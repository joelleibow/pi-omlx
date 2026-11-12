import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, test, vi } from "vitest";
import extension, { EXTENSION_SINGLETON_KEY } from "../index.ts";
import { _setAuthPathForTesting, PROVIDER_KEY } from "../src/auth-storage.ts";

function callbacksReturning(...values: string[]) {
	const queue = [...values];
	return {
		onAuth: () => {},
		onDeviceCode: () => {},
		onPrompt: async () => queue.shift() ?? "",
		onSelect: async () => undefined,
	};
}

function jsonResponse(body: unknown): Response {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		json: async () => body,
		text: async () => JSON.stringify(body),
	} as Response;
}

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pi-omlx-index-"));
	_setAuthPathForTesting(join(dir, "auth.json"));
	delete (globalThis as Record<PropertyKey, unknown>)[EXTENSION_SINGLETON_KEY];
});

afterEach(() => {
	_setAuthPathForTesting(undefined);
	rmSync(dir, { recursive: true, force: true });
	delete (globalThis as Record<PropertyKey, unknown>)[EXTENSION_SINGLETON_KEY];
});

test("/login with an API key registers authenticated OMLX models", async () => {
	let registered: ProviderConfig | undefined;
	const registeredIds = new Set<string>();
	const handlers = new Map<string, () => void>();
	const pi = {
		registerProvider: (provider: string, config: ProviderConfig) => {
			registeredIds.add(provider);
			registered = config;
		},
		unregisterProvider: () => {},
		on: (event: string, handler: () => void) => {
			handlers.set(event, handler);
		},
		getThinkingLevel: () => "off",
	} as unknown as ExtensionAPI;

	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		assert.equal(
			init?.headers && (init.headers as Record<string, string>).Authorization,
			"Bearer omlx-key",
		);
		assert.equal(String(url), "https://omlx.home.g33k.top/v1/models/status");
		return jsonResponse({
			models: [
				{
					id: "real-model",
					max_context_window: 32768,
					max_tokens: 4096,
				},
			],
		});
	}) as typeof fetch;

	try {
		await extension(pi);
		await registered?.oauth?.login(
			callbacksReturning("https://omlx.home.g33k.top", "omlx-key"),
		);
		assert.equal(registered?.authHeader, true);
		assert.equal(registered?.apiKey, "$OMLX_API_KEY");
		assert.equal(registered?.models?.[0]?.id, "real-model");
		assert.deepEqual([...registeredIds], [PROVIDER_KEY]);
	} finally {
		globalThis.fetch = originalFetch;
		handlers.get("session_shutdown")?.();
	}
});

// The wiring tests take the credential route this change asks for: a stored
// `auth.json` under the test's own PI_CODING_AGENT_DIR. `dir` is the temp
// directory the file-level hook points the read at, so the same file is the
// one the production read resolves when it asks pi for the agent directory.
const FIXTURE_BASE_URL = "https://omlx.home.g33k.top";
const FIXTURE_API_ROOT = `${FIXTURE_BASE_URL}/v1`;
const OTHER_API_ROOT = "http://10.0.0.5:8000/v1";
const STORED_KEY = "stored-key";
const ENV_KEY = "env-key";
const FIXTURE_MODELS = {
	models: [{ id: "real-model", max_context_window: 32768, max_tokens: 4096 }],
};
// index.ts polls every ten minutes; the interval is not exported.
const POLL_INTERVAL_MS = 10 * 60 * 1000;

const ENV_KEYS = [
	"PI_CODING_AGENT_DIR",
	"OMLX_API_KEY",
	"OMLX_BASE_URL",
	"PI_OMLX_DEBUG",
] as const;

type TestEnv = Partial<Record<(typeof ENV_KEYS)[number], string>>;

function withEnv(env: TestEnv): () => void {
	const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const);
	for (const key of ENV_KEYS) delete process.env[key];
	Object.assign(process.env, env);
	return () => {
		for (const key of ENV_KEYS) delete process.env[key];
		for (const [key, value] of saved) {
			if (value !== undefined) process.env[key] = value;
		}
	};
}

function storeCredential(record: Record<string, unknown>): void {
	writeFileSync(
		join(dir, "auth.json"),
		JSON.stringify({ [PROVIDER_KEY]: record }, null, 2),
	);
}

interface FetchCall {
	url: string;
	authorization: string | undefined;
}

function recordCatalogFetches(): FetchCall[] {
	const fetches: FetchCall[] = [];
	globalThis.fetch = (async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		const headers = init?.headers as Record<string, string> | undefined;
		fetches.push({ url: String(url), authorization: headers?.Authorization });
		return jsonResponse(FIXTURE_MODELS);
	}) as typeof fetch;
	return fetches;
}

interface ProviderCall {
	kind: "register" | "unregister";
	provider: string;
	config?: ProviderConfig;
}

function fakePi() {
	const calls: ProviderCall[] = [];
	const handlers = new Map<string, () => void>();
	const pi = {
		registerProvider: (provider: string, config: ProviderConfig) => {
			calls.push({ kind: "register", provider, config });
		},
		unregisterProvider: (provider: string) => {
			calls.push({ kind: "unregister", provider });
		},
		on: (event: string, handler: () => void) => {
			handlers.set(event, handler);
		},
		getThinkingLevel: () => "off",
	} as unknown as ExtensionAPI;
	return {
		pi,
		calls,
		lastRegistered: () =>
			calls.filter((call) => call.kind === "register").at(-1)?.config,
		shutdown: () => handlers.get("session_shutdown")?.(),
	};
}

// Drains the microtasks the poll's immediate first refresh runs, so the call
// log is stable and the ten-minute sleep is already scheduled on the fake clock.
async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

interface DriveContext {
	fetches: FetchCall[];
	calls: ProviderCall[];
	lastRegistered: () => ProviderConfig | undefined;
	stderr: () => string[];
}

async function driveExtension(
	env: TestEnv,
	body: (context: DriveContext) => Promise<void>,
): Promise<void> {
	const restoreEnv = withEnv({ ...env, PI_CODING_AGENT_DIR: dir });
	const originalFetch = globalThis.fetch;
	const fetches = recordCatalogFetches();
	const fake = fakePi();
	const write = vi
		.spyOn(process.stderr, "write")
		.mockImplementation(() => true);
	vi.useFakeTimers();
	try {
		await extension(fake.pi);
		await settle();
		await body({
			fetches,
			calls: fake.calls,
			lastRegistered: fake.lastRegistered,
			stderr: () => write.mock.calls.map(([chunk]) => String(chunk)),
		});
	} finally {
		vi.useRealTimers();
		fake.shutdown();
		write.mockRestore();
		globalThis.fetch = originalFetch;
		restoreEnv();
	}
}

function storedOAuth(access: string): Record<string, unknown> {
	return {
		type: "oauth",
		access,
		refresh: "",
		expires: Number.MAX_SAFE_INTEGER,
		baseUrl: FIXTURE_API_ROOT,
	};
}

test("a stored credential decides the fetch and the registration", async () => {
	storeCredential(storedOAuth(STORED_KEY));
	await driveExtension(
		{ OMLX_API_KEY: ENV_KEY, OMLX_BASE_URL: OTHER_API_ROOT },
		async ({ fetches, lastRegistered }) => {
			assert.equal(fetches[0]?.url, `${FIXTURE_API_ROOT}/models/status`);
			assert.equal(fetches[0]?.authorization, `Bearer ${STORED_KEY}`);
			assert.equal(lastRegistered()?.baseUrl, FIXTURE_API_ROOT);
			assert.equal(lastRegistered()?.apiKey, "$OMLX_API_KEY");
			assert.equal(lastRegistered()?.authHeader, true);
		},
	);
});

test("a legacy api_key record keeps its own base URL", async () => {
	storeCredential({
		type: "api_key",
		key: STORED_KEY,
		baseUrl: FIXTURE_API_ROOT,
	});
	await driveExtension(
		{ OMLX_BASE_URL: OTHER_API_ROOT },
		async ({ fetches, lastRegistered }) => {
			assert.equal(fetches[0]?.url, `${FIXTURE_API_ROOT}/models/status`);
			assert.equal(fetches[0]?.authorization, `Bearer ${STORED_KEY}`);
			assert.equal(lastRegistered()?.baseUrl, FIXTURE_API_ROOT);
		},
	);
});

test("a stored keyless credential registers keyless while the environment key is set", async () => {
	storeCredential(storedOAuth(""));
	await driveExtension(
		{ OMLX_API_KEY: ENV_KEY },
		async ({ fetches, lastRegistered }) => {
			assert.equal(fetches[0]?.url, `${FIXTURE_API_ROOT}/models/status`);
			assert.equal(fetches[0]?.authorization, undefined);
			assert.equal(lastRegistered()?.apiKey, undefined);
			assert.equal(lastRegistered()?.authHeader, false);
		},
	);
});

test("a stored api_key with an empty key makes no catalog fetch", async () => {
	storeCredential({ type: "api_key", key: "" });
	await driveExtension(
		{ OMLX_API_KEY: ENV_KEY },
		async ({ fetches, lastRegistered }) => {
			assert.deepEqual(fetches, []);
			assert.equal(lastRegistered()?.baseUrl, undefined);
			assert.equal(lastRegistered()?.apiKey, undefined);
			assert.equal(lastRegistered()?.models, undefined);
		},
	);
});

test("an environment base URL alone makes no catalog fetch", async () => {
	await driveExtension(
		{ OMLX_BASE_URL: OTHER_API_ROOT },
		async ({ fetches, lastRegistered }) => {
			assert.deepEqual(fetches, []);
			assert.equal(lastRegistered()?.baseUrl, undefined);
			assert.equal(lastRegistered()?.apiKey, undefined);
		},
	);
});

test("nothing stored and nothing set registers the login-only provider", async () => {
	await driveExtension({}, async ({ fetches, lastRegistered }) => {
		assert.deepEqual(fetches, []);
		assert.equal(lastRegistered()?.baseUrl, undefined);
		assert.equal(lastRegistered()?.models, undefined);
	});
});

test("the poll re-fetches with the stored credential while both variables are set", async () => {
	storeCredential(storedOAuth(STORED_KEY));
	await driveExtension(
		{ OMLX_API_KEY: ENV_KEY, OMLX_BASE_URL: OTHER_API_ROOT },
		async ({ fetches, lastRegistered }) => {
			const beforePoll = fetches.length;
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
			assert.equal(fetches.length, beforePoll + 1);
			const pollFetch = fetches[fetches.length - 1];
			assert.equal(pollFetch?.url, `${FIXTURE_API_ROOT}/models/status`);
			assert.equal(pollFetch?.authorization, `Bearer ${STORED_KEY}`);
			assert.equal(lastRegistered()?.baseUrl, FIXTURE_API_ROOT);
			assert.equal(lastRegistered()?.apiKey, "$OMLX_API_KEY");
		},
	);
});

test("a login with an empty key registers keyless while the environment key is set", async () => {
	await driveExtension(
		{ OMLX_API_KEY: ENV_KEY, OMLX_BASE_URL: FIXTURE_BASE_URL },
		async ({ fetches, lastRegistered }) => {
			const login = lastRegistered()?.oauth?.login;
			assert.ok(login);
			const before = fetches.length;
			const credential = await login(callbacksReturning(FIXTURE_BASE_URL, ""));
			assert.equal(credential.access, "");
			assert.equal(credential.baseUrl, FIXTURE_API_ROOT);
			assert.equal(fetches.length, before + 1);
			assert.equal(fetches[before]?.url, `${FIXTURE_API_ROOT}/models/status`);
			assert.equal(fetches[before]?.authorization, undefined);
			assert.equal(lastRegistered()?.apiKey, undefined);
		},
	);
});

test("a keyless registration unregisters the keyed one first", async () => {
	await driveExtension(
		{ OMLX_API_KEY: ENV_KEY, OMLX_BASE_URL: FIXTURE_BASE_URL },
		async ({ calls, lastRegistered }) => {
			const login = lastRegistered()?.oauth?.login;
			assert.ok(login);
			const before = calls.length;
			await login(callbacksReturning(FIXTURE_API_ROOT, ""));
			const during = calls.slice(before);
			assert.deepEqual(
				during.map((call) => call.kind),
				["unregister", "register"],
			);
			assert.equal(during[0]?.provider, PROVIDER_KEY);
			assert.equal(lastRegistered()?.apiKey, undefined);
			assert.equal(lastRegistered()?.authHeader, false);
		},
	);
});

test("a steady-state keyless poll unregisters first", async () => {
	storeCredential(storedOAuth(""));
	await driveExtension({}, async ({ calls, lastRegistered }) => {
		const before = calls.length;
		await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
		const during = calls.slice(before);
		assert.deepEqual(
			during.slice(-2).map((call) => call.kind),
			["unregister", "register"],
		);
		assert.equal(during.at(-2)?.provider, PROVIDER_KEY);
		assert.equal(lastRegistered()?.apiKey, undefined);
	});
});

test("the provider_registered line names the stored source and carries no key", async () => {
	storeCredential(storedOAuth(STORED_KEY));
	await driveExtension({ PI_OMLX_DEBUG: "1" }, async ({ stderr }) => {
		const line = stderr().find((chunk) =>
			chunk.includes("provider_registered"),
		);
		assert.ok(line, "no provider_registered line was written");
		assert.match(line, /"source":"stored"/);
		assert.ok(!line.includes(STORED_KEY), `the line carries the key: ${line}`);
	});
});

test("the provider_registered line reports the environment source", async () => {
	await driveExtension(
		{
			PI_OMLX_DEBUG: "1",
			OMLX_API_KEY: ENV_KEY,
			OMLX_BASE_URL: FIXTURE_BASE_URL,
		},
		async ({ stderr }) => {
			const line = stderr().find((chunk) =>
				chunk.includes("provider_registered"),
			);
			assert.ok(line, "no provider_registered line was written");
			assert.match(line, /"source":"environment"/);
			assert.ok(!line.includes(ENV_KEY), `the line carries the key: ${line}`);
		},
	);
});

test("a login-only registration writes no provider_registered line", async () => {
	await driveExtension({ PI_OMLX_DEBUG: "1" }, async ({ stderr }) => {
		assert.deepEqual(
			stderr().filter((chunk) => chunk.includes("provider_registered")),
			[],
		);
	});
});

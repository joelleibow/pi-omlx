import { strict as assert } from "node:assert";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Provider } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, inject, test, vi } from "vitest";
import extension from "../index.ts";
import { PROVIDER_KEY } from "../src/auth-storage.ts";
import type { OmlxModel } from "../src/catalog.ts";
import { DEFAULT_OMLX_BASE_URL, KEYLESS_PLACEHOLDER } from "../src/config.ts";

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
	dir = mkdtempSync(join(inject("isolationRoot"), "pi-omlx-index-"));
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
// `auth.json` under the test's own PI_CODING_AGENT_DIR. `dir` is that
// directory, which `driveExtension` points pi's agent directory at, so the
// same file is the one the production read resolves.
const FIXTURE_BASE_URL = "https://omlx.home.g33k.top";
const FIXTURE_API_ROOT = `${FIXTURE_BASE_URL}/v1`;
const OTHER_API_ROOT = "http://10.0.0.5:8000/v1";
const STORED_KEY = "stored-key";
const ENV_KEY = "env-key";
const FIXTURE_MODELS = {
	models: [{ id: "real-model", max_context_window: 32768, max_tokens: 4096 }],
};
// index.ts polls every ten minutes, and backs off from two seconds after a
// failure; neither value is exported.
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const BACKOFF_BASE_MS = 2_000;

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

function recordCatalogFetches(
	respond: () => Response | Promise<Response>,
): FetchCall[] {
	const fetches: FetchCall[] = [];
	globalThis.fetch = (async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		const headers = init?.headers as Record<string, string> | undefined;
		fetches.push({ url: String(url), authorization: headers?.Authorization });
		return respond();
	}) as typeof fetch;
	return fetches;
}

function catalogRefusedResponse(): Response {
	return {
		ok: false,
		status: 503,
		statusText: "Service Unavailable",
		json: async () => ({}),
		text: async () => "unavailable",
	} as Response;
}

interface ProviderCall {
	kind: "register" | "unregister";
	provider: string;
	config?: ProviderConfig;
}

interface NotifyCall {
	message: string;
	type: string | undefined;
}

interface SessionShape {
	hasUI: boolean;
	mode: string;
}

type Handler = (event?: unknown, ctx?: unknown) => void;

function fakePi() {
	const calls: ProviderCall[] = [];
	const notifies: NotifyCall[] = [];
	const setModels: unknown[] = [];
	const handlers = new Map<string, Handler>();
	const notify = (message: string, type?: string) => {
		notifies.push({ message, type });
	};
	const pi = {
		registerProvider: (
			provider: Provider | string,
			config?: ProviderConfig,
		) => {
			calls.push({
				kind: "register",
				provider: typeof provider === "string" ? provider : provider.id,
				config: typeof provider === "string" ? config : undefined,
			});
		},
		unregisterProvider: (provider: string) => {
			calls.push({ kind: "unregister", provider });
		},
		on: (event: string, handler: Handler) => {
			handlers.set(event, handler);
		},
		getThinkingLevel: () => "off",
		setModel: (model: unknown) => {
			setModels.push(model);
			return true;
		},
	} as unknown as ExtensionAPI;
	return {
		pi,
		calls,
		notifies,
		setModels,
		lastRegistered: () =>
			calls.filter((call) => call.kind === "register").at(-1)?.config,
		startSession: (shape: SessionShape = { hasUI: true, mode: "rpc" }) => {
			handlers.get("session_start")?.({}, { ...shape, ui: { notify } });
		},
		shutdown: () => handlers.get("session_shutdown")?.(),
	};
}

interface CacheFixture {
	apiRoot: string;
	models: OmlxModel[];
}

// The cache file under the test's own agent directory: `dir` is what
// driveExtension points PI_CODING_AGENT_DIR at, and the extension derives the
// cache path from it at each read and each write.
function cacheFixturePath(): string {
	return join(dir, "cache", "omlx-models.json");
}

function writeCacheFixture(apiRoot: string, models: OmlxModel[]): void {
	const path = cacheFixturePath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ apiRoot, models }, null, 2));
}

function readCacheFixture(): CacheFixture | undefined {
	try {
		return JSON.parse(readFileSync(cacheFixturePath(), "utf-8"));
	} catch {
		return undefined;
	}
}

// A cached model with real limits, under whatever id a test needs: the ids
// differ so that only the test's own registration or write can satisfy it.
function cachedModel(id: string): OmlxModel {
	return { id, contextWindow: 32768, maxTokens: 4096 };
}

// Drains the microtasks the poll's first tick runs — the session's only startup
// request — so the call log is stable and the ten-minute sleep is already
// scheduled on the fake clock.
async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

interface DriveContext {
	fetches: FetchCall[];
	calls: ProviderCall[];
	notifies: NotifyCall[];
	setModels: unknown[];
	lastRegistered: () => ProviderConfig | undefined;
	load: () => Promise<void>;
	startSession: (shape?: SessionShape) => void;
	shutdown: () => void;
	stderr: () => string[];
}

type EntryFunction = (pi: ExtensionAPI) => Promise<void>;

async function driveExtension(
	env: TestEnv,
	body: (context: DriveContext) => Promise<void>,
	respond: () => Response | Promise<Response> = () =>
		jsonResponse(FIXTURE_MODELS),
	loadEntry: () => Promise<EntryFunction> = async () => extension,
): Promise<void> {
	const restoreEnv = withEnv({ ...env, PI_CODING_AGENT_DIR: dir });
	const originalFetch = globalThis.fetch;
	const fetches = recordCatalogFetches(respond);
	const fake = fakePi();
	const write = vi
		.spyOn(process.stderr, "write")
		.mockImplementation(() => true);
	// vitest intercepts console.* before process.stderr.write, so seeing what
	// the extension puts on stderr takes both observers.
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
	const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.useFakeTimers();
	try {
		// Loaded after withEnv, so an entry module that sets the environment has
		// its writes still visible to the body instead of being cleared first.
		const entry = await loadEntry();
		await entry(fake.pi);
		await settle();
		await body({
			fetches,
			calls: fake.calls,
			notifies: fake.notifies,
			setModels: fake.setModels,
			lastRegistered: fake.lastRegistered,
			load: () => entry(fake.pi),
			startSession: fake.startSession,
			shutdown: fake.shutdown,
			stderr: () => [
				...write.mock.calls.map(([chunk]) => String(chunk)),
				...consoleError.mock.calls.map((call) => call.map(String).join(" ")),
				...consoleWarn.mock.calls.map((call) => call.map(String).join(" ")),
			],
		});
	} finally {
		vi.useRealTimers();
		fake.shutdown();
		write.mockRestore();
		consoleError.mockRestore();
		consoleWarn.mockRestore();
		globalThis.fetch = originalFetch;
		restoreEnv();
	}
}

// The stored login pi hands the extension's hooks: an api_key credential whose
// provider-scoped env carries the URL. `key` is omitted when the login was
// keyless, exactly as pi persists it.
function storedLogin(key?: string): Record<string, unknown> {
	return {
		type: "api_key",
		...(key === undefined ? {} : { key }),
		env: { OMLX_BASE_URL: FIXTURE_API_ROOT },
	};
}

test("a stored credential decides the fetch and the registration", async () => {
	storeCredential(storedLogin(STORED_KEY));
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

test("a stored keyless credential registers keyless while the environment key is set", async () => {
	storeCredential(storedLogin());
	await driveExtension(
		{ OMLX_API_KEY: ENV_KEY },
		async ({ fetches, lastRegistered }) => {
			assert.equal(fetches[0]?.url, `${FIXTURE_API_ROOT}/models/status`);
			assert.equal(fetches[0]?.authorization, `Bearer ${KEYLESS_PLACEHOLDER}`);
			assert.equal(lastRegistered()?.apiKey, undefined);
			assert.equal(lastRegistered()?.authHeader, false);
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
	storeCredential(storedLogin(STORED_KEY));
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
			// The login probes with the credential, then registers the catalog
			// under it; both requests are keyless.
			assert.equal(fetches.length, before + 2);
			for (const request of fetches.slice(before)) {
				assert.equal(request.url, `${FIXTURE_API_ROOT}/models/status`);
				assert.equal(request.authorization, `Bearer ${KEYLESS_PLACEHOLDER}`);
			}
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
	storeCredential(storedLogin());
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
	storeCredential(storedLogin(STORED_KEY));
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

test("the environment supplies both halves when nothing is stored", async () => {
	await driveExtension(
		{ OMLX_API_KEY: ENV_KEY, OMLX_BASE_URL: FIXTURE_BASE_URL },
		async ({ fetches, lastRegistered }) => {
			assert.equal(fetches[0]?.url, `${FIXTURE_API_ROOT}/models/status`);
			assert.equal(fetches[0]?.authorization, `Bearer ${ENV_KEY}`);
			assert.equal(lastRegistered()?.baseUrl, FIXTURE_API_ROOT);
			assert.equal(lastRegistered()?.apiKey, "$OMLX_API_KEY");
			assert.equal(lastRegistered()?.authHeader, true);
		},
	);
});

// shortcut: proves a `.env` beside the entry module configures nothing. A read
// from the working directory, or of another filename, would stay green; upgrade
// this test if a configuration-file reader is proposed.
test("a .env beside a copy of index.ts configures nothing", async () => {
	const repoRoot = fileURLToPath(new URL("..", import.meta.url));
	const copyDir = mkdtempSync(join(inject("isolationRoot"), "extension-copy-"));
	cpSync(join(repoRoot, "index.ts"), join(copyDir, "index.ts"));
	cpSync(join(repoRoot, "src"), join(copyDir, "src"), { recursive: true });
	symlinkSync(join(repoRoot, "node_modules"), join(copyDir, "node_modules"));
	writeFileSync(
		join(copyDir, ".env"),
		"OMLX_BASE_URL=http://from-dotenv.invalid/v1\nOMLX_API_KEY=from-dotenv\n",
	);

	await driveExtension(
		{},
		async ({ fetches, lastRegistered }) => {
			assert.equal(process.env.OMLX_API_KEY, undefined);
			assert.equal(process.env.OMLX_BASE_URL, undefined);
			assert.deepEqual(fetches, []);
			assert.equal(lastRegistered()?.baseUrl, undefined);
			assert.equal(lastRegistered()?.apiKey, undefined);
			assert.equal(lastRegistered()?.models, undefined);
		},
		undefined,
		async () =>
			(
				await import(
					/* @vite-ignore */ pathToFileURL(join(copyDir, "index.ts")).href
				)
			).default,
	);
});

test("a stored credential without a base URL fetches from the default", async () => {
	storeCredential({ type: "api_key", key: STORED_KEY });
	await driveExtension(
		{ OMLX_BASE_URL: OTHER_API_ROOT },
		async ({ fetches, lastRegistered }) => {
			assert.equal(fetches[0]?.url, `${DEFAULT_OMLX_BASE_URL}/models/status`);
			assert.equal(fetches[0]?.authorization, `Bearer ${STORED_KEY}`);
			// The server refuses this catalog, so nothing is cached at the default
			// URL and the provider stays login-only.
			assert.equal(lastRegistered()?.baseUrl, undefined);
			assert.equal(lastRegistered()?.models, undefined);
		},
		catalogRefusedResponse,
	);
});

// Requirement 1. Neither test advances the fake clock, so the only thing that
// can let the body run is the factory resolving on its own.
test("a request that never answers does not delay a session with cached models", async () => {
	storeCredential(storedLogin(STORED_KEY));
	writeCacheFixture(FIXTURE_API_ROOT, [cachedModel("cached-model")]);
	await driveExtension(
		{},
		async ({ fetches, lastRegistered }) => {
			assert.equal(fetches.length, 1);
			assert.equal(fetches[0]?.url, `${FIXTURE_API_ROOT}/models/status`);
			assert.deepEqual(
				lastRegistered()?.models?.map((model) => model.id),
				["cached-model"],
			);
		},
		neverAnswered,
	);
});

test("a request that never answers does not delay a session with no cache", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension(
		{},
		async ({ fetches, lastRegistered }) => {
			assert.equal(fetches.length, 1);
			assert.equal(fetches[0]?.url, `${FIXTURE_API_ROOT}/models/status`);
			assert.equal(lastRegistered()?.baseUrl, undefined);
			assert.equal(lastRegistered()?.models, undefined);
		},
		neverAnswered,
	);
});

function neverAnswered(): Promise<Response> {
	return new Promise<Response>(() => {});
}

// Requirement 2: the arrived models are registered for pi's model list and
// pi's own choice of starting model is left alone.
test("a late catalog registers under omlx and moves no model", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension({}, async ({ calls, setModels }) => {
		assert.deepEqual(setModels, []);
		const registrations = calls.filter((call) => call.kind === "register");
		const late = registrations.at(-1);
		assert.equal(late?.provider, "omlx");
		assert.deepEqual(
			late?.config?.models?.map((model) => model.id),
			["real-model"],
		);
	});
});

// Requirement 2, boundary case: a cached start registers under omlx as well.
test("a cached start registers under omlx without choosing a model", async () => {
	storeCredential(storedLogin(STORED_KEY));
	writeCacheFixture(FIXTURE_API_ROOT, [cachedModel("cached-model")]);
	await driveExtension({}, async ({ calls, setModels }) => {
		assert.deepEqual(setModels, []);
		// The startup registration is the first one; the poll's tick registers the
		// fetched catalog after it.
		const startup = calls.find((call) => call.kind === "register");
		assert.equal(startup?.provider, "omlx");
		assert.deepEqual(
			startup?.config?.models?.map((model) => model.id),
			["cached-model"],
		);
	});
});

// A second copy of the extension in one process runs like any other pi
// extension, so a second load registers again instead of skipping.
test("a second load in one process registers again with no shutdown first", async () => {
	storeCredential(storedLogin(STORED_KEY));
	writeCacheFixture(FIXTURE_API_ROOT, [cachedModel("cached-model")]);
	await driveExtension(
		{},
		async ({ calls, load }) => {
			const registrations = () =>
				calls.filter((call) => call.kind === "register");
			assert.equal(registrations().length, 1);
			await load();
			assert.deepEqual(
				registrations().map((call) =>
					call.config?.models?.map((model) => model.id),
				),
				[["cached-model"], ["cached-model"]],
			);
		},
		neverAnswered,
	);
});

// Requirement 1, third scenario. The response's model id appears in no other
// test, and the cache file is removed first, so only this run's own write can
// satisfy the assertion.
test("a successful request registers the fetched models and writes the cache", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension(
		{},
		async ({ fetches, lastRegistered }) => {
			assert.equal(fetches.length, 1);
			assert.deepEqual(
				lastRegistered()?.models?.map((model) => model.id),
				["cache-write-model"],
			);
			const cache = readCacheFixture();
			assert.equal(cache?.apiRoot, FIXTURE_API_ROOT);
			assert.deepEqual(
				cache?.models?.map((model) => model.id),
				["cache-write-model"],
			);
			assert.equal(cache?.models?.[0]?.contextWindow, 65536);
			assert.equal(cache?.models?.[0]?.maxTokens, 8192);
		},
		() =>
			jsonResponse({
				models: [
					{
						id: "cache-write-model",
						max_context_window: 65536,
						max_tokens: 8192,
					},
				],
			}),
	);
});

// Requirement 3: at most one warning per session, through ctx.ui.notify.
test("a failed load with cached models warns once with the URL and the count", async () => {
	storeCredential(storedLogin(STORED_KEY));
	writeCacheFixture(FIXTURE_API_ROOT, [
		cachedModel("cached-a"),
		cachedModel("cached-b"),
	]);
	await driveExtension(
		{},
		async ({ notifies, startSession }) => {
			startSession();
			assert.deepEqual(notifies, [
				{
					message: `oMLX model list unavailable at ${FIXTURE_API_ROOT}; using 2 cached models.`,
					type: "warning",
				},
			]);
		},
		catalogRefusedResponse,
	);
});

test("a failed load with no cache warns once naming the login-only provider", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension(
		{},
		async ({ notifies, startSession }) => {
			startSession();
			assert.deepEqual(notifies, [
				{
					message: `oMLX model list unavailable at ${FIXTURE_API_ROOT}; using the login-only provider.`,
					type: "warning",
				},
			]);
		},
		catalogRefusedResponse,
	);
});

test("a 200 with nothing registrable warns once and writes no cache", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension(
		{},
		async ({ fetches, notifies, startSession }) => {
			startSession();
			assert.equal(fetches.length, 1);
			assert.equal(notifies.length, 1);
			assert.equal(readCacheFixture(), undefined);
		},
		() =>
			jsonResponse({
				models: [{ id: "no-limits", max_context_window: 0, max_tokens: 0 }],
			}),
	);
});

test("a failure before the session starts warns once it does", async () => {
	storeCredential(storedLogin(STORED_KEY));
	writeCacheFixture(FIXTURE_API_ROOT, [cachedModel("cached-a")]);
	await driveExtension(
		{},
		async ({ notifies, startSession }) => {
			assert.deepEqual(notifies, []);
			startSession();
			assert.equal(notifies.length, 1);
		},
		catalogRefusedResponse,
	);
});

test("a later success adds no second warning", async () => {
	storeCredential(storedLogin(STORED_KEY));
	writeCacheFixture(FIXTURE_API_ROOT, [cachedModel("cached-a")]);
	let failing = true;
	await driveExtension(
		{},
		async ({ lastRegistered, notifies, startSession }) => {
			startSession();
			assert.equal(notifies.length, 1);
			failing = false;
			await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
			assert.deepEqual(
				lastRegistered()?.models?.map((model) => model.id),
				["real-model"],
			);
			assert.equal(notifies.length, 1);
		},
		() => (failing ? catalogRefusedResponse() : jsonResponse(FIXTURE_MODELS)),
	);
});

// Requirement 3's once-per-session rule, which the text rule above cannot show:
// a login-only start fails again on the next tick, and the session starts twice
// because RPC emits session_start twice on one instance, yet it is told once.
test("a login-only session warns once, however often it starts or fails again", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension(
		{},
		async ({ notifies, startSession }) => {
			startSession();
			startSession();
			assert.equal(notifies.length, 1, "the second session_start warned again");
			await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
			assert.equal(notifies.length, 1, "a second failed load warned again");
			startSession();
			assert.equal(notifies.length, 1, "a later session_start warned again");
		},
		catalogRefusedResponse,
	);
});

// Requirement 3, the late row: only a session that started login-only is told
// about models that arrived afterwards.
test("a late catalog warns once for a session that started login-only", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension({}, async ({ notifies, startSession }) => {
		startSession();
		assert.deepEqual(notifies, [
			{
				message: `oMLX session started login-only; models from ${FIXTURE_API_ROOT} are now available; choose one with /model.`,
				type: "warning",
			},
		]);
	});
});

test("a warm cache whose catalog arrives normally warns about nothing", async () => {
	storeCredential(storedLogin(STORED_KEY));
	writeCacheFixture(FIXTURE_API_ROOT, [cachedModel("cached-a")]);
	await driveExtension({}, async ({ notifies, startSession }) => {
		startSession();
		assert.deepEqual(notifies, []);
	});
});

test("an unconfigured start that later logs in warns about nothing", async () => {
	await driveExtension(
		{},
		async ({ lastRegistered, notifies, startSession }) => {
			startSession();
			assert.deepEqual(notifies, []);
			const login = lastRegistered()?.oauth?.login;
			assert.ok(login);
			await login(callbacksReturning(FIXTURE_BASE_URL, STORED_KEY));
			assert.deepEqual(notifies, []);
			// What pi does with the credential the login returned.
			storeCredential(storedLogin(STORED_KEY));
			await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
			assert.equal(lastRegistered()?.baseUrl, FIXTURE_API_ROOT);
			assert.deepEqual(notifies, []);
		},
	);
});

// The notice decision traces, and its request does too; without the flag,
// stderr stays empty.
test("the notice decision traces under PI_OMLX_DEBUG and is silent without it", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension(
		{ PI_OMLX_DEBUG: "1" },
		async ({ stderr, startSession }) => {
			startSession();
			const held = stderr().find(
				(chunk) =>
					chunk.includes("catalog_notice") &&
					chunk.includes('"decision":"held"'),
			);
			assert.ok(held, `no held catalog_notice line: ${stderr().join("")}`);
			assert.match(held, /"result":"failed"/);
			assert.ok(held.includes(FIXTURE_API_ROOT));
			const shown = stderr().find(
				(chunk) =>
					chunk.includes("catalog_notice") &&
					chunk.includes('"decision":"shown"'),
			);
			assert.ok(shown, `no shown catalog_notice line: ${stderr().join("")}`);
			assert.ok(shown.includes("using the login-only provider"));
			assert.ok(
				stderr().some((chunk) => chunk.includes("catalog_status_failed")),
				`no catalog_status_failed line: ${stderr().join("")}`,
			);
			assert.ok(
				stderr().every((chunk) => !chunk.includes(STORED_KEY)),
				`a line carries the key: ${stderr().join("")}`,
			);
		},
		catalogRefusedResponse,
	);

	await driveExtension(
		{},
		async ({ stderr, startSession }) => {
			startSession();
			assert.deepEqual(stderr(), []);
		},
		catalogRefusedResponse,
	);
});

// pi's UI is a no-op where it provides none; the extension does not guard on
// hasUI, so the notice still reaches the ui it was handed, and stderr carries
// nothing beyond what the diagnostics spec allows.
test("a print-mode session with no UI records the warning and writes no stderr", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension(
		{},
		async ({ notifies, startSession, stderr }) => {
			startSession({ hasUI: false, mode: "print" });
			assert.equal(notifies.length, 1);
			assert.deepEqual(stderr(), []);
		},
		catalogRefusedResponse,
	);
});

test("a json-mode session with no UI records the warning and writes no stderr", async () => {
	storeCredential(storedLogin(STORED_KEY));
	await driveExtension(
		{},
		async ({ notifies, startSession, stderr }) => {
			startSession({ hasUI: false, mode: "json" });
			assert.equal(notifies.length, 1);
			assert.deepEqual(stderr(), []);
		},
		catalogRefusedResponse,
	);
});

// Requirement 4: a fetch that outlives its session changes nothing.
test("a fetch that resolves after shutdown leaves the cache alone", async () => {
	storeCredential(storedLogin(STORED_KEY));
	writeCacheFixture(FIXTURE_API_ROOT, [cachedModel("cached-before")]);
	const before = readCacheFixture();
	const held = heldResponse();
	await driveExtension(
		{},
		async ({ fetches, shutdown }) => {
			assert.equal(fetches.length, 1);
			shutdown();
			held.answer(jsonResponse(FIXTURE_MODELS));
			await settle();
			assert.deepEqual(readCacheFixture(), before);
		},
		held.respond,
	);
});

test("a stale fetch that fails outright writes nothing either", async () => {
	storeCredential(storedLogin(STORED_KEY));
	writeCacheFixture(FIXTURE_API_ROOT, [cachedModel("cached-before")]);
	const before = readCacheFixture();
	const held = heldResponse();
	await driveExtension(
		{},
		async ({ fetches, shutdown }) => {
			assert.equal(fetches.length, 1);
			shutdown();
			held.answer(catalogRefusedResponse());
			await settle();
			assert.deepEqual(readCacheFixture(), before);
		},
		held.respond,
	);
});

// A response a test holds open and answers when it chooses. Every request the
// extension makes after the answer gets the same response, so a fetch that fell
// through from /models/status to /models still completes.
function heldResponse(): {
	respond: () => Promise<Response>;
	answer: (response: Response) => void;
} {
	const waiting: Array<(response: Response) => void> = [];
	let answered: Response | undefined;
	return {
		respond: () => {
			if (answered) return Promise.resolve(answered);
			return new Promise<Response>((resolve) => {
				waiting.push(resolve);
			});
		},
		answer: (response: Response) => {
			answered = response;
			for (const resolve of waiting.splice(0)) resolve(response);
		},
	};
}

test("a fetch that resolves after shutdown registers nothing and warns nobody", async () => {
	storeCredential(storedLogin(STORED_KEY));
	const held = heldResponse();
	await driveExtension(
		{},
		async ({ calls, fetches, notifies, shutdown, startSession }) => {
			startSession();
			assert.equal(fetches.length, 1);
			const before = calls.length;
			shutdown();
			held.answer(jsonResponse(FIXTURE_MODELS));
			await settle();
			assert.equal(calls.length, before);
			assert.deepEqual(notifies, []);
		},
		held.respond,
	);
});

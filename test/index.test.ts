import { strict as assert } from "node:assert";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
	Model,
	Provider,
	RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, inject, test, vi } from "vitest";
import extension from "../index.ts";
import { PROVIDER_KEY } from "../src/auth-storage.ts";

type EntryFunction = (pi: ExtensionAPI) => Promise<void>;

const FIXTURE_BASE_URL = "https://omlx.home.g33k.top/v1";
const FIXTURE_MODELS = {
	models: [{ id: "real-model", max_context_window: 32768, max_tokens: 4096 }],
};

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(inject("isolationRoot"), "pi-omlx-index-"));
});

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

interface Fetched {
	url: string;
	authorization: string | undefined;
}

interface NotifyCall {
	message: string;
	type: string | undefined;
}

interface SessionShape {
	hasUI: boolean;
	mode: string;
}

// What the session's model registry answers. A defined `getProviderAuth` is
// what "configured" means, so a test can tell the two registry questions apart.
interface SessionAnswers {
	providerAuth?: () => Promise<unknown>;
	providerAuthStatus?: () => unknown;
}

type Handler = (event?: unknown, ctx?: unknown) => unknown;

function jsonResponse(body: unknown): Response {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		json: async () => body,
		text: async () => JSON.stringify(body),
	} as Response;
}

// A pi that registers a native provider and nothing else: a string registration
// throws, which is what fails a run that kept the legacy path.
function fakePi() {
	let thinkingLevel = "off";
	const providers: Provider[] = [];
	const notifies: NotifyCall[] = [];
	const setModels: unknown[] = [];
	const handlers = new Map<string, Handler>();
	const notify = (message: string, type?: string) => {
		notifies.push({ message, type });
	};
	const pi = {
		registerProvider: (provider: Provider) => {
			if (typeof provider === "string") {
				throw new Error("the extension registered a provider by name");
			}
			providers.push(provider);
		},
		on: (event: string, handler: Handler) => {
			handlers.set(event, handler);
		},
		getThinkingLevel: () => thinkingLevel,
		setModel: (model: unknown) => {
			setModels.push(model);
			return true;
		},
	} as unknown as ExtensionAPI;
	return {
		pi,
		providers,
		notifies,
		setModels,
		setThinkingLevel: (level: string) => {
			thinkingLevel = level;
		},
		beforeProviderRequest: (event: unknown, ctx: unknown) =>
			handlers.get("before_provider_request")?.(event, ctx),
		startSession: async (
			shape: SessionShape = { hasUI: true, mode: "rpc" },
			answers: SessionAnswers = {},
		): Promise<string[]> => {
			const asked: string[] = [];
			const modelRegistry = {
				getProviderAuth: async (provider: string) => {
					asked.push(`getProviderAuth:${provider}`);
					return answers.providerAuth
						? answers.providerAuth()
						: { auth: { apiKey: "resolved-key" } };
				},
				getProviderAuthStatus: (provider: string) => {
					asked.push(`getProviderAuthStatus:${provider}`);
					return answers.providerAuthStatus?.() ?? { configured: true };
				},
			};
			await handlers.get("session_start")?.(
				{},
				{ ...shape, ui: { notify }, modelRegistry },
			);
			return asked;
		},
	};
}

// The credential pi synthesises for the network phase: `resolve`'s output.
function storedCredential() {
	return {
		type: "api_key" as const,
		key: "stored-key",
		env: { OMLX_BASE_URL: FIXTURE_BASE_URL },
	};
}

// What pi's own refresh does with a provider: publish with the network allowed,
// running the update it returns.
async function publishCatalog(provider: Provider): Promise<void> {
	const refresh = provider.refreshModels;
	assert.ok(refresh, "the registered provider supplies no refreshModels");
	const context: RefreshModelsContext = {
		credential: storedCredential(),
		allowNetwork: true,
		signal: new AbortController().signal,
		publish: async (publication) => {
			publication.update?.();
			return true;
		},
	};
	await refresh(context);
}

interface DriveContext {
	fetches: Fetched[];
	providers: Provider[];
	notifies: NotifyCall[];
	setModels: unknown[];
	setThinkingLevel: (level: string) => void;
	beforeProviderRequest: (event: unknown, ctx: unknown) => unknown;
	load: () => Promise<void>;
	stdout: () => string[];
	startSession: (
		shape?: SessionShape,
		answers?: SessionAnswers,
	) => Promise<string[]>;
	stderr: () => string[];
}

async function driveExtension(
	env: TestEnv,
	body: (context: DriveContext) => Promise<void>,
	loadEntry: () => Promise<EntryFunction> = async () => extension,
): Promise<void> {
	const restoreEnv = withEnv({ ...env, PI_CODING_AGENT_DIR: dir });
	const originalFetch = globalThis.fetch;
	const fetches: Fetched[] = [];
	globalThis.fetch = (async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		const headers = init?.headers as Record<string, string> | undefined;
		fetches.push({
			url: String(url),
			authorization: headers?.Authorization,
		});
		return jsonResponse(FIXTURE_MODELS);
	}) as typeof fetch;
	const fake = fakePi();
	const write = vi
		.spyOn(process.stderr, "write")
		.mockImplementation(() => true);
	const writeOut = vi
		.spyOn(process.stdout, "write")
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
		await body({
			fetches,
			providers: fake.providers,
			notifies: fake.notifies,
			setModels: fake.setModels,
			setThinkingLevel: fake.setThinkingLevel,
			beforeProviderRequest: fake.beforeProviderRequest,
			load: async () => {
				await entry(fake.pi);
			},
			startSession: fake.startSession,
			stdout: () => writeOut.mock.calls.map(([chunk]) => String(chunk)),
			stderr: () => [
				...write.mock.calls.map(([chunk]) => String(chunk)),
				...consoleError.mock.calls.map((call) => call.map(String).join(" ")),
				...consoleWarn.mock.calls.map((call) => call.map(String).join(" ")),
			],
		});
	} finally {
		vi.useRealTimers();
		write.mockRestore();
		writeOut.mockRestore();
		consoleError.mockRestore();
		consoleWarn.mockRestore();
		globalThis.fetch = originalFetch;
		restoreEnv();
	}
}

test("the factory registers a native provider with an API-key login and no OAuth handler", async () => {
	await driveExtension({}, async ({ providers, fetches }) => {
		assert.equal(providers.length, 1, "the factory registered no provider");
		const provider = providers[0];
		assert.equal(provider?.id, "omlx");
		assert.equal(provider?.name, "OMLX");
		assert.ok(provider?.auth.apiKey?.login, "no API-key login");
		assert.ok(provider?.auth.apiKey.check, "no API-key check");
		assert.ok(provider?.auth.apiKey.resolve, "no API-key resolve");
		assert.equal(
			provider?.auth.oauth,
			undefined,
			"an OAuth handler is offered",
		);
		assert.ok(provider?.refreshModels, "no refreshModels");
		// A provider with no catalog yet lists nothing and fetches nothing.
		assert.deepEqual(provider?.getModels(), []);
		assert.deepEqual(fetches, []);
	});
});

// catalog-discovery: pi owns when the catalog is fetched, and never on a timer.
test("advancing the clock performs no catalog fetch and no cache write", async () => {
	await driveExtension(
		{ OMLX_API_KEY: "environment-key", OMLX_BASE_URL: FIXTURE_BASE_URL },
		async ({ fetches, providers }) => {
			await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
			assert.deepEqual(fetches, []);
			const provider = providers[0];
			assert.ok(provider, "the factory registered no provider");
			// A publish writes pi's store and nothing of the extension's.
			await publishCatalog(provider);
			assert.equal(existsSync(join(dir, "cache")), false);
		},
	);
});

// catalog-discovery: a catalog that lands after the session started moves no
// model. The extension calls no setModel, so the choice stays pi's.
test("a late publish leaves the session's model alone", async () => {
	await driveExtension({}, async ({ providers, setModels, startSession }) => {
		startSession();
		const provider = providers[0];
		assert.ok(provider, "the factory registered no provider");
		await publishCatalog(provider);
		assert.deepEqual(
			provider.getModels().map((model) => model.id),
			["real-model"],
		);
		assert.deepEqual(setModels, []);
	});
});

test("a second load in one process registers again with no shutdown first", async () => {
	await driveExtension({}, async ({ providers, load }) => {
		assert.equal(providers.length, 1);
		await load();
		assert.equal(providers.length, 2);
	});
});

// The session a test starts needs a stored entry when the warning depends on
// one: `dir` is the agent directory the extension reads.
function storeCredential(record: Record<string, unknown>): void {
	writeFileSync(
		join(dir, "auth.json"),
		JSON.stringify({ [PROVIDER_KEY]: record }, null, 2),
	);
}

// catalog-discovery: ruling C1's landed-model warning, once, naming /model.
test("a configured start with no models warns once and names /model", async () => {
	await driveExtension({}, async ({ notifies, startSession }) => {
		await startSession();
		assert.equal(
			notifies.length,
			1,
			"the start did not show exactly one warning",
		);
		assert.match(notifies[0]?.message ?? "", /\/model/);
		assert.equal(notifies[0]?.type, "warning");
	});
});

// credential-resolution + catalog-discovery: an OAuth-shaped entry is not a
// login any more, and the start says how to replace it — once, and not with the
// landed-model warning beside it.
test("an oauth-shaped entry shows the remedy and nothing else", async () => {
	storeCredential({
		type: "oauth",
		access: "old-key",
		refresh: "",
		expires: 0,
		baseUrl: FIXTURE_BASE_URL,
	});
	const authPath = join(dir, "auth.json");
	const before = readFileSync(authPath);

	await driveExtension({}, async ({ notifies, providers, startSession }) => {
		const provider = providers[0];
		assert.ok(provider, "the factory registered no provider");
		// With no models the landed-model warning would also fire: the remedy
		// is the one that wins, and it is the only one.
		await startSession();
		assert.equal(notifies.length, 1, "the start did not show one warning");
		const message = notifies[0]?.message ?? "";
		// pi's /logout takes no provider argument: the remedy says to choose
		// OMLX there, and to pass the provider to /login instead.
		assert.ok(!message.includes("/logout omlx"), message);
		assert.match(message, /run \/logout/);
		assert.match(message, /choose OMLX/);
		assert.match(message, /\/login omlx/);
		assert.ok(message.indexOf("/logout") < message.indexOf("/login"), message);
		assert.ok(
			!message.includes("/model"),
			`the landed warning followed: ${message}`,
		);
		// Boundary: the entry wins even when models are present.
		await publishCatalog(provider);
		await startSession();
		assert.equal(notifies.length, 2, "the start with models showed no warning");
		assert.ok(!(notifies[1]?.message ?? "").includes("/model"));
	});

	assert.deepEqual(readFileSync(authPath), before, "the entry was rewritten");
});

test("a warm start and an unconfigured start notify nothing", async () => {
	await driveExtension({}, async ({ notifies, providers, startSession }) => {
		const provider = providers[0];
		assert.ok(provider, "the factory registered no provider");
		await publishCatalog(provider);
		await startSession();
		assert.deepEqual(notifies, [], "a warm start warned");
		await startSession(undefined, { providerAuth: async () => undefined });
		assert.deepEqual(notifies, [], "an unconfigured start warned");
	});
});

test("the notice reads getProviderAuth and provider.getModels", async () => {
	await driveExtension(
		{},
		async ({ notifies, providers, startSession, stderr }) => {
			// The status snapshot says configured; the resolution says nothing. A
			// handler reading the status would warn here.
			const asked = await startSession(undefined, {
				providerAuth: async () => undefined,
				providerAuthStatus: () => ({ configured: true }),
			});
			assert.deepEqual(notifies, [], "the status snapshot decided the warning");
			assert.ok(asked.includes("getProviderAuth:omlx"), asked.join());
			assert.ok(
				!asked.some((question) =>
					question.startsWith("getProviderAuthStatus:"),
				),
				asked.join(),
			);

			// A rejection counts as unconfigured and surfaces nothing.
			await startSession(undefined, {
				providerAuth: () => Promise.reject(new Error("ModelsError: auth")),
			});
			assert.deepEqual(notifies, []);
			assert.deepEqual(stderr(), []);

			// The count is the list the provider serves, so one model is a warm start.
			const provider = providers[0];
			assert.ok(provider, "the factory registered no provider");
			await publishCatalog(provider);
			await startSession();
			assert.deepEqual(notifies, [], "a start with one model warned");
		},
	);
});

// catalog-discovery: pi's `notify` is a no-op where it has no session UI, so a
// print or json run stays silent about it.
test("a print-mode start and a json-mode start write nothing to stdout or stderr", async () => {
	await driveExtension({}, async ({ startSession, stderr, stdout }) => {
		await startSession({ hasUI: false, mode: "print" });
		await startSession({ hasUI: false, mode: "json" });
		assert.deepEqual(stderr(), []);
		assert.deepEqual(stdout(), []);
	});
});

// A model as pi's store hands one back on an offline restore.
function restoredModel(
	id: string,
	reasoning: boolean,
): Model<"openai-completions"> {
	return {
		id,
		name: id,
		api: "openai-completions",
		provider: "omlx",
		baseUrl: FIXTURE_BASE_URL,
		reasoning,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 32768,
		maxTokens: 4096,
	};
}

async function restoreCatalog(
	provider: Provider,
	models: unknown[],
): Promise<void> {
	const refresh = provider.refreshModels;
	assert.ok(refresh, "the registered provider supplies no refreshModels");
	await refresh({
		stored: { models: models as Model<"openai-completions">[] },
		allowNetwork: false,
		signal: new AbortController().signal,
		publish: async (publication) => {
			publication.update?.();
			return true;
		},
	});
}

// credential-resolution: the thinking controls read the one list the provider
// serves, so an offline-restored model keeps (or loses) its controls.
test("an offline-restored model with reasoning false has thinking disabled", async () => {
	await driveExtension(
		{},
		async ({ providers, setThinkingLevel, beforeProviderRequest }) => {
			const provider = providers[0];
			assert.ok(provider, "the factory registered no provider");
			await restoreCatalog(provider, [
				restoredModel("restored-model", false),
				restoredModel("thinking-model", true),
			]);
			setThinkingLevel("high");

			assert.deepEqual(
				beforeProviderRequest(
					{ payload: { model: "restored-model", thinking_budget: 1024 } },
					{ model: { provider: "omlx", id: "restored-model" } },
				),
				{
					model: "restored-model",
					thinking_budget: 0,
					chat_template_kwargs: { enable_thinking: false },
				},
			);
			assert.deepEqual(
				beforeProviderRequest(
					{ payload: { model: "thinking-model", thinking_budget: 10240 } },
					{ model: { provider: "omlx", id: "thinking-model" } },
				),
				{ model: "thinking-model", thinking_budget: 10240 },
			);
		},
	);
});

test("a request for a model in no list is left alone", async () => {
	await driveExtension(
		{},
		async ({ providers, setThinkingLevel, beforeProviderRequest }) => {
			const provider = providers[0];
			assert.ok(provider, "the factory registered no provider");
			setThinkingLevel("high");
			const payload = { model: "unknown", thinking_budget: 1024 };

			assert.equal(
				beforeProviderRequest(
					{ payload },
					{ model: { provider: "omlx", id: "unknown" } },
				),
				undefined,
				"a model in no list had its payload rewritten",
			);
		},
	);
});

// environment-configuration: a `.env` beside the entry module configures
// nothing. The copy is what a user installing from the repository has, so a read
// from the working directory, or of another filename, would stay green.
// shortcut: proves the .env is not read; upgrade this test if a configuration
// file reader is proposed.
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
		async ({ fetches, providers }) => {
			assert.equal(process.env.OMLX_API_KEY, undefined);
			assert.equal(process.env.OMLX_BASE_URL, undefined);
			assert.deepEqual(fetches, [], "the copy made a catalog fetch");
			const provider = providers[0];
			assert.ok(provider, "the factory registered no provider");
			const check = provider.auth.apiKey?.check;
			assert.ok(check, "the provider declares no API-key check");
			assert.equal(
				await check({
					ctx: {
						env: async (name: string) => process.env[name],
						fileExists: async () => false,
					},
					credential: undefined,
					signal: new AbortController().signal,
				}),
				undefined,
				"the .env beside the copy configured omlx",
			);
		},
		async () =>
			(
				await import(
					/* @vite-ignore */ pathToFileURL(join(copyDir, "index.ts")).href
				)
			).default,
	);
});

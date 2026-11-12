import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "vitest";
import { _setAuthPathForTesting, PROVIDER_KEY } from "../src/auth-storage.ts";
import {
	applyStoredCredentialToEnv,
	DEFAULT_OMLX_BASE_URL,
	hasOmlxTarget,
	loadConfig,
	normalizeBaseUrl,
	resolveConfiguredApiKey,
	resolveOmlxCredential,
} from "../src/config.ts";

test("normalizeBaseUrl appends /v1 when missing", () => {
	assert.equal(
		normalizeBaseUrl("https://omlx.example.com"),
		"https://omlx.example.com/v1",
	);
});

test("normalizeBaseUrl keeps /v1 when present", () => {
	assert.equal(
		normalizeBaseUrl("https://omlx.example.com/v1"),
		"https://omlx.example.com/v1",
	);
});

test("normalizeBaseUrl strips trailing slashes", () => {
	assert.equal(
		normalizeBaseUrl("https://omlx.example.com/v1/"),
		"https://omlx.example.com/v1",
	);
	assert.equal(
		normalizeBaseUrl("https://omlx.example.com///"),
		"https://omlx.example.com/v1",
	);
});

test("normalizeBaseUrl rejects empty string", () => {
	assert.throws(() => normalizeBaseUrl("   "), /empty/);
});

let dir: string;
let authPath: string;

function storeCredential(baseUrl: string, apiKey: string): void {
	writeFileSync(
		authPath,
		JSON.stringify(
			{ [PROVIDER_KEY]: { type: "api_key", key: apiKey, baseUrl } },
			null,
			2,
		),
	);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pi-omlx-config-"));
	authPath = join(dir, "auth.json");
	_setAuthPathForTesting(authPath);
});
afterEach(() => {
	_setAuthPathForTesting(undefined);
	rmSync(dir, { recursive: true, force: true });
});

test("loadConfig defaults to local OMLX base URL", () => {
	const cfg = loadConfig({});
	assert.equal(cfg.apiRoot, DEFAULT_OMLX_BASE_URL);
	assert.equal(cfg.apiKeyEnvVar, "OMLX_API_KEY");
});

test("loadConfig returns normalized explicit apiRoot and env var name", () => {
	const cfg = loadConfig({ OMLX_BASE_URL: "https://omlx.example.com" });
	assert.equal(cfg.apiRoot, "https://omlx.example.com/v1");
	assert.equal(cfg.apiKeyEnvVar, "OMLX_API_KEY");
});

test("loadConfig uses stored base URL when env is absent", () => {
	storeCredential("https://stored/v1", "stored-k");
	assert.equal(loadConfig({}).apiRoot, "https://stored/v1");
});

test("loadConfig does not mix env API key with stored base URL", () => {
	storeCredential("https://stored/v1", "stored-k");
	assert.equal(
		loadConfig({ OMLX_API_KEY: "shell-k" }).apiRoot,
		DEFAULT_OMLX_BASE_URL,
	);
});

test("resolveConfiguredApiKey prefers explicit env var", () => {
	storeCredential("https://stored/v1", "stored-k");
	assert.equal(resolveConfiguredApiKey({ OMLX_API_KEY: "shell-k" }), "shell-k");
});

test("resolveConfiguredApiKey falls back to stored credential", () => {
	storeCredential("https://stored/v1", "stored-k");
	assert.equal(resolveConfiguredApiKey({}), "stored-k");
});

test("resolveConfiguredApiKey does not mix env base URL with stored key", () => {
	storeCredential("https://stored/v1", "stored-k");
	assert.equal(
		resolveConfiguredApiKey({ OMLX_BASE_URL: "https://shell/v1" }),
		undefined,
	);
});

test("hasOmlxTarget is true with an env API key", () => {
	assert.equal(hasOmlxTarget({ OMLX_API_KEY: "shell-k" }), true);
});

test("hasOmlxTarget is true with an env base URL but no key (keyless)", () => {
	assert.equal(hasOmlxTarget({ OMLX_BASE_URL: "http://localhost:8000" }), true);
});

test("hasOmlxTarget is true when only a stored credential exists", () => {
	storeCredential("https://stored/v1", "stored-k");
	assert.equal(hasOmlxTarget({}), true);
});

test("hasOmlxTarget is false with no key, no base URL, no stored creds", () => {
	assert.equal(hasOmlxTarget({}), false);
});

test("applyStoredCredentialToEnv returns false when no stored creds", () => {
	const env: NodeJS.ProcessEnv = {};
	assert.equal(applyStoredCredentialToEnv(env), false);
	assert.equal(env.OMLX_BASE_URL, undefined);
	assert.equal(env.OMLX_API_KEY, undefined);
});

test("applyStoredCredentialToEnv populates env when stored creds exist", () => {
	storeCredential("https://stored/v1", "stored-k");
	const env: NodeJS.ProcessEnv = {};
	assert.equal(applyStoredCredentialToEnv(env), true);
	assert.equal(env.OMLX_BASE_URL, "https://stored/v1");
	assert.equal(env.OMLX_API_KEY, "stored-k");
});

test("applyStoredCredentialToEnv yields to explicit env pair", () => {
	storeCredential("https://stored/v1", "stored-k");
	const env: NodeJS.ProcessEnv = {
		OMLX_BASE_URL: "https://shell/v1",
		OMLX_API_KEY: "shell-k",
	};
	assert.equal(applyStoredCredentialToEnv(env), false);
	assert.equal(env.OMLX_BASE_URL, "https://shell/v1");
	assert.equal(env.OMLX_API_KEY, "shell-k");
});

test("applyStoredCredentialToEnv does not mix partial env with stored creds", () => {
	storeCredential("https://stored/v1", "stored-k");
	const env: NodeJS.ProcessEnv = { OMLX_BASE_URL: "https://shell/v1" };
	assert.equal(applyStoredCredentialToEnv(env), false);
	assert.equal(env.OMLX_BASE_URL, "https://shell/v1");
	assert.equal(env.OMLX_API_KEY, undefined);
});

// The resolver's matrix, on plain objects: the stored URL and key differ from
// the environment's, and neither differs from the default by accident.
const STORED_URL = "http://127.0.0.1:9400/v1";
const ENV_URL = "http://10.0.0.5:8000/v1";
const STORED_KEY = "stored-key";
const ENV_KEY = "env-key";

const ENV_STATES: NodeJS.ProcessEnv[] = [
	{},
	{ OMLX_API_KEY: ENV_KEY },
	{ OMLX_BASE_URL: ENV_URL },
	{ OMLX_API_KEY: ENV_KEY, OMLX_BASE_URL: ENV_URL },
];

function resolved(apiRoot: string, apiKey: string, source: string) {
	return { configured: true, apiRoot, apiKey, source };
}

test("resolveOmlxCredential reports nothing stored as unconfigured", () => {
	assert.deepEqual(resolveOmlxCredential(undefined, {}), { configured: false });
	assert.deepEqual(
		resolveOmlxCredential(undefined, { OMLX_BASE_URL: ENV_URL }),
		{
			configured: false,
		},
	);
});

test("resolveOmlxCredential takes both halves from the environment when nothing is stored", () => {
	assert.deepEqual(
		resolveOmlxCredential(undefined, { OMLX_API_KEY: ENV_KEY }),
		resolved(DEFAULT_OMLX_BASE_URL, ENV_KEY, "environment"),
	);
	assert.deepEqual(
		resolveOmlxCredential(undefined, {
			OMLX_API_KEY: ENV_KEY,
			OMLX_BASE_URL: ENV_URL,
		}),
		resolved(ENV_URL, ENV_KEY, "environment"),
	);
	assert.deepEqual(resolveOmlxCredential(undefined, { OMLX_API_KEY: "" }), {
		configured: false,
	});
});

test("resolveOmlxCredential reads a stored oauth record's own URL and access", () => {
	for (const env of ENV_STATES) {
		assert.deepEqual(
			resolveOmlxCredential(
				{ type: "oauth", access: STORED_KEY, baseUrl: STORED_URL },
				env,
			),
			resolved(STORED_URL, STORED_KEY, "stored"),
			`environment ${JSON.stringify(env)}`,
		);
		assert.deepEqual(
			resolveOmlxCredential(
				{ type: "oauth", access: "", baseUrl: STORED_URL },
				env,
			),
			resolved(STORED_URL, "", "stored"),
			`environment ${JSON.stringify(env)}`,
		);
	}
	assert.deepEqual(
		resolveOmlxCredential(
			{ type: "oauth", access: STORED_KEY, baseUrl: DEFAULT_OMLX_BASE_URL },
			{},
		),
		resolved(DEFAULT_OMLX_BASE_URL, STORED_KEY, "stored"),
	);
});

test("resolveOmlxCredential reads a stored api_key record with a key", () => {
	for (const env of ENV_STATES) {
		assert.deepEqual(
			resolveOmlxCredential(
				{ type: "api_key", key: STORED_KEY, baseUrl: STORED_URL },
				env,
			),
			resolved(STORED_URL, STORED_KEY, "stored"),
			`environment ${JSON.stringify(env)}`,
		);
	}
	assert.deepEqual(
		resolveOmlxCredential(
			{ type: "api_key", key: STORED_KEY },
			{ OMLX_BASE_URL: ENV_URL },
		),
		resolved(DEFAULT_OMLX_BASE_URL, STORED_KEY, "stored"),
	);
	assert.deepEqual(
		resolveOmlxCredential({ type: "api_key", key: "k" }, {}),
		resolved(DEFAULT_OMLX_BASE_URL, "k", "stored"),
	);
});

test("resolveOmlxCredential reports a stored api_key with an empty key as unconfigured", () => {
	for (const env of ENV_STATES) {
		assert.deepEqual(
			resolveOmlxCredential({ type: "api_key", key: "" }, env),
			{ configured: false },
			`environment ${JSON.stringify(env)}`,
		);
	}
});

test("resolveOmlxCredential reports a stored record of another type as unconfigured", () => {
	assert.deepEqual(resolveOmlxCredential({ type: "mystery" }, {}), {
		configured: false,
	});
	assert.deepEqual(
		resolveOmlxCredential({ type: "mystery" }, { OMLX_API_KEY: ENV_KEY }),
		{ configured: false },
	);
	assert.deepEqual(
		resolveOmlxCredential(
			{ type: "mystery", key: "" },
			{ OMLX_API_KEY: ENV_KEY },
		),
		{ configured: false },
	);
});

test("resolveOmlxCredential falls back to the default URL for a blank URL", () => {
	assert.deepEqual(
		resolveOmlxCredential(
			{ type: "oauth", access: STORED_KEY, baseUrl: "   " },
			{},
		),
		resolved(DEFAULT_OMLX_BASE_URL, STORED_KEY, "stored"),
	);
	assert.deepEqual(
		resolveOmlxCredential(undefined, {
			OMLX_API_KEY: ENV_KEY,
			OMLX_BASE_URL: "   ",
		}),
		resolved(DEFAULT_OMLX_BASE_URL, ENV_KEY, "environment"),
	);
	assert.deepEqual(
		resolveOmlxCredential(undefined, {
			OMLX_API_KEY: ENV_KEY,
			OMLX_BASE_URL: "",
		}),
		resolved(DEFAULT_OMLX_BASE_URL, ENV_KEY, "environment"),
	);
});

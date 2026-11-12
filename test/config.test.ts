import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
	DEFAULT_OMLX_BASE_URL,
	normalizeBaseUrl,
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

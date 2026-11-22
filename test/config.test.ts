import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
	DEFAULT_OMLX_BASE_URL,
	KEYLESS_PLACEHOLDER,
	normalizeBaseUrl,
	resolveOmlx,
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

// The environment pi would hand the hook, plus the record of whether the
// resolution asked it anything: the stored side must consult none of it.
function envLookup(env: NodeJS.ProcessEnv): {
	asked: string[];
	lookup: (name: string) => Promise<string | undefined>;
} {
	const asked: string[] = [];
	return {
		asked,
		lookup: async (name) => {
			asked.push(name);
			return env[name];
		},
	};
}

test("resolveOmlx falls back to the default URL for a stored credential with no base URL", async () => {
	const { asked, lookup } = envLookup({ OMLX_BASE_URL: ENV_URL });
	// A blank stored URL carries no instruction either, as an environment one
	// does not (resolveBaseUrl's rule, shared by both sides).
	for (const credential of [
		{ key: STORED_KEY },
		{ key: STORED_KEY, env: { OMLX_BASE_URL: "   " } },
	]) {
		assert.deepEqual(
			await resolveOmlx(credential, lookup),
			{
				baseUrl: DEFAULT_OMLX_BASE_URL,
				apiKey: STORED_KEY,
				source: "stored",
			},
			`credential ${JSON.stringify(credential)}`,
		);
	}
	assert.deepEqual(asked, [], `the environment was read: ${asked.join()}`);
});

test("resolveOmlx reads both halves from the environment and reports nothing for a URL alone", async () => {
	assert.deepEqual(
		await resolveOmlx(
			undefined,
			envLookup({ OMLX_API_KEY: ENV_KEY, OMLX_BASE_URL: ENV_URL }).lookup,
		),
		{ baseUrl: ENV_URL, apiKey: ENV_KEY, source: "environment" },
	);
	assert.deepEqual(
		await resolveOmlx(undefined, envLookup({ OMLX_API_KEY: ENV_KEY }).lookup),
		{ baseUrl: DEFAULT_OMLX_BASE_URL, apiKey: ENV_KEY, source: "environment" },
	);
	for (const env of [{ OMLX_BASE_URL: ENV_URL }, {}, { OMLX_API_KEY: "" }]) {
		assert.equal(
			await resolveOmlx(undefined, envLookup(env).lookup),
			undefined,
			`environment ${JSON.stringify(env)}`,
		);
	}
});

test("resolveOmlx returns the placeholder for a stored credential with no key while OMLX_API_KEY is set", async () => {
	const { asked, lookup } = envLookup({ OMLX_API_KEY: ENV_KEY });
	// `key: ""` is where `||` and `??` differ, and an empty bearer throws
	// inside pi-ai's client rather than reaching the server.
	for (const credential of [
		{ env: { OMLX_BASE_URL: STORED_URL } },
		{ key: "", env: { OMLX_BASE_URL: STORED_URL } },
	]) {
		assert.deepEqual(
			await resolveOmlx(credential, lookup),
			{ baseUrl: STORED_URL, apiKey: KEYLESS_PLACEHOLDER, source: "stored" },
			`credential ${JSON.stringify(credential)}`,
		);
	}
	assert.deepEqual(asked, [], `the environment was read: ${asked.join()}`);
});

test("resolveOmlx returns the stored URL and key while both variables are set", async () => {
	for (const env of [
		{ OMLX_API_KEY: ENV_KEY, OMLX_BASE_URL: ENV_URL },
		{ OMLX_BASE_URL: ENV_URL },
		{ OMLX_API_KEY: ENV_KEY },
	]) {
		const { asked, lookup } = envLookup(env);
		assert.deepEqual(
			await resolveOmlx(
				{ key: STORED_KEY, env: { OMLX_BASE_URL: STORED_URL } },
				lookup,
			),
			{ baseUrl: STORED_URL, apiKey: STORED_KEY, source: "stored" },
			`environment ${JSON.stringify(env)}`,
		);
		assert.deepEqual(asked, [], `the environment was read: ${asked.join()}`);
	}
});

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "vitest";
import {
	_setAuthPathForTesting,
	loadOmlxCredential,
	PROVIDER_KEY,
	readOmlxCredential,
} from "../src/auth-storage.ts";

let dir: string;
let authPath: string;

function writeAuth(data: Record<string, unknown>): void {
	writeFileSync(authPath, JSON.stringify(data, null, 2));
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pi-omlx-auth-"));
	authPath = join(dir, "auth.json");
	_setAuthPathForTesting(authPath);
});
afterEach(() => {
	_setAuthPathForTesting(undefined);
	rmSync(dir, { recursive: true, force: true });
});

test("PROVIDER_KEY is omlx", () => {
	assert.equal(PROVIDER_KEY, "omlx");
});

test("loadOmlxCredential returns undefined when nothing is stored", () => {
	assert.equal(loadOmlxCredential(), undefined);
});

test("load ignores a credential keyed by the package name", () => {
	writeAuth({ "pi-omlx": { type: "api_key", key: "package-name-key" } });
	assert.equal(loadOmlxCredential(), undefined);
});

test("load reads normal /login api-key credential without base URL", () => {
	writeAuth({ [PROVIDER_KEY]: { type: "api_key", key: "omlx-key" } });
	assert.deepEqual(loadOmlxCredential(), {
		baseUrl: undefined,
		apiKey: "omlx-key",
	});
});

test("load reads legacy oauth-shaped OMLX credential", () => {
	writeAuth({
		[PROVIDER_KEY]: {
			type: "oauth",
			access: "omlx-key",
			refresh: "omlx-key",
			expires: Date.now() + 1000,
			baseUrl: "https://omlx.example.com/v1",
		},
	});
	assert.deepEqual(loadOmlxCredential(), {
		baseUrl: "https://omlx.example.com/v1",
		apiKey: "omlx-key",
	});
});

test("load reads keyless oauth-shaped credential (baseUrl only, empty access)", () => {
	writeAuth({
		[PROVIDER_KEY]: {
			type: "oauth",
			access: "",
			refresh: "",
			expires: Number.POSITIVE_INFINITY,
			baseUrl: "https://omlx.example.com/v1",
		},
	});
	assert.deepEqual(loadOmlxCredential(), {
		baseUrl: "https://omlx.example.com/v1",
		apiKey: "",
	});
});

test("load ignores sibling provider entries", () => {
	writeAuth({
		anthropic: { type: "oauth", access: "x", refresh: "r", expires: 0 },
		[PROVIDER_KEY]: { type: "api_key", key: "k" },
	});
	assert.deepEqual(loadOmlxCredential(), { baseUrl: undefined, apiKey: "k" });
});

test("load returns undefined when auth.json does not exist", () => {
	assert.equal(loadOmlxCredential(), undefined);
});

test("load ignores entries missing key", () => {
	writeAuth({ [PROVIDER_KEY]: { type: "api_key", key: "" } });
	assert.equal(loadOmlxCredential(), undefined);
});

// The read under PROVIDER_KEY returns the record unfiltered: the resolver, not
// this function, decides what a present credential means. Each case points its
// own PI_CODING_AGENT_DIR at this test's temp directory and writes the file the
// production read resolves there.
function storeUnderAgentDir(auth: Record<string, unknown>): void {
	process.env.PI_CODING_AGENT_DIR = dir;
	writeFileSync(join(dir, "auth.json"), JSON.stringify(auth, null, 2));
}

afterEach(() => {
	delete process.env.PI_CODING_AGENT_DIR;
});

test("readOmlxCredential returns a stored api_key record with an empty key", () => {
	storeUnderAgentDir({ [PROVIDER_KEY]: { type: "api_key", key: "" } });
	assert.deepEqual(readOmlxCredential(), { type: "api_key", key: "" });
});

test("readOmlxCredential returns a stored oauth record with its baseUrl and access", () => {
	storeUnderAgentDir({
		[PROVIDER_KEY]: {
			type: "oauth",
			access: "stored-key",
			refresh: "",
			expires: 42,
			baseUrl: "https://omlx.example.com/v1",
		},
	});
	assert.deepEqual(readOmlxCredential(), {
		type: "oauth",
		access: "stored-key",
		refresh: "",
		expires: 42,
		baseUrl: "https://omlx.example.com/v1",
	});
});

test("readOmlxCredential returns undefined when no omlx entry is stored", () => {
	storeUnderAgentDir({
		anthropic: { type: "oauth", access: "x", refresh: "r", expires: 0 },
	});
	assert.equal(readOmlxCredential(), undefined);
});

test("readOmlxCredential returns a record of an unknown type as-is", () => {
	storeUnderAgentDir({ [PROVIDER_KEY]: { type: "mystery", key: "k" } });
	assert.deepEqual(readOmlxCredential(), { type: "mystery", key: "k" });
});

test("readOmlxCredential returns undefined when auth.json does not exist", () => {
	process.env.PI_CODING_AGENT_DIR = dir;
	assert.equal(readOmlxCredential(), undefined);
});

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "vitest";
import {
	_setAuthPathForTesting,
	PROVIDER_KEY,
	readOmlxCredential,
} from "../src/auth-storage.ts";

let dir: string;
let savedAgentDir: string | undefined;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pi-omlx-auth-"));
	savedAgentDir = process.env.PI_CODING_AGENT_DIR;
	_setAuthPathForTesting(join(dir, "auth.json"));
});
afterEach(() => {
	_setAuthPathForTesting(undefined);
	if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
	rmSync(dir, { recursive: true, force: true });
});

test("PROVIDER_KEY is omlx", () => {
	assert.equal(PROVIDER_KEY, "omlx");
});

// The read under PROVIDER_KEY returns the record unfiltered: the resolver, not
// this function, decides what a present credential means. Each case points its
// own PI_CODING_AGENT_DIR at this test's temp directory and writes the file the
// production read resolves there.
function storeUnderAgentDir(auth: Record<string, unknown>): void {
	process.env.PI_CODING_AGENT_DIR = dir;
	writeFileSync(join(dir, "auth.json"), JSON.stringify(auth, null, 2));
}

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

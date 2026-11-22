import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, inject, test } from "vitest";
import { PROVIDER_KEY, readOmlxCredential } from "../src/auth-storage.ts";

let dir: string;
let savedAgentDir: string | undefined;

beforeEach(() => {
	dir = mkdtempSync(join(inject("isolationRoot"), "pi-omlx-auth-"));
	savedAgentDir = process.env.PI_CODING_AGENT_DIR;
});
afterEach(() => {
	if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
});

test("PROVIDER_KEY is omlx", () => {
	assert.equal(PROVIDER_KEY, "omlx");
});

// The read under PROVIDER_KEY returns the record unfiltered: the resolver, not
// this function, decides what a present credential means. Each case writes its
// record under the agent directory it points PI_CODING_AGENT_DIR at, so the
// record is the one the production path resolves too.
function storeUnderAgentDir(auth: Record<string, unknown>): void {
	process.env.PI_CODING_AGENT_DIR = dir;
	writeFileSync(join(dir, "auth.json"), JSON.stringify(auth, null, 2));
}

test("readOmlxCredential returns a stored api_key record's type", () => {
	storeUnderAgentDir({ [PROVIDER_KEY]: { type: "api_key", key: "" } });
	assert.equal(readOmlxCredential()?.type, "api_key");
});

test("readOmlxCredential returns a stored oauth record's type", () => {
	storeUnderAgentDir({
		[PROVIDER_KEY]: {
			type: "oauth",
			access: "stored-key",
			refresh: "",
			expires: 42,
			baseUrl: "https://omlx.example.com/v1",
		},
	});
	assert.equal(readOmlxCredential()?.type, "oauth");
});

test("readOmlxCredential returns undefined when no omlx entry is stored", () => {
	storeUnderAgentDir({
		anthropic: { type: "oauth", access: "x", refresh: "r", expires: 0 },
	});
	assert.equal(readOmlxCredential(), undefined);
});

test("readOmlxCredential returns a record of an unknown type", () => {
	storeUnderAgentDir({ [PROVIDER_KEY]: { type: "mystery", key: "k" } });
	assert.equal(readOmlxCredential()?.type, "mystery");
});

test("readOmlxCredential returns undefined when auth.json does not exist", () => {
	process.env.PI_CODING_AGENT_DIR = dir;
	assert.equal(readOmlxCredential(), undefined);
});

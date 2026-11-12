import { strict as assert } from "node:assert";
import { join } from "node:path";
import { test } from "vitest";
import { escapedPaths } from "./guard.ts";

const ROOT = "/tmp/pi-omlx-test-abc";

test("the root itself is inside", () => {
	assert.deepEqual(escapedPaths(ROOT, [ROOT]), []);
});

test("a path under the root is inside", () => {
	assert.deepEqual(escapedPaths(ROOT, [join(ROOT, "agent", "auth.json")]), []);
});

test("a sibling whose name starts with the root is escaped", () => {
	assert.deepEqual(escapedPaths(ROOT, ["/tmp/pi-omlx-test-abc-leak"]), [
		"/tmp/pi-omlx-test-abc-leak",
	]);
});

test("a relative path is escaped", () => {
	assert.deepEqual(escapedPaths(ROOT, ["relative/path"]), ["relative/path"]);
});

test("an empty string is escaped", () => {
	assert.deepEqual(escapedPaths(ROOT, [""]), [""]);
});

test("an absent path is escaped as <absent>", () => {
	assert.deepEqual(escapedPaths(ROOT, [undefined]), ["<absent>"]);
});

test("a mixed list returns only the escaped entries", () => {
	assert.deepEqual(
		escapedPaths(ROOT, [
			ROOT,
			join(ROOT, "home"),
			undefined,
			"/tmp/pi-omlx-test-abc-leak",
			"relative",
		]),
		["<absent>", "/tmp/pi-omlx-test-abc-leak", "relative"],
	);
});

import { strict as assert } from "node:assert";
import { test, vi } from "vitest";

// The answers pinned here are what the predicate in src/debug.ts returns for
// each value of the variable: unset and the empty string are falsy, and "0"
// arrives as a truthy string.
async function emittedLines(value: string | undefined): Promise<string[]> {
	vi.resetModules();
	vi.stubEnv("PI_OMLX_DEBUG", value);
	const write = vi
		.spyOn(process.stderr, "write")
		.mockImplementation(() => true);
	try {
		const { omlxDebug } = await import("../src/debug.ts");
		omlxDebug("debug_test_event", { source: "test" });
		return write.mock.calls.map(([chunk]) => String(chunk));
	} finally {
		write.mockRestore();
		vi.unstubAllEnvs();
	}
}

test("tracing stays off when PI_OMLX_DEBUG is unset", async () => {
	assert.deepEqual(await emittedLines(undefined), []);
});

test("the empty string turns tracing off", async () => {
	assert.deepEqual(await emittedLines(""), []);
});

test("the string 0 turns tracing on", async () => {
	assert.equal((await emittedLines("0")).length, 1);
});

test("a set value turns tracing on and the line carries the new prefix", async () => {
	const lines = await emittedLines("1");
	assert.equal(lines.length, 1);
	assert.ok(
		lines[0].startsWith("[pi-omlx] "),
		`emitted line lacks the [pi-omlx] prefix: ${lines[0]}`,
	);
});

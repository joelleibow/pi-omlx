import type { PathLike } from "node:fs";
import { homedir } from "node:os";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { inject, vi } from "vitest";
import { resolveLocalModelSettingsPath } from "../../src/catalog.ts";
import { escapedPaths } from "./guard.ts";

vi.mock("node:fs", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs")>();
	// The factory can run while this file's own imports are still initializing,
	// so it imports what it needs itself.
	const [{ fileURLToPath }, { resolve }] = await Promise.all([
		import("node:url"),
		import("node:path"),
	]);
	const repoDotenv = fileURLToPath(new URL("../../.env", import.meta.url));
	const existsSync = (path: PathLike): boolean =>
		resolve(String(path)) === repoDotenv ? false : original.existsSync(path);
	return { ...original, existsSync, default: { ...original, existsSync } };
});

const root = inject("isolationRoot");
if (!root) {
	throw new Error("pi-omlx test isolation: the run provided no isolation root");
}

const escaped = escapedPaths(root, [
	getAgentDir(),
	homedir(),
	resolveLocalModelSettingsPath(process.env.OMLX_MODEL_SETTINGS_PATH),
]);
if (escaped.length > 0) {
	throw new Error(
		`pi-omlx test isolation escaped: ${escaped.join(", ")} are not under ${root}`,
	);
}

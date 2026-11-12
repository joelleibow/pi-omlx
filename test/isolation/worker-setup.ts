import { homedir } from "node:os";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { inject } from "vitest";
import { resolveLocalModelSettingsPath } from "../../src/catalog.ts";
import { escapedPaths } from "./guard.ts";

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

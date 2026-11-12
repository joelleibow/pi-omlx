import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
	interface ProvidedContext {
		isolationRoot: string;
	}
}

export default function setup(project: TestProject): void {
	// Real path, so the path the environment carries and the path the guard
	// compares are the same string (macOS: /var/... resolves to /private/var/...).
	const root = mkdtempSync(join(realpathSync(tmpdir()), "pi-omlx-test-"));
	process.env.HOME = join(root, "home");
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	project.provide("isolationRoot", root);
}

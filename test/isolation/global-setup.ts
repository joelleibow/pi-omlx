import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
	interface ProvidedContext {
		isolationRoot: string;
	}
}

// Every key the extension reads besides PI_CODING_AGENT_DIR, from the search of
// index.ts, src/*.ts and .env.example Eleanor Addendum 1 records.
const CALLER_ENV_KEYS = [
	"OMLX_API_KEY",
	"OMLX_BASE_URL",
	"OMLX_MODEL_SETTINGS_PATH",
	"OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS",
	"PI_OMLX_DEBUG",
] as const;

let root: string | undefined;

export function setup(project: TestProject): void {
	// Real path, so the path the environment carries and the path the guard
	// compares are the same string (macOS: /var/... resolves to /private/var/...).
	root = mkdtempSync(join(realpathSync(tmpdir()), "pi-omlx-test-"));
	process.env.HOME = join(root, "home");
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	for (const key of CALLER_ENV_KEYS) delete process.env[key];
	project.provide("isolationRoot", root);
}

export function teardown(): void {
	if (root === undefined) return;
	// shortcut: the root leaks on SIGINT, SIGTERM and SIGKILL; add
	// process.once("exit") removal if leaked pi-omlx-test-* roots accumulate.
	rmSync(root, { recursive: true, force: true });
}

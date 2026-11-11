import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

const HOME = homedir();
const MODEL_SETTINGS = join(HOME, ".omlx", "model_settings.json");
const MODELS_DIR = join(HOME, "models");
const SMOKE_LOG_DIR = resolve("log/smoke-test");

const CACHE_PATHS = [
	join(HOME, ".cache", "omlx"),
	join(HOME, ".omlx", "cache"),
	join(HOME, "Library", "Caches", "omlx"),
	join(HOME, ".cache", "huggingface", "hub"),
];

const SETTINGS_FIELDS = [
	"model_alias",
	"model_type_override",
	"max_context_window",
	"max_tokens",
	"thinking_budget_enabled",
	"thinking_budget_tokens",
	"reasoning_parser",
	"forced_ct_kwargs",
	"chat_template_kwargs",
	"dflash_enabled",
	"specprefill_enabled",
	"turboquant_kv_enabled",
	"ttl_seconds",
	"index_cache_freq",
];

function main(): void {
	const requestedModels = process.argv.slice(2).filter((arg) => arg !== "--");
	section("OMLX DEBUG");
	line(`time: ${new Date().toISOString()}`);
	line(`cwd: ${process.cwd()}`);
	line(`OMLX_BASE_URL: ${process.env.OMLX_BASE_URL ?? "(default)"}`);
	line(`OMLX_API_KEY: ${process.env.OMLX_API_KEY ? "(set)" : "(unset)"}`);

	const settings = readJsonFile(MODEL_SETTINGS);
	const models = getModelSettings(settings);
	const selectedNames = selectModelNames(models, requestedModels);

	section("CONFIG");
	fileSummary("model settings", MODEL_SETTINGS);
	dirSummary("models dir", MODELS_DIR);
	dirSummary("smoke logs", SMOKE_LOG_DIR);

	section("MODEL SETTINGS");
	if (!models) {
		line("missing or unreadable ~/.omlx/model_settings.json");
	} else {
		line(`configured models: ${Object.keys(models).length}`);
		if (selectedNames.length === 0) {
			line("no selected models found under ~/.omlx/model_settings.json");
		}
		for (const name of selectedNames) {
			printModel(name, asObject(models[name]));
		}
	}

	section("MODEL PATHS");
	printModelPaths(selectedNames);

	section("LOGS");
	printLatestFiles("latest smoke logs", SMOKE_LOG_DIR, 8);

	section("CACHE STATE");
	for (const path of CACHE_PATHS) {
		dirSummary(basename(path), path);
	}

	section("NEXT CHECKS");
	line("This task reports shell-visible filesystem diagnostics only.");
	line("Use `mise run smoke:omlx` when you need a live OMLX request check.");
}

function section(title: string): void {
	console.log(`\n== ${title} ==`);
}

function line(value: string): void {
	console.log(value);
}

function readJsonFile(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

function getModelSettings(settings: unknown): JsonObject | undefined {
	const root = asObject(settings);
	if (!root) return undefined;
	return asObject(root.models) ?? root;
}

function selectModelNames(
	models: JsonObject | undefined,
	requested: string[],
): string[] {
	if (!models) return [];
	if (requested.length > 0) return requested.filter((name) => name in models);
	return Object.keys(models).sort((a, b) => a.localeCompare(b));
}

function printModel(name: string, settings: JsonObject | undefined): void {
	console.log(`\n[${name}]`);
	if (!settings) {
		line("missing settings entry");
		return;
	}
	for (const field of SETTINGS_FIELDS) {
		const value = settings[field];
		if (value !== undefined) line(`${field}: ${formatValue(value)}`);
	}
	const modelPath = join(MODELS_DIR, name);
	const targetPath = resolveModelPath(modelPath);
	printTemplateHash(targetPath);
	printRopeConfig(targetPath);
}

function printModelPaths(modelNames: string[]): void {
	if (!existsSync(MODELS_DIR)) {
		line(`missing: ${MODELS_DIR}`);
		return;
	}
	const names =
		modelNames.length > 0
			? modelNames
			: readdirSync(MODELS_DIR).sort((a, b) => a.localeCompare(b));
	for (const name of names) {
		const path = join(MODELS_DIR, name);
		if (!existsSync(path)) {
			line(`${name}: missing ${path}`);
			continue;
		}
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) {
			line(`${name}: ${path} -> ${resolveModelPath(path)}`);
		} else {
			line(`${name}: ${path}`);
		}
	}
}

function printTemplateHash(modelPath: string | undefined): void {
	if (!modelPath) return;
	const templatePath = join(modelPath, "chat_template.jinja");
	if (!existsSync(templatePath)) {
		line("chat_template.jinja: missing");
		return;
	}
	line(`chat_template.jinja sha256: ${sha256(templatePath)}`);
}

function printRopeConfig(modelPath: string | undefined): void {
	if (!modelPath) return;
	const config = asObject(readJsonFile(join(modelPath, "config.json")));
	const textConfig = asObject(config?.text_config);
	const rope = textConfig?.rope_parameters ?? config?.rope_parameters;
	if (rope !== undefined) line(`rope_parameters: ${formatValue(rope)}`);
}

function printLatestFiles(label: string, dir: string, limit: number): void {
	console.log(`\n[${label}]`);
	if (!existsSync(dir)) {
		line(`missing: ${dir}`);
		return;
	}
	const files = readdirSync(dir)
		.map((name) => join(dir, name))
		.filter((path) => statSync(path).isFile())
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
		.slice(0, limit);
	for (const file of files) fileSummary(basename(file), file);
}

function fileSummary(label: string, path: string): void {
	if (!existsSync(path)) {
		line(`${label}: missing (${path})`);
		return;
	}
	const stat = statSync(path);
	line(
		`${label}: ${path} (${formatBytes(stat.size)}, mtime ${stat.mtime.toISOString()})`,
	);
}

function dirSummary(label: string, path: string): void {
	if (!existsSync(path)) {
		line(`${label}: missing (${path})`);
		return;
	}
	const stat = statSync(path);
	if (!stat.isDirectory()) {
		fileSummary(label, path);
		return;
	}
	const entries = readdirSync(path);
	line(
		`${label}: ${path} (${entries.length} entries, mtime ${stat.mtime.toISOString()})`,
	);
}

function resolveModelPath(path: string): string | undefined {
	if (!existsSync(path)) return undefined;
	try {
		const link = lstatSync(path);
		const resolved = link.isSymbolicLink()
			? resolve(path, "..", readlinkSync(path))
			: path;
		return statSync(resolved).isDirectory() ? resolve(resolved) : undefined;
	} catch {
		return undefined;
	}
}

function asObject(value: unknown): JsonObject | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonObject)
		: undefined;
}

function formatValue(value: unknown): string {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	)
		return String(value);
	return JSON.stringify(value);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

main();

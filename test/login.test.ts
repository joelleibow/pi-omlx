import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	AuthPrompt,
	ProviderAuthInteraction,
} from "@earendil-works/pi-ai";
import { afterEach, beforeEach, inject, test } from "vitest";
import { refreshOmlxCatalog } from "../src/catalog.ts";
import { DEFAULT_OMLX_BASE_URL, KEYLESS_PLACEHOLDER } from "../src/config.ts";
import { loginOmlx } from "../src/login.ts";

const BASE_URL = "http://127.0.0.1:8000/v1";
const originalFetch = globalThis.fetch;

interface RecordedRequest {
	url: string;
	authorization: string | undefined;
	signal: AbortSignal | undefined;
}

function catalogResponse(models: unknown[]): Response {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		json: async () => ({ models }),
		text: async () => JSON.stringify({ models }),
	} as Response;
}

function usableModel(id = "login-model"): Record<string, unknown> {
	return { id, max_context_window: 65536, max_tokens: 8192 };
}

function recordRequests(
	respond: () => Response | Promise<Response>,
): RecordedRequest[] {
	const requests: RecordedRequest[] = [];
	globalThis.fetch = (async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		const headers = init?.headers as Record<string, string> | undefined;
		requests.push({
			url: String(url),
			authorization: headers?.Authorization,
			signal: init?.signal ?? undefined,
		});
		return respond();
	}) as typeof fetch;
	return requests;
}

// Every test starts from a server that answers the probe with one usable model;
// a test that needs another answer records its own.
let requests: RecordedRequest[] = [];

beforeEach(() => {
	requests = recordRequests(() => catalogResponse([usableModel()]));
});

const restores: Array<() => void> = [];

afterEach(() => {
	globalThis.fetch = originalFetch;
	for (const restore of restores.splice(0)) restore();
});

// The agent directory a login could write into, if it wrote anything.
function emptyAgentDir(): string {
	const dir = mkdtempSync(join(inject("isolationRoot"), "login-agent-"));
	const saved = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = dir;
	restores.push(() => {
		if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = saved;
	});
	return dir;
}

// What pi hands `auth.apiKey.login`: the prompts it answers, and the signal
// that cancels the whole flow.
function interactionAnswering(
	values: string[],
	signal = new AbortController().signal,
): ProviderAuthInteraction & { prompts: AuthPrompt[] } {
	const queue = [...values];
	const prompts: AuthPrompt[] = [];
	return {
		prompts,
		signal,
		prompt: async (prompt) => {
			prompts.push(prompt);
			return queue.shift() ?? "";
		},
		notify: () => {},
	};
}

test("loginOmlx prompts for the URL then the key and returns an api_key credential", async () => {
	const interaction = interactionAnswering([
		"http://127.0.0.1:8000",
		" omlx-key ",
	]);

	const credential = await loginOmlx(interaction);

	assert.equal(credential.type, "api_key");
	assert.equal(credential.key, "omlx-key");
	assert.equal(credential.env?.OMLX_BASE_URL, "http://127.0.0.1:8000/v1");
	assert.deepEqual(
		interaction.prompts.map((prompt) => prompt.type),
		["text", "secret"],
	);
	const urlPrompt = interaction.prompts[0];
	assert.ok(
		urlPrompt?.type === "text",
		"the first prompt is not a text prompt",
	);
	assert.equal(urlPrompt.placeholder, DEFAULT_OMLX_BASE_URL);
	assert.equal(requests[0]?.url, `${BASE_URL}/models/status`);
	assert.equal(requests[0]?.authorization, "Bearer omlx-key");
});

test("loginOmlx normalizes a URL that already ends in /v1 or carries trailing slashes", async () => {
	for (const [entered, expected] of [
		["https://omlx.example.com/v1", "https://omlx.example.com/v1"],
		["https://omlx.example.com/v1/", "https://omlx.example.com/v1"],
		["https://omlx.example.com///", "https://omlx.example.com/v1"],
	]) {
		const credential = await loginOmlx(
			interactionAnswering([entered ?? "", "key"]),
		);
		assert.equal(credential.env?.OMLX_BASE_URL, expected, entered ?? "");
	}
});

test("loginOmlx omits the key when the entered key is whitespace only", async () => {
	const credential = await loginOmlx(
		interactionAnswering(["http://127.0.0.1:8000", "   "]),
	);

	assert.equal("key" in credential, false, JSON.stringify(credential));
	assert.equal(JSON.stringify(credential).includes('"key"'), false);
	assert.equal(credential.env?.OMLX_BASE_URL, "http://127.0.0.1:8000/v1");
});

test("loginOmlx rejects an empty base URL without fetching", async () => {
	for (const entered of ["", "   "]) {
		const interaction = interactionAnswering([entered, "key"]);
		await assert.rejects(
			() => loginOmlx(interaction),
			/base URL/i,
			`entered ${JSON.stringify(entered)}`,
		);
		assert.equal(
			interaction.prompts.length,
			1,
			"a blank URL still asked for a key",
		);
	}
	assert.deepEqual(requests, []);
});

test("loginOmlx fetches with the credential it is about to return and neither publishes nor registers", async () => {
	const agentDir = emptyAgentDir();

	const credential = await loginOmlx(
		interactionAnswering([BASE_URL, "omlx-key"]),
	);

	assert.equal(credential.key, "omlx-key");
	assert.equal(requests.length, 1, "the probe did not fetch once");
	assert.equal(requests[0]?.url, `${BASE_URL}/models/status`);
	assert.equal(requests[0]?.authorization, "Bearer omlx-key");
	// Nothing stored, published or registered: the agent directory stays empty,
	// and the login has no access to registration at all.
	assert.deepEqual(readdirSync(agentDir), []);
});

test("a keyless probe sends the placeholder bearer", async () => {
	await loginOmlx(interactionAnswering([BASE_URL, ""]));

	assert.equal(requests[0]?.authorization, `Bearer ${KEYLESS_PLACEHOLDER}`);
});

test("loginOmlx fails with the cause when the fetch throws", async () => {
	const agentDir = emptyAgentDir();
	recordRequests(() => {
		throw new Error("fetch failed: connect ECONNREFUSED 127.0.0.1:8000");
	});

	await assert.rejects(
		() => loginOmlx(interactionAnswering([BASE_URL, "omlx-key"])),
		(error: Error) => {
			assert.match(error.message, /ECONNREFUSED/);
			assert.ok(error.message.includes(BASE_URL), error.message);
			return true;
		},
	);
	assert.deepEqual(readdirSync(agentDir), []);
});

test("loginOmlx fails when the server rejects the key", async () => {
	recordRequests(
		() =>
			({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				json: async () => ({}),
				text: async () => '{"detail":"Invalid API key"}',
			}) as Response,
	);

	await assert.rejects(
		() => loginOmlx(interactionAnswering([BASE_URL, "wrong-key"])),
		/401.*Invalid API key/,
	);
});

test("a catalog with no registrable model fails the login", async () => {
	const agentDir = emptyAgentDir();
	recordRequests(() => catalogResponse([{ id: "no-limits" }]));

	await assert.rejects(
		() => loginOmlx(interactionAnswering([BASE_URL, "omlx-key"])),
		(error: Error) => {
			assert.match(error.message, /max_context_window/);
			assert.match(error.message, /1 model/);
			return true;
		},
	);
	assert.deepEqual(readdirSync(agentDir), []);
});

test("a mixed catalog lets the login finish and the keyless probe carries the placeholder", async () => {
	requests = recordRequests(() =>
		catalogResponse([usableModel("usable"), { id: "no-limits" }]),
	);

	const credential = await loginOmlx(interactionAnswering([BASE_URL, ""]));

	assert.equal(credential.env?.OMLX_BASE_URL, BASE_URL);
	assert.equal("key" in credential, false, JSON.stringify(credential));
	assert.equal(requests[0]?.authorization, `Bearer ${KEYLESS_PLACEHOLDER}`);
});

test("an aborted interaction fails the login and stores nothing", async () => {
	const agentDir = emptyAgentDir();
	const controller = new AbortController();
	requests = recordRequests(() => {
		// A real fetch rejects as soon as the signal it was handed aborts.
		const signal = requests.at(-1)?.signal;
		const pending = new Promise<Response>((_resolve, reject) => {
			const abort = () => {
				const error = new Error("This operation was aborted");
				error.name = "AbortError";
				reject(error);
			};
			if (signal?.aborted) return abort();
			signal?.addEventListener("abort", abort, { once: true });
		});
		// The interaction aborts while the request is in flight.
		controller.abort();
		return pending;
	});

	await assert.rejects(
		() =>
			loginOmlx(
				interactionAnswering([BASE_URL, "omlx-key"], controller.signal),
			),
		/abort|cancel/i,
	);
	assert.equal(requests.length, 1, "the probe made no request to abort");
	assert.deepEqual(readdirSync(agentDir), []);
});

test("an interaction aborted before the probe makes no request", async () => {
	const controller = new AbortController();
	controller.abort();

	await assert.rejects(
		() =>
			loginOmlx(
				interactionAnswering([BASE_URL, "omlx-key"], controller.signal),
			),
		/cancel/i,
	);
	assert.deepEqual(requests, []);
});

test("the login leaves auth.json byte-identical outside the omlx entry, and a failing refresh keeps it", async () => {
	const agentDir = emptyAgentDir();
	const otherEntry = { type: "api_key", key: "another-provider-key" };
	const authPath = join(agentDir, "auth.json");
	writeFileSync(authPath, JSON.stringify({ other: otherEntry }, null, 2));

	const beforeLogin = readFileSync(authPath);
	const credential = await loginOmlx(
		interactionAnswering([BASE_URL, "omlx-key"]),
	);
	// Storing is pi's job: the login returns the credential and writes nothing.
	assert.deepEqual(readFileSync(authPath), beforeLogin);

	// What pi does with it, and then a refresh that fails.
	writeFileSync(
		authPath,
		JSON.stringify({ other: otherEntry, omlx: credential }, null, 2),
	);
	const stored = readFileSync(authPath);
	requests = recordRequests(
		() =>
			({
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
				json: async () => ({}),
				text: async () => "unavailable",
			}) as Response,
	);
	const committed: unknown[] = [];
	await assert.rejects(() =>
		refreshOmlxCatalog(
			{
				credential,
				stored: { models: [] },
				allowNetwork: true,
				signal: new AbortController().signal,
				publish: async (publication) => {
					publication.update?.();
					return true;
				},
			},
			(models) => committed.push(models),
		),
	);
	assert.deepEqual(readFileSync(authPath), stored);
});

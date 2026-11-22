import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PROVIDER_KEY, readOmlxCredential } from "./src/auth-storage.ts";
import { omlxDebug } from "./src/debug.ts";
import { startupNotice } from "./src/notice.ts";
import { createOmlxProvider } from "./src/provider.ts";
import { applyOmlxThinkingControls } from "./src/thinking.ts";

const PROVIDER = PROVIDER_KEY;

export default async function (pi: ExtensionAPI): Promise<void> {
	// One provider, registered once: pi calls its auth hooks, its refresh hook,
	// its streams and its model list, and owns the stored credential.
	const provider = createOmlxProvider();
	pi.registerProvider(provider);

	// Ruling C1: at most one warning per start, decided from the live context and
	// the list pi chose from. Nothing here selects or moves a model.
	pi.on("session_start", async (_event, ctx) => {
		const storedType = readOmlxCredential()?.type;
		const auth = await ctx.modelRegistry
			.getProviderAuth(PROVIDER)
			.catch((error: unknown) => {
				omlxDebug("startup_auth_check_failed", {
					error: error instanceof Error ? error.message : String(error),
				});
				return undefined;
			});
		const notice = startupNotice({
			storedType,
			configured: auth !== undefined,
			modelCount: provider.getModels().length,
		});
		if (notice) ctx.ui.notify(notice, "warning");
	});

	pi.on("model_select", (event) => {
		omlxDebug("model_select", {
			provider: event.model.provider,
			model: event.model.id,
			source: event.source,
		});
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (ctx.model?.provider !== PROVIDER) return;
		omlxDebug("before_provider_request", {
			provider: ctx.model.provider,
			model: ctx.model.id,
			payloadKeys:
				event.payload && typeof event.payload === "object"
					? Object.keys(event.payload as object)
					: [],
		});
		const activeModel = provider
			.getModels()
			.find((model) => model.id === ctx.model?.id);
		// A model in no list has no default to apply: leave the payload alone
		// rather than writing thinking off for a model we know nothing about.
		if (!activeModel) return;
		return applyOmlxThinkingControls(
			event.payload,
			pi.getThinkingLevel(),
			activeModel.reasoning,
		);
	});
}

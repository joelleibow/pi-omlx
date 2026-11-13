import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PROVIDER_KEY } from "./src/auth-storage.ts";
import { omlxDebug } from "./src/debug.ts";
import { createOmlxProvider } from "./src/provider.ts";
import { applyOmlxThinkingControls } from "./src/thinking.ts";

const PROVIDER = PROVIDER_KEY;

export default async function (pi: ExtensionAPI): Promise<void> {
	// One provider, registered once: pi calls its auth hooks, its refresh hook,
	// its streams and its model list, and owns the stored credential.
	const provider = createOmlxProvider();
	pi.registerProvider(provider);

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
		return applyOmlxThinkingControls(
			event.payload,
			pi.getThinkingLevel(),
			activeModel?.reasoning,
		);
	});
}

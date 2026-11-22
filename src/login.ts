import type {
	ApiKeyCredential,
	ProviderAuthInteraction,
} from "@earendil-works/pi-ai";
import {
	fetchModels,
	noRegistrableModelMessage,
	registrableModels,
	resolveLocalModelSettingsPath,
} from "./catalog.ts";
import {
	DEFAULT_OMLX_BASE_URL,
	normalizeBaseUrl,
	OMLX_BASE_URL_ENV_VAR,
	resolveOmlx,
} from "./config.ts";
import { omlxDebug } from "./debug.ts";

/**
 * Pi's native API-key login for omlx: the prompted base URL as the credential's
 * provider-scoped environment, and the key when one was entered — omitted when
 * none was, which is the shape a keyless login is stored in.
 */
export async function loginOmlx(
	interaction: ProviderAuthInteraction,
): Promise<ApiKeyCredential> {
	const enteredUrl = await interaction.prompt({
		type: "text",
		message: "OMLX base URL",
		placeholder: process.env[OMLX_BASE_URL_ENV_VAR] ?? DEFAULT_OMLX_BASE_URL,
	});
	const rawUrl = enteredUrl.trim();
	if (!rawUrl) {
		throw new Error("An OMLX base URL is required; nothing was saved.");
	}
	const baseUrl = normalizeBaseUrl(rawUrl);

	const enteredKey = await interaction.prompt({
		type: "secret",
		message: "OMLX API key (leave empty for a keyless server)",
	});
	const key = enteredKey.trim();

	const credential: ApiKeyCredential = {
		type: "api_key",
		env: { [OMLX_BASE_URL_ENV_VAR]: baseUrl },
	};
	if (key) credential.key = key;

	// The probe: fetch the catalog once with the credential pi is about to
	// store, and discard it. The dialog is the only surface that shows its
	// failure, which is why the login runs it at all (ruling C2).
	const resolved = await resolveOmlx(credential, noEnvironment);
	if (interaction.signal.aborted) throw cancelled();
	const models = await fetchModels(resolved.baseUrl, resolved.apiKey, {
		signal: interaction.signal,
		modelSettingsPath: resolveLocalModelSettingsPath(
			process.env.OMLX_MODEL_SETTINGS_PATH,
		),
		onDebug: (event) => omlxDebug(event.kind, event.details),
	}).catch((error: unknown) => {
		if (interaction.signal.aborted) throw cancelled();
		const cause = error instanceof Error ? error.message : String(error);
		throw new Error(`OMLX login failed at ${resolved.baseUrl}: ${cause}`);
	});
	if (registrableModels(models).length === 0) {
		throw new Error(noRegistrableModelMessage(resolved.baseUrl, models.length));
	}
	return credential;
}

const noEnvironment = async (): Promise<string | undefined> => undefined;

function cancelled(): Error {
	return new Error("The OMLX login was cancelled.");
}

import { strict as assert } from "node:assert";
import { test } from "vitest";
import { startupNotice } from "../src/notice.ts";

// One return value, so a start can never show two warnings: the OAuth remedy is
// decided first, the landed-model warning only when omlx is configured and pi
// holds nothing to run on.
test("a configured start with no models names /model", () => {
	const notice = startupNotice({
		storedType: "api_key",
		configured: true,
		modelCount: 0,
	});

	assert.ok(notice);
	assert.match(notice, /\/model/);
	assert.ok(!notice.includes("/logout"));
});

test("a configured start with models says nothing", () => {
	assert.equal(
		startupNotice({ storedType: "api_key", configured: true, modelCount: 1 }),
		undefined,
	);
});

test("an unconfigured start says nothing", () => {
	for (const storedType of [undefined, "api_key"]) {
		assert.equal(
			startupNotice({ storedType, configured: false, modelCount: 0 }),
			undefined,
		);
	}
});

test("an oauth-shaped entry takes the remedy, whatever omlx reports", () => {
	for (const configured of [true, false]) {
		for (const modelCount of [0, 3]) {
			const notice = startupNotice({
				storedType: "oauth",
				configured,
				modelCount,
			});
			assert.ok(notice, `no remedy for ${configured}/${modelCount}`);
			assert.match(notice, /\/logout/);
			assert.match(notice, /\/login/);
			assert.ok(notice.indexOf("/logout") < notice.indexOf("/login"), notice);
			assert.ok(!notice.includes("/model"), notice);
		}
	}
});

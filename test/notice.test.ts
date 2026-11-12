import { strict as assert } from "node:assert";
import { test } from "vitest";
import { catalogNotice } from "../src/notice.ts";

const URL_ROOT = "http://10.0.0.5:8000/v1";

test("a failed load with cached models names the URL and the count", () => {
	assert.equal(
		catalogNotice("failed", false, URL_ROOT, 3),
		`oMLX model list unavailable at ${URL_ROOT}; using 3 cached models.`,
	);
});

test("a failed load with one cached model says model, not models", () => {
	assert.equal(
		catalogNotice("failed", false, URL_ROOT, 1),
		`oMLX model list unavailable at ${URL_ROOT}; using 1 cached model.`,
	);
});

test("a failed load with no cache names the login-only provider", () => {
	assert.equal(
		catalogNotice("failed", true, URL_ROOT, 0),
		`oMLX model list unavailable at ${URL_ROOT}; using the login-only provider.`,
	);
});

test("a late catalog names the URL, the login-only start and the way to switch", () => {
	assert.equal(
		catalogNotice("registered", true, URL_ROOT, 0),
		`oMLX session started login-only; models from ${URL_ROOT} are now available; choose one with /model.`,
	);
});

test("a catalog that arrives for a cached start says nothing", () => {
	assert.equal(catalogNotice("registered", false, URL_ROOT, 3), undefined);
});

test("an unconfigured credential says nothing", () => {
	assert.equal(catalogNotice("not_configured", false, URL_ROOT, 0), undefined);
});

test("a missing URL says nothing", () => {
	assert.equal(catalogNotice("failed", false, undefined, 3), undefined);
});

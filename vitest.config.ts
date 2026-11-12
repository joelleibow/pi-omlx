import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		clearMocks: true,
		restoreMocks: true,
		globalSetup: ["./test/isolation/global-setup.ts"],
	},
});

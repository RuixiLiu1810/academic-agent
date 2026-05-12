import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = new URL("../../..", import.meta.url).pathname;

const forbiddenHostOwnedFiles = [
	"src/core/agent-session.ts",
	"src/core/agent-session-runtime.ts",
	"src/core/agent-session-services.ts",
	"src/core/bash-executor.ts",
	"src/core/diagnostics.ts",
	"src/core/footer-data-provider.ts",
	"src/core/keybindings.ts",
	"src/core/output-guard.ts",
	"src/core/provider-display-names.ts",
	"src/core/resource-loader.ts",
	"src/core/session-cwd.ts",
	"src/core/slash-commands.ts",
	"src/core/system-prompt.ts",
	"src/core/extensions/index.ts",
	"src/core/extensions/loader.ts",
	"src/core/extensions/runner.ts",
	"src/core/extensions/types.ts",
	"src/core/extensions/wrapper.ts",
];

const codingOwnedFiles = [
	"src/core/sdk.ts",
	"src/core/model-resolver.ts",
	"src/core/telemetry.ts",
	"src/core/timings.ts",
	"src/core/tools/index.ts",
	"src/core/export-html/index.ts",
	"src/core/orchestration/coding-worker.ts",
];

describe("coding-agent host boundary", () => {
	it("does not keep host-owned core modules in coding-agent", () => {
		const existingForbiddenFiles = forbiddenHostOwnedFiles.filter((relativePath) =>
			existsSync(join(packageRoot, relativePath)),
		);

		expect(existingForbiddenFiles).toEqual([]);
	});

	it("keeps only coding-owned core implementations", () => {
		const missingCodingFiles = codingOwnedFiles.filter(
			(relativePath) => !existsSync(join(packageRoot, relativePath)),
		);

		expect(missingCodingFiles).toEqual([]);
	});
});

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const packageRoot = new URL("..", import.meta.url);

describe("lead-agent package boundary", () => {
	it("imports coding-agent only through the worker gateway", () => {
		const sourceFiles = globSync("src/**/*.ts", {
			cwd: packageRoot,
			absolute: true,
		});
		const violations = sourceFiles.flatMap((filePath) => {
			const text = readFileSync(filePath, "utf8");
			const relativePath = relative(packageRoot.pathname, filePath);
			const importsRoot = text.includes('from "@mariozechner/pi-coding-agent"');
			const importsWorker = text.includes('from "@mariozechner/pi-coding-agent/worker"');
			const isGateway = relativePath === "src/workers/coding-worker-dispatcher.ts";

			if (importsRoot) return [`${relativePath} imports coding-agent root`];
			if (importsWorker && !isGateway) return [`${relativePath} bypasses worker gateway`];
			return [];
		});

		expect(violations).toEqual([]);
	});
});

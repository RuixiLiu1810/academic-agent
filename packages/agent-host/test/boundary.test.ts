import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const repoRoot = new URL("../../..", import.meta.url);
const packageRoot = new URL("..", import.meta.url);

describe("agent-host package boundary", () => {
	it("does not import product packages", () => {
		const sourceFiles = globSync("packages/agent-host/src/**/*.ts", {
			cwd: repoRoot,
			absolute: true,
		});
		const forbidden = [
			"@mariozechner/pi-coding-agent",
			"@mariozechner/pi-lead-agent",
			"packages/coding-agent",
			"packages/lead-agent",
		];
		const violations = sourceFiles.flatMap((filePath) => {
			const text = readFileSync(filePath, "utf8");
			return forbidden
				.filter((token) => text.includes(token))
				.map((token) => `${relative(packageRoot.pathname, filePath)} contains ${token}`);
		});

		expect(violations).toEqual([]);
	});
});

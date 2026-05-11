import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageJson {
	bin?: Record<string, string>;
	files?: string[];
}

function readPackageJson(): PackageJson {
	return JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as PackageJson;
}

describe("lead-agent package entry", () => {
	it("declares a source-compatible product binary", () => {
		const packageJson = readPackageJson();

		expect(packageJson.bin).toEqual({
			"pi-lead": "dist/cli.js",
		});
		expect(packageJson.files).toContain("dist");
	});
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLeadCliFileInputs } from "../src/cli/file-input.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-cli-files-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

describe("readLeadCliFileInputs", () => {
	it("reads text @file inputs as named academic context blocks", () => {
		const cwd = makeTempDir();
		writeFileSync(join(cwd, "notes.md"), "Claim A needs citation.\n");

		const context = readLeadCliFileInputs(cwd, ["notes.md"]);

		expect(context).toEqual([
			{
				path: join(cwd, "notes.md"),
				kind: "text",
				mediaType: "text/markdown",
				sizeBytes: 24,
				constraint: "File context from notes.md:\n\nClaim A needs citation.",
			},
		]);
	});

	it("represents image @file inputs as traceable image context", () => {
		const cwd = makeTempDir();
		writeFileSync(join(cwd, "figure.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

		const context = readLeadCliFileInputs(cwd, ["figure.png"]);

		expect(context).toEqual([
			{
				path: join(cwd, "figure.png"),
				kind: "image",
				mediaType: "image/png",
				sizeBytes: 8,
				constraint: `File context from figure.png:\n\n[Image file attached as metadata: image/png, 8 bytes.]`,
			},
		]);
	});

	it("represents unsupported binary @file inputs without dropping traceability", () => {
		const cwd = makeTempDir();
		writeFileSync(join(cwd, "dataset.bin"), Buffer.from([0, 1, 2, 3]));

		const context = readLeadCliFileInputs(cwd, ["dataset.bin"]);

		expect(context).toEqual([
			{
				path: join(cwd, "dataset.bin"),
				kind: "binary",
				mediaType: "application/octet-stream",
				sizeBytes: 4,
				constraint:
					"File context from dataset.bin:\n\n[Binary file recorded as metadata only: application/octet-stream, 4 bytes.]",
			},
		]);
	});

	it("throws a useful error when a file is missing", () => {
		const cwd = makeTempDir();

		expect(() => readLeadCliFileInputs(cwd, ["missing.md"])).toThrow("File input not found: missing.md");
	});
});

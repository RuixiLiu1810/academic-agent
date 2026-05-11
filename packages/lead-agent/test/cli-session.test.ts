import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLeadCliSessionManager } from "../src/cli/session.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-cli-session-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

describe("createLeadCliSessionManager", () => {
	it("creates in-memory sessions when noSession is set", async () => {
		const manager = await createLeadCliSessionManager({
			cwd: "/tmp/lead-cwd",
			noSession: true,
		});

		expect(manager.isPersisted()).toBe(false);
		expect(manager.getCwd()).toBe("/tmp/lead-cwd");
	});

	it("creates persisted sessions in the provided session dir", async () => {
		const sessionDir = makeTempDir();
		const manager = await createLeadCliSessionManager({
			cwd: "/tmp/lead-cwd",
			sessionDir,
		});

		manager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "hello" }],
			api: "lead-agent",
			provider: "lead-agent",
			model: "lead-agent-test",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		});

		expect(manager.isPersisted()).toBe(true);
		expect(readdirSync(sessionDir).some((filename) => filename.endsWith(".jsonl"))).toBe(true);
	});
});

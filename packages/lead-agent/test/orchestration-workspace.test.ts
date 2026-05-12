import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLeadSessionWorkspace } from "../src/orchestration/workspace.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-workspace-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

describe("createLeadSessionWorkspace", () => {
	it("creates a default session-scoped workspace", () => {
		const cwd = makeTempDir();
		const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-1" });

		expect(workspace.rootDir).toBe(join(cwd, ".lead-agent", "artifacts", "sessions", "session-1"));
		expect(existsSync(workspace.rootDir)).toBe(true);
		expect(existsSync(workspace.manifestPath)).toBe(true);
	});

	it("uses a provided artifact directory as the session workspace root", () => {
		const cwd = makeTempDir();
		const artifactDir = makeTempDir();
		const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-1", artifactDir });

		expect(workspace.rootDir).toBe(artifactDir);
		expect(existsSync(workspace.manifestPath)).toBe(true);
	});

	it("writes task plans, step files, artifact briefs, and final output", () => {
		const cwd = makeTempDir();
		const workspace = createLeadSessionWorkspace({ cwd, sessionId: "session-1" });
		const taskDir = workspace.ensureTaskDir("task-1");

		workspace.writeTaskJson("task-1", "workflow-plan.json", { taskId: "task-1" });
		workspace.writeStepJson("task-1", 1, "reviewer", "worker-result.json", { status: "success" });
		workspace.writeStepJson("task-1", 1, "reviewer", "artifact-briefs.json", [{ artifactId: "a1" }]);
		workspace.writeFinalOutput("task-1", "Final answer.");

		expect(taskDir).toBe(join(workspace.rootDir, "tasks", "task-1"));
		expect(readFileSync(join(taskDir, "workflow-plan.json"), "utf8")).toContain("task-1");
		expect(readFileSync(join(taskDir, "steps", "01-reviewer", "worker-result.json"), "utf8")).toContain("success");
		expect(readFileSync(join(taskDir, "final-output.md"), "utf8")).toBe("Final answer.\n");
	});
});

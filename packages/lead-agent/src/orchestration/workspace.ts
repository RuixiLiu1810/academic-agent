import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileSystemArtifactStore } from "@mariozechner/pi-artifact-core";

export interface LeadSessionWorkspaceOptions {
	cwd: string;
	sessionId: string;
	artifactDir?: string;
}

export interface LeadSessionWorkspace {
	rootDir: string;
	manifestPath: string;
	store: FileSystemArtifactStore;
	ensureTaskDir(taskId: string): string;
	writeTaskJson(taskId: string, filename: string, value: unknown): string;
	writeStepJson(taskId: string, order: number, profileId: string, filename: string, value: unknown): string;
	writeFinalOutput(taskId: string, content: string): string;
	appendWorkflowLog(value: unknown): string;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function stepDirName(order: number, profileId: string): string {
	return `${String(order).padStart(2, "0")}-${profileId}`;
}

export function createLeadSessionWorkspace(options: LeadSessionWorkspaceOptions): LeadSessionWorkspace {
	const rootDir = options.artifactDir ?? join(options.cwd, ".lead-agent", "artifacts", "sessions", options.sessionId);
	mkdirSync(rootDir, { recursive: true });
	const store = new FileSystemArtifactStore(rootDir);
	const manifestPath = join(rootDir, "artifacts.json");
	if (store.manifest().artifacts.length === 0) {
		writeJson(manifestPath, store.manifest());
	}

	const ensureTaskDir = (taskId: string): string => {
		const dir = join(rootDir, "tasks", taskId);
		mkdirSync(dir, { recursive: true });
		return dir;
	};

	const ensureStepDir = (taskId: string, order: number, profileId: string): string => {
		const dir = join(ensureTaskDir(taskId), "steps", stepDirName(order, profileId));
		mkdirSync(dir, { recursive: true });
		return dir;
	};

	return {
		rootDir,
		manifestPath,
		store,
		ensureTaskDir,
		writeTaskJson(taskId, filename, value) {
			const path = join(ensureTaskDir(taskId), filename);
			writeJson(path, value);
			return path;
		},
		writeStepJson(taskId, order, profileId, filename, value) {
			const path = join(ensureStepDir(taskId, order, profileId), filename);
			writeJson(path, value);
			return path;
		},
		writeFinalOutput(taskId, content) {
			const path = join(ensureTaskDir(taskId), "final-output.md");
			writeFileSync(path, `${content}\n`);
			return path;
		},
		appendWorkflowLog(value) {
			const path = join(rootDir, "session-workflow-log.jsonl");
			writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: "a" });
			return path;
		},
	};
}

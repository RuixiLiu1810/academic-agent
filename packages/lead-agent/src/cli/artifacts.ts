import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileSystemArtifactStore } from "@mariozechner/pi-artifact-core";
import type { LeadAgentResult } from "../index.js";

export interface PersistedLeadCliArtifacts {
	finalOutputPath: string;
	resultJsonPath: string;
	acceptanceReportPath?: string;
	manifestPath: string;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function persistLeadCliArtifacts(result: LeadAgentResult, artifactDir: string): PersistedLeadCliArtifacts {
	const store = new FileSystemArtifactStore(artifactDir);
	const finalOutputPath = join(artifactDir, "final-output.md");
	const resultJsonPath = join(artifactDir, "lead-result.json");
	const acceptanceReportPath = result.acceptanceReport ? join(artifactDir, "acceptance-report.json") : undefined;
	writeFileSync(finalOutputPath, `${result.finalOutput}\n`);
	writeJson(resultJsonPath, result);
	if (result.acceptanceReport && acceptanceReportPath) {
		writeJson(acceptanceReportPath, result.acceptanceReport);
	}
	store.create({
		kind: "lead-cli-result",
		title: "Lead agent final output",
		mediaType: "text/markdown",
		content: result.finalOutput,
		metadata: {
			taskId: result.taskId,
			sessionId: result.sessionId,
			decisionMode: result.decision.mode,
			profileId: result.decision.profileId ?? null,
		},
	});
	return {
		finalOutputPath,
		resultJsonPath,
		acceptanceReportPath,
		manifestPath: join(artifactDir, "artifacts.json"),
	};
}

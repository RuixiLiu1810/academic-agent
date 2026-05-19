import type { ArtifactBrief, ArtifactRef, JsonObject, WorkflowStep } from "@mariozechner/pi-agent-contracts";
import type { LeadConversationContext, LeadWorkflowResultSummary } from "./lead-context.js";

export interface WorkerContextPackage {
	currentObjective: string;
	currentStepObjective: string;
	relevantPriorObjectives: string[];
	relevantLeadOutputs: string[];
	relevantArtifacts: ArtifactRef[];
	allowedArtifactIds: string[];
	artifactBriefs: ArtifactBrief[];
	previousWorkflowResults: LeadWorkflowResultSummary[];
	compactionSummary?: string;
	budget: {
		maxChars: number;
		usedChars: number;
		truncatedSections: string[];
	};
}

export interface BuildWorkerContextPackageOptions {
	conversationContext?: LeadConversationContext;
	step: WorkflowStep;
	inputArtifacts: readonly ArtifactRef[];
	stepArtifactBriefs?: readonly ArtifactBrief[];
}

function mergeArtifactBriefs(left: readonly ArtifactBrief[], right: readonly ArtifactBrief[]): ArtifactBrief[] {
	const briefs = new Map<string, ArtifactBrief>();
	for (const brief of [...left, ...right]) {
		briefs.set(`${brief.artifactId}:${brief.kind}`, brief);
	}
	return [...briefs.values()];
}

function artifactBriefsFor(
	artifactIds: ReadonlySet<string>,
	contextBriefs: readonly ArtifactBrief[],
	stepArtifactBriefs: readonly ArtifactBrief[],
): ArtifactBrief[] {
	return mergeArtifactBriefs(
		contextBriefs.filter((brief) => artifactIds.has(brief.artifactId)),
		stepArtifactBriefs.filter((brief) => artifactIds.has(brief.artifactId)),
	);
}

export function buildWorkerContextPackage(options: BuildWorkerContextPackageOptions): WorkerContextPackage {
	const inputArtifactIds = new Set(options.inputArtifacts.map((artifact) => artifact.id));
	const context = options.conversationContext;
	const artifactBriefs = artifactBriefsFor(
		inputArtifactIds,
		context?.artifactBriefs ?? [],
		options.stepArtifactBriefs ?? [],
	);
	const basePackage: Omit<WorkerContextPackage, "budget"> = {
		currentObjective: context?.currentObjective ?? options.step.objective,
		currentStepObjective: options.step.objective,
		relevantPriorObjectives: context?.recentUserObjectives ?? [],
		relevantLeadOutputs: context?.recentLeadOutputs ?? [],
		relevantArtifacts: [...options.inputArtifacts],
		allowedArtifactIds: [...inputArtifactIds],
		artifactBriefs,
		previousWorkflowResults: context?.recentWorkflowResults ?? [],
		...(context?.compactionSummary ? { compactionSummary: context.compactionSummary } : {}),
	};
	const usedChars = JSON.stringify(basePackage).length;
	return {
		...basePackage,
		budget: {
			maxChars: context?.budget.maxChars ?? usedChars,
			usedChars,
			truncatedSections: context?.budget.truncatedSections ?? [],
		},
	};
}

export function workerContextPackageToJsonObject(contextPackage: WorkerContextPackage): JsonObject {
	return {
		currentObjective: contextPackage.currentObjective,
		currentStepObjective: contextPackage.currentStepObjective,
		relevantPriorObjectives: contextPackage.relevantPriorObjectives,
		relevantLeadOutputs: contextPackage.relevantLeadOutputs,
		relevantArtifacts: contextPackage.relevantArtifacts.map((artifact) => ({
			id: artifact.id,
			kind: artifact.kind,
			uri: artifact.uri,
			...(artifact.title ? { title: artifact.title } : {}),
			...(artifact.mediaType ? { mediaType: artifact.mediaType } : {}),
			...(artifact.version ? { version: artifact.version } : {}),
			...(artifact.metadata ? { metadata: artifact.metadata } : {}),
		})),
		allowedArtifactIds: contextPackage.allowedArtifactIds,
		artifactBriefs: contextPackage.artifactBriefs.map((brief) => ({
			artifactId: brief.artifactId,
			kind: brief.kind,
			...(brief.title ? { title: brief.title } : {}),
			brief: brief.brief,
			...(brief.keyFindings ? { keyFindings: brief.keyFindings } : {}),
			...(brief.limitations ? { limitations: brief.limitations } : {}),
		})),
		previousWorkflowResults: contextPackage.previousWorkflowResults.map((result) => ({
			taskId: result.taskId,
			accepted: result.accepted,
			producedArtifactKinds: result.producedArtifactKinds,
			issues: result.issues,
		})),
		...(contextPackage.compactionSummary ? { compactionSummary: contextPackage.compactionSummary } : {}),
		budget: {
			maxChars: contextPackage.budget.maxChars,
			usedChars: contextPackage.budget.usedChars,
			truncatedSections: contextPackage.budget.truncatedSections,
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArrayFrom(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function formatArtifactBriefs(value: unknown): string {
	if (!Array.isArray(value) || value.length === 0) {
		return "none";
	}
	return value
		.map((entry) => {
			if (!isRecord(entry) || typeof entry.artifactId !== "string" || typeof entry.kind !== "string") {
				return undefined;
			}
			const brief = typeof entry.brief === "string" ? entry.brief : "";
			return `- ${entry.artifactId} (${entry.kind}): ${brief}`;
		})
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

function formatArtifacts(value: unknown): string {
	if (!Array.isArray(value) || value.length === 0) {
		return "none";
	}
	return value
		.map((entry) => {
			if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.kind !== "string") {
				return undefined;
			}
			return `- ${entry.id} (${entry.kind})`;
		})
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

export function formatWorkerContextPackageFromMetadata(metadata: JsonObject | undefined): string {
	const contextPackage = metadata?.leadContextPackage;
	if (!isRecord(contextPackage)) {
		return "none";
	}
	const priorObjectives = stringArrayFrom(contextPackage.relevantPriorObjectives);
	const leadOutputs = stringArrayFrom(contextPackage.relevantLeadOutputs);
	const previousWorkflowResults = Array.isArray(contextPackage.previousWorkflowResults)
		? contextPackage.previousWorkflowResults
				.map((entry) => {
					if (!isRecord(entry) || typeof entry.taskId !== "string") {
						return undefined;
					}
					return `- ${entry.taskId}: accepted=${String(entry.accepted)}, artifacts=${stringArrayFrom(entry.producedArtifactKinds).join(", ") || "none"}`;
				})
				.filter((line): line is string => line !== undefined)
				.join("\n")
		: "none";
	return [
		`Current objective: ${typeof contextPackage.currentObjective === "string" ? contextPackage.currentObjective : "none"}`,
		`Current step objective: ${
			typeof contextPackage.currentStepObjective === "string" ? contextPackage.currentStepObjective : "none"
		}`,
		`Relevant prior objectives:\n${priorObjectives.length > 0 ? priorObjectives.map((value) => `- ${value}`).join("\n") : "none"}`,
		`Relevant lead outputs:\n${leadOutputs.length > 0 ? leadOutputs.map((value) => `- ${value}`).join("\n") : "none"}`,
		`Relevant artifact refs:\n${formatArtifacts(contextPackage.relevantArtifacts)}`,
		`Allowed artifact IDs: ${stringArrayFrom(contextPackage.allowedArtifactIds).join(", ") || "none"}`,
		`Artifact briefs:\n${formatArtifactBriefs(contextPackage.artifactBriefs)}`,
		`Previous workflow results:\n${previousWorkflowResults || "none"}`,
		`Compaction summary:\n${typeof contextPackage.compactionSummary === "string" ? contextPackage.compactionSummary : "none"}`,
	].join("\n");
}

import type { ArtifactBrief, ArtifactRef, JsonObject, JsonValue } from "@mariozechner/pi-agent-contracts";
import type { SessionEntry, SessionManager } from "@mariozechner/pi-agent-host";

export interface LeadDecisionSummary {
	taskId?: string;
	mode: "direct" | "worker";
	profileId?: string;
	reason?: string;
}

export interface LeadWorkflowResultSummary {
	taskId: string;
	accepted: boolean;
	producedArtifactKinds: string[];
	issues: string[];
}

export interface LeadConversationContextBudget {
	maxChars: number;
	usedChars: number;
	truncatedSections: string[];
}

export interface LeadConversationContext {
	sessionId: string;
	currentObjective: string;
	recentUserObjectives: string[];
	recentLeadOutputs: string[];
	recentDecisions: LeadDecisionSummary[];
	recentWorkflowResults: LeadWorkflowResultSummary[];
	priorArtifacts: ArtifactRef[];
	artifactBriefs: ArtifactBrief[];
	compactionSummary?: string;
	compactionDetails?: JsonObject;
	budget: LeadConversationContextBudget;
}

export interface BuildLeadConversationContextOptions {
	sessionManager: SessionManager;
	currentObjective: string;
	maxChars?: number;
}

const DEFAULT_MAX_CHARS = 12_000;
const MAX_RECENT_MESSAGES = 8;
const MAX_RECENT_DECISIONS = 6;
const MAX_RECENT_WORKFLOW_RESULTS = 8;
const TRIMMED_LEAD_OUTPUT_CHARS = 120;
const TRIMMED_ARTIFACT_BRIEF_CHARS = 80;
const TRIMMED_USER_OBJECTIVE_CHARS = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) {
		return true;
	}
	switch (typeof value) {
		case "string":
		case "number":
		case "boolean":
			return true;
		case "object":
			if (Array.isArray(value)) {
				return value.every(isJsonValue);
			}
			return Object.values(value as Record<string, unknown>).every(isJsonValue);
		default:
			return false;
	}
}

function jsonObjectFrom(value: unknown): JsonObject | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const jsonObject: JsonObject = {};
	for (const [key, entryValue] of Object.entries(value)) {
		if (isJsonValue(entryValue)) {
			jsonObject[key] = entryValue;
		}
	}
	return jsonObject;
}

function stringArrayFrom(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function textFromContent(content: unknown): string | undefined {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return undefined;
	}
	const text = content
		.map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : undefined))
		.filter((part): part is string => part !== undefined)
		.join("");
	return text.trim().length > 0 ? text : undefined;
}

function trimText(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, Math.max(maxChars - 3, 0))}...`;
}

function artifactRefFrom(value: unknown): ArtifactRef | undefined {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		typeof value.kind !== "string" ||
		typeof value.uri !== "string"
	) {
		return undefined;
	}
	const metadata = jsonObjectFrom(value.metadata);
	return {
		id: value.id,
		kind: value.kind,
		uri: value.uri,
		...(typeof value.title === "string" ? { title: value.title } : {}),
		...(typeof value.mediaType === "string" ? { mediaType: value.mediaType } : {}),
		...(typeof value.version === "string" ? { version: value.version } : {}),
		...(metadata ? { metadata } : {}),
	};
}

function artifactBriefFrom(value: unknown): ArtifactBrief | undefined {
	if (
		!isRecord(value) ||
		typeof value.artifactId !== "string" ||
		typeof value.kind !== "string" ||
		typeof value.brief !== "string"
	) {
		return undefined;
	}
	const keyFindings = stringArrayFrom(value.keyFindings);
	const limitations = stringArrayFrom(value.limitations);
	return {
		artifactId: value.artifactId,
		kind: value.kind,
		...(typeof value.title === "string" ? { title: value.title } : {}),
		brief: value.brief,
		...(keyFindings.length > 0 ? { keyFindings } : {}),
		...(limitations.length > 0 ? { limitations } : {}),
	};
}

function customData(entry: SessionEntry, customType: string): Record<string, unknown> | undefined {
	return entry.type === "custom" && entry.customType === customType && isRecord(entry.data) ? entry.data : undefined;
}

function extractRecentMessages(
	sessionManager: SessionManager,
): Pick<LeadConversationContext, "recentUserObjectives" | "recentLeadOutputs"> {
	const sessionContext = sessionManager.buildSessionContext();
	const userObjectives: string[] = [];
	const leadOutputs: string[] = [];
	for (const message of sessionContext.messages) {
		const role = (message as { role?: unknown }).role;
		const content = textFromContent((message as { content?: unknown }).content);
		if (!content) {
			continue;
		}
		if (role === "user") {
			userObjectives.push(content);
		} else if (role === "assistant") {
			leadOutputs.push(content);
		}
	}
	return {
		recentUserObjectives: userObjectives.slice(-MAX_RECENT_MESSAGES),
		recentLeadOutputs: leadOutputs.slice(-MAX_RECENT_MESSAGES),
	};
}

function extractDecisions(branch: readonly SessionEntry[]): LeadDecisionSummary[] {
	const decisions: LeadDecisionSummary[] = [];
	for (const entry of branch) {
		const data = customData(entry, "lead-agent.decision");
		if (!data || (data.mode !== "direct" && data.mode !== "worker")) {
			continue;
		}
		decisions.push({
			...(typeof data.taskId === "string" ? { taskId: data.taskId } : {}),
			mode: data.mode,
			...(typeof data.profileId === "string" ? { profileId: data.profileId } : {}),
			...(typeof data.reason === "string" ? { reason: data.reason } : {}),
		});
	}
	return decisions.slice(-MAX_RECENT_DECISIONS);
}

function extractArtifactsFromValue(value: unknown): ArtifactRef[] {
	return Array.isArray(value)
		? value.map(artifactRefFrom).filter((artifact): artifact is ArtifactRef => artifact !== undefined)
		: [];
}

function extractArtifactBriefsFromValue(value: unknown): ArtifactBrief[] {
	return Array.isArray(value)
		? value.map(artifactBriefFrom).filter((brief): brief is ArtifactBrief => brief !== undefined)
		: [];
}

function issueMessagesFrom(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((issue) => {
				if (typeof issue === "string") {
					return issue;
				}
				if (isRecord(issue) && typeof issue.message === "string") {
					return issue.message;
				}
				return undefined;
			})
			.filter((issue): issue is string => issue !== undefined);
	}
	return [];
}

function extractWorkflowResults(branch: readonly SessionEntry[]): LeadWorkflowResultSummary[] {
	const results: LeadWorkflowResultSummary[] = [];
	for (const entry of branch) {
		const data = customData(entry, "lead-agent.result") ?? customData(entry, "workflow_step_result");
		if (!data || typeof data.taskId !== "string" || typeof data.accepted !== "boolean") {
			continue;
		}
		const artifacts = extractArtifactsFromValue(data.producedArtifacts);
		results.push({
			taskId: data.taskId,
			accepted: data.accepted,
			producedArtifactKinds: artifacts.map((artifact) => artifact.kind),
			issues: issueMessagesFrom(data.issues),
		});
	}
	return results.slice(-MAX_RECENT_WORKFLOW_RESULTS);
}

function extractArtifacts(branch: readonly SessionEntry[]): ArtifactRef[] {
	const artifacts = new Map<string, ArtifactRef>();
	for (const entry of branch) {
		if (entry.type !== "custom" || !isRecord(entry.data)) {
			continue;
		}
		for (const artifact of extractArtifactsFromValue(entry.data.producedArtifacts)) {
			artifacts.set(artifact.id, artifact);
		}
		for (const artifact of extractArtifactsFromValue(entry.data.inputArtifacts)) {
			artifacts.set(artifact.id, artifact);
		}
	}
	return [...artifacts.values()];
}

function extractArtifactBriefs(branch: readonly SessionEntry[]): ArtifactBrief[] {
	const briefs = new Map<string, ArtifactBrief>();
	for (const entry of branch) {
		if (entry.type !== "custom" || !isRecord(entry.data)) {
			continue;
		}
		for (const brief of extractArtifactBriefsFromValue(entry.data.artifactBriefs)) {
			briefs.set(`${brief.artifactId}:${brief.kind}`, brief);
		}
	}
	return [...briefs.values()];
}

function extractCompaction(
	branch: readonly SessionEntry[],
): Pick<LeadConversationContext, "compactionSummary" | "compactionDetails"> {
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index];
		if (entry?.type !== "compaction") {
			continue;
		}
		return {
			compactionSummary: entry.summary,
			...(jsonObjectFrom(entry.details) ? { compactionDetails: jsonObjectFrom(entry.details) } : {}),
		};
	}
	return {};
}

function contextChars(context: Omit<LeadConversationContext, "budget">): number {
	return JSON.stringify(context).length;
}

function withBudget(
	context: Omit<LeadConversationContext, "budget">,
	maxChars: number,
	truncatedSections: string[] = [],
): LeadConversationContext {
	return {
		...context,
		budget: {
			maxChars,
			usedChars: contextChars(context),
			truncatedSections,
		},
	};
}

function trimForBudget(context: Omit<LeadConversationContext, "budget">, maxChars: number): LeadConversationContext {
	const truncatedSections: string[] = [];
	let trimmed = { ...context };
	if (contextChars(trimmed) > maxChars && trimmed.recentLeadOutputs.length > 0) {
		trimmed = {
			...trimmed,
			recentLeadOutputs: trimmed.recentLeadOutputs.map((output) => trimText(output, TRIMMED_LEAD_OUTPUT_CHARS)),
		};
		truncatedSections.push("recentLeadOutputs");
	}
	if (contextChars(trimmed) > maxChars && trimmed.artifactBriefs.length > 0) {
		trimmed = {
			...trimmed,
			artifactBriefs: trimmed.artifactBriefs.map((brief) => ({
				...brief,
				brief: trimText(brief.brief, TRIMMED_ARTIFACT_BRIEF_CHARS),
				keyFindings: brief.keyFindings?.map((finding) => trimText(finding, TRIMMED_ARTIFACT_BRIEF_CHARS)),
				limitations: brief.limitations?.map((limitation) => trimText(limitation, TRIMMED_ARTIFACT_BRIEF_CHARS)),
			})),
		};
		truncatedSections.push("artifactBriefs");
	}
	if (contextChars(trimmed) > maxChars && trimmed.recentUserObjectives.length > 0) {
		trimmed = {
			...trimmed,
			recentUserObjectives: trimmed.recentUserObjectives.map((objective) =>
				trimText(objective, TRIMMED_USER_OBJECTIVE_CHARS),
			),
		};
		truncatedSections.push("recentUserObjectives");
	}
	return withBudget(trimmed, maxChars, truncatedSections);
}

export function buildLeadConversationContext(options: BuildLeadConversationContextOptions): LeadConversationContext {
	const branch = options.sessionManager.getBranch();
	const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
	const messages = extractRecentMessages(options.sessionManager);
	const compaction = extractCompaction(branch);
	return trimForBudget(
		{
			sessionId: options.sessionManager.getSessionId(),
			currentObjective: options.currentObjective,
			recentUserObjectives: messages.recentUserObjectives,
			recentLeadOutputs: messages.recentLeadOutputs,
			recentDecisions: extractDecisions(branch),
			recentWorkflowResults: extractWorkflowResults(branch),
			priorArtifacts: extractArtifacts(branch),
			artifactBriefs: extractArtifactBriefs(branch),
			...compaction,
		},
		maxChars,
	);
}

export function formatLeadConversationContextForDebug(context: LeadConversationContext): string {
	return JSON.stringify(context, null, 2);
}

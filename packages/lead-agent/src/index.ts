import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	AcceptanceIssue,
	AcceptanceReport,
	ArtifactRef,
	JsonObject,
	JsonValue,
	WorkerProfile,
	WorkerRequest,
	WorkerResult,
} from "@mariozechner/pi-agent-contracts";
import { createAcceptanceReport, createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { createAgentHostSession, SessionManager } from "@mariozechner/pi-agent-host";
import { runCodingWorker } from "@mariozechner/pi-coding-agent";

export type AcademicTaskType = "writing" | "research" | "review" | "revision" | "methods" | "citation";
export type LeadAgentDispatchMode = "auto" | "direct" | "worker";

export interface LeadAgentTaskRequest {
	taskId?: string;
	objective: string;
	constraints?: string[];
	inputArtifacts?: ArtifactRef[];
	expectedOutputs?: string[];
	acceptanceCriteria?: string[];
	metadata?: JsonObject;
	taskType?: AcademicTaskType;
	profileId?: string;
	dispatchMode?: LeadAgentDispatchMode;
}

export interface LeadAgentDecision {
	mode: "direct" | "worker";
	workerType?: string;
	profileId?: string;
	reason: string;
}

export interface LeadAgentResult {
	taskId: string;
	finalOutput: string;
	decision: LeadAgentDecision;
	sessionId: string;
	acceptanceReport?: AcceptanceReport;
	workerResult?: WorkerResult;
}

export type LeadAgentWorkerRunner = (request: WorkerRequest) => Promise<WorkerResult>;
export type LeadAgentDirectRunner = (request: LeadAgentTaskRequest) => Promise<string>;

export interface LeadAgentRuntimeOptions {
	workerRunner?: LeadAgentWorkerRunner;
	directRunner?: LeadAgentDirectRunner;
	profiles?: WorkerProfile[];
	sessionManager?: SessionManager;
	cwd?: string;
}

export interface LeadAgentRuntime {
	run(request: LeadAgentTaskRequest): Promise<LeadAgentResult>;
	plan(request: LeadAgentTaskRequest): LeadAgentDecision;
	profiles: readonly WorkerProfile[];
	sessionManager: SessionManager;
}

export const DEFAULT_ACADEMIC_PROFILE_DIR = fileURLToPath(new URL("../profiles", import.meta.url));

export const DEFAULT_ACADEMIC_PROFILES: WorkerProfile[] = [
	{
		id: "researcher",
		name: "Researcher",
		description: "Collects and organizes evidence for academic tasks.",
		capabilities: ["literature-review", "evidence-table", "claim-support"],
		expectedOutputs: ["evidence summary"],
		acceptanceChecklist: ["Evidence is separated from interpretation", "Uncertainty is explicit"],
	},
	{
		id: "reviewer",
		name: "Reviewer",
		description: "Critically reviews manuscripts and response materials.",
		capabilities: ["peer-review", "claim-audit", "consistency-check"],
		expectedOutputs: ["review memo"],
		acceptanceChecklist: ["Findings are severity ordered", "Issues are actionable"],
	},
	{
		id: "writer",
		name: "Writer",
		description: "Drafts unified academic prose from accepted inputs.",
		capabilities: ["academic-writing", "synthesis"],
		expectedOutputs: ["draft text"],
		acceptanceChecklist: ["Claims are bounded", "Style is consistent"],
	},
	{
		id: "reviser",
		name: "Reviser",
		description: "Revises existing academic prose according to constraints.",
		capabilities: ["revision", "response-letter"],
		expectedOutputs: ["revised text"],
		acceptanceChecklist: ["Meaning is preserved", "Reviewer requests are addressed"],
	},
	{
		id: "method-auditor",
		name: "Method Auditor",
		description: "Checks methods, statistics, and reproducibility details.",
		capabilities: ["methods-audit", "statistics-check", "reproducibility"],
		expectedOutputs: ["methods audit"],
		acceptanceChecklist: ["Missing assumptions are explicit", "Statistical limits are stated"],
	},
	{
		id: "citation-checker",
		name: "Citation Checker",
		description: "Checks citation need and citation support for claims.",
		capabilities: ["citation-check", "claim-support"],
		expectedOutputs: ["citation audit"],
		acceptanceChecklist: ["Unsupported claims are identified", "Citation-dependent wording is bounded"],
	},
];

function slugToTitle(slug: string): string {
	return slug
		.split("-")
		.filter((part) => part.length > 0)
		.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
		.join(" ");
}

function normalizeHeading(value: string): string {
	return value.trim().toLowerCase();
}

function sectionText(markdown: string, heading: string): string | undefined {
	const normalizedHeading = normalizeHeading(heading);
	const lines = markdown.split(/\r?\n/);
	let collecting = false;
	const collected: string[] = [];
	for (const line of lines) {
		const headingMatch = /^##\s+(.+?)\s*$/.exec(line);
		if (headingMatch) {
			if (collecting) {
				break;
			}
			collecting = normalizeHeading(headingMatch[1] ?? "") === normalizedHeading;
			continue;
		}
		if (collecting) {
			collected.push(line);
		}
	}
	const text = collected.join("\n").trim();
	return text.length > 0 ? text : undefined;
}

function sectionList(markdown: string, heading: string): string[] {
	const text = sectionText(markdown, heading);
	if (!text) {
		return [];
	}
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.map((line) => line.slice(2).trim())
		.filter((line) => line.length > 0);
}

function titleFromMarkdown(markdown: string, fallback: string): string {
	const title = /^#\s+(.+?)\s*$/m.exec(markdown)?.[1]?.trim();
	return title && title.length > 0 ? title : fallback;
}

function descriptionFromMarkdown(markdown: string): string | undefined {
	const withoutTitle = markdown.replace(/^#\s+.+?$/m, "").trim();
	const beforeSection = withoutTitle.split(/^##\s+/m)[0]?.trim();
	return beforeSection && beforeSection.length > 0 ? beforeSection.replace(/\s+/g, " ") : undefined;
}

export function parseAcademicProfileMarkdown(id: string, markdown: string): WorkerProfile {
	const fallbackName = slugToTitle(id);
	const description = descriptionFromMarkdown(markdown);
	const rolePrompt = sectionText(markdown, "Role Prompt") ?? description;
	const capabilities = sectionList(markdown, "Capabilities");
	const expectedOutputs = sectionList(markdown, "Output Requirements");
	const acceptanceChecklist = sectionList(markdown, "Acceptance Checklist");
	return {
		id,
		name: titleFromMarkdown(markdown, fallbackName),
		description,
		rolePrompt,
		capabilities: capabilities.length > 0 ? capabilities : [id],
		expectedOutputs: expectedOutputs.length > 0 ? expectedOutputs : undefined,
		acceptanceChecklist: acceptanceChecklist.length > 0 ? acceptanceChecklist : undefined,
	};
}

export function loadAcademicProfilesFromDir(profileDir = DEFAULT_ACADEMIC_PROFILE_DIR): WorkerProfile[] {
	if (!existsSync(profileDir)) {
		return [...DEFAULT_ACADEMIC_PROFILES];
	}
	const profileFiles = readdirSync(profileDir)
		.filter((filename) => extname(filename) === ".md")
		.sort();
	const profiles = profileFiles.map((filename) => {
		const id = basename(filename, ".md");
		const markdown = readFileSync(join(profileDir, filename), "utf8");
		return parseAcademicProfileMarkdown(id, markdown);
	});
	return profiles.length > 0 ? profiles : [...DEFAULT_ACADEMIC_PROFILES];
}

function includesAny(text: string, terms: readonly string[]): boolean {
	const normalized = text.toLowerCase();
	return terms.some((term) => normalized.includes(term));
}

function profileIdForTaskType(taskType: AcademicTaskType): string | undefined {
	switch (taskType) {
		case "writing":
			return undefined;
		case "research":
			return "researcher";
		case "review":
			return "reviewer";
		case "revision":
			return "reviser";
		case "methods":
			return "method-auditor";
		case "citation":
			return "citation-checker";
	}
}

function findProfile(profiles: readonly WorkerProfile[], profileId: string | undefined): WorkerProfile | undefined {
	if (!profileId) {
		return undefined;
	}
	return profiles.find((profile) => profile.id === profileId);
}

function chooseWorkerProfile(
	request: LeadAgentTaskRequest,
	profiles: readonly WorkerProfile[],
): WorkerProfile | undefined {
	const explicitProfile = findProfile(profiles, request.profileId);
	if (explicitProfile) {
		return explicitProfile;
	}
	if (request.taskType) {
		const taskProfile = findProfile(profiles, profileIdForTaskType(request.taskType));
		if (taskProfile) {
			return taskProfile;
		}
		if (request.taskType === "writing") {
			return undefined;
		}
	}
	const objective = request.objective;
	if (includesAny(objective, ["citation", "reference", "引用", "参考文献"])) {
		return profiles.find((profile) => profile.id === "citation-checker");
	}
	if (includesAny(objective, ["method", "statistics", "统计", "方法", "reproducibility", "复现"])) {
		return profiles.find((profile) => profile.id === "method-auditor");
	}
	if (includesAny(objective, ["review", "审稿", "退修", "comment", "意见", "核查"])) {
		return profiles.find((profile) => profile.id === "reviewer");
	}
	if (includesAny(objective, ["literature", "evidence", "research", "文献", "证据", "检索"])) {
		return profiles.find((profile) => profile.id === "researcher");
	}
	for (const profile of profiles) {
		if (includesAny(objective, [profile.id, profile.name, ...profile.capabilities])) {
			return profile;
		}
	}
	return undefined;
}

export function planLeadAgentTask(
	request: LeadAgentTaskRequest,
	profiles: readonly WorkerProfile[] = DEFAULT_ACADEMIC_PROFILES,
): LeadAgentDecision {
	if (request.dispatchMode === "direct") {
		return {
			mode: "direct",
			reason: "Task was forced into direct lead-author mode by dispatchMode.",
		};
	}
	const profile = chooseWorkerProfile(request, profiles);
	if (!profile) {
		if (request.dispatchMode === "worker") {
			const fallbackProfile = profiles.find((candidate) => candidate.id === "researcher") ?? profiles[0];
			if (fallbackProfile) {
				return {
					mode: "worker",
					workerType: fallbackProfile.id,
					profileId: fallbackProfile.id,
					reason:
						"Worker dispatch was forced; no explicit profile matched, so the researcher profile was selected.",
				};
			}
		}
		return {
			mode: "direct",
			reason: "Task appears to require unified lead-author writing or revision rather than a separable worker pass.",
		};
	}
	return {
		mode: "worker",
		workerType: profile.id,
		profileId: profile.id,
		reason: `Task has a separable ${profile.name} pass with structured acceptance criteria.`,
	};
}

function toWorkerRequest(
	taskId: string,
	request: LeadAgentTaskRequest,
	decision: LeadAgentDecision,
	profiles: readonly WorkerProfile[],
): WorkerRequest {
	const profile = profiles.find((candidate) => candidate.id === decision.profileId);
	return {
		taskId,
		workerType: decision.workerType ?? "academic-worker",
		objective: request.objective,
		constraints: request.constraints ?? [],
		inputArtifacts: request.inputArtifacts ?? [],
		expectedOutputs: request.expectedOutputs ?? profile?.expectedOutputs ?? ["worker summary"],
		acceptanceCriteria: request.acceptanceCriteria ?? profile?.acceptanceChecklist ?? [],
		profile,
		metadata: request.metadata,
	};
}

async function synthesizeDirect(
	taskId: string,
	sessionId: string,
	request: LeadAgentTaskRequest,
	decision: LeadAgentDecision,
	directRunner: LeadAgentDirectRunner,
): Promise<LeadAgentResult> {
	const finalOutput = await directRunner(request);
	return {
		taskId,
		finalOutput,
		decision,
		sessionId,
	};
}

export function buildLeadDirectPrompt(request: LeadAgentTaskRequest): string {
	const sections: string[] = [
		"You are a lead academic author responsible for unified prose synthesis. Produce precise, well-structured academic writing that directly addresses the objective below.",
	];
	sections.push(`Objective:\n${request.objective}`);
	if (request.constraints && request.constraints.length > 0) {
		sections.push(`Constraints:\n${request.constraints.map((c) => `- ${c}`).join("\n")}`);
	}
	if (request.expectedOutputs && request.expectedOutputs.length > 0) {
		sections.push(`Expected outputs:\n${request.expectedOutputs.map((o) => `- ${o}`).join("\n")}`);
	}
	return sections.join("\n\n");
}

function extractLastAssistantText(messages: readonly { role: string; content: unknown }[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (!m || m.role !== "assistant") {
			continue;
		}
		const { content } = m;
		if (typeof content === "string") {
			return content;
		}
		if (Array.isArray(content)) {
			return content
				.filter(
					(p): p is { type: "text"; text: string } =>
						typeof p === "object" &&
						p !== null &&
						(p as { type?: unknown }).type === "text" &&
						typeof (p as { text?: unknown }).text === "string",
				)
				.map((p) => p.text)
				.join("\n");
		}
	}
	return "";
}

function createDefaultDirectRunner(cwd: string): LeadAgentDirectRunner {
	return async (request) => {
		const { session } = await createAgentHostSession({ cwd, noTools: "all" });
		await session.prompt(buildLeadDirectPrompt(request));
		const text = extractLastAssistantText(session.messages as readonly { role: string; content: unknown }[]);
		return text.trim().length > 0 ? text : request.objective;
	};
}

function synthesizeWorkerResult(
	taskId: string,
	sessionId: string,
	decision: LeadAgentDecision,
	workerResult: WorkerResult,
	acceptanceReport: AcceptanceReport,
): LeadAgentResult {
	if (!acceptanceReport.accepted) {
		return {
			taskId,
			finalOutput: `Worker result was not accepted: ${workerResult.summary}`,
			decision,
			sessionId,
			acceptanceReport,
			workerResult,
		};
	}
	return {
		taskId,
		finalOutput: workerResult.summary,
		decision,
		sessionId,
		acceptanceReport,
		workerResult,
	};
}

function normalizeForMatch(value: string): string {
	return value.trim().toLowerCase();
}

function textIncludesExpected(text: string, expected: string): boolean {
	const normalizedText = normalizeForMatch(text);
	const normalizedExpected = normalizeForMatch(expected);
	return normalizedExpected.length === 0 || normalizedText.includes(normalizedExpected);
}

function artifactMatchesExpected(artifact: ArtifactRef, expected: string): boolean {
	return [artifact.id, artifact.kind, artifact.uri, artifact.title ?? "", artifact.mediaType ?? ""].some((value) =>
		textIncludesExpected(value, expected),
	);
}

function jsonValueMatchesExpected(value: JsonValue | undefined, expected: string): boolean {
	if (value === undefined || value === null) {
		return false;
	}
	if (typeof value === "string") {
		return textIncludesExpected(value, expected);
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return textIncludesExpected(String(value), expected);
	}
	if (Array.isArray(value)) {
		return value.some((item) => jsonValueMatchesExpected(item, expected));
	}
	return Object.entries(value).some(
		([key, item]) => textIncludesExpected(key, expected) || jsonValueMatchesExpected(item, expected),
	);
}

function workerResultSatisfiesExpectedOutput(workerResult: WorkerResult, expectedOutput: string): boolean {
	return (
		textIncludesExpected(workerResult.summary, expectedOutput) ||
		workerResult.producedArtifacts.some((artifact) => artifactMatchesExpected(artifact, expectedOutput)) ||
		jsonValueMatchesExpected(workerResult.structuredOutputs, expectedOutput)
	);
}

function acceptanceIssuesForWorkerResult(workerRequest: WorkerRequest, workerResult: WorkerResult): AcceptanceIssue[] {
	const issues: AcceptanceIssue[] = [];
	if (workerResult.status !== "success") {
		issues.push({
			code: "worker_failed",
			message: workerResult.failureReason ?? `Worker returned status ${workerResult.status}.`,
			severity: "error",
		});
	}
	for (const expectedOutput of workerRequest.expectedOutputs) {
		if (!workerResultSatisfiesExpectedOutput(workerResult, expectedOutput)) {
			issues.push({
				code: "expected_output_missing",
				message: `Worker result did not satisfy expected output: ${expectedOutput}`,
				severity: "error",
			});
		}
	}
	for (const warning of workerResult.warnings) {
		issues.push({
			code: "worker_warning",
			message: warning,
			severity: "warning",
		});
	}
	for (const question of workerResult.openQuestions) {
		issues.push({
			code: "worker_open_question",
			message: question,
			severity: "info",
		});
	}
	return issues;
}

function createLeadAcceptanceReport(workerRequest: WorkerRequest, workerResult: WorkerResult): AcceptanceReport {
	return createAcceptanceReport(workerResult, acceptanceIssuesForWorkerResult(workerRequest, workerResult));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function createFailedWorkerResult(taskId: string, sessionId: string, error: unknown): WorkerResult {
	const message = errorMessage(error);
	return {
		taskId,
		status: "failed",
		summary: "Worker failed before producing an accepted result.",
		producedArtifacts: [],
		warnings: [message],
		openQuestions: ["Retry with a narrower worker request or handle the task directly in the lead agent."],
		executionTrace: createExecutionTrace(`lead-worker-failure-${taskId}`, sessionId),
		failureReason: message,
	};
}

function recordLeadEvent(sessionManager: SessionManager, customType: string, data: JsonObject): void {
	sessionManager.appendCustomEntry(customType, data);
}

function recordLeadAssistantMessage(sessionManager: SessionManager, finalOutput: string): void {
	sessionManager.appendMessage({
		role: "assistant",
		content: [{ type: "text", text: finalOutput }],
		api: "lead-agent",
		provider: "lead-agent",
		model: "lead-agent-synthesis",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			},
		},
		stopReason: "stop",
		timestamp: Date.now(),
	});
}

export function createLeadAgentRuntime(options: LeadAgentRuntimeOptions = {}): LeadAgentRuntime {
	const profiles = options.profiles ?? loadAcademicProfilesFromDir();
	const workerRunner = options.workerRunner ?? runCodingWorker;
	const directRunner = options.directRunner ?? createDefaultDirectRunner(options.cwd ?? process.cwd());
	const sessionManager = options.sessionManager ?? SessionManager.inMemory(options.cwd ?? process.cwd());
	return {
		profiles,
		sessionManager,
		plan: (request) => planLeadAgentTask(request, profiles),
		run: async (request) => {
			const taskId = request.taskId ?? `lead-task-${Date.now()}`;
			const sessionId = sessionManager.getSessionId();
			sessionManager.appendMessage({
				role: "user",
				content: [{ type: "text", text: request.objective }],
				timestamp: Date.now(),
			});
			const decision = planLeadAgentTask(request, profiles);
			recordLeadEvent(sessionManager, "lead-agent.decision", {
				taskId,
				mode: decision.mode,
				workerType: decision.workerType ?? null,
				profileId: decision.profileId ?? null,
				reason: decision.reason,
			});
			if (decision.mode === "direct") {
				const result = await synthesizeDirect(taskId, sessionId, request, decision, directRunner);
				recordLeadAssistantMessage(sessionManager, result.finalOutput);
				recordLeadEvent(sessionManager, "lead-agent.result", {
					taskId,
					finalOutput: result.finalOutput,
					accepted: true,
				});
				return result;
			}
			const workerRequest = toWorkerRequest(taskId, request, decision, profiles);
			recordLeadEvent(sessionManager, "lead-agent.worker_request", {
				taskId,
				workerType: workerRequest.workerType,
				expectedOutputs: workerRequest.expectedOutputs,
			});
			let workerResult: WorkerResult;
			let acceptanceReport: AcceptanceReport;
			try {
				workerResult = await workerRunner(workerRequest);
				acceptanceReport = createLeadAcceptanceReport(workerRequest, workerResult);
			} catch (error) {
				workerResult = createFailedWorkerResult(taskId, sessionId, error);
				acceptanceReport = createLeadAcceptanceReport(workerRequest, workerResult);
			}
			const result = synthesizeWorkerResult(taskId, sessionId, decision, workerResult, acceptanceReport);
			recordLeadAssistantMessage(sessionManager, result.finalOutput);
			recordLeadEvent(sessionManager, "lead-agent.result", {
				taskId,
				finalOutput: result.finalOutput,
				accepted: acceptanceReport.accepted,
			});
			return result;
		},
	};
}

export * from "./academic-smoke.js";

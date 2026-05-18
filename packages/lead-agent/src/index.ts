import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	AcceptanceReport,
	ArtifactBrief,
	ArtifactRef,
	JsonObject,
	WorkerProfile,
	WorkerResult,
	WorkflowClarification,
	WorkflowPlan,
	WorkflowPlanMode,
} from "@mariozechner/pi-agent-contracts";
import {
	type AgentHostSessionEvent,
	createAgentHostSession,
	type ModelRegistry,
	SessionManager,
} from "@mariozechner/pi-agent-host";
import type { ToolDefinition } from "@mariozechner/pi-agent-host/extensions";
import type { ArtifactStore } from "@mariozechner/pi-artifact-core";
import { createArxivProvider } from "./literature/providers/arxiv.js";
import { createCrossrefProvider } from "./literature/providers/crossref.js";
import { createPubMedProvider } from "./literature/providers/pubmed.js";
import { createSemanticScholarProvider } from "./literature/providers/semantic-scholar.js";
import { createLiteratureSearchTool } from "./literature/tools.js";
import {
	createFauxWorkflowPlanner,
	createLeadSessionWorkspace,
	createLeadTaskPlanningInput,
	createLlmWorkflowPlanner,
	executeWorkflowPlan,
	type LeadAgentWorkerRunner,
	type LeadSessionWorkspace,
	PlannerValidationError,
	synthesizeWorkflowFinalOutput,
	WORKFLOW_TEMPLATES,
	type WorkflowExecutionEvent,
	type WorkflowPlanner,
} from "./orchestration/index.js";
import { buildLeadDirectMessage, LEAD_AGENT_SYSTEM_PROMPT } from "./prompts.js";
import { createProfileWorkerDispatcher } from "./workers/profile-worker-dispatcher.js";
import { createProfileWorkerRunner } from "./workers/profile-worker-runner.js";
import { createStructuredProfileRunner } from "./workers/structured-profile-runner.js";

export type AcademicTaskType = "writing" | "research" | "review" | "revision" | "methods" | "citation";
export type LeadAgentDispatchMode = "auto" | "direct" | "worker";

/** Mirrors the ThinkingLevel from @mariozechner/pi-agent-core. */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** A model entry as returned by ModelRegistry.getAvailable(). */
export type LeadAgentModel = ReturnType<ModelRegistry["getAvailable"]>[number];

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
	/** Called for progress updates across direct and workflow runs. */
	onEvent?: (event: LeadAgentRunEvent) => void;
	/** @deprecated Use onEvent instead. */
	onDirectRunEvent?: (event: AgentHostSessionEvent) => void;
}

export type LeadAgentRunEvent =
	| {
			type: "plan_summary";
			taskId: string;
			sessionId: string;
			mode: WorkflowPlanMode;
			stepCount: number;
			summary: string;
	  }
	| {
			type: "clarification_required";
			taskId: string;
			sessionId: string;
			clarification: WorkflowClarification;
	  }
	| {
			type: "direct_session";
			event: AgentHostSessionEvent;
	  }
	| WorkflowExecutionEvent;

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
	clarification?: WorkflowClarification;
	workflowPlan?: WorkflowPlan;
	artifactBriefs?: ArtifactBrief[];
	acceptanceReport?: AcceptanceReport;
	workerResult?: WorkerResult;
}
export type LeadAgentDirectRunner = (request: LeadAgentTaskRequest) => Promise<string>;
export type { LeadAgentWorkerRunner } from "./orchestration/index.js";

export interface LiteratureSearchConfig {
	contactEmail?: string;
	semanticScholarApiKey?: string;
	ncbiApiKey?: string;
	ncbiTool?: string;
	ncbiEmail?: string;
}

export interface LeadAgentRuntimeOptions {
	workerRunner?: LeadAgentWorkerRunner;
	directRunner?: LeadAgentDirectRunner;
	workflowPlanner?: WorkflowPlanner;
	literatureSearch?: LiteratureSearchConfig;
	workspace?: LeadSessionWorkspace;
	artifactDir?: string;
	artifactStore?: Pick<ArtifactStore, "get">;
	confirmPlan?: boolean;
	profiles?: WorkerProfile[];
	sessionManager?: SessionManager;
	cwd?: string;
	/** Model to use for the direct runner. If undefined, uses the default from settings. */
	model?: LeadAgentModel;
	/** Model to use for the LLM workflow planner. When absent and no workflowPlanner is set, falls back to a direct-mode stub. */
	plannerModel?: LeadAgentModel;
	/** Thinking level for extended reasoning. Defaults to "off". */
	thinkingLevel?: ThinkingLevel;
	/** Specific tools to enable. When set, noTools is ignored. */
	tools?: string[];
	/** Disable tools. "all" disables everything (default), "builtin" disables built-ins only. */
	noTools?: "all" | "builtin";
}

export interface LeadAgentRuntime {
	run(request: LeadAgentTaskRequest): Promise<LeadAgentResult>;
	abort(): void;
	plan(request: LeadAgentTaskRequest): LeadAgentDecision;
	/** Update the model and thinking level used for subsequent direct tasks. */
	setModel(model: LeadAgentModel | undefined, thinkingLevel?: ThinkingLevel): void;
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
		id: "literature-searcher",
		name: "Literature Searcher",
		description: "Plans and triages academic literature searches before evidence synthesis.",
		capabilities: [
			"literature-search",
			"search-strategy",
			"query-planning",
			"bibliography-triage",
			"screening-plan",
			"retrieval-gap-analysis",
		],
		expectedOutputs: [
			"search strategy",
			"query plan",
			"bibliography candidates",
			"screening notes",
			"retrieval gaps",
		],
		acceptanceChecklist: [
			"Search scope and key concepts are explicit",
			"Candidate bibliography is separated from verified evidence",
			"Retrieval gaps and database limitations are explicit",
		],
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

function parseBoolean(value: string): boolean | undefined {
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return undefined;
}

function parseStringList(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function sectionKeyValueMap(markdown: string, heading: string): Map<string, string> {
	const entries = new Map<string, string>();
	for (const item of sectionList(markdown, heading)) {
		const separator = item.indexOf(":");
		if (separator === -1) {
			continue;
		}
		const key = item.slice(0, separator).trim();
		const value = item.slice(separator + 1).trim();
		if (key.length > 0 && value.length > 0) {
			entries.set(key, value);
		}
	}
	return entries;
}

function parseToolPolicy(markdown: string): WorkerProfile["toolPolicy"] {
	const values = sectionKeyValueMap(markdown, "Tool Policy");
	if (values.size === 0) {
		return undefined;
	}
	const policy: NonNullable<WorkerProfile["toolPolicy"]> = {};
	const numericKeys = ["maxCalls", "maxResultsPerProvider", "timeoutMs"] as const;
	for (const key of numericKeys) {
		const value = values.get(key);
		if (value !== undefined) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) {
				policy[key] = parsed;
			}
		}
	}
	for (const key of ["defaultProviders", "allowedProviders"] as const) {
		const value = values.get(key);
		if (value !== undefined) {
			policy[key] = parseStringList(value);
		}
	}
	for (const key of ["requireArtifactOutput", "allowRefresh"] as const) {
		const value = values.get(key);
		if (value !== undefined) {
			const parsed = parseBoolean(value);
			if (parsed !== undefined) {
				policy[key] = parsed;
			}
		}
	}
	return policy;
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
	const allowedTools = sectionList(markdown, "Allowed Tools");
	const toolPolicy = parseToolPolicy(markdown);
	const inputRequirements = sectionList(markdown, "Input Requirements");
	const boundaries = sectionList(markdown, "Boundaries");
	return {
		id,
		name: titleFromMarkdown(markdown, fallbackName),
		description,
		rolePrompt,
		capabilities: capabilities.length > 0 ? capabilities : [id],
		expectedOutputs: expectedOutputs.length > 0 ? expectedOutputs : undefined,
		acceptanceChecklist: acceptanceChecklist.length > 0 ? acceptanceChecklist : undefined,
		allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
		toolPolicy,
		inputRequirements: inputRequirements.length > 0 ? inputRequirements : undefined,
		boundaries: boundaries.length > 0 ? boundaries : undefined,
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
	if (includesAny(objective, ["literature", "文献", "检索", "search papers", "find papers", "寻找"])) {
		return profiles.find((profile) => profile.id === "literature-searcher");
	}
	if (includesAny(objective, ["evidence", "research", "证据"])) {
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

function createDirectWorkflowPlan(taskId: string, sessionId: string, request: LeadAgentTaskRequest): WorkflowPlan {
	return {
		taskId,
		sessionId,
		objective: request.objective,
		rationale: "Task was selected for direct lead-author synthesis.",
		userVisibleSummary: "I will handle this directly.",
		mode: "direct",
		steps: [],
		stopConditions: ["Final answer produced"],
	};
}

function expectedArtifactKindsForFallback(request: LeadAgentTaskRequest): string[] {
	return request.expectedOutputs?.filter((output) => output.endsWith("-table") || output.endsWith("-audit")) ?? [];
}

function createSingleStepWorkflowPlan(
	taskId: string,
	sessionId: string,
	request: LeadAgentTaskRequest,
	decision: LeadAgentDecision,
	profiles: readonly WorkerProfile[],
): WorkflowPlan {
	const profile = profiles.find((candidate) => candidate.id === decision.profileId);
	const profileId = decision.profileId ?? profile?.id ?? "researcher";
	return {
		taskId,
		sessionId,
		objective: request.objective,
		rationale: decision.reason,
		userVisibleSummary: `I will run the ${profile?.name ?? profileId} worker and synthesize the accepted result.`,
		mode: "workflow",
		steps: [
			{
				id: profileId,
				order: 1,
				profileId,
				objective: request.objective,
				inputArtifactRefs: request.inputArtifacts ?? [],
				expectedArtifactKinds: expectedArtifactKindsForFallback(request),
				expectedOutputs: request.expectedOutputs ?? profile?.expectedOutputs ?? ["worker summary"],
				acceptanceCriteria: request.acceptanceCriteria ?? profile?.acceptanceChecklist ?? [],
			},
		],
		stopConditions: ["Worker result accepted"],
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
		workflowPlan: createDirectWorkflowPlan(taskId, sessionId, request),
		artifactBriefs: [],
	};
}

function createClarificationResult(options: {
	taskId: string;
	sessionId: string;
	decision: LeadAgentDecision;
	workflowPlan: WorkflowPlan;
	clarification: WorkflowClarification;
}): LeadAgentResult {
	return {
		taskId: options.taskId,
		sessionId: options.sessionId,
		decision: options.decision,
		finalOutput: options.clarification.question,
		clarification: options.clarification,
		workflowPlan: options.workflowPlan,
		artifactBriefs: [],
	};
}

function emitPlanSummary(
	request: LeadAgentTaskRequest,
	workflowPlan: WorkflowPlan,
	taskId: string,
	sessionId: string,
): void {
	request.onEvent?.({
		type: "plan_summary",
		taskId,
		sessionId,
		mode: workflowPlan.mode,
		stepCount: workflowPlan.steps.length,
		summary: workflowPlan.userVisibleSummary,
	});
}

/**
 * @deprecated Import buildLeadDirectMessage from "./prompts.js" instead.
 * Kept for backward compatibility.
 */
export {
	buildLeadDirectMessage as buildLeadDirectPrompt,
	buildLeadDirectMessage,
	LEAD_AGENT_SYSTEM_PROMPT,
} from "./prompts.js";

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

function createDefaultDirectRunner(
	cwd: string,
	modelRef: { value: LeadAgentModel | undefined },
	thinkingLevelRef: { value: ThinkingLevel | undefined },
	toolsRef: { value: string[] | undefined },
	noToolsRef: { value: "all" | "builtin" },
	resetRef: { value: boolean },
): LeadAgentDirectRunner {
	// Persisted session for multi-turn context continuity.
	// Replaced when resetRef.value is true (e.g. after setModel).
	let cachedSession: Awaited<ReturnType<typeof createAgentHostSession>>["session"] | undefined;

	return async (request) => {
		if (!cachedSession || resetRef.value) {
			const { session } = await createAgentHostSession({
				cwd,
				model: modelRef.value,
				thinkingLevel: thinkingLevelRef.value,
				tools: toolsRef.value,
				noTools: toolsRef.value ? undefined : noToolsRef.value,
				resourceLoaderOptions: {
					systemPromptOverride: () => LEAD_AGENT_SYSTEM_PROMPT,
				},
			});
			cachedSession = session;
			resetRef.value = false;
		}
		const onEvent = request.onEvent;
		const onDirectRunEvent = request.onDirectRunEvent;
		let unsub: (() => void) | undefined;
		if (onEvent || onDirectRunEvent) {
			unsub = cachedSession.subscribe((event) => {
				onDirectRunEvent?.(event);
				onEvent?.({ type: "direct_session", event });
			});
		}
		try {
			await cachedSession.prompt(buildLeadDirectMessage(request));
		} finally {
			unsub?.();
		}
		const text = extractLastAssistantText(cachedSession.messages as readonly { role: string; content: unknown }[]);
		return text.trim().length > 0 ? text : request.objective;
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

function decisionForWorkflowPlan(plan: WorkflowPlan, fallback: LeadAgentDecision): LeadAgentDecision {
	if (plan.mode === "direct") {
		return {
			mode: "direct",
			reason: plan.rationale,
		};
	}
	const firstStep = [...plan.steps].sort((a, b) => a.order - b.order)[0];
	if (!firstStep) {
		return fallback;
	}
	return {
		mode: "worker",
		workerType: firstStep.profileId,
		profileId: firstStep.profileId,
		reason: plan.rationale,
	};
}

function latestWorkflowWorkerResult(stepResults: readonly { workerResult?: WorkerResult }[]): WorkerResult | undefined {
	for (let i = stepResults.length - 1; i >= 0; i--) {
		const workerResult = stepResults[i]?.workerResult;
		if (workerResult) {
			return workerResult;
		}
	}
	return undefined;
}

function createDefaultWorkflowWorkerRunner(
	cwd: string,
	workspace: LeadSessionWorkspace,
	config: LiteratureSearchConfig | undefined,
): LeadAgentWorkerRunner {
	const literatureTool = createLiteratureSearchTool({
		store: workspace.store,
		providers: [
			createCrossrefProvider({
				mailto: config?.contactEmail ?? process.env.CROSSREF_MAILTO ?? process.env.PI_LITERATURE_CONTACT_EMAIL,
			}),
			createSemanticScholarProvider({
				apiKey: config?.semanticScholarApiKey ?? process.env.SEMANTIC_SCHOLAR_API_KEY,
			}),
			createPubMedProvider({
				apiKey: config?.ncbiApiKey ?? process.env.NCBI_API_KEY,
				tool: config?.ncbiTool ?? process.env.NCBI_TOOL,
				email: config?.ncbiEmail ?? process.env.NCBI_EMAIL ?? process.env.PI_LITERATURE_CONTACT_EMAIL,
			}),
			createArxivProvider(),
		],
	});
	const literatureToolDefinition = literatureTool as unknown as ToolDefinition;
	const literatureRunner = createProfileWorkerRunner({
		cwd,
		store: workspace.store,
		toolDefinitions: [literatureToolDefinition],
	});
	const structuredRunner = createStructuredProfileRunner({
		store: workspace.store,
	});
	return createProfileWorkerDispatcher({
		literatureRunner,
		structuredRunner,
	});
}

export function createLeadAgentRuntime(options: LeadAgentRuntimeOptions = {}): LeadAgentRuntime {
	const profiles = options.profiles ?? loadAcademicProfilesFromDir();
	// Priority: 1. injected workflowPlanner  2. plannerModel → LLM planner  3. direct-mode stub fallback
	const workflowPlanner =
		options.workflowPlanner ??
		(options.plannerModel
			? createLlmWorkflowPlanner({
					model: options.plannerModel,
					templates: WORKFLOW_TEMPLATES,
					profiles,
				})
			: createFauxWorkflowPlanner((input) => ({
					taskId: input.taskId,
					sessionId: input.sessionId,
					objective: input.objective,
					rationale: "No LLM planner configured; handling directly.",
					userVisibleSummary: "I will handle this directly.",
					mode: "direct" as const,
					steps: [],
					stopConditions: ["Final answer produced"],
				})));
	const sessionManager = options.sessionManager ?? SessionManager.inMemory(options.cwd ?? process.cwd());

	// Mutable refs so setModel() can update them after creation
	const modelRef: { value: LeadAgentModel | undefined } = { value: options.model };
	const thinkingLevelRef: { value: ThinkingLevel | undefined } = { value: options.thinkingLevel };
	const toolsRef: { value: string[] | undefined } = { value: options.tools };
	const noToolsRef: { value: "all" | "builtin" } = { value: options.noTools ?? "all" };
	const resetRef: { value: boolean } = { value: false };

	const directRunner =
		options.directRunner ??
		createDefaultDirectRunner(
			options.cwd ?? process.cwd(),
			modelRef,
			thinkingLevelRef,
			toolsRef,
			noToolsRef,
			resetRef,
		);

	let abortController = new AbortController();

	async function runImpl(request: LeadAgentTaskRequest): Promise<LeadAgentResult> {
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
		if (request.dispatchMode === "direct") {
			const workflowPlan = createDirectWorkflowPlan(taskId, sessionId, request);
			emitPlanSummary(request, workflowPlan, taskId, sessionId);
			const result = await synthesizeDirect(taskId, sessionId, request, decision, directRunner);
			result.workflowPlan = workflowPlan;
			recordLeadAssistantMessage(sessionManager, result.finalOutput);
			recordLeadEvent(sessionManager, "lead-agent.result", {
				taskId,
				finalOutput: result.finalOutput,
				accepted: true,
			});
			return result;
		}

		const planningInput = createLeadTaskPlanningInput({
			request,
			taskId,
			sessionId,
			profiles,
		});
		let workflowPlan: WorkflowPlan;
		try {
			workflowPlan = await workflowPlanner.plan(planningInput);
		} catch (e) {
			if (e instanceof PlannerValidationError) {
				const result: LeadAgentResult = {
					taskId,
					finalOutput: "未能生成可执行的工作流计划。请检查输入后重试。",
					decision: { mode: "direct", reason: "Planner validation failed after repair" },
					sessionId,
				};
				recordLeadAssistantMessage(sessionManager, result.finalOutput);
				return result;
			}
			throw e;
		}
		if (
			(decision.mode === "worker" && workflowPlan.mode === "direct") ||
			(request.profileId &&
				!workflowPlan.steps.some((step) => step.profileId === request.profileId) &&
				workflowPlan.steps.length <= 1)
		) {
			recordLeadEvent(sessionManager, "lead-agent.planner_override", {
				taskId,
				requestedProfileId: request.profileId ?? null,
				plannedMode: workflowPlan.mode,
				plannedStepProfileIds: workflowPlan.steps.map((step) => step.profileId),
				reason: "Explicit profileId was not present in planner output; falling back to a single-step workflow.",
			});
			workflowPlan = createSingleStepWorkflowPlan(taskId, sessionId, request, decision, profiles);
		}
		const workflowDecision = decisionForWorkflowPlan(workflowPlan, decision);
		emitPlanSummary(request, workflowPlan, taskId, sessionId);
		const clarification = workflowPlan.requiresClarification;
		if (clarification?.blocksExecution) {
			request.onEvent?.({
				type: "clarification_required",
				taskId,
				sessionId,
				clarification,
			});
			const result = createClarificationResult({
				taskId,
				sessionId,
				decision: workflowDecision,
				workflowPlan,
				clarification,
			});
			recordLeadAssistantMessage(sessionManager, result.finalOutput);
			recordLeadEvent(sessionManager, "lead-agent.clarification", {
				taskId,
				question: clarification.question,
				reason: clarification.reason,
				blocksExecution: clarification.blocksExecution,
			});
			return result;
		}
		if (workflowPlan.mode === "direct") {
			const result = await synthesizeDirect(taskId, sessionId, request, workflowDecision, directRunner);
			result.workflowPlan = workflowPlan;
			recordLeadAssistantMessage(sessionManager, result.finalOutput);
			recordLeadEvent(sessionManager, "lead-agent.result", {
				taskId,
				finalOutput: result.finalOutput,
				accepted: true,
			});
			return result;
		}
		recordLeadEvent(sessionManager, "lead-agent.workflow_plan", {
			taskId,
			mode: workflowPlan.mode,
			stepCount: workflowPlan.steps.length,
			confirmPlan: options.confirmPlan ?? false,
		});
		const workspace =
			options.workspace ??
			createLeadSessionWorkspace({
				cwd: sessionManager.getCwd(),
				sessionId,
				artifactDir: options.artifactDir,
			});
		const workerRunner =
			options.workerRunner ??
			createDefaultWorkflowWorkerRunner(sessionManager.getCwd(), workspace, options.literatureSearch);
		const execution = await executeWorkflowPlan({
			plan: workflowPlan,
			profiles,
			workspace,
			workerRunner,
			artifactStore: options.artifactStore ?? workspace.store,
			onEvent: request.onEvent,
			constraints: request.constraints ?? [],
			metadata: request.metadata,
		});
		const acceptanceReport = execution.acceptanceReports.at(-1);
		const workerResult = latestWorkflowWorkerResult(execution.stepResults);
		const finalOutput = synthesizeWorkflowFinalOutput(workflowPlan, execution);
		const result: LeadAgentResult = {
			taskId,
			finalOutput,
			decision: workflowDecision,
			sessionId,
			workflowPlan,
			artifactBriefs: execution.artifactBriefs,
			acceptanceReport,
			workerResult,
		};
		recordLeadAssistantMessage(sessionManager, result.finalOutput);
		recordLeadEvent(sessionManager, "lead-agent.result", {
			taskId,
			finalOutput: result.finalOutput,
			accepted: acceptanceReport?.accepted ?? execution.accepted,
		});
		return result;
	}

	return {
		profiles,
		sessionManager,
		plan: (request) => planLeadAgentTask(request, profiles),
		setModel(model, thinkingLevel) {
			modelRef.value = model;
			thinkingLevelRef.value = thinkingLevel;
			// Force a new agent session on next direct run so the new model takes effect.
			resetRef.value = true;
		},
		abort() {
			abortController.abort();
		},
		async run(request) {
			abortController = new AbortController();
			const abortPromise = new Promise<never>((_, reject) => {
				abortController.signal.addEventListener(
					"abort",
					() => {
						const err = new Error("Run aborted by user");
						err.name = "AbortError";
						reject(err);
					},
					{ once: true },
				);
			});
			return Promise.race([runImpl(request), abortPromise]);
		},
	};
}

export * from "./academic-smoke.js";

import type { ArtifactRef, WorkerProfile, WorkflowPlan } from "@mariozechner/pi-agent-contracts";
import { WorkflowPlanSchema } from "@mariozechner/pi-agent-contracts";
import type { Context, Tool, ToolCall } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import type { LeadAgentModel } from "../index.js";
import { assertValidWorkflowPlan, validateWorkflowPlan } from "./planner.js";
import { summarizeWorkflowTemplatesForPlanner } from "./templates.js";
import type { LeadTaskPlanningInput, PlannerValidationContext, WorkflowPlanner, WorkflowTemplate } from "./types.js";

export interface LlmWorkflowPlannerConfig {
	model: LeadAgentModel;
	templates: WorkflowTemplate[];
	profiles: readonly WorkerProfile[];
}

export class PlannerValidationError extends Error {
	readonly objective: string;
	readonly firstErrors: string[];
	readonly secondErrors: string[];
	readonly firstPlan?: unknown;
	readonly secondPlan?: unknown;

	constructor(options: {
		objective: string;
		firstErrors: string[];
		secondErrors: string[];
		firstPlan?: unknown;
		secondPlan?: unknown;
	}) {
		super(
			`LLM planner failed after repair attempt.\n` +
				`First errors: ${options.firstErrors.join("; ")}\n` +
				`Second errors: ${options.secondErrors.join("; ")}`,
		);
		this.name = "PlannerValidationError";
		this.objective = options.objective;
		this.firstErrors = options.firstErrors;
		this.secondErrors = options.secondErrors;
		this.firstPlan = options.firstPlan;
		this.secondPlan = options.secondPlan;
	}
}

type PlannerCallResult = { ok: true; plan: unknown } | { ok: false; errors: string[] };

// WorkflowPlanSchema is a plain JsonObject, not a TypeBox TSchema instance.
// Upgrading agent-contracts to TypeBox is out of scope for this change.
// This cast is local to llm-planner.ts; the tool is not exported.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const submitWorkflowPlanTool = {
	name: "submit_workflow_plan",
	description: "Submit the final workflow plan for execution.",
	parameters: {
		type: "object",
		properties: {
			plan: WorkflowPlanSchema,
		},
		required: ["plan"],
		additionalProperties: false,
	},
} satisfies Tool<any>;

const SYSTEM_PROMPT = `You are a workflow planner for an academic research pipeline.
Your ONLY job is to submit a valid WorkflowPlan.

Rules:
- Do NOT solve the user task.
- Do NOT write a user-facing answer.
- Do NOT explain your reasoning outside the tool call.
- Submit exactly one submit_workflow_plan tool call.
- Use only worker profile IDs listed in Available worker profiles.
- Treat the listed workflow templates as guidance — you may use, adapt, or combine them. Do not invent profile IDs.
- Do not invent worker types, artifact IDs, or inter-step artifact references.
- Do not switch to mode=direct merely to avoid validation errors.
  Only choose direct if the task truly requires no specialist worker.
- If mode=direct, steps MUST be [].
- If mode=workflow, steps MUST contain at least one step.
- Every workflow step MUST follow this exact format for the objective field:

  User objective: <verbatim copy of the user's original objective>

  Step objective: <specific task for this worker>

  Do not merge them. Do not paraphrase the user objective.
- Only reference artifact IDs from the provided Input artifacts list in inputArtifactRefs.
  Prior-step outputs are automatically available to later workers — do not invent inter-step IDs.`;

function formatArtifacts(artifacts: ArtifactRef[]): string {
	if (artifacts.length === 0) return "none";
	return artifacts.map((a) => `- ${a.id} (${a.kind})`).join("\n");
}

function buildUserMessage(input: LeadTaskPlanningInput, config: LlmWorkflowPlannerConfig): string {
	const profileLines = config.profiles.map((p) => `- ${p.id}: ${p.description}`).join("\n");
	const templateSummaries = summarizeWorkflowTemplatesForPlanner(config.templates);
	const templateLines = templateSummaries
		.map((t) => {
			const stepLines =
				t.steps.length === 0
					? "  (no steps — lead agent handles directly)"
					: t.steps.map((s) => `  - ${s.profileId}: ${s.role}`).join("\n");
			return `${t.id}: ${t.description}\n${stepLines}`;
		})
		.join("\n\n");

	return [
		`User objective:\n${input.objective}`,
		`Constraints:\n${input.constraints.length > 0 ? input.constraints.join("\n") : "none"}`,
		`Expected outputs:\n${input.expectedOutputs.length > 0 ? input.expectedOutputs.join("\n") : "none"}`,
		`Input artifacts:\n${formatArtifacts(input.inputArtifacts)}`,
		`Available worker profiles:\n${profileLines}`,
		`Available workflow templates (use, adapt, or combine as needed):\n${templateLines}`,
	].join("\n\n");
}

function buildRepairUserMessage(
	input: LeadTaskPlanningInput,
	config: LlmWorkflowPlannerConfig,
	firstErrors: string[],
	firstPlan: unknown,
): string {
	const base = buildUserMessage(input, config);
	return (
		`The plan you submitted is invalid. Do not solve the user task.\n` +
		`Use only the available worker profiles and workflow templates listed below.\n` +
		`Do not invent replacement IDs. Preserve the original user objective exactly.\n` +
		`Do not switch to mode=direct merely to avoid validation errors.\n` +
		`Fix only the structural issues listed below and submit exactly one corrected submit_workflow_plan tool call.\n\n` +
		`Validation errors:\n${firstErrors.map((e) => `- ${e}`).join("\n")}\n\n` +
		`Invalid plan:\n${JSON.stringify(firstPlan, null, 2)}\n\n---\n\n` +
		base
	);
}

function buildContext(userMessage: string): Context {
	return {
		messages: [{ role: "user", content: [{ type: "text", text: userMessage }], timestamp: Date.now() }],
		tools: [submitWorkflowPlanTool],
		systemPrompt: SYSTEM_PROMPT,
	};
}

async function runPlannerCall(context: Context, config: LlmWorkflowPlannerConfig): Promise<PlannerCallResult> {
	const msg = await completeSimple(config.model, context);

	if (msg.stopReason !== "toolUse") {
		return { ok: false, errors: [`Expected stopReason=toolUse, got ${msg.stopReason}`] };
	}

	const toolCalls = msg.content.filter(
		(c) => c.type === "toolCall" && (c as ToolCall).name === "submit_workflow_plan",
	) as ToolCall[];

	if (toolCalls.length === 0) {
		return { ok: false, errors: ["No submit_workflow_plan tool call in response"] };
	}
	if (toolCalls.length > 1) {
		return { ok: false, errors: [`Expected exactly 1 tool call, got ${toolCalls.length}`] };
	}

	const args = toolCalls[0]!.arguments;
	if (!args.plan || typeof args.plan !== "object") {
		return { ok: false, errors: ["Tool call missing args.plan or plan is not an object"] };
	}

	return { ok: true, plan: args.plan };
}

export function createLlmWorkflowPlanner(config: LlmWorkflowPlannerConfig): WorkflowPlanner {
	return {
		async plan(input: LeadTaskPlanningInput): Promise<WorkflowPlan> {
			const validationContext: PlannerValidationContext = {
				profiles: config.profiles,
				templates: config.templates,
				inputArtifacts: input.inputArtifacts,
			};

			// First attempt
			const first = await runPlannerCall(buildContext(buildUserMessage(input, config)), config);
			const firstErrors = first.ok ? validateWorkflowPlan(first.plan, validationContext) : first.errors;

			if (first.ok && firstErrors.length === 0) {
				assertValidWorkflowPlan(first.plan, validationContext);
				return first.plan as WorkflowPlan;
			}

			// Repair attempt
			const firstPlan = first.ok ? first.plan : null;
			const repair = await runPlannerCall(
				buildContext(buildRepairUserMessage(input, config, firstErrors, firstPlan)),
				config,
			);
			const secondErrors = repair.ok ? validateWorkflowPlan(repair.plan, validationContext) : repair.errors;

			if (repair.ok && secondErrors.length === 0) {
				assertValidWorkflowPlan(repair.plan, validationContext);
				return repair.plan as WorkflowPlan;
			}

			throw new PlannerValidationError({
				objective: input.objective,
				firstErrors,
				secondErrors,
				firstPlan: first.ok ? first.plan : undefined,
				secondPlan: repair.ok ? repair.plan : undefined,
			});
		},
	};
}

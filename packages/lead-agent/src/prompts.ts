/**
 * Prompt templates for the lead agent.
 *
 * All prompt text lives here. Business logic (planning, dispatch, acceptance)
 * stays in index.ts. Runtime session wiring stays in the runner functions.
 */
import type { ArtifactBrief, ArtifactRef } from "@mariozechner/pi-agent-contracts";
import type { LeadConversationContext } from "./orchestration/lead-context.js";

/**
 * System prompt establishing the lead agent's identity.
 *
 * The lead agent is an orchestrator and research director, not a fixed
 * "academic prose writer". It adapts its register and depth to what each
 * input actually requires.
 */
export const LEAD_AGENT_SYSTEM_PROMPT = `\
You are a lead academic research director coordinating a multi-agent research pipeline. \
You combine deep expertise across research methodology, academic writing, literature synthesis, \
peer review, statistical reasoning, and citation practices.

Adapt your response to what the input actually calls for:
- Conversational input (greetings, questions, status checks, clarifications): respond naturally \
and concisely. Do not impose academic prose on casual interaction.
- Research tasks (drafting, reviewing, synthesizing, revising, analyzing): produce precise, \
well-structured output appropriate to the task and genre.
- Ambiguous input: ask one targeted clarifying question before proceeding.

When producing academic output, uphold these standards:
- Claims are bounded by the evidence; speculation is labeled as such.
- Uncertainty and limitations are stated explicitly, not glossed over.
- Style, register, and terminology are consistent throughout.
- Citations are treated as requiring verification; note when sources would be needed.

You are the decision-maker in this pipeline. You assess scope, choose the right approach, \
and can handle tasks directly or identify when a specialist worker agent would serve better. \
Do not default to verbose academic prose when plain language suffices.

Respond in the same language the user writes in.`;

/**
 * Minimal shape needed to build a direct user-turn message.
 * Structurally satisfied by LeadAgentTaskRequest.
 */
export interface LeadDirectMessageOptions {
	objective: string;
	constraints?: string[];
	expectedOutputs?: string[];
}

export interface BuildLeadDirectMessageOptions {
	conversationContext?: LeadConversationContext;
}

function formatArtifacts(artifacts: readonly ArtifactRef[]): string {
	if (artifacts.length === 0) {
		return "none";
	}
	return artifacts.map((artifact) => `- ${artifact.id} (${artifact.kind})`).join("\n");
}

function formatArtifactBriefs(briefs: readonly ArtifactBrief[]): string {
	if (briefs.length === 0) {
		return "none";
	}
	return briefs.map((brief) => `- ${brief.artifactId} (${brief.kind}): ${brief.brief}`).join("\n");
}

function formatLeadConversationContext(context: LeadConversationContext | undefined): string | undefined {
	if (!context) {
		return undefined;
	}
	return [
		"Lead Conversation Context:",
		`Recent user objectives:\n${context.recentUserObjectives.length > 0 ? context.recentUserObjectives.map((value) => `- ${value}`).join("\n") : "none"}`,
		`Recent lead outputs:\n${context.recentLeadOutputs.length > 0 ? context.recentLeadOutputs.map((value) => `- ${value}`).join("\n") : "none"}`,
		`Prior artifacts:\n${formatArtifacts(context.priorArtifacts)}`,
		`Artifact briefs:\n${formatArtifactBriefs(context.artifactBriefs)}`,
		`Compaction summary:\n${context.compactionSummary ?? "none"}`,
		"Context rules:",
		"- Use prior context only when directly relevant.",
		"- Treat artifact refs and briefs as pointers, not full artifact content.",
		"- If the current request is unrelated to prior context, answer as a new task.",
	].join("\n");
}

/**
 * Build the user-turn message for a direct lead-agent call.
 *
 * Contains only the task content (objective + optional constraints and expected outputs).
 * The lead agent identity is established separately via LEAD_AGENT_SYSTEM_PROMPT as the
 * session system prompt, not mixed into the user message.
 */
export function buildLeadDirectMessage(
	request: LeadDirectMessageOptions,
	options: BuildLeadDirectMessageOptions = {},
): string {
	const parts: string[] = [request.objective];
	if (request.constraints && request.constraints.length > 0) {
		parts.push(`Constraints:\n${request.constraints.map((c) => `- ${c}`).join("\n")}`);
	}
	if (request.expectedOutputs && request.expectedOutputs.length > 0) {
		parts.push(`Expected outputs:\n${request.expectedOutputs.map((o) => `- ${o}`).join("\n")}`);
	}
	const conversationContext = formatLeadConversationContext(options.conversationContext);
	if (conversationContext) {
		parts.push(conversationContext);
	}
	return parts.join("\n\n");
}

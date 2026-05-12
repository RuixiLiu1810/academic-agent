import type { ArtifactRef } from "@mariozechner/pi-agent-contracts";
import type { WorkflowTemplate } from "./types.js";

export interface TemplateSelectionInput {
	objective: string;
	expectedOutputs: string[];
	inputArtifacts: ArtifactRef[];
}

function includesAny(text: string, terms: readonly string[]): boolean {
	const normalized = text.toLowerCase();
	return terms.some((term) => normalized.includes(term));
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
	{
		id: "direct-writing",
		title: "Direct Writing",
		description: "Single lead-author pass for small writing or polishing tasks.",
		steps: [],
	},
	{
		id: "citation-audit",
		title: "Citation Audit",
		description: "Check claim support before revision.",
		steps: [
			{
				id: "citation-audit",
				profileId: "citation-checker",
				objective: "Identify unsupported or citation-dependent claims.",
				expectedArtifactKinds: ["claim-audit"],
				expectedOutputs: ["citation audit"],
				acceptanceCriteria: ["Unsupported claims are identified"],
			},
		],
	},
	{
		id: "method-audit",
		title: "Method Audit",
		description: "Check reproducibility and methods assumptions.",
		steps: [
			{
				id: "method-audit",
				profileId: "method-auditor",
				objective: "Audit methods, statistics, and reproducibility details.",
				expectedArtifactKinds: ["revision-plan"],
				expectedOutputs: ["methods audit"],
				acceptanceCriteria: ["Missing assumptions are explicit"],
			},
		],
	},
	{
		id: "revision-response",
		title: "Revision Response",
		description: "Map review comments, plan revisions, and draft response text.",
		steps: [
			{
				id: "review-comment-map",
				profileId: "reviewer",
				objective: "Map reviewer comments into actionable issues.",
				expectedArtifactKinds: ["review-comment-map"],
				expectedOutputs: ["review memo"],
				acceptanceCriteria: ["Findings are actionable"],
			},
			{
				id: "revision-plan",
				profileId: "reviser",
				objective: "Create a revision plan and response strategy.",
				expectedArtifactKinds: ["revision-plan"],
				expectedOutputs: ["revision plan"],
				acceptanceCriteria: ["Reviewer requests are addressed"],
			},
		],
	},
	{
		id: "evidence-synthesis",
		title: "Evidence Synthesis",
		description: "Extract evidence and prepare a writing outline.",
		steps: [
			{
				id: "evidence-summary",
				profileId: "researcher",
				objective: "Separate evidence from interpretation.",
				expectedArtifactKinds: ["evidence-table"],
				expectedOutputs: ["evidence summary"],
				acceptanceCriteria: ["Uncertainty is explicit"],
			},
			{
				id: "outline",
				profileId: "writer",
				objective: "Turn accepted evidence into an outline.",
				expectedArtifactKinds: ["outline"],
				expectedOutputs: ["outline"],
				acceptanceCriteria: ["Claims are bounded"],
			},
		],
	},
];

export function selectWorkflowTemplateCandidates(input: TemplateSelectionInput): WorkflowTemplate[] {
	const text = [
		input.objective,
		...input.expectedOutputs,
		...input.inputArtifacts.map((artifact) => artifact.kind),
	].join("\n");
	const selected = WORKFLOW_TEMPLATES.filter((template) => {
		if (template.id === "citation-audit") {
			return includesAny(text, ["citation", "reference", "引用", "参考文献"]);
		}
		if (template.id === "method-audit") {
			return includesAny(text, ["method", "statistics", "方法", "统计", "reproducibility"]);
		}
		if (template.id === "revision-response") {
			return includesAny(text, ["reviewer", "comment", "response", "退修", "审稿", "意见"]);
		}
		if (template.id === "evidence-synthesis") {
			return includesAny(text, ["evidence", "literature", "文献", "证据", "outline"]);
		}
		return false;
	});
	return selected.length > 0 ? selected : [WORKFLOW_TEMPLATES[0]!];
}

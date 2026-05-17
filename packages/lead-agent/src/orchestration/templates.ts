import type { WorkflowTemplate } from "./types.js";

export interface WorkflowTemplateSummary {
	id: string;
	title: string;
	description: string;
	steps: { profileId: string; role: string }[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
	{
		id: "direct-writing",
		title: "Direct Writing",
		description: "Single lead-author pass for small writing or polishing tasks.",
		steps: [],
	},
	{
		id: "literature-search",
		title: "Literature Search",
		description: "Plan and triage literature discovery before source-backed evidence synthesis.",
		steps: [
			{
				id: "literature-search",
				profileId: "literature-searcher",
				objective:
					"Build an offline structured search strategy, query plan, candidate bibliography hints, and retrieval gaps.",
				expectedArtifactKinds: ["literature-search-results"],
				expectedOutputs: ["search strategy", "query plan", "bibliography candidates", "retrieval gaps"],
				acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
			},
		],
	},
	{
		id: "literature-to-evidence",
		title: "Literature To Evidence",
		description: "Search first, then synthesize accepted search outputs into evidence notes.",
		steps: [
			{
				id: "literature-search",
				profileId: "literature-searcher",
				objective:
					"Build an offline structured search strategy, query plan, candidate bibliography hints, and retrieval gaps.",
				expectedArtifactKinds: ["literature-search-results"],
				expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
				acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
			},
			{
				id: "evidence-summary",
				profileId: "researcher",
				objective:
					"Synthesize accepted search outputs into evidence summary, evidence table, and uncertainty notes.",
				expectedArtifactKinds: ["evidence-table"],
				expectedOutputs: ["evidence summary", "evidence-table", "uncertainty notes"],
				acceptanceCriteria: ["Uncertainty is explicit"],
			},
		],
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
		id: "review-memo",
		title: "Review Memo",
		description: "Produce a severity-ordered review memo without entering revision planning.",
		steps: [
			{
				id: "review-memo",
				profileId: "reviewer",
				objective: "Review the manuscript and produce a severity-ordered memo.",
				expectedArtifactKinds: ["review-comment-map"],
				expectedOutputs: ["review memo"],
				acceptanceCriteria: ["Findings are severity ordered"],
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
	{
		id: "outline-to-draft",
		title: "Outline To Draft",
		description: "Expand an accepted outline into a bounded draft.",
		steps: [
			{
				id: "draft",
				profileId: "writer",
				objective: "Expand the accepted outline into a coherent draft.",
				expectedArtifactKinds: ["draft-text"],
				expectedOutputs: ["draft text"],
				acceptanceCriteria: ["Style is consistent"],
			},
		],
	},
];

export function summarizeWorkflowTemplatesForPlanner(templates: WorkflowTemplate[]): WorkflowTemplateSummary[] {
	return templates.map((template) => ({
		id: template.id,
		title: template.title,
		description: template.description,
		steps: template.steps.map((step) => ({
			profileId: step.profileId,
			role: step.objective,
		})),
	}));
}

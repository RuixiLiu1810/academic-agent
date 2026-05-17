/**
 * Standardized OutputRequirement arrays for each academic worker profile.
 *
 * These constants are the single source of truth for what each profile is expected to produce.
 * They can be embedded into WorkerRequest.outputRequirements by the executor or manually wired
 * into WorkflowTemplate step definitions.
 */

import type { OutputRequirement } from "@mariozechner/pi-agent-contracts";

export const LITERATURE_SEARCH_OUTPUTS: OutputRequirement[] = [
	{
		id: "literature-search-results",
		kind: "artifact",
		label: "Literature search results",
		required: true,
		artifactKind: "literature-search-results",
		description: "Structured list of retrieved candidate papers with titles, abstracts, and source metadata.",
	},
];

export const EVIDENCE_SYNTHESIS_OUTPUTS: OutputRequirement[] = [
	{
		id: "evidence-table",
		kind: "artifact",
		label: "Evidence table",
		required: true,
		artifactKind: "evidence-table",
		description:
			"Structured table mapping claims to supporting evidence entries including citation, strength, and methodology notes.",
	},
	{
		id: "synthesis-summary",
		kind: "summary",
		label: "Synthesis narrative summary",
		required: true,
		description: "Prose synthesis of the evidence across retrieved literature, identifying convergences and gaps.",
	},
];

export const CITATION_AUDIT_OUTPUTS: OutputRequirement[] = [
	{
		id: "citation-audit-report",
		kind: "artifact",
		label: "Citation audit report",
		required: true,
		artifactKind: "claim-audit",
		description:
			"Structured audit listing each claim and whether its citation accurately supports it, with issue severity.",
	},
];

export const METHOD_AUDIT_OUTPUTS: OutputRequirement[] = [
	{
		id: "methods-audit",
		kind: "artifact",
		label: "Methods audit",
		required: true,
		artifactKind: "methods-audit",
		description:
			"Structured assessment of methodological soundness including design, power, bias risk, and reporting completeness.",
	},
];

export const REVIEW_MEMO_OUTPUTS: OutputRequirement[] = [
	{
		id: "review-comment-map",
		kind: "artifact",
		label: "Review comment map",
		required: true,
		artifactKind: "review-comment-map",
		description:
			"Structured map of reviewer comments to specific sections with recommended author responses and priority.",
	},
	{
		id: "review-summary",
		kind: "summary",
		label: "Review decision memo",
		required: true,
		description: "High-level summary of the overall reviewer assessment and recommended revision actions.",
	},
];

export const WRITER_OUTPUTS: OutputRequirement[] = [
	{
		id: "draft-document",
		kind: "artifact",
		label: "Draft manuscript section",
		required: true,
		artifactKind: "draft-document",
		description: "Written manuscript section or complete draft produced according to the step objective.",
	},
];

export const REVISER_OUTPUTS: OutputRequirement[] = [
	{
		id: "revised-document",
		kind: "artifact",
		label: "Revised manuscript",
		required: true,
		artifactKind: "draft-document",
		description: "Revised manuscript addressing reviewer comments or editorial feedback.",
	},
	{
		id: "revision-notes",
		kind: "summary",
		label: "Revision notes",
		required: false,
		description: "Prose notes summarising the changes made in response to each reviewer comment.",
	},
];

/** Map from profile id to the canonical output requirements for that profile. */
export const OUTPUT_REQUIREMENTS_BY_PROFILE: Record<string, OutputRequirement[]> = {
	"literature-searcher": LITERATURE_SEARCH_OUTPUTS,
	researcher: EVIDENCE_SYNTHESIS_OUTPUTS,
	"citation-checker": CITATION_AUDIT_OUTPUTS,
	"method-auditor": METHOD_AUDIT_OUTPUTS,
	reviewer: REVIEW_MEMO_OUTPUTS,
	writer: WRITER_OUTPUTS,
	reviser: REVISER_OUTPUTS,
};

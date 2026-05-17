/**
 * TypeScript interfaces describing the content shape of each artifact kind produced
 * by academic worker profiles.
 *
 * These types are consumed by acceptance checkers, downstream steps, and any code that
 * reads artifact JSON payloads.  They intentionally use only plain serializable types so
 * they round-trip through JSON without loss.
 */

// ---------------------------------------------------------------------------
// literature-search-results
// ---------------------------------------------------------------------------

export interface LiteratureSearchCandidate {
	/** Unique identifier from the source database (e.g. PubMed PMID, DOI). */
	sourceId: string;
	/** Source database name (e.g. "pubmed", "semanticscholar"). */
	source: string;
	title: string;
	authors: string[];
	/** Publication year (may be undefined for preprints). */
	year?: number;
	/** Journal or conference venue. */
	venue?: string;
	abstract?: string;
	/** Raw relevance or citation count score returned by the search API. */
	relevanceScore?: number;
	/** Short statement of why this paper was included (written by the searcher). */
	inclusionRationale?: string;
}

export interface LiteratureSearchResultsArtifact {
	/** Search query string(s) used. */
	queries: string[];
	candidates: LiteratureSearchCandidate[];
	/** Total number of results returned by the search APIs before filtering. */
	rawResultCount?: number;
	/** Filters applied (e.g. year range, language). */
	filtersApplied?: string[];
}

// ---------------------------------------------------------------------------
// evidence-table
// ---------------------------------------------------------------------------

export interface EvidenceTableRow {
	/** Claim or research question being evidenced. */
	claim: string;
	/** Citation key or full reference string. */
	citation: string;
	/** Free-text description of the evidence. */
	evidence: string;
	/** Study design (e.g. "RCT", "observational cohort"). */
	studyDesign?: string;
	/** Evidence strength rating (e.g. "high", "moderate", "low", "very low"). */
	strength: "high" | "moderate" | "low" | "very low" | string;
	notes?: string;
}

export interface EvidenceTableArtifact {
	rows: EvidenceTableRow[];
	/** Overall synthesis narrative written by the researcher. */
	narrative?: string;
}

// ---------------------------------------------------------------------------
// claim-audit
// ---------------------------------------------------------------------------

export type ClaimAuditSeverity = "critical" | "major" | "minor" | "ok";

export interface ClaimAuditItem {
	/** The claim as written in the draft. */
	claim: string;
	/** The cited reference(s). */
	citations: string[];
	/** Whether the citation accurately supports the claim. */
	supported: boolean;
	severity: ClaimAuditSeverity;
	/** Human-readable explanation of the issue (if any). */
	explanation?: string;
	/** Suggested corrective action (if applicable). */
	suggestion?: string;
}

export interface ClaimAuditArtifact {
	items: ClaimAuditItem[];
	/** Summary statistics. */
	summary: {
		total: number;
		supported: number;
		unsupported: number;
		critical: number;
		major: number;
		minor: number;
	};
}

// ---------------------------------------------------------------------------
// methods-audit
// ---------------------------------------------------------------------------

export type MethodIssueKind =
	| "design"
	| "power"
	| "randomization"
	| "blinding"
	| "reporting"
	| "bias"
	| "confounding"
	| "other";

export interface MethodIssue {
	kind: MethodIssueKind;
	description: string;
	severity: "critical" | "major" | "minor";
	recommendation?: string;
}

export interface MethodsAuditOutput {
	studyDesign: string;
	sampleSize?: number;
	powerAdequate?: boolean;
	issues: MethodIssue[];
	overallRating: "sound" | "minor-concerns" | "major-concerns" | "fatally-flawed";
	narrative?: string;
}

// ---------------------------------------------------------------------------
// review-comment-map
// ---------------------------------------------------------------------------

export type ReviewFindingPriority = "critical" | "major" | "minor" | "optional";

export interface ReviewFinding {
	/** Reviewer comment or question verbatim or paraphrased. */
	comment: string;
	/** Section of the manuscript to which the comment applies. */
	section?: string;
	priority: ReviewFindingPriority;
	/** Recommended author action. */
	suggestedResponse?: string;
}

export interface ReviewCommentMapArtifact {
	findings: ReviewFinding[];
	/** Overall recommendation: accept / minor revisions / major revisions / reject. */
	overallRecommendation: "accept" | "minor-revisions" | "major-revisions" | "reject";
	overallSummary?: string;
}

// ---------------------------------------------------------------------------
// draft-document
// ---------------------------------------------------------------------------

export interface DraftDocumentArtifact {
	/** The section title or type (e.g. "Introduction", "Full manuscript"). */
	section: string;
	/** Full text of the written content in Markdown or plain text. */
	content: string;
	/** Word count of the content. */
	wordCount?: number;
	notes?: string;
}

// ---------------------------------------------------------------------------
// Union type for all artifact payloads
// ---------------------------------------------------------------------------

export type ArtifactPayload =
	| LiteratureSearchResultsArtifact
	| EvidenceTableArtifact
	| ClaimAuditArtifact
	| MethodsAuditOutput
	| ReviewCommentMapArtifact
	| DraftDocumentArtifact;

/** Maps artifact kind strings to their corresponding payload type. */
export interface ArtifactPayloadMap {
	"literature-search-results": LiteratureSearchResultsArtifact;
	"evidence-table": EvidenceTableArtifact;
	"claim-audit": ClaimAuditArtifact;
	"methods-audit": MethodsAuditOutput;
	"review-comment-map": ReviewCommentMapArtifact;
	"draft-document": DraftDocumentArtifact;
}

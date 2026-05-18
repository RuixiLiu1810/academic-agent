import type { AcceptanceIssue, JsonObject, WorkerRequest } from "./index.js";

export type OutputRequirementKind = "artifact" | "structured" | "narrative";

export interface SchemaRef {
	id: string;
	version: "v1";
}

export interface OutputRequirementBase {
	id: string;
	label: string;
	required: boolean;
	description?: string;
}

export interface ArtifactOutputRequirement extends OutputRequirementBase {
	kind: "artifact";
	artifactKind: string;
	minCount?: number;
	schemaRef?: SchemaRef;
}

export interface StructuredOutputRequirement extends OutputRequirementBase {
	kind: "structured";
	path: string;
	schemaRef?: SchemaRef;
}

export interface NarrativeOutputRequirement extends OutputRequirementBase {
	kind: "narrative";
	section: string;
	minChars?: number;
	mustMention?: string[];
}

export type OutputRequirement = ArtifactOutputRequirement | StructuredOutputRequirement | NarrativeOutputRequirement;

export interface ExpectedWorkerOutput {
	contractId: string;
	profileId: string;
	requirements: OutputRequirement[];
	successMode: "all-required";
}

export interface WorkerAttemptContext {
	attempt: number;
	maxAttempts: number;
	previousIssues?: AcceptanceIssue[];
	previousFailureReason?: string;
}

export interface EvidenceTableRow {
	claimId: string;
	claim: string;
	support: "supported" | "partial" | "uncertain" | "contradicted";
	sourceArtifactIds: string[];
	notes?: string;
}

export interface EvidenceTableArtifactPayload {
	kind: "evidence-table";
	rows: EvidenceTableRow[];
	uncertaintySummary: string;
}

export interface CitationAuditEntry {
	claimId: string;
	claim: string;
	status: "supported" | "missing-citation" | "mismatch";
	sourceArtifactIds: string[];
	rationale: string;
}

export interface CitationAuditArtifactPayload {
	kind: "claim-audit";
	entries: CitationAuditEntry[];
	unsupportedCount: number;
}

export interface BibliographyCandidate {
	title: string;
	authors?: string[];
	year?: number;
	doi?: string;
	sourceProvider?: string;
	note?: string;
}

export interface BibliographyCandidatesArtifactPayload {
	kind: "bibliography-candidates";
	queryPlan: string[];
	candidates: BibliographyCandidate[];
	retrievalGaps: string[];
}

export type TypedArtifactPayload =
	| EvidenceTableArtifactPayload
	| CitationAuditArtifactPayload
	| BibliographyCandidatesArtifactPayload;

export interface ContractWorkerRequestFields {
	outputContract?: ExpectedWorkerOutput;
	attemptContext?: WorkerAttemptContext;
	legacyExpectedOutputs?: string[];
	legacyAcceptanceCriteria?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSchemaRef(value: unknown): value is SchemaRef {
	if (!isRecord(value)) return false;
	return value.id !== undefined && typeof value.id === "string" && value.version === "v1";
}

function isOutputRequirementBase(value: Record<string, unknown>): boolean {
	return (
		typeof value.id === "string" &&
		typeof value.label === "string" &&
		typeof value.required === "boolean" &&
		(value.description === undefined || typeof value.description === "string")
	);
}

function isOutputRequirement(value: unknown): value is OutputRequirement {
	if (!isRecord(value) || !isOutputRequirementBase(value)) return false;
	if (value.kind === "artifact") {
		return (
			typeof value.artifactKind === "string" &&
			(value.minCount === undefined || typeof value.minCount === "number") &&
			(value.schemaRef === undefined || isSchemaRef(value.schemaRef))
		);
	}
	if (value.kind === "structured") {
		return typeof value.path === "string" && (value.schemaRef === undefined || isSchemaRef(value.schemaRef));
	}
	if (value.kind === "narrative") {
		return (
			typeof value.section === "string" &&
			(value.minChars === undefined || typeof value.minChars === "number") &&
			(value.mustMention === undefined || isStringArray(value.mustMention))
		);
	}
	return false;
}

export function legacyOutputsToContract(request: WorkerRequest): ExpectedWorkerOutput {
	const profileId = request.profile?.id ?? request.workerType;
	return {
		contractId: `legacy:${profileId}`,
		profileId,
		successMode: "all-required",
		requirements: request.expectedOutputs.map((label) => ({
			kind: "narrative",
			id: label,
			label,
			required: true,
			section: label,
		})),
	};
}

export function isExpectedWorkerOutput(value: unknown): value is ExpectedWorkerOutput {
	if (!isRecord(value)) return false;
	return (
		typeof value.contractId === "string" &&
		typeof value.profileId === "string" &&
		value.successMode === "all-required" &&
		Array.isArray(value.requirements) &&
		value.requirements.every(isOutputRequirement)
	);
}

function isAcceptanceIssue(value: unknown): value is AcceptanceIssue {
	if (!isRecord(value)) return false;
	return (
		typeof value.code === "string" &&
		typeof value.message === "string" &&
		(value.severity === "info" || value.severity === "warning" || value.severity === "error") &&
		(value.artifactId === undefined || typeof value.artifactId === "string")
	);
}

export function isWorkerAttemptContext(value: unknown): value is WorkerAttemptContext {
	if (!isRecord(value)) return false;
	return (
		typeof value.attempt === "number" &&
		typeof value.maxAttempts === "number" &&
		(value.previousIssues === undefined ||
			(Array.isArray(value.previousIssues) && value.previousIssues.every(isAcceptanceIssue))) &&
		(value.previousFailureReason === undefined || typeof value.previousFailureReason === "string")
	);
}

export function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

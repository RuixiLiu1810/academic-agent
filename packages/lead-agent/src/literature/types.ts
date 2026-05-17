import type { ArtifactRef } from "@mariozechner/pi-agent-contracts";

export type LiteratureProviderId = "crossref" | "semantic-scholar" | "pubmed" | "arxiv";

export interface LiteratureSearchToolInput {
	query: string;
	providers?: LiteratureProviderId[];
	maxResults?: number;
	fromYear?: number;
	toYear?: number;
	fieldOfStudy?: string;
	includePreprints?: boolean;
	includeBiomedical?: boolean;
	refresh?: boolean;
}

export interface LiteratureProviderProvenance {
	provider: LiteratureProviderId;
	providerRecordId: string;
	sourceQuery: string;
	rawScore?: number;
	retrievedAt: string;
}

export interface LiteratureCandidate {
	id: string;
	provider: LiteratureProviderId;
	providerRecordId: string;
	title: string;
	authors: string[];
	year?: number;
	venue?: string;
	doi?: string;
	pmid?: string;
	arxivId?: string;
	url?: string;
	abstract?: string;
	publicationType?: string;
	isOpenAccess?: boolean;
	citationCount?: number;
	sourceQuery: string;
	rawScore?: number;
	retrievedAt: string;
	provenance?: LiteratureProviderProvenance[];
	rankingNotes?: string[];
}

export interface LiteratureCandidateBrief {
	id: string;
	title: string;
	authors: string[];
	year?: number;
	venue?: string;
	doi?: string;
	pmid?: string;
	arxivId?: string;
	url?: string;
	providers: LiteratureProviderId[];
	rankingNotes: string[];
}

export interface LiteratureProviderRequest {
	query: string;
	maxResults: number;
	fromYear?: number;
	toYear?: number;
	fieldOfStudy?: string;
	includePreprints?: boolean;
	includeBiomedical?: boolean;
	signal?: AbortSignal;
}

export interface LiteratureProviderResult {
	provider: LiteratureProviderId;
	candidates: LiteratureCandidate[];
	warnings: string[];
}

export interface LiteratureSearchProvider {
	id: LiteratureProviderId;
	search(request: LiteratureProviderRequest): Promise<LiteratureProviderResult>;
}

export interface LiteratureProviderRunSummary {
	provider: LiteratureProviderId;
	status: "success" | "failed";
	candidateCount: number;
	warnings: string[];
	error?: string;
}

export interface LiteratureSearchToolOutput {
	retrievalRunId: string;
	providers: LiteratureProviderRunSummary[];
	artifactRefs: ArtifactRef[];
	candidatesPreview: LiteratureCandidateBrief[];
	warnings: string[];
}

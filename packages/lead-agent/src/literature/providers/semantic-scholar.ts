import { normalizeDoi } from "../normalize.js";
import type { LiteratureSearchProvider } from "../types.js";

interface SemanticScholarProviderOptions {
	fetch?: typeof fetch;
	apiKey?: string;
}

interface SemanticScholarPaper {
	paperId: string;
	title?: string;
	authors?: Array<{ name?: string }>;
	year?: number;
	venue?: string;
	abstract?: string;
	citationCount?: number;
	url?: string;
	externalIds?: { DOI?: string };
	openAccessPdf?: { url?: string };
}

interface SemanticScholarSearchResponse {
	data?: SemanticScholarPaper[];
}

export function createSemanticScholarProvider(options: SemanticScholarProviderOptions = {}): LiteratureSearchProvider {
	const fetchImpl = options.fetch ?? fetch;
	return {
		id: "semantic-scholar",
		async search(request) {
			const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
			url.searchParams.set("query", request.query);
			url.searchParams.set("limit", String(request.maxResults));
			url.searchParams.set(
				"fields",
				"paperId,title,authors,year,venue,abstract,citationCount,url,externalIds,openAccessPdf",
			);
			if (request.fromYear || request.toYear) {
				url.searchParams.set("year", `${request.fromYear ?? ""}-${request.toYear ?? ""}`);
			}
			const response = await fetchImpl(url, {
				signal: request.signal,
				headers: options.apiKey ? { "x-api-key": options.apiKey } : undefined,
			});
			if (!response.ok) throw new Error(`Semantic Scholar request failed: ${response.status}`);
			const body = (await response.json()) as SemanticScholarSearchResponse;
			const retrievedAt = new Date().toISOString();
			return {
				provider: "semantic-scholar",
				warnings: [],
				candidates: (body.data ?? []).map((paper) => ({
					id: `semantic-scholar-${paper.paperId}`,
					provider: "semantic-scholar",
					providerRecordId: paper.paperId,
					title: paper.title ?? "(untitled)",
					authors: (paper.authors ?? []).map((author) => author.name ?? "").filter((name) => name.length > 0),
					year: paper.year,
					venue: paper.venue,
					doi: normalizeDoi(paper.externalIds?.DOI),
					url: paper.url ?? paper.openAccessPdf?.url,
					abstract: paper.abstract,
					citationCount: paper.citationCount,
					isOpenAccess: paper.openAccessPdf?.url !== undefined,
					sourceQuery: request.query,
					retrievedAt,
				})),
			};
		},
	};
}

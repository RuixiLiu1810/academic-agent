import { normalizeDoi } from "../normalize.js";
import type { LiteratureSearchProvider } from "../types.js";

interface PubMedProviderOptions {
	fetch?: typeof fetch;
	apiKey?: string;
	tool?: string;
	email?: string;
}

interface PubMedSearchResponse {
	esearchresult?: {
		idlist?: string[];
	};
}

interface PubMedSummaryRecord {
	uid?: string;
	title?: string;
	fulljournalname?: string;
	pubdate?: string;
	authors?: Array<{ name?: string }>;
	articleids?: Array<{ idtype?: string; value?: string }>;
}

interface PubMedSummaryResponse {
	result?: Record<string, PubMedSummaryRecord>;
}

function yearFromPubDate(value: string | undefined): number | undefined {
	const match = /^(\d{4})/.exec(value ?? "");
	return match ? Number(match[1]) : undefined;
}

export function createPubMedProvider(options: PubMedProviderOptions = {}): LiteratureSearchProvider {
	const fetchImpl = options.fetch ?? fetch;
	const applyCommonParams = (url: URL): void => {
		url.searchParams.set("retmode", "json");
		if (options.apiKey) url.searchParams.set("api_key", options.apiKey);
		if (options.tool) url.searchParams.set("tool", options.tool);
		if (options.email) url.searchParams.set("email", options.email);
	};
	return {
		id: "pubmed",
		async search(request) {
			const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
			searchUrl.searchParams.set("db", "pubmed");
			searchUrl.searchParams.set("term", request.query);
			searchUrl.searchParams.set("retmax", String(request.maxResults));
			if (request.fromYear || request.toYear) {
				searchUrl.searchParams.set("mindate", String(request.fromYear ?? ""));
				searchUrl.searchParams.set("maxdate", String(request.toYear ?? ""));
				searchUrl.searchParams.set("datetype", "pdat");
			}
			applyCommonParams(searchUrl);
			const searchResponse = await fetchImpl(searchUrl, { signal: request.signal });
			if (!searchResponse.ok) throw new Error(`PubMed ESearch failed: ${searchResponse.status}`);
			const searchBody = (await searchResponse.json()) as PubMedSearchResponse;
			const ids = searchBody.esearchresult?.idlist ?? [];
			if (ids.length === 0) {
				return { provider: "pubmed", warnings: [], candidates: [] };
			}
			const summaryUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
			summaryUrl.searchParams.set("db", "pubmed");
			summaryUrl.searchParams.set("id", ids.join(","));
			applyCommonParams(summaryUrl);
			const summaryResponse = await fetchImpl(summaryUrl, { signal: request.signal });
			if (!summaryResponse.ok) throw new Error(`PubMed ESummary failed: ${summaryResponse.status}`);
			const summaryBody = (await summaryResponse.json()) as PubMedSummaryResponse;
			const retrievedAt = new Date().toISOString();
			return {
				provider: "pubmed",
				warnings: [],
				candidates: ids.flatMap((id) => {
					const record = summaryBody.result?.[id];
					if (!record) return [];
					const doi = record.articleids?.find((articleId) => articleId.idtype === "doi")?.value;
					return [
						{
							id: `pubmed-${id}`,
							provider: "pubmed",
							providerRecordId: id,
							title: record.title ?? "(untitled)",
							authors: (record.authors ?? [])
								.map((author) => author.name ?? "")
								.filter((name) => name.length > 0),
							year: yearFromPubDate(record.pubdate),
							venue: record.fulljournalname,
							doi: normalizeDoi(doi),
							pmid: record.uid ?? id,
							url: `https://pubmed.ncbi.nlm.nih.gov/${record.uid ?? id}/`,
							sourceQuery: request.query,
							retrievedAt,
						},
					];
				}),
			};
		},
	};
}

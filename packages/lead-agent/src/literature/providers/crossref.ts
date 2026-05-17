import { normalizeDoi } from "../normalize.js";
import type { LiteratureSearchProvider } from "../types.js";

interface CrossrefProviderOptions {
	fetch?: typeof fetch;
	mailto?: string;
	userAgent?: string;
}

interface CrossrefAuthor {
	given?: string;
	family?: string;
}

interface CrossrefDateParts {
	"date-parts"?: number[][];
}

interface CrossrefWork {
	DOI?: string;
	title?: string[];
	author?: CrossrefAuthor[];
	"container-title"?: string[];
	published?: CrossrefDateParts;
	issued?: CrossrefDateParts;
	URL?: string;
	type?: string;
}

interface CrossrefWorksResponse {
	message?: {
		items?: CrossrefWork[];
	};
}

function authorName(author: CrossrefAuthor): string {
	return [author.given, author.family].filter(Boolean).join(" ").trim();
}

function yearFromWork(work: CrossrefWork): number | undefined {
	return work.published?.["date-parts"]?.[0]?.[0] ?? work.issued?.["date-parts"]?.[0]?.[0];
}

export function createCrossrefProvider(options: CrossrefProviderOptions = {}): LiteratureSearchProvider {
	const fetchImpl = options.fetch ?? fetch;
	return {
		id: "crossref",
		async search(request) {
			const url = new URL("https://api.crossref.org/works");
			url.searchParams.set("query", request.query);
			url.searchParams.set("rows", String(request.maxResults));
			if (request.fromYear) url.searchParams.append("filter", `from-pub-date:${request.fromYear}`);
			if (request.toYear) url.searchParams.append("filter", `until-pub-date:${request.toYear}`);
			if (options.mailto) url.searchParams.set("mailto", options.mailto);
			const response = await fetchImpl(url, {
				signal: request.signal,
				headers: options.userAgent ? { "user-agent": options.userAgent } : undefined,
			});
			if (!response.ok) throw new Error(`Crossref request failed: ${response.status}`);
			const body = (await response.json()) as CrossrefWorksResponse;
			const retrievedAt = new Date().toISOString();
			return {
				provider: "crossref",
				warnings: [],
				candidates: (body.message?.items ?? []).map((work, index) => ({
					id: `crossref-${work.DOI ?? index}`,
					provider: "crossref",
					providerRecordId: work.DOI ?? `index-${index}`,
					title: work.title?.[0] ?? "(untitled)",
					authors: (work.author ?? []).map(authorName).filter((name) => name.length > 0),
					year: yearFromWork(work),
					venue: work["container-title"]?.[0],
					doi: normalizeDoi(work.DOI),
					url: work.URL,
					publicationType: work.type,
					sourceQuery: request.query,
					retrievedAt,
				})),
			};
		},
	};
}

import { normalizeDoi } from "../normalize.js";
import type { LiteratureSearchProvider } from "../types.js";

interface ArxivProviderOptions {
	fetch?: typeof fetch;
}

function decodeXml(value: string): string {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");
}

function firstTagText(xml: string, tag: string): string | undefined {
	const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
	const value = pattern.exec(xml)?.[1]?.trim();
	return value && value.length > 0 ? value.replace(/\s+/g, " ") : undefined;
}

function tagTexts(xml: string, tag: string): string[] {
	const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
	return [...xml.matchAll(pattern)]
		.map((match) => decodeXml(match[1]?.trim().replace(/\s+/g, " ") ?? ""))
		.filter((value) => value.length > 0);
}

function arxivIdFromUrl(value: string | undefined): string | undefined {
	return value?.split("/abs/")[1];
}

export function createArxivProvider(options: ArxivProviderOptions = {}): LiteratureSearchProvider {
	const fetchImpl = options.fetch ?? fetch;
	return {
		id: "arxiv",
		async search(request) {
			const url = new URL("https://export.arxiv.org/api/query");
			url.searchParams.set("search_query", `all:${request.query}`);
			url.searchParams.set("start", "0");
			url.searchParams.set("max_results", String(request.maxResults));
			url.searchParams.set("sortBy", "relevance");
			const response = await fetchImpl(url, { signal: request.signal });
			if (!response.ok) throw new Error(`arXiv request failed: ${response.status}`);
			const xml = await response.text();
			const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => match[1] ?? "");
			const retrievedAt = new Date().toISOString();
			return {
				provider: "arxiv",
				warnings: [],
				candidates: entries.map((entry, index) => {
					const idUrl = decodeXml(firstTagText(entry, "id") ?? "");
					const arxivId = arxivIdFromUrl(idUrl);
					const published = firstTagText(entry, "published");
					const doi = firstTagText(entry, "arxiv:doi") ?? firstTagText(entry, "doi");
					return {
						id: `arxiv-${arxivId ?? index}`,
						provider: "arxiv",
						providerRecordId: arxivId ?? `index-${index}`,
						title: decodeXml(firstTagText(entry, "title") ?? "(untitled)"),
						authors: tagTexts(entry, "name"),
						year: published ? Number(published.slice(0, 4)) : undefined,
						arxivId,
						doi: normalizeDoi(doi),
						url: idUrl,
						abstract: decodeXml(firstTagText(entry, "summary") ?? ""),
						sourceQuery: request.query,
						retrievedAt,
					};
				}),
			};
		},
	};
}

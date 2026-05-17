import { describe, expect, it } from "vitest";
import { createArxivProvider } from "../src/literature/providers/arxiv.js";
import { createCrossrefProvider } from "../src/literature/providers/crossref.js";
import { createPubMedProvider } from "../src/literature/providers/pubmed.js";
import { createSemanticScholarProvider } from "../src/literature/providers/semantic-scholar.js";

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("literature providers", () => {
	it("normalizes Crossref works results", async () => {
		const provider = createCrossrefProvider({
			fetch: async () =>
				jsonResponse({
					message: {
						items: [
							{
								DOI: "10.1000/nir",
								title: ["Near infrared spectroscopy for diagnosis"],
								author: [{ given: "Alice", family: "Author" }],
								"container-title": ["Journal of NIR"],
								published: { "date-parts": [[2024]] },
								URL: "https://doi.org/10.1000/nir",
								type: "journal-article",
							},
						],
					},
				}),
		});

		const result = await provider.search({ query: "near infrared diagnosis", maxResults: 5 });

		expect(result.provider).toBe("crossref");
		expect(result.candidates[0]).toMatchObject({
			provider: "crossref",
			doi: "10.1000/nir",
			title: "Near infrared spectroscopy for diagnosis",
			authors: ["Alice Author"],
			year: 2024,
		});
	});

	it("normalizes Semantic Scholar paper search results", async () => {
		const provider = createSemanticScholarProvider({
			fetch: async () =>
				jsonResponse({
					data: [
						{
							paperId: "s2-1",
							title: "Near infrared imaging in medicine",
							authors: [{ name: "Bob Author" }],
							year: 2025,
							venue: "Medical Imaging",
							abstract: "Abstract text",
							citationCount: 12,
							url: "https://semanticscholar.org/paper/s2-1",
							externalIds: { DOI: "10.2000/nir" },
						},
					],
				}),
		});

		const result = await provider.search({ query: "near infrared imaging", maxResults: 5 });

		expect(result.provider).toBe("semantic-scholar");
		expect(result.candidates[0]).toMatchObject({
			provider: "semantic-scholar",
			providerRecordId: "s2-1",
			doi: "10.2000/nir",
			citationCount: 12,
		});
	});

	it("normalizes PubMed ESummary results", async () => {
		const provider = createPubMedProvider({
			fetch: async (input) => {
				const url = String(input);
				if (url.includes("esearch.fcgi")) {
					return jsonResponse({ esearchresult: { idlist: ["123"] } });
				}
				return jsonResponse({
					result: {
						"123": {
							uid: "123",
							title: "Near infrared diagnosis in PubMed",
							fulljournalname: "PubMed Journal",
							pubdate: "2023 Jan",
							authors: [{ name: "Carol Author" }],
							articleids: [{ idtype: "doi", value: "10.3000/nir" }],
						},
					},
				});
			},
		});

		const result = await provider.search({ query: "near infrared diagnosis", maxResults: 5 });

		expect(result.provider).toBe("pubmed");
		expect(result.candidates[0]).toMatchObject({
			provider: "pubmed",
			pmid: "123",
			doi: "10.3000/nir",
			title: "Near infrared diagnosis in PubMed",
			year: 2023,
		});
	});

	it("normalizes arXiv Atom feed results", async () => {
		const provider = createArxivProvider({
			fetch: async () =>
				new Response(
					`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <title>Near infrared imaging preprint</title>
    <summary>Preprint abstract.</summary>
    <published>2024-01-01T00:00:00Z</published>
    <author><name>Dana Author</name></author>
    <category term="cs.CV"/>
    <link href="http://arxiv.org/abs/2401.00001v1"/>
  </entry>
</feed>`,
					{ status: 200 },
				),
		});

		const result = await provider.search({ query: "near infrared imaging", maxResults: 5 });

		expect(result.provider).toBe("arxiv");
		expect(result.candidates[0]).toMatchObject({
			provider: "arxiv",
			arxivId: "2401.00001v1",
			title: "Near infrared imaging preprint",
			authors: ["Dana Author"],
			year: 2024,
		});
	});
});

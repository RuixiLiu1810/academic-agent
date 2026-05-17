import { describe, expect, it } from "vitest";
import { dedupeAndRankCandidates, normalizeDoi } from "../src/literature/normalize.js";
import type { LiteratureCandidate } from "../src/literature/types.js";

function candidate(overrides: Partial<LiteratureCandidate>): LiteratureCandidate {
	return {
		id: overrides.id ?? "candidate-1",
		provider: overrides.provider ?? "crossref",
		providerRecordId: overrides.providerRecordId ?? "record-1",
		title: overrides.title ?? "Near infrared spectroscopy in diagnosis",
		authors: overrides.authors ?? ["A. Author"],
		year: overrides.year ?? 2024,
		doi: overrides.doi,
		pmid: overrides.pmid,
		arxivId: overrides.arxivId,
		url: overrides.url,
		abstract: overrides.abstract,
		venue: overrides.venue,
		citationCount: overrides.citationCount,
		sourceQuery: overrides.sourceQuery ?? "near infrared diagnosis",
		rawScore: overrides.rawScore,
		retrievedAt: overrides.retrievedAt ?? "2026-05-17T00:00:00.000Z",
		provenance: overrides.provenance,
		rankingNotes: overrides.rankingNotes,
	};
}

describe("literature normalization", () => {
	it("normalizes DOI values", () => {
		expect(normalizeDoi("https://doi.org/10.1000/ABC")).toBe("10.1000/abc");
		expect(normalizeDoi("doi:10.1000/XYZ")).toBe("10.1000/xyz");
	});

	it("deduplicates by DOI and preserves provider provenance", () => {
		const results = dedupeAndRankCandidates(
			[
				candidate({ provider: "crossref", providerRecordId: "doi-1", doi: "https://doi.org/10.1000/ABC" }),
				candidate({ provider: "semantic-scholar", providerRecordId: "s2-1", doi: "10.1000/abc" }),
			],
			{ query: "near infrared diagnosis" },
		);

		expect(results).toHaveLength(1);
		expect(results[0]?.doi).toBe("10.1000/abc");
		expect(results[0]?.provenance?.map((p) => p.provider).sort()).toEqual(["crossref", "semantic-scholar"]);
	});

	it("ranks exact title matches and multi-provider records first", () => {
		const results = dedupeAndRankCandidates(
			[
				candidate({ id: "b", title: "Unrelated spectroscopy note", year: 2026, citationCount: 20 }),
				candidate({ id: "a", title: "Near infrared spectroscopy in diagnosis", year: 2022, citationCount: 1 }),
				candidate({ id: "a2", title: "Near infrared spectroscopy in diagnosis", year: 2022, doi: "10.1/a" }),
				candidate({
					id: "a3",
					title: "Near infrared spectroscopy in diagnosis",
					year: 2022,
					doi: "10.1/a",
					provider: "pubmed",
				}),
			],
			{ query: "near infrared spectroscopy in diagnosis" },
		);

		expect(results[0]?.title).toBe("Near infrared spectroscopy in diagnosis");
		expect(results[0]?.rankingNotes).toContain("matched query terms");
		expect(results[0]?.rankingNotes).toContain("returned by 2 providers");
	});
});

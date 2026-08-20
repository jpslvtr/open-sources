import { searchCandidates, searchCommittees } from "../api/fec";
import { normalizeName } from "../resolvers/normalize";
import type { FecCandidate, FecCommittee } from "../api/fec";

interface SearchParams {
  query: string;
  type: string;
  level: string;
  party: string;
  state: string;
  cycle: string;
  page: number;
  perPage: number;
}

function mapParty(fecParty: string | null): string | null {
  if (!fecParty) return null;
  const map: Record<string, string> = {
    DEM: "DEM", REP: "REP", LIB: "LIB", GRN: "GRN", IND: "IND",
    Democratic: "DEM", Republican: "REP", Libertarian: "LIB", Green: "GRN",
  };
  return map[fecParty] ?? "OTH";
}

function candidateToResult(c: FecCandidate) {
  return {
    entity: {
      id: `fec:${c.candidate_id}`,
      canonicalName: normalizeName(c.name),
      type: "candidate" as const,
      party: mapParty(c.party_full ?? c.party),
      state: c.state,
      level: "federal" as const,
      office: c.office_full,
      sourceIds: { fec: c.candidate_id },
      aliases: [c.name],
      dataAsOf: new Date().toISOString().split("T")[0],
    },
    headline: c.office_full ? `${c.office_full}${c.state ? ` - ${c.state}` : ""}` : "Federal candidate",
    headlineAmount: 0,
  };
}

function committeeToResult(c: FecCommittee) {
  return {
    entity: {
      id: `fec:${c.committee_id}`,
      canonicalName: c.name,
      type: "committee" as const,
      party: mapParty(c.party_full ?? c.party),
      state: c.state,
      level: "federal" as const,
      office: null,
      sourceIds: { fec: c.committee_id },
      aliases: [],
      dataAsOf: new Date().toISOString().split("T")[0],
    },
    headline: c.committee_type_full ?? c.designation_full ?? "Committee",
    headlineAmount: 0,
  };
}

export async function handleSearch(params: SearchParams) {
  const { query, type, party, state, cycle, page, perPage } = params;

  if (!query || query.trim().length < 2) {
    return { results: [], total: 0, page, perPage };
  }

  const fecParams: Record<string, string> = {};
  if (party && party !== "all") fecParams.party = party;
  if (state && state !== "all") fecParams.state = state;
  if (cycle && cycle !== "all") fecParams.cycle = cycle;
  fecParams.page = String(page);
  fecParams.per_page = String(perPage);

  const searchCandidateType = type === "all" || type === "candidate";
  const searchCommitteeType = type === "all" || type === "committee";

  const requests: Promise<unknown>[] = [];
  if (searchCandidateType) requests.push(searchCandidates(query, fecParams));
  if (searchCommitteeType) requests.push(searchCommittees(query, fecParams));

  const responses = await Promise.allSettled(requests);

  const results: (ReturnType<typeof candidateToResult> | ReturnType<typeof committeeToResult>)[] = [];
  let total = 0;
  let idx = 0;

  if (searchCandidateType) {
    const res = responses[idx++];
    if (res.status === "fulfilled") {
      const data = res.value as Awaited<ReturnType<typeof searchCandidates>>;
      results.push(...data.results.map(candidateToResult));
      total += data.pagination.count;
    }
  }

  if (searchCommitteeType) {
    const res = responses[idx++];
    if (res.status === "fulfilled") {
      const data = res.value as Awaited<ReturnType<typeof searchCommittees>>;
      results.push(...data.results.map(committeeToResult));
      total += data.pagination.count;
    }
  }

  return { results, total, page, perPage };
}

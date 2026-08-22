import type { SearchResponse, EntityResponse, ContributionsResponse, GraphResponse, GraphNode, GraphEdge } from "../types/api";
import type { SearchFilters, Party } from "../types/entities";
import { normalizeName, normalizeEntityName, entityMatchScore } from "../utils/normalize";
import { cacheGet, cacheSet, cacheKey } from "../utils/cache";

const FEC_BASE = "https://api.open.fec.gov/v1";
const FEC_KEY = import.meta.env.VITE_FEC_API_KEY || "DEMO_KEY";

const TTL_SEARCH = 5 * 60 * 1000;
const TTL_ENTITY = 15 * 60 * 1000;
const TTL_CONTRIBUTIONS = 15 * 60 * 1000;

function mapParty(fecParty: string | null): Party {
  if (!fecParty) return null;
  const map: Record<string, Party> = {
    DEM: "DEM", REP: "REP", LIB: "LIB", GRN: "GRN", IND: "IND",
    Democratic: "DEM", Republican: "REP", Libertarian: "LIB", Green: "GRN",
  };
  return map[fecParty] ?? "OTH";
}

interface FecResponse<T> {
  results: T[];
  pagination: { page: number; per_page: number; count: number; pages: number };
}

function aggregateCycles(totals: Record<string, unknown>[]) {
  const byCycle = new Map<number, { received: number; given: number }>();
  for (const t of totals) {
    const cycle = t.cycle as number;
    if (!cycle) continue;
    const existing = byCycle.get(cycle) ?? { received: 0, given: 0 };
    existing.received += (t.receipts as number) || 0;
    existing.given += (t.disbursements as number) || 0;
    byCycle.set(cycle, existing);
  }
  return Array.from(byCycle.entries())
    .map(([cycle, data]) => ({ cycle, ...data }))
    .sort((a, b) => b.cycle - a.cycle);
}

async function fecFetch<T>(path: string, params: Record<string, string> = {}, ttl = TTL_ENTITY): Promise<FecResponse<T>> {
  const key = cacheKey(path, params);
  const cached = cacheGet<FecResponse<T>>(key);
  if (cached) return cached;

  const url = new URL(`${FEC_BASE}${path}`);
  url.searchParams.set("api_key", FEC_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    const res = await fetch(url.toString());
    if (res.status === 429) {
      lastError = new Error("FEC API rate limit - retrying");
      continue;
    }
    if (!res.ok) throw new Error(`FEC API ${res.status}`);
    const data: FecResponse<T> = await res.json();
    cacheSet(key, data, ttl);
    return data;
  }
  throw lastError ?? new Error("FEC API request failed");
}

export async function search(params: {
  query: string;
  filters: SearchFilters;
  page: number;
  perPage: number;
}): Promise<SearchResponse> {
  const { query, filters, page, perPage } = params;
  const hasQuery = query.trim().length >= 2;

  const fecParams: Record<string, string> = {
    per_page: String(perPage),
    page: String(page),
    sort_null_only: "false",
  };
  if (hasQuery) {
    fecParams.q = query;
    fecParams.sort = "-receipts";
  } else {
    fecParams.sort = "name";
    fecParams.has_raised_funds = "true";
  }
  if (filters.party && filters.party !== "all") fecParams.party = filters.party as string;
  if (filters.state && filters.state !== "all") fecParams.state = filters.state as string;

  const searchCandidates = filters.type === "all" || filters.type === "candidate";
  const searchCommittees = filters.type === "all" || filters.type === "committee";

  const candidateEndpoint = hasQuery ? "/candidates/search/" : "/candidates/";
  const requests: Promise<FecResponse<Record<string, unknown>>>[] = [];
  if (searchCandidates) requests.push(fecFetch(candidateEndpoint, fecParams, TTL_SEARCH));
  if (searchCommittees) requests.push(fecFetch("/committees/", fecParams, TTL_SEARCH));

  const responses = await Promise.allSettled(requests);
  const results: SearchResponse["results"] = [];
  let total = 0;
  let idx = 0;

  if (searchCandidates) {
    const res = responses[idx++];
    if (res.status === "fulfilled") {
      const data = res.value;
      for (const c of data.results) {
        results.push({
          entity: {
            id: `fec:${c.candidate_id}`,
            canonicalName: normalizeName(c.name as string),
            type: "candidate",
            party: mapParty((c.party as string | null) ?? (c.party_full as string | null)),
            state: (c.state as string) ?? null,
            level: "federal",
            office: (c.office_full as string) ?? null,
            sourceIds: { fec: c.candidate_id as string },
            aliases: [c.name as string],
            dataAsOf: new Date().toISOString().split("T")[0],
          },
          headline: c.office_full
            ? `${c.office_full}${c.state ? ` - ${c.state}` : ""}`
            : "Federal candidate",
          headlineAmount: 0,
        });
      }
      total += data.pagination.count;
    }
  }

  if (searchCommittees) {
    const res = responses[idx++];
    if (res.status === "fulfilled") {
      const data = res.value;
      for (const c of data.results) {
        results.push({
          entity: {
            id: `fec:${c.committee_id}`,
            canonicalName: normalizeEntityName(c.name as string, "committee"),
            type: "committee",
            party: mapParty((c.party as string | null) ?? (c.party_full as string | null)),
            state: (c.state as string) ?? null,
            level: "federal",
            office: null,
            sourceIds: { fec: c.committee_id as string },
            aliases: [],
            dataAsOf: new Date().toISOString().split("T")[0],
          },
          headline: (c.committee_type_full as string) ?? (c.designation_full as string) ?? "Committee",
          headlineAmount: 0,
        });
      }
      total += data.pagination.count;
    }
  }

  return { results, total, page, perPage };
}

export async function getEntity(entityId: string): Promise<EntityResponse> {
  // Individual donor by normalized name
  if (entityId.startsWith("name:")) {
    const donorName = entityId.slice(5);
    const res = await fecFetch<Record<string, unknown>>("/schedules/schedule_a/", {
      contributor_name: donorName,
      sort: "-contribution_receipt_amount",
      sort_hide_null: "true",
      per_page: "100",
    }, TTL_CONTRIBUTIONS);

    if (res.results.length === 0) throw new Error("Donor not found");

    let totalGiven = 0;
    const recipientTotals = new Map<string, number>();
    const aliases = new Set<string>();
    let state: string | null = null;
    let employer: string | null = null;
    let occupation: string | null = null;
    const byCycle = new Map<number, number>();

    for (const r of res.results) {
      const amount = (r.contribution_receipt_amount as number) || 0;
      totalGiven += amount;
      const rawName = r.contributor_name as string;
      if (rawName) aliases.add(rawName);
      if (!state) state = (r.contributor_state as string) ?? null;
      if (!employer) employer = (r.contributor_employer as string) ?? null;
      if (!occupation) occupation = (r.contributor_occupation as string) ?? null;

      const recipName = (r.committee as Record<string, unknown>)?.name as string ?? "Unknown";
      recipientTotals.set(recipName, (recipientTotals.get(recipName) ?? 0) + amount);

      const year = parseInt((r.contribution_receipt_date as string)?.slice(0, 4));
      if (year) {
        const cycle = year % 2 === 0 ? year : year + 1;
        byCycle.set(cycle, (byCycle.get(cycle) ?? 0) + amount);
      }
    }

    const topRecipient = Array.from(recipientTotals.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const cycles = Array.from(byCycle.entries())
      .map(([cycle, given]) => ({ cycle, received: 0, given }))
      .sort((a, b) => b.cycle - a.cycle);

    const today = new Date().toISOString().split("T")[0];
    return {
      entity: {
        id: entityId,
        canonicalName: donorName,
        type: "individual",
        party: null,
        state,
        level: "federal",
        office: employer && occupation ? `${occupation} at ${employer}` : employer ?? occupation ?? null,
        sourceIds: {},
        aliases: Array.from(aliases),
        dataAsOf: today,
      },
      stats: {
        totalReceived: 0,
        totalGiven: totalGiven,
        contributionCount: res.results.length,
        topSource: null,
        topRecipient,
        cycles,
      },
      dataAsOf: today,
    };
  }

  const sourceId = entityId.replace(/^fec:/, "");
  const isCandidate = /^[HSP]\d/.test(sourceId);

  if (isCandidate) {
    const [candidateRes, totalsRes] = await Promise.all([
      fecFetch<Record<string, unknown>>(`/candidate/${sourceId}/`),
      fecFetch<Record<string, unknown>>(`/candidate/${sourceId}/totals/`),
    ]);
    const c = candidateRes.results[0];
    if (!c) throw new Error("Candidate not found");

    const totals = totalsRes.results;
    const totalReceived = totals.reduce((sum: number, t: Record<string, unknown>) => sum + ((t.receipts as number) || 0), 0);
    const totalGiven = totals.reduce((sum: number, t: Record<string, unknown>) => sum + ((t.disbursements as number) || 0), 0);
    const latest = totals[0] as Record<string, unknown> | undefined;

    return {
      entity: {
        id: entityId,
        canonicalName: normalizeName(c.name as string),
        type: "candidate",
        party: mapParty((c.party as string | null) ?? (c.party_full as string | null)),
        state: (c.state as string) ?? null,
        level: "federal",
        office: (c.office_full as string) ?? null,
        sourceIds: { fec: sourceId },
        aliases: [c.name as string],
        dataAsOf: latest?.coverage_end_date
          ? (latest.coverage_end_date as string).split("T")[0]
          : new Date().toISOString().split("T")[0],
      },
      stats: {
        totalReceived,
        totalGiven,
        contributionCount: 0,
        topSource: null,
        topRecipient: null,
        cycles: aggregateCycles(totals),
      },
      dataAsOf: latest?.coverage_end_date
        ? (latest.coverage_end_date as string).split("T")[0]
        : new Date().toISOString().split("T")[0],
    };
  }

  // Committee
  const [commitRes, totalsRes] = await Promise.all([
    fecFetch<Record<string, unknown>>(`/committee/${sourceId}/`),
    fecFetch<Record<string, unknown>>(`/committee/${sourceId}/totals/`),
  ]);
  const c = commitRes.results[0];
  if (!c) throw new Error("Committee not found");

  const totals = totalsRes.results;
  const totalReceived = totals.reduce((sum: number, t: Record<string, unknown>) =>
    sum + ((t.receipts as number) || 0), 0);
  const totalGiven = totals.reduce((sum: number, t: Record<string, unknown>) =>
    sum + ((t.disbursements as number) || 0), 0);
  const latestCoverage = totals[0] as Record<string, unknown> | undefined;

  return {
    entity: {
      id: entityId,
      canonicalName: c.name as string,
      type: "committee",
      party: mapParty((c.party as string | null) ?? (c.party_full as string | null)),
      state: (c.state as string) ?? null,
      level: "federal",
      office: null,
      sourceIds: { fec: sourceId },
      aliases: [],
      dataAsOf: latestCoverage?.coverage_end_date
        ? (latestCoverage.coverage_end_date as string).split("T")[0]
        : new Date().toISOString().split("T")[0],
    },
    stats: {
      totalReceived,
      totalGiven,
      contributionCount: 0,
      topSource: null,
      topRecipient: null,
      cycles: aggregateCycles(totals),
    },
    dataAsOf: latestCoverage?.coverage_end_date
      ? (latestCoverage.coverage_end_date as string).split("T")[0]
      : new Date().toISOString().split("T")[0],
  };
}

async function findCommitteeForCandidate(candidateId: string): Promise<string | null> {
  try {
    const primaryRes = await fecFetch<Record<string, unknown>>(
      `/candidate/${candidateId}/committees/`,
      { designation: "P" },
    );
    if (primaryRes.results[0]) {
      return primaryRes.results[0].committee_id as string;
    }
    const authRes = await fecFetch<Record<string, unknown>>(
      `/candidate/${candidateId}/committees/`,
      { designation: "A" },
    );
    return (authRes.results[0]?.committee_id as string) ?? null;
  } catch {
    return null;
  }
}

export async function getContributions(
  entityId: string,
  direction: "received" | "given",
  page = 1,
  perPage = 30,
): Promise<ContributionsResponse> {
  const today = new Date().toISOString().split("T")[0];

  // Individual donor by normalized name - they only give, never receive
  if (entityId.startsWith("name:")) {
    if (direction === "received") {
      return { contributions: [], total: 0, page, perPage, dataAsOf: today };
    }
    const donorName = entityId.slice(5);
    const res = await fecFetch<Record<string, unknown>>("/schedules/schedule_a/", {
      contributor_name: donorName,
      sort: "-contribution_receipt_amount",
      sort_hide_null: "true",
      per_page: String(perPage),
      page: String(page),
    }, TTL_CONTRIBUTIONS);
    return {
      contributions: res.results.map((r) => ({
        id: r.sub_id as string,
        contributorName: r.contributor_name as string,
        contributorId: entityId,
        recipientName: (r.committee as Record<string, unknown>)?.name as string ?? "Unknown",
        recipientId: r.committee_id ? `fec:${r.committee_id}` : null,
        amount: r.contribution_receipt_amount as number,
        date: (r.contribution_receipt_date as string) ?? "",
        employer: (r.contributor_employer as string) ?? null,
        occupation: (r.contributor_occupation as string) ?? null,
        purpose: (r.receipt_type_full as string) ?? null,
        source: "fec",
        type: "contribution" as const,
      })),
      total: res.pagination.count,
      page: res.pagination.page,
      perPage: res.pagination.per_page,
      dataAsOf: today,
    };
  }

  const sourceId = entityId.replace(/^fec:/, "");
  const isCommittee = /^C\d/.test(sourceId);

  let committeeId = sourceId;
  if (!isCommittee) {
    const found = await findCommitteeForCandidate(sourceId);
    if (!found) return { contributions: [], total: 0, page, perPage, dataAsOf: today };
    committeeId = found;
  }

  if (direction === "received") {
    const res = await fecFetch<Record<string, unknown>>("/schedules/schedule_a/", {
      committee_id: committeeId,
      sort: "-contribution_receipt_amount",
      sort_hide_null: "true",
      per_page: String(perPage),
      page: String(page),
    }, TTL_CONTRIBUTIONS);
    return {
      contributions: res.results.map((r) => ({
        id: r.sub_id as string,
        contributorName: r.contributor_name as string,
        contributorId: r.contributor_id ? `fec:${r.contributor_id}` : null,
        recipientName: (r.committee as Record<string, unknown>)?.name as string ?? sourceId,
        recipientId: entityId,
        amount: r.contribution_receipt_amount as number,
        date: (r.contribution_receipt_date as string) ?? "",
        employer: (r.contributor_employer as string) ?? null,
        occupation: (r.contributor_occupation as string) ?? null,
        purpose: (r.receipt_type_full as string) ?? null,
        source: "fec",
        type: "contribution" as const,
      })),
      total: res.pagination.count,
      page: res.pagination.page,
      perPage: res.pagination.per_page,
      dataAsOf: today,
    };
  }

  const res = await fecFetch<Record<string, unknown>>("/schedules/schedule_b/", {
    committee_id: committeeId,
    sort: "-disbursement_amount",
    sort_hide_null: "true",
    per_page: String(perPage),
    page: String(page),
  }, TTL_CONTRIBUTIONS);
  return {
    contributions: res.results.map((r) => ({
      id: r.sub_id as string,
      contributorName: (r.committee as Record<string, unknown>)?.name as string ?? sourceId,
      contributorId: entityId,
      recipientName: r.recipient_name as string,
      recipientId: null,
      amount: r.disbursement_amount as number,
      date: (r.disbursement_date as string) ?? "",
      employer: null,
      occupation: null,
      purpose: (r.disbursement_description as string) ?? (r.disbursement_purpose_category as string) ?? null,
      source: "fec",
      type: "disbursement" as const,
    })),
    total: res.pagination.count,
    page: res.pagination.page,
    perPage: res.pagination.per_page,
    dataAsOf: today,
  };
}

interface AggregatedConnection {
  name: string;
  entityId: string | null;
  total: number;
  count: number;
  state?: string;
  employer?: string;
  occupation?: string;
}

// Merge name-only groups that likely refer to the same person.
// Only merges groups without FEC IDs, using entityMatchScore >= 0.9.
function fuzzyMerge(groups: AggregatedConnection[]): AggregatedConnection[] {
  const withId: AggregatedConnection[] = [];
  const nameOnly: AggregatedConnection[] = [];
  for (const g of groups) {
    if (g.entityId) withId.push(g);
    else nameOnly.push(g);
  }
  if (nameOnly.length < 2) return groups;

  const merged = new Set<number>();
  for (let i = 0; i < nameOnly.length; i++) {
    if (merged.has(i)) continue;
    for (let j = i + 1; j < nameOnly.length; j++) {
      if (merged.has(j)) continue;
      const score = entityMatchScore(
        { name: nameOnly[i].name, state: nameOnly[i].state, employer: nameOnly[i].employer, occupation: nameOnly[i].occupation },
        { name: nameOnly[j].name, state: nameOnly[j].state, employer: nameOnly[j].employer, occupation: nameOnly[j].occupation },
      );
      if (score >= 0.9) {
        nameOnly[i].total += nameOnly[j].total;
        nameOnly[i].count += nameOnly[j].count;
        merged.add(j);
      }
    }
  }

  const result = [...withId];
  for (let i = 0; i < nameOnly.length; i++) {
    if (!merged.has(i)) result.push(nameOnly[i]);
  }
  return result.sort((a, b) => b.total - a.total);
}

async function aggregateContributors(
  committeeId: string,
  sampleSize: number,
): Promise<AggregatedConnection[]> {
  const res = await fecFetch<Record<string, unknown>>("/schedules/schedule_a/", {
    committee_id: committeeId,
    sort: "-contribution_receipt_amount",
    sort_hide_null: "true",
    per_page: String(sampleSize),
  }, TTL_CONTRIBUTIONS);

  const grouped = new Map<string, AggregatedConnection>();
  for (const r of res.results) {
    const amount = (r.contribution_receipt_amount as number) || 0;
    if (amount <= 0) continue;
    const name = (r.contributor_name as string) || "Unknown";
    const rawId = r.contributor_id as string | undefined;
    const entityId = rawId ? `fec:${rawId}` : null;
    const key = entityId ?? normalizeName(name);
    const existing = grouped.get(key);
    if (existing) {
      existing.total += amount;
      existing.count++;
    } else {
      grouped.set(key, {
        name, entityId, total: amount, count: 1,
        state: (r.contributor_state as string) ?? undefined,
        employer: (r.contributor_employer as string) ?? undefined,
        occupation: (r.contributor_occupation as string) ?? undefined,
      });
    }
  }
  return fuzzyMerge(Array.from(grouped.values()));
}

async function aggregateRecipients(
  committeeId: string,
  sampleSize: number,
): Promise<AggregatedConnection[]> {
  const res = await fecFetch<Record<string, unknown>>("/schedules/schedule_b/", {
    committee_id: committeeId,
    sort: "-disbursement_amount",
    sort_hide_null: "true",
    per_page: String(sampleSize),
  }, TTL_CONTRIBUTIONS);

  const grouped = new Map<string, AggregatedConnection>();
  for (const r of res.results) {
    const amount = (r.disbursement_amount as number) || 0;
    if (amount <= 0) continue;
    const name = (r.recipient_name as string) || "Unknown";
    const rawId = r.recipient_committee_id as string | undefined;
    const entityId = rawId ? `fec:${rawId}` : null;
    const key = entityId ?? normalizeName(name);
    const existing = grouped.get(key);
    if (existing) {
      existing.total += amount;
      existing.count++;
    } else {
      grouped.set(key, { name, entityId, total: amount, count: 1 });
    }
  }
  return fuzzyMerge(Array.from(grouped.values()));
}

// Per-hop parameters: fewer connections and expansions at deeper levels
function hopParams(hop: number) {
  return {
    connectionsPerSide: Math.max(3, 14 - hop * 3),
    sampleSize: Math.max(15, 55 - hop * 10),
    expandLimit: Math.max(1, 5 - hop),
  };
}

// Expand a single committee node: fetch its contributors and recipients,
// add them to the graph, and return committees eligible for further expansion.
async function expandCommittee(
  commId: string,
  parentNodeId: string,
  centerId: string,
  currentDepth: number,
  nodes: Map<string, GraphNode>,
  edgeMap: Map<string, GraphEdge>,
  expanded: Set<string>,
  limit: number,
): Promise<{ id: string; committeeId: string }[]> {
  if (expanded.has(commId)) return [];
  expanded.add(commId);

  const params = hopParams(currentDepth);
  const [contribResult, recipResult] = await Promise.allSettled([
    aggregateContributors(commId, params.sampleSize),
    aggregateRecipients(commId, params.sampleSize),
  ]);

  const newCommittees: { id: string; committeeId: string }[] = [];
  let expandCount = 0;

  if (contribResult.status === "fulfilled") {
    for (const c of contribResult.value.slice(0, params.connectionsPerSide)) {
      if (nodes.size >= limit) break;
      const nodeId = c.entityId ?? `name:${normalizeName(c.name)}`;
      if (nodeId === centerId || nodeId === parentNodeId) continue;
      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          name: c.entityId ? c.name : normalizeName(c.name),
          type: c.entityId?.startsWith("fec:C") ? "committee" : "individual",
          party: null,
          totalFlow: c.total,
          depth: currentDepth,
        });
      }
      const ek = `${nodeId}>${parentNodeId}`;
      if (!edgeMap.has(ek)) {
        edgeMap.set(ek, { source: nodeId, target: parentNodeId, amount: c.total, count: c.count });
      }
      if (c.entityId?.startsWith("fec:C") && expandCount < params.expandLimit
          && !expanded.has(c.entityId.replace(/^fec:/, ""))) {
        newCommittees.push({ id: c.entityId, committeeId: c.entityId.replace(/^fec:/, "") });
        expandCount++;
      }
    }
  }

  if (recipResult.status === "fulfilled") {
    for (const r of recipResult.value.slice(0, params.connectionsPerSide)) {
      if (nodes.size >= limit) break;
      const nodeId = r.entityId ?? `name:${normalizeName(r.name)}`;
      if (nodeId === centerId || nodeId === parentNodeId) continue;
      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          name: r.entityId ? r.name : normalizeName(r.name),
          type: r.entityId?.startsWith("fec:C") ? "committee" : "individual",
          party: null,
          totalFlow: r.total,
          depth: currentDepth,
        });
      }
      const ek = `${parentNodeId}>${nodeId}`;
      if (!edgeMap.has(ek)) {
        edgeMap.set(ek, { source: parentNodeId, target: nodeId, amount: r.total, count: r.count });
      }
      if (r.entityId?.startsWith("fec:C") && expandCount < params.expandLimit
          && !expanded.has(r.entityId.replace(/^fec:/, ""))
          && !newCommittees.some(nc => nc.id === r.entityId)) {
        newCommittees.push({ id: r.entityId, committeeId: r.entityId.replace(/^fec:/, "") });
        expandCount++;
      }
    }
  }

  return newCommittees;
}

export async function getGraph(
  entityId: string,
  depth = 2,
  _minAmount = 0,
  limit = 150,
): Promise<GraphResponse> {
  void _minAmount;
  const sourceId = entityId.replace(/^fec:/, "");
  const isCommittee = /^C\d/.test(sourceId);

  let committeeId = sourceId;
  if (!isCommittee) {
    const found = await findCommitteeForCandidate(sourceId);
    if (!found) return { nodes: [], edges: [], centerEntityId: entityId };
    committeeId = found;
  }

  const nodes = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  const expanded = new Set<string>();

  const centerInfo = await getEntity(entityId);
  nodes.set(entityId, {
    id: entityId,
    name: centerInfo.entity.canonicalName,
    type: centerInfo.entity.type,
    party: centerInfo.entity.party,
    totalFlow: centerInfo.stats.totalReceived + centerInfo.stats.totalGiven,
    depth: 0,
  });

  // Hop 1: expand center committee
  const hop1Queue = await expandCommittee(
    committeeId, entityId, entityId, 1,
    nodes, edgeMap, expanded, limit,
  );

  // Hops 2..depth: expand committees discovered at each level
  let currentQueue = hop1Queue;
  for (let hop = 2; hop <= depth && currentQueue.length > 0 && nodes.size < limit; hop++) {
    const results = await Promise.allSettled(
      currentQueue.map(comm =>
        expandCommittee(comm.committeeId, comm.id, entityId, hop, nodes, edgeMap, expanded, limit)
      ),
    );
    const nextQueue: { id: string; committeeId: string }[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        nextQueue.push(...result.value);
      }
    }
    currentQueue = nextQueue;
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edgeMap.values()),
    centerEntityId: entityId,
  };
}

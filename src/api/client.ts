import type { SearchResponse, EntityResponse, ContributionsResponse, GraphResponse } from "../types/api";
import type { SearchFilters, Party } from "../types/entities";

const FEC_BASE = "https://api.open.fec.gov/v1";
const FEC_KEY = import.meta.env.VITE_FEC_API_KEY || "DEMO_KEY";

function mapParty(fecParty: string | null): Party {
  if (!fecParty) return null;
  const map: Record<string, Party> = {
    DEM: "DEM", REP: "REP", LIB: "LIB", GRN: "GRN", IND: "IND",
    Democratic: "DEM", Republican: "REP", Libertarian: "LIB", Green: "GRN",
  };
  return map[fecParty] ?? "OTH";
}

function normalizeName(raw: string): string {
  let name = raw.toUpperCase().trim().replace(/[^A-Z\s,\-]/g, "");
  const suffixes = new Set(["JR", "SR", "II", "III", "IV", "V", "MD", "PHD", "ESQ"]);
  if (name.includes(",")) {
    const [last, ...rest] = name.split(",");
    const firstParts = rest.join(" ").trim().split(/\s+/).filter((p) => !suffixes.has(p));
    const lastParts = last.trim().split(/\s+/).filter((p) => !suffixes.has(p));
    // Strip middle initials (single letters)
    const first = firstParts.filter((p) => p.length > 1).join(" ");
    const lastClean = lastParts.join(" ");
    return [first, lastClean].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  const parts = name.split(/\s+/).filter((p) => !suffixes.has(p));
  return parts.join(" ");
}

interface FecResponse<T> {
  results: T[];
  pagination: { page: number; per_page: number; count: number; pages: number };
}

// Deduplicate and aggregate FEC totals by election cycle
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

async function fecFetch<T>(path: string, params: Record<string, string> = {}): Promise<FecResponse<T>> {
  const url = new URL(`${FEC_BASE}${path}`);
  url.searchParams.set("api_key", FEC_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FEC API ${res.status}`);
  return res.json();
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

  // /candidates/search/ requires q; /candidates/ works without it
  const candidateEndpoint = hasQuery ? "/candidates/search/" : "/candidates/";
  const requests: Promise<FecResponse<Record<string, unknown>>>[] = [];
  if (searchCandidates) requests.push(fecFetch(candidateEndpoint, fecParams));
  if (searchCommittees) requests.push(fecFetch("/committees/", fecParams));

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
            canonicalName: c.name as string,
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
  const sourceId = entityId.replace(/^fec:/, "");
  const isCommittee = /^C\d/.test(sourceId);
  const today = new Date().toISOString().split("T")[0];

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
    });
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

  // Disbursements
  const res = await fecFetch<Record<string, unknown>>("/schedules/schedule_b/", {
    committee_id: committeeId,
    sort: "-disbursement_amount",
    sort_hide_null: "true",
    per_page: String(perPage),
    page: String(page),
  });
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
  });

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
      grouped.set(key, { name, entityId, total: amount, count: 1 });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
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
  });

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
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
}

export async function getGraph(
  entityId: string,
  depth = 2,
  _minAmount = 0,
  limit = 100,
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

  const centerInfo = await getEntity(entityId);
  nodes.set(entityId, {
    id: entityId,
    name: centerInfo.entity.canonicalName,
    type: centerInfo.entity.type,
    party: centerInfo.entity.party,
    totalFlow: centerInfo.stats.totalReceived + centerInfo.stats.totalGiven,
    depth: 0,
  });

  const [contribResult, recipResult] = await Promise.allSettled([
    aggregateContributors(committeeId, 50),
    aggregateRecipients(committeeId, 50),
  ]);

  const HOP1_LIMIT = 12;
  const HOP2_EXPAND = 3;
  const hop2Queue: { id: string; committeeId: string }[] = [];

  if (contribResult.status === "fulfilled") {
    let expandCount = 0;
    for (const c of contribResult.value.slice(0, HOP1_LIMIT)) {
      const nodeId = c.entityId ?? `name:${normalizeName(c.name)}`;
      if (nodeId === entityId) continue;
      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          name: c.entityId ? c.name : normalizeName(c.name),
          type: c.entityId?.startsWith("fec:C") ? "committee" : "individual",
          party: null,
          totalFlow: c.total,
          depth: 1,
        });
      }
      edgeMap.set(`${nodeId}>${entityId}`, {
        source: nodeId, target: entityId, amount: c.total, count: c.count,
      });
      if (c.entityId?.startsWith("fec:C") && expandCount < HOP2_EXPAND) {
        hop2Queue.push({ id: c.entityId, committeeId: c.entityId.replace(/^fec:/, "") });
        expandCount++;
      }
    }
  }

  if (recipResult.status === "fulfilled") {
    let expandCount = 0;
    for (const r of recipResult.value.slice(0, HOP1_LIMIT)) {
      const nodeId = r.entityId ?? `name:${normalizeName(r.name)}`;
      if (nodeId === entityId) continue;
      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          name: r.entityId ? r.name : normalizeName(r.name),
          type: r.entityId?.startsWith("fec:C") ? "committee" : "individual",
          party: null,
          totalFlow: r.total,
          depth: 1,
        });
      }
      edgeMap.set(`${entityId}>${nodeId}`, {
        source: entityId, target: nodeId, amount: r.total, count: r.count,
      });
      if (r.entityId?.startsWith("fec:C") && expandCount < HOP2_EXPAND
          && !hop2Queue.some((h) => h.id === r.entityId)) {
        hop2Queue.push({ id: r.entityId, committeeId: r.entityId.replace(/^fec:/, "") });
        expandCount++;
      }
    }
  }

  if (depth >= 2 && hop2Queue.length > 0) {
    const hop2Results = await Promise.allSettled(
      hop2Queue.map(async (comm) => {
        const [h2c, h2r] = await Promise.allSettled([
          aggregateContributors(comm.committeeId, 20),
          aggregateRecipients(comm.committeeId, 20),
        ]);
        return { parentId: comm.id, contributors: h2c, recipients: h2r };
      }),
    );

    for (const result of hop2Results) {
      if (result.status !== "fulfilled") continue;
      const { parentId, contributors, recipients } = result.value;

      if (contributors.status === "fulfilled") {
        for (const c of contributors.value.slice(0, 5)) {
          if (nodes.size >= limit) break;
          const nodeId = c.entityId ?? `name:${normalizeName(c.name)}`;
          if (nodeId === entityId || nodeId === parentId) continue;
          if (!nodes.has(nodeId)) {
            nodes.set(nodeId, {
              id: nodeId,
              name: c.entityId ? c.name : normalizeName(c.name),
              type: c.entityId?.startsWith("fec:C") ? "committee" : "individual",
              party: null, totalFlow: c.total, depth: 2,
            });
          }
          const ek = `${nodeId}>${parentId}`;
          if (!edgeMap.has(ek)) {
            edgeMap.set(ek, { source: nodeId, target: parentId, amount: c.total, count: c.count });
          }
        }
      }

      if (recipients.status === "fulfilled") {
        for (const r of recipients.value.slice(0, 5)) {
          if (nodes.size >= limit) break;
          const nodeId = r.entityId ?? `name:${normalizeName(r.name)}`;
          if (nodeId === entityId || nodeId === parentId) continue;
          if (!nodes.has(nodeId)) {
            nodes.set(nodeId, {
              id: nodeId,
              name: r.entityId ? r.name : normalizeName(r.name),
              type: r.entityId?.startsWith("fec:C") ? "committee" : "individual",
              party: null, totalFlow: r.total, depth: 2,
            });
          }
          const ek = `${parentId}>${nodeId}`;
          if (!edgeMap.has(ek)) {
            edgeMap.set(ek, { source: parentId, target: nodeId, amount: r.total, count: r.count });
          }
        }
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edgeMap.values()),
    centerEntityId: entityId,
  };
}

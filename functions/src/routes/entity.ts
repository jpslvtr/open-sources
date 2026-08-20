import {
  getCandidate,
  getCandidateTotals,
  getCommittee,
  getContributionsTo,
  getDisbursements,
} from "../api/fec";
import { normalizeName } from "../resolvers/normalize";
import type { FecScheduleA, FecScheduleB } from "../api/fec";

function schedAToContribution(r: FecScheduleA) {
  return {
    id: r.sub_id,
    contributorName: r.contributor_name,
    contributorId: r.contributor_id ? `fec:${r.contributor_id}` : null,
    recipientName: r.committee?.name ?? r.committee_id,
    recipientId: `fec:${r.committee_id}`,
    amount: r.contribution_receipt_amount,
    date: r.contribution_receipt_date ?? "",
    employer: r.contributor_employer,
    occupation: r.contributor_occupation,
    purpose: r.receipt_type_full,
    source: "fec",
    type: "contribution" as const,
  };
}

function schedBToContribution(r: FecScheduleB) {
  return {
    id: r.sub_id,
    contributorName: r.committee?.name ?? r.committee_id,
    contributorId: `fec:${r.committee_id}`,
    recipientName: r.recipient_name,
    recipientId: null,
    amount: r.disbursement_amount,
    date: r.disbursement_date ?? "",
    employer: null,
    occupation: null,
    purpose: r.disbursement_description ?? r.disbursement_purpose_category,
    source: "fec",
    type: "disbursement" as const,
  };
}

// Parse entity ID format "source:id"
function parseEntityId(id: string): { source: string; sourceId: string } {
  const colonIdx = id.indexOf(":");
  if (colonIdx === -1) return { source: "fec", sourceId: id };
  return { source: id.slice(0, colonIdx), sourceId: id.slice(colonIdx + 1) };
}

export async function handleGetEntity(entityId: string) {
  const { source, sourceId } = parseEntityId(entityId);

  if (source !== "fec") {
    throw new Error(`Unsupported source: ${source}`);
  }

  // Determine if candidate or committee by ID prefix
  const isCandidate = /^[HSP]\d/.test(sourceId);
  const isCommittee = /^C\d/.test(sourceId);

  if (isCandidate) {
    const [candidate, totals] = await Promise.all([
      getCandidate(sourceId),
      getCandidateTotals(sourceId),
    ]);
    if (!candidate) throw new Error("Candidate not found");

    const latestTotal = totals[0];
    const totalReceived = totals.reduce((sum, t) => sum + (t.receipts || 0), 0);
    const totalGiven = totals.reduce((sum, t) => sum + (t.disbursements || 0), 0);

    return {
      entity: {
        id: entityId,
        canonicalName: normalizeName(candidate.name),
        type: "candidate" as const,
        party: candidate.party,
        state: candidate.state,
        level: "federal" as const,
        office: candidate.office_full,
        sourceIds: { fec: sourceId },
        aliases: [candidate.name],
        dataAsOf: latestTotal?.coverage_end_date?.split("T")[0]
          ?? new Date().toISOString().split("T")[0],
      },
      stats: {
        totalReceived,
        totalGiven,
        contributionCount: 0,
        topSource: null,
        topRecipient: null,
        cycles: totals.map((t) => ({
          cycle: t.cycle,
          received: t.receipts || 0,
          given: t.disbursements || 0,
        })),
      },
      dataAsOf: latestTotal?.coverage_end_date?.split("T")[0]
        ?? new Date().toISOString().split("T")[0],
    };
  }

  if (isCommittee) {
    const committee = await getCommittee(sourceId);
    if (!committee) throw new Error("Committee not found");

    return {
      entity: {
        id: entityId,
        canonicalName: committee.name,
        type: "committee" as const,
        party: committee.party,
        state: committee.state,
        level: "federal" as const,
        office: null,
        sourceIds: { fec: sourceId },
        aliases: [],
        dataAsOf: new Date().toISOString().split("T")[0],
      },
      stats: {
        totalReceived: 0,
        totalGiven: 0,
        contributionCount: 0,
        topSource: null,
        topRecipient: null,
        cycles: [],
      },
      dataAsOf: new Date().toISOString().split("T")[0],
    };
  }

  throw new Error("Unknown FEC ID format");
}

export async function handleGetContributions(
  entityId: string,
  direction: "received" | "given",
  page: number,
  perPage: number,
) {
  const { source, sourceId } = parseEntityId(entityId);
  if (source !== "fec") throw new Error(`Unsupported source: ${source}`);

  const params = { page: String(page), per_page: String(perPage) };

  if (direction === "received") {
    // Contributions received by this committee
    const isCommittee = /^C\d/.test(sourceId);
    if (isCommittee) {
      const res = await getContributionsTo(sourceId, params);
      return {
        contributions: res.results.map(schedAToContribution),
        total: res.pagination.count,
        page: res.pagination.page,
        perPage: res.pagination.per_page,
        dataAsOf: new Date().toISOString().split("T")[0],
      };
    }
    // For candidates, look up their principal committee
    // The FEC API doesn't directly support schedule_a by candidate_id
    // We'd need to find the candidate's committee first
    return { contributions: [], total: 0, page, perPage, dataAsOf: new Date().toISOString().split("T")[0] };
  }

  // Disbursements by this committee
  const isCommittee = /^C\d/.test(sourceId);
  if (isCommittee) {
    const res = await getDisbursements(sourceId, params);
    return {
      contributions: res.results.map(schedBToContribution),
      total: res.pagination.count,
      page: res.pagination.page,
      perPage: res.pagination.per_page,
      dataAsOf: new Date().toISOString().split("T")[0],
    };
  }

  return { contributions: [], total: 0, page, perPage, dataAsOf: new Date().toISOString().split("T")[0] };
}

import { defineString } from "firebase-functions/params";

const fecApiKey = defineString("FEC_API_KEY", { default: "DEMO_KEY" });

const BASE = "https://api.open.fec.gov/v1";

interface FecPaginatedResponse<T> {
  results: T[];
  pagination: {
    page: number;
    per_page: number;
    count: number;
    pages: number;
  };
}

async function fecFetch<T>(path: string, params: Record<string, string> = {}): Promise<FecPaginatedResponse<T>> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", fecApiKey.value());
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FEC API ${res.status}: ${text}`);
  }
  return res.json() as Promise<FecPaginatedResponse<T>>;
}

// -- Candidate types --

export interface FecCandidate {
  candidate_id: string;
  name: string;
  party_full: string | null;
  party: string | null;
  state: string | null;
  office_full: string | null;
  office: string | null;
  district: string | null;
  incumbent_challenge_full: string | null;
  cycles: number[];
  candidate_status: string | null;
}

export interface FecCandidateTotals {
  candidate_id: string;
  cycle: number;
  receipts: number;
  disbursements: number;
  individual_contributions: number;
  other_political_committee_contributions: number;
  contributions: number;
  last_cash_on_hand_end_period: number | null;
  last_debts_owed_by_committee: number | null;
  coverage_end_date: string | null;
}

// -- Committee types --

export interface FecCommittee {
  committee_id: string;
  name: string;
  committee_type_full: string | null;
  committee_type: string | null;
  designation_full: string | null;
  designation: string | null;
  party_full: string | null;
  party: string | null;
  state: string | null;
  treasurer_name: string | null;
  cycles: number[];
  candidate_ids: string[];
}

// -- Schedule A (contributions received) --

export interface FecScheduleA {
  sub_id: string;
  contributor_name: string;
  contributor_id: string | null;
  contributor_state: string | null;
  contributor_employer: string | null;
  contributor_occupation: string | null;
  contributor_zip: string | null;
  contribution_receipt_amount: number;
  contribution_receipt_date: string | null;
  committee_id: string;
  committee: { name: string } | null;
  receipt_type_full: string | null;
  memo_text: string | null;
  line_number_label: string | null;
  is_individual: boolean | null;
}

// -- Schedule B (disbursements) --

export interface FecScheduleB {
  sub_id: string;
  recipient_name: string;
  recipient_state: string | null;
  disbursement_amount: number;
  disbursement_date: string | null;
  committee_id: string;
  committee: { name: string } | null;
  disbursement_purpose_category: string | null;
  disbursement_description: string | null;
}

// -- API methods --

export async function searchCandidates(
  query: string,
  params: { party?: string; state?: string; cycle?: string; page?: string; per_page?: string } = {},
): Promise<FecPaginatedResponse<FecCandidate>> {
  return fecFetch<FecCandidate>("/candidates/search/", {
    q: query,
    sort: "-receipts",
    sort_null_only: "false",
    ...params,
    per_page: params.per_page || "20",
    page: params.page || "1",
  });
}

export async function searchCommittees(
  query: string,
  params: { party?: string; state?: string; cycle?: string; page?: string; per_page?: string } = {},
): Promise<FecPaginatedResponse<FecCommittee>> {
  return fecFetch<FecCommittee>("/committees/", {
    q: query,
    sort: "-receipts",
    ...params,
    per_page: params.per_page || "20",
    page: params.page || "1",
  });
}

export async function getCandidate(candidateId: string): Promise<FecCandidate | null> {
  const res = await fecFetch<FecCandidate>(`/candidate/${candidateId}/`);
  return res.results[0] ?? null;
}

export async function getCandidateTotals(
  candidateId: string,
  cycle?: number,
): Promise<FecCandidateTotals[]> {
  const params: Record<string, string> = {};
  if (cycle) params.cycle = String(cycle);
  const res = await fecFetch<FecCandidateTotals>(`/candidate/${candidateId}/totals/`, params);
  return res.results;
}

export async function getCommittee(committeeId: string): Promise<FecCommittee | null> {
  const res = await fecFetch<FecCommittee>(`/committee/${committeeId}/`);
  return res.results[0] ?? null;
}

export async function getContributionsTo(
  committeeId: string,
  params: { page?: string; per_page?: string; sort?: string; sort_hide_null?: string; contributor_name?: string } = {},
): Promise<FecPaginatedResponse<FecScheduleA>> {
  return fecFetch<FecScheduleA>("/schedules/schedule_a/", {
    committee_id: committeeId,
    sort: "-contribution_receipt_amount",
    sort_hide_null: "true",
    per_page: params.per_page || "30",
    page: params.page || "1",
    ...params,
  });
}

export async function getContributionsBy(
  contributorName: string,
  params: { page?: string; per_page?: string; contributor_state?: string } = {},
): Promise<FecPaginatedResponse<FecScheduleA>> {
  return fecFetch<FecScheduleA>("/schedules/schedule_a/", {
    contributor_name: contributorName,
    sort: "-contribution_receipt_amount",
    sort_hide_null: "true",
    per_page: params.per_page || "30",
    page: params.page || "1",
    ...params,
  });
}

export async function getDisbursements(
  committeeId: string,
  params: { page?: string; per_page?: string } = {},
): Promise<FecPaginatedResponse<FecScheduleB>> {
  return fecFetch<FecScheduleB>("/schedules/schedule_b/", {
    committee_id: committeeId,
    sort: "-disbursement_amount",
    sort_hide_null: "true",
    per_page: params.per_page || "30",
    page: params.page || "1",
    ...params,
  });
}

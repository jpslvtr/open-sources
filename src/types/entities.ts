export type EntityType = "candidate" | "committee" | "individual" | "organization";

export type Party = "DEM" | "REP" | "IND" | "LIB" | "GRN" | "OTH" | null;

export type Level = "federal" | "state";

export interface Entity {
  id: string;
  canonicalName: string;
  type: EntityType;
  party: Party;
  state: string | null;
  level: Level;
  office: string | null;
  sourceIds: {
    fec?: string;
    ftm?: string;
    propublica?: string;
  };
  aliases: string[];
  dataAsOf: string;
}

export interface EntityStats {
  totalReceived: number;
  totalGiven: number;
  contributionCount: number;
  topSource: string | null;
  topRecipient: string | null;
  cycles: CycleSummary[];
}

export interface CycleSummary {
  cycle: number;
  received: number;
  given: number;
}

export interface Contribution {
  id: string;
  contributorName: string;
  contributorId: string | null;
  recipientName: string;
  recipientId: string | null;
  amount: number;
  date: string;
  employer: string | null;
  occupation: string | null;
  purpose: string | null;
  source: string;
  type: "contribution" | "disbursement" | "independent_expenditure";
}

export interface SearchFilters {
  type: EntityType | "all";
  level: Level | "all";
  party: Party | "all";
  state: string | "all";
  cycle: number | "all";
}

export interface SearchResult {
  entity: Entity;
  headline: string;
  headlineAmount: number;
}

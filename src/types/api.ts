import type { Entity, EntityStats, Contribution, SearchFilters, SearchResult } from "./entities";

export interface SearchRequest {
  query: string;
  filters: SearchFilters;
  page: number;
  perPage: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  perPage: number;
}

export interface EntityResponse {
  entity: Entity;
  stats: EntityStats;
  dataAsOf: string;
}

export interface ContributionsResponse {
  contributions: Contribution[];
  total: number;
  page: number;
  perPage: number;
  dataAsOf: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: Entity["type"];
  party: Entity["party"];
  totalFlow: number;
  depth: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  amount: number;
  count: number;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerEntityId: string;
}

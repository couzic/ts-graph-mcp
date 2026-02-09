import { map } from "rxjs";
import { ajax } from "rxjs/ajax";
import type { GraphEndpoint, SymbolOption } from "./SymbolOption";

export type HealthResponse = {
  status: string;
  ready: boolean;
  indexed_files: number;
};

export type GraphSearchResult = {
  result: string;
};

type ApiEndpoint = { symbol: string; file_path: string } | { query: string };

const toApiEndpoint = (endpoint: GraphEndpoint): ApiEndpoint => {
  if (endpoint.kind === "symbol") {
    return { symbol: endpoint.symbol, file_path: endpoint.file_path };
  }
  return { query: endpoint.query };
};

type SearchGraphParams = {
  from?: GraphEndpoint;
  to?: GraphEndpoint;
  maxNodes: number;
  format: string;
};

export const createApiService = () => ({
  getHealth: () => ajax.getJSON<HealthResponse>("/health"),

  searchSymbols: (query: string) =>
    ajax.getJSON<SymbolOption[]>(`/api/symbols?q=${encodeURIComponent(query)}`),

  searchByTopic: (topic: string, maxNodes: number, format: string) =>
    ajax<GraphSearchResult>({
      url: "/api/graph/search",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        max_nodes: maxNodes,
        format,
      }),
      responseType: "json",
    }).pipe(map((r) => r.response)),

  searchGraph: ({ from, to, maxNodes, format }: SearchGraphParams) =>
    ajax<GraphSearchResult>({
      url: "/api/graph/search",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(from ? { from: toApiEndpoint(from) } : {}),
        ...(to ? { to: toApiEndpoint(to) } : {}),
        max_nodes: maxNodes,
        format,
      }),
      responseType: "json",
    }).pipe(map((r) => r.response)),
});

export type ApiService = ReturnType<typeof createApiService>;

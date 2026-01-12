import { map } from "rxjs";
import { ajax } from "rxjs/ajax";
import { SymbolOption } from "./SymbolOption";

export type HealthResponse = {
  status: string;
  ready: boolean;
  indexed_files: number;
};

export const createApiService = () => ({
  getHealth: () => ajax.getJSON<HealthResponse>("/health"),

  searchSymbols: (query: string) =>
    ajax.getJSON<SymbolOption[]>(`/api/symbols?q=${encodeURIComponent(query)}`),

  getDependencies: (file: string, symbol: string, output: string) => {
    const params = new URLSearchParams({ file, symbol, output });
    return ajax<string>({
      url: `/api/graph/dependencies?${params}`,
      responseType: "text",
    }).pipe(map((r) => r.response));
  },

  getDependents: (file: string, symbol: string, output: string) => {
    const params = new URLSearchParams({ file, symbol, output });
    return ajax<string>({
      url: `/api/graph/dependents?${params}`,
      responseType: "text",
    }).pipe(map((r) => r.response));
  },

  getPathsBetween: (
    fromFile: string,
    fromSymbol: string,
    toFile: string,
    toSymbol: string,
    output: string
  ) => {
    const params = new URLSearchParams({
      from_file: fromFile,
      from_symbol: fromSymbol,
      to_file: toFile,
      to_symbol: toSymbol,
      output,
    });
    return ajax<string>({
      url: `/api/graph/paths?${params}`,
      responseType: "text",
    }).pipe(map((r) => r.response));
  },
});


export type ApiService = ReturnType<typeof createApiService>;

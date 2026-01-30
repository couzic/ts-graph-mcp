
export type SymbolOption = {
  file_path: string;
  symbol: string;
  type: string;
};

export type GraphEndpoint =
  | { kind: "symbol"; file_path: string; symbol: string; type: string }
  | { kind: "query"; query: string };

export const symbolToEndpoint = (opt: SymbolOption): GraphEndpoint => ({
  kind: "symbol",
  file_path: opt.file_path,
  symbol: opt.symbol,
  type: opt.type,
});

export const queryToEndpoint = (query: string): GraphEndpoint => ({
  kind: "query",
  query,
});

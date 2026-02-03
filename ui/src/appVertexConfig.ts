import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  debounceTime,
  distinctUntilChanged,
  interval,
  of,
  startWith,
  switchMap,
} from "rxjs";
import { configureRootVertex } from "verdux";
import { type ApiService, createApiService } from "./ApiService.js";
import type { GraphEndpoint, SymbolOption } from "./SymbolOption.js";

export type OutputFormat = "mcp" | "mermaid" | "md";
export type MermaidDirection = "LR" | "TD";

type AppState = {
  fromEndpoint: GraphEndpoint | null;
  toEndpoint: GraphEndpoint | null;
  topic: string;
  outputFormat: OutputFormat;
  mermaidDirection: MermaidDirection;
  maxNodes: number;
  fromSearchQuery: string;
  toSearchQuery: string;
  selectionHistory: SymbolOption[];
};

const addToHistory = (state: AppState, endpoint: GraphEndpoint) => {
  if (endpoint.kind !== "symbol") {
    return;
  }
  const symbolOption: SymbolOption = {
    file_path: endpoint.file_path,
    symbol: endpoint.symbol,
    type: endpoint.type,
  };
  const filtered = state.selectionHistory.filter(
    (h) => h.file_path !== endpoint.file_path || h.symbol !== endpoint.symbol,
  );
  state.selectionHistory = [symbolOption, ...filtered].slice(0, 12);
};

const filterOutSelected = (
  history: SymbolOption[],
  fromEndpoint: GraphEndpoint | null,
  toEndpoint: GraphEndpoint | null,
): SymbolOption[] =>
  history.filter(
    (h) =>
      !(
        fromEndpoint &&
        fromEndpoint.kind === "symbol" &&
        h.file_path === fromEndpoint.file_path &&
        h.symbol === fromEndpoint.symbol
      ) &&
      !(
        toEndpoint &&
        toEndpoint.kind === "symbol" &&
        h.file_path === toEndpoint.file_path &&
        h.symbol === toEndpoint.symbol
      ),
  );

const initialState: AppState = {
  fromEndpoint: null,
  toEndpoint: null,
  topic: "",
  outputFormat: "mcp",
  mermaidDirection: "LR",
  maxNodes: 50,
  fromSearchQuery: "",
  toSearchQuery: "",
  selectionHistory: [],
};

const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setFromEndpoint: (state, action: PayloadAction<GraphEndpoint | null>) => {
      state.fromEndpoint = action.payload;
      if (action.payload) {
        addToHistory(state, action.payload);
      }
    },
    setToEndpoint: (state, action: PayloadAction<GraphEndpoint | null>) => {
      state.toEndpoint = action.payload;
      if (action.payload) {
        addToHistory(state, action.payload);
      }
    },
    setTopic: (state, action: PayloadAction<string>) => {
      state.topic = action.payload;
    },
    setOutputFormat: (state, action: PayloadAction<OutputFormat>) => {
      state.outputFormat = action.payload;
    },
    setMermaidDirection: (state, action: PayloadAction<MermaidDirection>) => {
      state.mermaidDirection = action.payload;
    },
    setMaxNodes: (state, action: PayloadAction<number>) => {
      state.maxNodes = action.payload;
    },
    setFromSearchQuery: (state, action: PayloadAction<string>) => {
      state.fromSearchQuery = action.payload;
    },
    setToSearchQuery: (state, action: PayloadAction<string>) => {
      state.toSearchQuery = action.payload;
    },
    clearFromEndpoint: (state) => {
      state.fromEndpoint = null;
    },
    clearToEndpoint: (state) => {
      state.toEndpoint = null;
    },
    swapEndpoints: (state) => {
      const temp = state.fromEndpoint;
      state.fromEndpoint = state.toEndpoint;
      state.toEndpoint = temp;
    },
  },
});

export const appActions = appSlice.actions;

const buildVertexConfig = (dependencies: { apiService: () => ApiService }) =>
  configureRootVertex({
    slice: appSlice,
    dependencies,
  }).withDependencies(({ apiService }, vertex) =>
    vertex
      .load({
        health: interval(3000).pipe(
          startWith(0),
          switchMap(() => apiService.getHealth()),
        ),
      })
      .loadFromFields$(
        ["fromSearchQuery", "selectionHistory", "fromEndpoint", "toEndpoint"],
        {
          fromSymbolOptions: (fields$) =>
            fields$.pipe(
              debounceTime(200),
              distinctUntilChanged(
                (prev, curr) =>
                  prev.fromSearchQuery === curr.fromSearchQuery &&
                  prev.selectionHistory === curr.selectionHistory &&
                  prev.fromEndpoint === curr.fromEndpoint &&
                  prev.toEndpoint === curr.toEndpoint,
              ),
              switchMap(
                ({
                  fromSearchQuery,
                  selectionHistory,
                  fromEndpoint,
                  toEndpoint,
                }) => {
                  if (fromSearchQuery.length < 2) {
                    return of(
                      filterOutSelected(
                        selectionHistory,
                        fromEndpoint,
                        toEndpoint,
                      ),
                    );
                  }
                  return apiService.searchSymbols(fromSearchQuery);
                },
              ),
            ),
        },
      )
      .loadFromFields$(
        ["toSearchQuery", "selectionHistory", "fromEndpoint", "toEndpoint"],
        {
          toSymbolOptions: (fields$) =>
            fields$.pipe(
              debounceTime(200),
              distinctUntilChanged(
                (prev, curr) =>
                  prev.toSearchQuery === curr.toSearchQuery &&
                  prev.selectionHistory === curr.selectionHistory &&
                  prev.fromEndpoint === curr.fromEndpoint &&
                  prev.toEndpoint === curr.toEndpoint,
              ),
              switchMap(
                ({
                  toSearchQuery,
                  selectionHistory,
                  fromEndpoint,
                  toEndpoint,
                }) => {
                  if (toSearchQuery.length < 2) {
                    return of(
                      filterOutSelected(
                        selectionHistory,
                        fromEndpoint,
                        toEndpoint,
                      ),
                    );
                  }
                  return apiService.searchSymbols(toSearchQuery);
                },
              ),
            ),
        },
      )
      .loadFromFields$(["fromEndpoint", "toEndpoint", "topic", "maxNodes"], {
        queryResult: (fields$) =>
          fields$.pipe(
            debounceTime(100),
            switchMap(({ fromEndpoint, toEndpoint, topic, maxNodes }) => {
              // Topic only → semantic search
              if (topic.trim() && !fromEndpoint && !toEndpoint) {
                return apiService.searchByTopic(topic, maxNodes);
              }
              // FROM only → dependenciesOf (what does this call?)
              if (fromEndpoint && !toEndpoint) {
                return apiService.searchGraph({ from: fromEndpoint, maxNodes });
              }
              // TO only → dependentsOf (who calls this?)
              if (!fromEndpoint && toEndpoint) {
                return apiService.searchGraph({ to: toEndpoint, maxNodes });
              }
              // Both → pathsBetween
              if (fromEndpoint && toEndpoint) {
                return apiService.searchGraph({
                  from: fromEndpoint,
                  to: toEndpoint,
                  maxNodes,
                });
              }
              // Neither selected
              return of(null);
            }),
          ),
      }),
  );

export const appVertexConfig = buildVertexConfig({
  apiService: createApiService,
});

export type AppVertexConfig = typeof appVertexConfig;

/**
 * Creates an appVertexConfig with custom dependencies for testing.
 *
 * @example
 * const mockApiService = {
 *   getHealth: () => of({ status: "ok", ready: true, indexed_files: 10 }),
 *   searchSymbols: () => of([]),
 *   getDependents: () => of("result"),
 *   getPathsBetween: () => of("result"),
 * };
 * const testConfig = createAppVertexConfig({ apiService: () => mockApiService });
 */
export const createAppVertexConfig = buildVertexConfig;

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  debounceTime,
  distinctUntilChanged,
  interval,
  map,
  of,
  startWith,
  switchMap,
} from "rxjs";
import { configureRootVertex } from "verdux";
import { ApiService, createApiService } from "./ApiService.js";
import { SymbolOption } from "./SymbolOption.js";


export type OutputFormat = "mcp" | "mermaid" | "md";
export type MermaidDirection = "LR" | "TD";

type AppState = {
  startNode: SymbolOption | null;
  endNode: SymbolOption | null;
  outputFormat: OutputFormat;
  mermaidDirection: MermaidDirection;
  maxNodes: number;
  startSearchQuery: string;
  endSearchQuery: string;
  selectionHistory: SymbolOption[];
};

const addToHistory = (state: AppState, option: SymbolOption) => {
  const filtered = state.selectionHistory.filter(
    (h) => h.file_path !== option.file_path || h.symbol !== option.symbol
  );
  state.selectionHistory = [option, ...filtered].slice(0, 12);
};

const filterOutSelected = (
  history: SymbolOption[],
  startNode: SymbolOption | null,
  endNode: SymbolOption | null
): SymbolOption[] =>
  history.filter(
    (h) =>
      !(startNode && h.file_path === startNode.file_path && h.symbol === startNode.symbol) &&
      !(endNode && h.file_path === endNode.file_path && h.symbol === endNode.symbol)
  );

const appSlice = createSlice({
  name: "app",
  initialState: {
    startNode: null,
    endNode: null,
    outputFormat: "mcp",
    mermaidDirection: "LR",
    maxNodes: 50,
    startSearchQuery: "",
    endSearchQuery: "",
    selectionHistory: [],
  } as AppState,
  reducers: {
    setStartNode: (state, action: PayloadAction<SymbolOption | null>) => {
      state.startNode = action.payload;
      if (action.payload) {
        addToHistory(state, action.payload);
      }
    },
    setEndNode: (state, action: PayloadAction<SymbolOption | null>) => {
      state.endNode = action.payload;
      if (action.payload) {
        addToHistory(state, action.payload);
      }
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
    setStartSearchQuery: (state, action: PayloadAction<string>) => {
      state.startSearchQuery = action.payload;
    },
    setEndSearchQuery: (state, action: PayloadAction<string>) => {
      state.endSearchQuery = action.payload;
    },
    clearStartNode: (state) => {
      state.startNode = null;
    },
    clearEndNode: (state) => {
      state.endNode = null;
    },
    swapNodes: (state) => {
      const temp = state.startNode;
      state.startNode = state.endNode;
      state.endNode = temp;
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
          switchMap(() => apiService.getHealth())
        ),
      })
      .loadFromFields$(["startSearchQuery", "selectionHistory", "startNode", "endNode"], {
        startSymbolOptions: (fields$) =>
          fields$.pipe(
            debounceTime(200),
            distinctUntilChanged(
              (prev, curr) =>
                prev.startSearchQuery === curr.startSearchQuery &&
                prev.selectionHistory === curr.selectionHistory &&
                prev.startNode === curr.startNode &&
                prev.endNode === curr.endNode
            ),
            switchMap(({ startSearchQuery, selectionHistory, startNode, endNode }) => {
              if (startSearchQuery.length < 2) {
                return of(filterOutSelected(selectionHistory, startNode, endNode));
              }
              return apiService.searchSymbols(startSearchQuery);
            })
          ),
      })
      .loadFromFields$(["endSearchQuery", "selectionHistory", "startNode", "endNode"], {
        endSymbolOptions: (fields$) =>
          fields$.pipe(
            debounceTime(200),
            distinctUntilChanged(
              (prev, curr) =>
                prev.endSearchQuery === curr.endSearchQuery &&
                prev.selectionHistory === curr.selectionHistory &&
                prev.startNode === curr.startNode &&
                prev.endNode === curr.endNode
            ),
            switchMap(({ endSearchQuery, selectionHistory, startNode, endNode }) => {
              if (endSearchQuery.length < 2) {
                return of(filterOutSelected(selectionHistory, startNode, endNode));
              }
              return apiService.searchSymbols(endSearchQuery);
            })
          ),
      })
      .loadFromFields$(["startNode", "endNode", "outputFormat", "maxNodes"], {
        queryResult: (fields$) =>
          fields$.pipe(
            debounceTime(100),
            switchMap(({ startNode, endNode, outputFormat, maxNodes }) => {
              // START only → dependenciesOf (what does this call?)
              if (startNode && !endNode) {
                return apiService.getDependencies(
                  startNode.file_path,
                  startNode.symbol,
                  outputFormat,
                  maxNodes
                );
              }
              // END only → dependentsOf (who calls this?)
              if (!startNode && endNode) {
                return apiService.getDependents(
                  endNode.file_path,
                  endNode.symbol,
                  outputFormat,
                  maxNodes
                );
              }
              // Both → pathsBetween
              if (startNode && endNode) {
                return apiService.getPathsBetween(
                  startNode.file_path,
                  startNode.symbol,
                  endNode.file_path,
                  endNode.symbol,
                  outputFormat,
                  maxNodes
                );
              }
              // Neither selected
              return of(null);
            })
          ),
      })
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

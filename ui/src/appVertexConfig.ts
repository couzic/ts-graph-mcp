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

const appSlice = createSlice({
  name: "app",
  initialState: {
    startNode: null as SymbolOption | null,
    endNode: null as SymbolOption | null,
    outputFormat: "mcp" as OutputFormat,
    startSearchQuery: "",
    endSearchQuery: "",
  },
  reducers: {
    setStartNode: (state, action: PayloadAction<SymbolOption | null>) => {
      state.startNode = action.payload;
    },
    setEndNode: (state, action: PayloadAction<SymbolOption | null>) => {
      state.endNode = action.payload;
    },
    setOutputFormat: (state, action: PayloadAction<OutputFormat>) => {
      state.outputFormat = action.payload;
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
      .loadFromFields$(["startSearchQuery"], {
        startSymbolOptions: (fields$) =>
          fields$.pipe(
            map((f) => f.startSearchQuery),
            debounceTime(200),
            distinctUntilChanged(),
            switchMap((query) => {
              if (query.length < 2) {
                return of([]);
              }
              return apiService.searchSymbols(query);
            })
          ),
      })
      .loadFromFields$(["endSearchQuery"], {
        endSymbolOptions: (fields$) =>
          fields$.pipe(
            map((f) => f.endSearchQuery),
            debounceTime(200),
            distinctUntilChanged(),
            switchMap((query) => {
              if (query.length < 2) {
                return of([]);
              }
              return apiService.searchSymbols(query);
            })
          ),
      })
      .loadFromFields$(["startNode", "endNode", "outputFormat"], {
        queryResult: (fields$) =>
          fields$.pipe(
            debounceTime(100),
            switchMap(({ startNode, endNode, outputFormat }) => {
              // START only → dependenciesOf (what does this call?)
              if (startNode && !endNode) {
                return apiService.getDependencies(
                  startNode.file_path,
                  startNode.symbol,
                  outputFormat
                );
              }
              // END only → dependentsOf (who calls this?)
              if (!startNode && endNode) {
                return apiService.getDependents(
                  endNode.file_path,
                  endNode.symbol,
                  outputFormat
                );
              }
              // Both → pathsBetween
              if (startNode && endNode) {
                return apiService.getPathsBetween(
                  startNode.file_path,
                  startNode.symbol,
                  endNode.file_path,
                  endNode.symbol,
                  outputFormat
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

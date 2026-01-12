import { createGraph, Graph, Vertex } from "verdux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthResponse } from "./ApiService.js";
import {
  appActions,
  createAppVertexConfig,
} from "./appVertexConfig.js";
import { SymbolOption } from "./SymbolOption.js";
import { Subject } from "rxjs";

describe("appVertexConfig", () => {
  let graph: Graph;
  let vertex: Vertex<ReturnType<typeof createAppVertexConfig>>;
  let receivedHealth$: Subject<HealthResponse>;
  let receivedSymbols$: Subject<SymbolOption[]>;
  let receivedDependencies$: Subject<string>;
  let receivedDependents$: Subject<string>;
  let receivedPaths$: Subject<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    receivedHealth$ = new Subject<HealthResponse>();
    receivedSymbols$ = new Subject<SymbolOption[]>();
    receivedDependencies$ = new Subject<string>();
    receivedDependents$ = new Subject<string>();
    receivedPaths$ = new Subject<string>();
    const vertexConfig = createAppVertexConfig({
      apiService: () => ({
        getHealth: () => receivedHealth$,
        searchSymbols: () => receivedSymbols$,
        getDependencies: () => receivedDependencies$,
        getDependents: () => receivedDependents$,
        getPathsBetween: () => receivedPaths$,
      }),
    });
    graph = createGraph({
      vertices: [vertexConfig],
    });
    vertex = graph.getVertexInstance(vertexConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("health loader", () => {
    it("loads health on startup", () => {
      const healthResponse: HealthResponse = {
        status: "ok",
        ready: true,
        indexed_files: 42,
      };
      receivedHealth$.next(healthResponse);

      expect(vertex.currentState.health).toEqual(healthResponse);
    });
  });

  describe("startSymbolOptions loader", () => {
    it("becomes loaded after debounce on startup", () => {
      // Emit health so the health field is loaded
      receivedHealth$.next({ status: "ok", ready: true, indexed_files: 0 });

      // Field starts in "loading" state due to debounceTime
      expect(vertex.currentLoadableState.status).toBe("loading");

      // After debounce, field becomes loaded with empty array
      vi.advanceTimersByTime(300);
      expect(vertex.currentLoadableState.status).toBe("loaded");
      expect(vertex.currentState.startSymbolOptions).toEqual([]);
    });

    it("returns empty array when query is less than 2 characters", () => {
      graph.dispatch(appActions.setStartSearchQuery("a"));
      vi.advanceTimersByTime(300);

      expect(vertex.currentState.startSymbolOptions).toEqual([]);
    });

    it("fetches symbols when query has 2+ characters", () => {
      const symbols: SymbolOption[] = [
        { file_path: "src/test.ts", symbol: "test", type: "Function" },
      ];

      graph.dispatch(appActions.setStartSearchQuery("te"));
      vi.advanceTimersByTime(300);
      receivedSymbols$.next(symbols);

      expect(vertex.currentState.startSymbolOptions).toEqual(symbols);
    });

    it("debounces rapid input changes", () => {
      const symbols: SymbolOption[] = [
        { file_path: "src/test.ts", symbol: "test", type: "Function" },
      ];

      graph.dispatch(appActions.setStartSearchQuery("te"));
      graph.dispatch(appActions.setStartSearchQuery("tes"));
      graph.dispatch(appActions.setStartSearchQuery("test"));
      vi.advanceTimersByTime(300);
      receivedSymbols$.next(symbols);

      expect(vertex.currentState.startSymbolOptions).toEqual(symbols);
    });
  });

  describe("endSymbolOptions loader", () => {
    it("returns empty array when query is less than 2 characters", () => {
      graph.dispatch(appActions.setEndSearchQuery("x"));
      vi.advanceTimersByTime(300);

      expect(vertex.currentState.endSymbolOptions).toEqual([]);
    });

    it("fetches symbols when query has 2+ characters", () => {
      const symbols: SymbolOption[] = [
        { file_path: "src/foo.ts", symbol: "foo", type: "Function" },
      ];

      graph.dispatch(appActions.setEndSearchQuery("fo"));
      vi.advanceTimersByTime(300);
      receivedSymbols$.next(symbols);

      expect(vertex.currentState.endSymbolOptions).toEqual(symbols);
    });
  });

  describe("queryResult loader", () => {
    const startNode: SymbolOption = {
      file_path: "src/start.ts",
      symbol: "start",
      type: "Function",
    };
    const endNode: SymbolOption = {
      file_path: "src/end.ts",
      symbol: "end",
      type: "Function",
    };

    it("returns null when no node is selected", () => {
      vi.advanceTimersByTime(200);

      expect(vertex.currentState.queryResult).toBeNull();
    });

    it("fetches dependencies when only startNode is selected", () => {
      const dependenciesResult = "## Graph\nstart --CALLS--> dep1";

      graph.dispatch(appActions.setStartNode(startNode));
      vi.advanceTimersByTime(200);
      receivedDependencies$.next(dependenciesResult);

      expect(vertex.currentState.queryResult).toEqual(dependenciesResult);
    });

    it("fetches dependents when only endNode is selected", () => {
      const dependentsResult = "## Graph\ncaller --CALLS--> end";

      graph.dispatch(appActions.setEndNode(endNode));
      vi.advanceTimersByTime(200);
      receivedDependents$.next(dependentsResult);

      expect(vertex.currentState.queryResult).toEqual(dependentsResult);
    });

    it("fetches pathsBetween when both startNode and endNode are selected", () => {
      const pathsResult = "## Graph\nstart --CALLS--> middle --CALLS--> end";

      graph.dispatch(appActions.setStartNode(startNode));
      graph.dispatch(appActions.setEndNode(endNode));
      vi.advanceTimersByTime(200);
      receivedPaths$.next(pathsResult);

      expect(vertex.currentState.queryResult).toEqual(pathsResult);
    });

    it("returns null when both nodes are cleared", () => {
      graph.dispatch(appActions.setStartNode(startNode));
      vi.advanceTimersByTime(200);
      receivedDependencies$.next("some result");

      graph.dispatch(appActions.clearStartNode());
      vi.advanceTimersByTime(200);

      expect(vertex.currentState.queryResult).toBeNull();
    });

    it("switches to dependencies when endNode is cleared", () => {
      const pathsResult = "## Graph\nstart --CALLS--> end";
      const dependenciesResult = "## Graph\nstart --CALLS--> dep1";

      graph.dispatch(appActions.setStartNode(startNode));
      graph.dispatch(appActions.setEndNode(endNode));
      vi.advanceTimersByTime(200);
      receivedPaths$.next(pathsResult);

      graph.dispatch(appActions.clearEndNode());
      vi.advanceTimersByTime(200);
      receivedDependencies$.next(dependenciesResult);

      expect(vertex.currentState.queryResult).toEqual(dependenciesResult);
    });

    it("switches to dependents when startNode is cleared", () => {
      const pathsResult = "## Graph\nstart --CALLS--> end";
      const dependentsResult = "## Graph\ncaller --CALLS--> end";

      graph.dispatch(appActions.setStartNode(startNode));
      graph.dispatch(appActions.setEndNode(endNode));
      vi.advanceTimersByTime(200);
      receivedPaths$.next(pathsResult);

      graph.dispatch(appActions.clearStartNode());
      vi.advanceTimersByTime(200);
      receivedDependents$.next(dependentsResult);

      expect(vertex.currentState.queryResult).toEqual(dependentsResult);
    });
  });
});

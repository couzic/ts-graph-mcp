import assert from "node:assert";
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
    const symbolA: SymbolOption = {
      file_path: "src/a.ts",
      symbol: "funcA",
      type: "Function",
    };

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

    it("returns empty array when no history and query is less than 2 characters", () => {
      graph.dispatch(appActions.setStartSearchQuery("a"));
      vi.advanceTimersByTime(300);

      expect(vertex.currentState.startSymbolOptions).toEqual([]);
    });

    it("filters out selected startNode from options", () => {
      graph.dispatch(appActions.setStartNode(symbolA));
      graph.dispatch(appActions.setStartSearchQuery("a"));
      vi.advanceTimersByTime(300);

      // symbolA is selected as startNode, so it's filtered out
      expect(vertex.currentState.startSymbolOptions).toEqual([]);
    });

    it("shows unselected history items as options", () => {
      const symbolB: SymbolOption = {
        file_path: "src/b.ts",
        symbol: "funcB",
        type: "Function",
      };
      graph.dispatch(appActions.setStartNode(symbolA));
      graph.dispatch(appActions.setEndNode(symbolB));
      graph.dispatch(appActions.setStartSearchQuery("a"));
      vi.advanceTimersByTime(300);

      // Both are in history, but both are filtered out (A is startNode, B is endNode)
      expect(vertex.currentState.startSymbolOptions).toEqual([]);
    });

    it("shows history items that are not selected in either dropdown", () => {
      const symbolB: SymbolOption = {
        file_path: "src/b.ts",
        symbol: "funcB",
        type: "Function",
      };
      const symbolC: SymbolOption = {
        file_path: "src/c.ts",
        symbol: "funcC",
        type: "Function",
      };
      // Build history: C, B, A
      graph.dispatch(appActions.setStartNode(symbolA));
      graph.dispatch(appActions.setStartNode(symbolB));
      graph.dispatch(appActions.setStartNode(symbolC));
      // Now select A as start and B as end
      graph.dispatch(appActions.setStartNode(symbolA));
      graph.dispatch(appActions.setEndNode(symbolB));
      graph.dispatch(appActions.setStartSearchQuery("x"));
      vi.advanceTimersByTime(300);

      // History is [B, A, C], filtering out A (startNode) and B (endNode) leaves [C]
      expect(vertex.currentState.startSymbolOptions).toEqual([symbolC]);
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
    const symbolA: SymbolOption = {
      file_path: "src/a.ts",
      symbol: "funcA",
      type: "Function",
    };
    const symbolB: SymbolOption = {
      file_path: "src/b.ts",
      symbol: "funcB",
      type: "Function",
    };

    it("returns empty array when no history and query is less than 2 characters", () => {
      graph.dispatch(appActions.setEndSearchQuery("x"));
      vi.advanceTimersByTime(300);

      expect(vertex.currentState.endSymbolOptions).toEqual([]);
    });

    it("filters out selected endNode from options", () => {
      graph.dispatch(appActions.setEndNode(symbolB));
      graph.dispatch(appActions.setEndSearchQuery("x"));
      vi.advanceTimersByTime(300);

      // symbolB is selected as endNode, so it's filtered out
      expect(vertex.currentState.endSymbolOptions).toEqual([]);
    });

    it("shows history items not selected in either dropdown", () => {
      const symbolC: SymbolOption = {
        file_path: "src/c.ts",
        symbol: "funcC",
        type: "Function",
      };
      // Build history
      graph.dispatch(appActions.setStartNode(symbolA));
      graph.dispatch(appActions.setEndNode(symbolB));
      graph.dispatch(appActions.setStartNode(symbolC));
      // Select A as start and B as end
      graph.dispatch(appActions.setStartNode(symbolA));
      graph.dispatch(appActions.setEndNode(symbolB));
      graph.dispatch(appActions.setEndSearchQuery("x"));
      vi.advanceTimersByTime(300);

      // History contains A, B, C. A is startNode, B is endNode, so only C remains
      expect(vertex.currentState.endSymbolOptions).toEqual([symbolC]);
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

  describe("swapNodes action", () => {
    const nodeA: SymbolOption = {
      file_path: "src/a.ts",
      symbol: "funcA",
      type: "Function",
    };
    const nodeB: SymbolOption = {
      file_path: "src/b.ts",
      symbol: "funcB",
      type: "Function",
    };

    it("swaps startNode and endNode when both are selected", () => {
      graph.dispatch(appActions.setStartNode(nodeA));
      graph.dispatch(appActions.setEndNode(nodeB));

      graph.dispatch(appActions.swapNodes());

      expect(vertex.currentState.startNode).toEqual(nodeB);
      expect(vertex.currentState.endNode).toEqual(nodeA);
    });

    it("moves startNode to endNode when only startNode is selected", () => {
      graph.dispatch(appActions.setStartNode(nodeA));

      graph.dispatch(appActions.swapNodes());

      expect(vertex.currentState.startNode).toBeNull();
      expect(vertex.currentState.endNode).toEqual(nodeA);
    });

    it("moves endNode to startNode when only endNode is selected", () => {
      graph.dispatch(appActions.setEndNode(nodeB));

      graph.dispatch(appActions.swapNodes());

      expect(vertex.currentState.startNode).toEqual(nodeB);
      expect(vertex.currentState.endNode).toBeNull();
    });

    it("does nothing when neither node is selected", () => {
      graph.dispatch(appActions.swapNodes());

      expect(vertex.currentState.startNode).toBeNull();
      expect(vertex.currentState.endNode).toBeNull();
    });
  });

  describe("selectionHistory", () => {
    const symbolA: SymbolOption = {
      file_path: "src/a.ts",
      symbol: "funcA",
      type: "Function",
    };
    const symbolB: SymbolOption = {
      file_path: "src/b.ts",
      symbol: "funcB",
      type: "Function",
    };

    it("starts with empty history", () => {
      expect(vertex.currentState.selectionHistory).toEqual([]);
    });

    it("adds startNode to history when selected", () => {
      graph.dispatch(appActions.setStartNode(symbolA));
      expect(vertex.currentState.selectionHistory).toEqual([symbolA]);
    });

    it("adds endNode to history when selected", () => {
      graph.dispatch(appActions.setEndNode(symbolB));
      expect(vertex.currentState.selectionHistory).toEqual([symbolB]);
    });

    it("moves re-selected symbol to front", () => {
      graph.dispatch(appActions.setStartNode(symbolA));
      graph.dispatch(appActions.setEndNode(symbolB));
      graph.dispatch(appActions.setStartNode(symbolA));
      expect(vertex.currentState.selectionHistory).toEqual([symbolA, symbolB]);
    });

    it("adds new selections to the front", () => {
      graph.dispatch(appActions.setStartNode(symbolA));
      graph.dispatch(appActions.setEndNode(symbolB));
      expect(vertex.currentState.selectionHistory).toEqual([symbolB, symbolA]);
    });

    it("limits history to 12 items", () => {
      for (let i = 0; i < 14; i++) {
        graph.dispatch(
          appActions.setStartNode({
            file_path: `src/${i}.ts`,
            symbol: `func${i}`,
            type: "Function",
          })
        );
      }
      expect(vertex.currentState.selectionHistory).toHaveLength(12);
      const firstItem = vertex.currentState.selectionHistory[0];
      assert(firstItem !== undefined);
      expect(firstItem.symbol).toBe("func13");
    });

    it("does not add null selections to history", () => {
      graph.dispatch(appActions.setStartNode(null));
      expect(vertex.currentState.selectionHistory).toEqual([]);
    });
  });
});

import assert from "node:assert";
import { Subject } from "rxjs";
import { createGraph, type Graph, type Vertex } from "verdux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSearchResult, HealthResponse } from "./ApiService.js";
import { appActions, createAppVertexConfig } from "./appVertexConfig.js";
import {
  type GraphEndpoint,
  type SymbolOption,
  symbolToEndpoint,
} from "./SymbolOption.js";

describe("appVertexConfig", () => {
  let graph: Graph;
  let vertex: Vertex<ReturnType<typeof createAppVertexConfig>>;
  let receivedHealth$: Subject<HealthResponse>;
  let receivedSymbols$: Subject<SymbolOption[]>;
  let receivedSearch$: Subject<GraphSearchResult>;
  let receivedTopic$: Subject<GraphSearchResult>;

  beforeEach(() => {
    vi.useFakeTimers();
    receivedHealth$ = new Subject<HealthResponse>();
    receivedSymbols$ = new Subject<SymbolOption[]>();
    receivedSearch$ = new Subject<GraphSearchResult>();
    receivedTopic$ = new Subject<GraphSearchResult>();
    const vertexConfig = createAppVertexConfig({
      apiService: () => ({
        getHealth: () => receivedHealth$,
        searchSymbols: () => receivedSymbols$,
        searchGraph: () => receivedSearch$,
        searchByTopic: (_topic, _maxNodes, _format) => receivedTopic$,
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

  describe("fromSymbolOptions loader", () => {
    const symbolA: SymbolOption = {
      file_path: "src/a.ts",
      symbol: "funcA",
      type: "Function",
    };

    it("becomes loaded after debounce on startup", () => {
      receivedHealth$.next({ status: "ok", ready: true, indexed_files: 0 });

      expect(vertex.currentLoadableState.status).toBe("loading");

      vi.advanceTimersByTime(400);
      expect(vertex.currentLoadableState.status).toBe("loaded");
      expect(vertex.currentState.fromSymbolOptions).toEqual([]);
    });

    it("returns empty array when no history and query is less than 2 characters", () => {
      graph.dispatch(appActions.setFromSearchQuery("a"));
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.fromSymbolOptions).toEqual([]);
    });

    it("filters out selected fromEndpoint from options", () => {
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      graph.dispatch(appActions.setFromSearchQuery("a"));
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.fromSymbolOptions).toEqual([]);
    });

    it("shows unselected history items as options", () => {
      const symbolB: SymbolOption = {
        file_path: "src/b.ts",
        symbol: "funcB",
        type: "Function",
      };
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      graph.dispatch(appActions.setToEndpoint(symbolToEndpoint(symbolB)));
      graph.dispatch(appActions.setFromSearchQuery("a"));
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.fromSymbolOptions).toEqual([]);
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
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolB)));
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolC)));
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      graph.dispatch(appActions.setToEndpoint(symbolToEndpoint(symbolB)));
      graph.dispatch(appActions.setFromSearchQuery("x"));
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.fromSymbolOptions).toEqual([symbolC]);
    });

    it("fetches symbols when query has 2+ characters", () => {
      const symbols: SymbolOption[] = [
        { file_path: "src/test.ts", symbol: "test", type: "Function" },
      ];

      graph.dispatch(appActions.setFromSearchQuery("te"));
      vi.advanceTimersByTime(400);
      receivedSymbols$.next(symbols);

      expect(vertex.currentState.fromSymbolOptions).toEqual(symbols);
    });

    it("debounces rapid input changes", () => {
      const symbols: SymbolOption[] = [
        { file_path: "src/test.ts", symbol: "test", type: "Function" },
      ];

      graph.dispatch(appActions.setFromSearchQuery("te"));
      graph.dispatch(appActions.setFromSearchQuery("tes"));
      graph.dispatch(appActions.setFromSearchQuery("test"));
      vi.advanceTimersByTime(400);
      receivedSymbols$.next(symbols);

      expect(vertex.currentState.fromSymbolOptions).toEqual(symbols);
    });
  });

  describe("toSymbolOptions loader", () => {
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
      graph.dispatch(appActions.setToSearchQuery("x"));
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.toSymbolOptions).toEqual([]);
    });

    it("filters out selected toEndpoint from options", () => {
      graph.dispatch(appActions.setToEndpoint(symbolToEndpoint(symbolB)));
      graph.dispatch(appActions.setToSearchQuery("x"));
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.toSymbolOptions).toEqual([]);
    });

    it("shows history items not selected in either dropdown", () => {
      const symbolC: SymbolOption = {
        file_path: "src/c.ts",
        symbol: "funcC",
        type: "Function",
      };
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      graph.dispatch(appActions.setToEndpoint(symbolToEndpoint(symbolB)));
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolC)));
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      graph.dispatch(appActions.setToEndpoint(symbolToEndpoint(symbolB)));
      graph.dispatch(appActions.setToSearchQuery("x"));
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.toSymbolOptions).toEqual([symbolC]);
    });

    it("fetches symbols when query has 2+ characters", () => {
      const symbols: SymbolOption[] = [
        { file_path: "src/foo.ts", symbol: "foo", type: "Function" },
      ];

      graph.dispatch(appActions.setToSearchQuery("fo"));
      vi.advanceTimersByTime(400);
      receivedSymbols$.next(symbols);

      expect(vertex.currentState.toSymbolOptions).toEqual(symbols);
    });
  });

  describe("queryResult loader", () => {
    const fromEndpoint: GraphEndpoint = {
      kind: "symbol",
      file_path: "src/start.ts",
      symbol: "start",
      type: "Function",
    };
    const toEndpoint: GraphEndpoint = {
      kind: "symbol",
      file_path: "src/end.ts",
      symbol: "end",
      type: "Function",
    };

    const toGraphResult = (result: string): GraphSearchResult => ({
      result,
    });

    it("returns null when no endpoint or topic is specified", () => {
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.queryResult).toBeNull();
    });

    it("fetches dependencies when only fromEndpoint is selected", () => {
      const dependenciesResult = toGraphResult(
        "## Graph\nstart --CALLS--> dep1",
      );

      graph.dispatch(appActions.setFromEndpoint(fromEndpoint));
      vi.advanceTimersByTime(400);
      receivedSearch$.next(dependenciesResult);

      expect(vertex.currentState.queryResult).toEqual(dependenciesResult);
    });

    it("fetches dependents when only toEndpoint is selected", () => {
      const dependentsResult = toGraphResult("## Graph\ncaller --CALLS--> end");

      graph.dispatch(appActions.setToEndpoint(toEndpoint));
      vi.advanceTimersByTime(400);
      receivedSearch$.next(dependentsResult);

      expect(vertex.currentState.queryResult).toEqual(dependentsResult);
    });

    it("fetches pathsBetween when both fromEndpoint and toEndpoint are selected", () => {
      const pathsResult = toGraphResult(
        "## Graph\nstart --CALLS--> middle --CALLS--> end",
      );

      graph.dispatch(appActions.setFromEndpoint(fromEndpoint));
      graph.dispatch(appActions.setToEndpoint(toEndpoint));
      vi.advanceTimersByTime(400);
      receivedSearch$.next(pathsResult);

      expect(vertex.currentState.queryResult).toEqual(pathsResult);
    });

    it("returns null when endpoints are cleared", () => {
      graph.dispatch(appActions.setFromEndpoint(fromEndpoint));
      vi.advanceTimersByTime(400);
      receivedSearch$.next(toGraphResult("some result"));

      graph.dispatch(appActions.clearFromEndpoint());
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.queryResult).toBeNull();
    });

    it("switches to dependencies when toEndpoint is cleared", () => {
      const pathsResult = toGraphResult("## Graph\nstart --CALLS--> end");
      const dependenciesResult = toGraphResult(
        "## Graph\nstart --CALLS--> dep1",
      );

      graph.dispatch(appActions.setFromEndpoint(fromEndpoint));
      graph.dispatch(appActions.setToEndpoint(toEndpoint));
      vi.advanceTimersByTime(400);
      receivedSearch$.next(pathsResult);

      graph.dispatch(appActions.clearToEndpoint());
      vi.advanceTimersByTime(400);
      receivedSearch$.next(dependenciesResult);

      expect(vertex.currentState.queryResult).toEqual(dependenciesResult);
    });

    it("switches to dependents when fromEndpoint is cleared", () => {
      const pathsResult = toGraphResult("## Graph\nstart --CALLS--> end");
      const dependentsResult = toGraphResult("## Graph\ncaller --CALLS--> end");

      graph.dispatch(appActions.setFromEndpoint(fromEndpoint));
      graph.dispatch(appActions.setToEndpoint(toEndpoint));
      vi.advanceTimersByTime(400);
      receivedSearch$.next(pathsResult);

      graph.dispatch(appActions.clearFromEndpoint());
      vi.advanceTimersByTime(400);
      receivedSearch$.next(dependentsResult);

      expect(vertex.currentState.queryResult).toEqual(dependentsResult);
    });

    it("fetches semantic search when topic is submitted", () => {
      const topicResult = toGraphResult("## Symbols matching 'auth'");

      graph.dispatch(appActions.setTopicInput("auth"));
      graph.dispatch(appActions.submitTopic());
      vi.advanceTimersByTime(400);
      receivedTopic$.next(topicResult);

      expect(vertex.currentState.queryResult).toEqual(topicResult);
    });

    it("does not fetch when topic is typed but not submitted", () => {
      graph.dispatch(appActions.setTopicInput("auth"));
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.queryResult).toBeNull();
    });

    it("does not fetch when submitted topic is whitespace only", () => {
      graph.dispatch(appActions.setTopicInput("   "));
      graph.dispatch(appActions.submitTopic());
      vi.advanceTimersByTime(400);

      expect(vertex.currentState.queryResult).toBeNull();
    });
  });

  describe("swapEndpoints action", () => {
    const nodeA: GraphEndpoint = {
      kind: "symbol",
      file_path: "src/a.ts",
      symbol: "funcA",
      type: "Function",
    };
    const nodeB: GraphEndpoint = {
      kind: "symbol",
      file_path: "src/b.ts",
      symbol: "funcB",
      type: "Function",
    };

    it("swaps fromEndpoint and toEndpoint when both are selected", () => {
      graph.dispatch(appActions.setFromEndpoint(nodeA));
      graph.dispatch(appActions.setToEndpoint(nodeB));

      graph.dispatch(appActions.swapEndpoints());

      expect(vertex.currentState.fromEndpoint).toEqual(nodeB);
      expect(vertex.currentState.toEndpoint).toEqual(nodeA);
    });

    it("moves fromEndpoint to toEndpoint when only fromEndpoint is selected", () => {
      graph.dispatch(appActions.setFromEndpoint(nodeA));

      graph.dispatch(appActions.swapEndpoints());

      expect(vertex.currentState.fromEndpoint).toBeNull();
      expect(vertex.currentState.toEndpoint).toEqual(nodeA);
    });

    it("moves toEndpoint to fromEndpoint when only toEndpoint is selected", () => {
      graph.dispatch(appActions.setToEndpoint(nodeB));

      graph.dispatch(appActions.swapEndpoints());

      expect(vertex.currentState.fromEndpoint).toEqual(nodeB);
      expect(vertex.currentState.toEndpoint).toBeNull();
    });

    it("does nothing when neither endpoint is selected", () => {
      graph.dispatch(appActions.swapEndpoints());

      expect(vertex.currentState.fromEndpoint).toBeNull();
      expect(vertex.currentState.toEndpoint).toBeNull();
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

    it("adds symbol endpoint to history when selected", () => {
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      expect(vertex.currentState.selectionHistory).toEqual([symbolA]);
    });

    it("adds toEndpoint symbol to history when selected", () => {
      graph.dispatch(appActions.setToEndpoint(symbolToEndpoint(symbolB)));
      expect(vertex.currentState.selectionHistory).toEqual([symbolB]);
    });

    it("moves re-selected symbol to front", () => {
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      graph.dispatch(appActions.setToEndpoint(symbolToEndpoint(symbolB)));
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      expect(vertex.currentState.selectionHistory).toEqual([symbolA, symbolB]);
    });

    it("adds new selections to the front", () => {
      graph.dispatch(appActions.setFromEndpoint(symbolToEndpoint(symbolA)));
      graph.dispatch(appActions.setToEndpoint(symbolToEndpoint(symbolB)));
      expect(vertex.currentState.selectionHistory).toEqual([symbolB, symbolA]);
    });

    it("limits history to 12 items", () => {
      for (let i = 0; i < 14; i++) {
        graph.dispatch(
          appActions.setFromEndpoint({
            kind: "symbol",
            file_path: `src/${i}.ts`,
            symbol: `func${i}`,
            type: "Function",
          }),
        );
      }
      expect(vertex.currentState.selectionHistory).toHaveLength(12);
      const firstItem = vertex.currentState.selectionHistory[0];
      assert(firstItem !== undefined);
      expect(firstItem.symbol).toBe("func13");
    });

    it("does not add null selections to history", () => {
      graph.dispatch(appActions.setFromEndpoint(null));
      expect(vertex.currentState.selectionHistory).toEqual([]);
    });

    it("does not add query endpoints to history", () => {
      graph.dispatch(
        appActions.setFromEndpoint({ kind: "query", query: "user auth" }),
      );
      expect(vertex.currentState.selectionHistory).toEqual([]);
    });
  });
});

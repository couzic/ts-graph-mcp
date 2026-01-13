import { Suspense, useSyncExternalStore } from "react";
import { appVertex, graph, appActions, OutputFormat, MermaidDirection } from "./graph.js";
import { useVertexState } from "./useVertexState.js";
import { SymbolSelect } from "./SymbolSelect.js";
import { OutputTabs } from "./OutputTabs.js";
import { QueryResults } from "./QueryResults.js";
import { SymbolOption } from "./SymbolOption.js";

type SymbolOptionsField = "startSymbolOptions" | "endSymbolOptions";

const EMPTY_SYMBOL_OPTIONS: SymbolOption[] = [];

/**
 * Hook to subscribe to symbol options without Suspense.
 * Returns empty array while loading to avoid suspending the UI on every keystroke.
 */
const useSymbolOptions = (field: SymbolOptionsField): SymbolOption[] => {
  return useSyncExternalStore(
    (onStoreChange) => {
      const subscription = appVertex.pick([field]).subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => {
      const loadableState = appVertex.currentLoadableState;
      if (loadableState.status !== "loaded") {
        return EMPTY_SYMBOL_OPTIONS;
      }
      return loadableState.state[field];
    }
  );
};

export const App = () => (
  <div style={appContainerStyle}>
    <header style={headerStyle}>
      <h1 style={titleStyle}>ts-graph</h1>
      <Suspense fallback={<span style={healthLoadingStyle}>...</span>}>
        <HealthBadge />
      </Suspense>
    </header>

    <Suspense fallback={<div style={loadingStyle}>Loading...</div>}>
      <MainContent />
    </Suspense>
  </div>
);

const HealthBadge = () => {
  const { health } = useVertexState(appVertex, ["health"]);
  return (
    <span
      style={{
        ...healthBadgeStyle,
        backgroundColor: health.status === "ok" ? "#1a4d1a" : "#4d1a1a",
      }}
    >
      {health.indexed_files} files indexed
    </span>
  );
};

const MainContent = () => {
  // Subscribe to sync slice state only - these never suspend
  const { startNode, endNode, outputFormat, mermaidDirection, maxNodes, startSearchQuery, endSearchQuery } =
    useVertexState(appVertex, [
      "startNode",
      "endNode",
      "outputFormat",
      "mermaidDirection",
      "maxNodes",
      "startSearchQuery",
      "endSearchQuery",
    ]);

  // Symbol options are handled separately to avoid suspending on every keystroke
  const startSymbolOptions = useSymbolOptions("startSymbolOptions");
  const endSymbolOptions = useSymbolOptions("endSymbolOptions");

  const handleStartSearchChange = (query: string) => {
    graph.dispatch(appActions.setStartSearchQuery(query));
  };

  const handleEndSearchChange = (query: string) => {
    graph.dispatch(appActions.setEndSearchQuery(query));
  };

  const handleStartSelect = (option: SymbolOption | null) => {
    graph.dispatch(appActions.setStartNode(option));
  };

  const handleEndSelect = (option: SymbolOption | null) => {
    graph.dispatch(appActions.setEndNode(option));
  };

  const handleClearStart = () => {
    graph.dispatch(appActions.clearStartNode());
  };

  const handleClearEnd = () => {
    graph.dispatch(appActions.clearEndNode());
  };

  const handleSwap = () => {
    graph.dispatch(appActions.swapNodes());
  };

  const handleFormatChange = (format: OutputFormat) => {
    graph.dispatch(appActions.setOutputFormat(format));
  };

  const handleDirectionChange = (direction: MermaidDirection) => {
    graph.dispatch(appActions.setMermaidDirection(direction));
  };

  const handleMaxNodesChange = (value: number) => {
    graph.dispatch(appActions.setMaxNodes(value));
  };

  return (
    <main style={mainStyle}>
      <section style={selectorsStyle}>
        <SymbolSelect
          label="START node"
          value={startNode}
          options={startSymbolOptions}
          searchQuery={startSearchQuery}
          onSearchChange={handleStartSearchChange}
          onSelect={handleStartSelect}
          onClear={handleClearStart}
        />
        <button
          style={swapButtonStyle}
          onClick={handleSwap}
          disabled={startNode === null && endNode === null}
          title="Swap START and END nodes"
        >
          ⇄
        </button>
        <SymbolSelect
          label="END node"
          value={endNode}
          options={endSymbolOptions}
          searchQuery={endSearchQuery}
          onSearchChange={handleEndSearchChange}
          onSelect={handleEndSelect}
          onClear={handleClearEnd}
        />
      </section>

      <section style={outputSectionStyle}>
        <div style={outputControlsStyle}>
          <OutputTabs
            activeFormat={outputFormat}
            onFormatChange={handleFormatChange}
            maxNodes={maxNodes}
            onMaxNodesChange={handleMaxNodesChange}
          />
          {outputFormat === "mermaid" && (
            <DirectionToggle
              direction={mermaidDirection}
              onDirectionChange={handleDirectionChange}
            />
          )}
        </div>
        <Suspense fallback={<ResultsLoading />}>
          <ResultsContent
            outputFormat={outputFormat}
            mermaidDirection={mermaidDirection}
            hasStartNode={startNode !== null}
            hasEndNode={endNode !== null}
          />
        </Suspense>
      </section>
    </main>
  );
};

const ResultsLoading = () => (
  <div style={resultsLoadingStyle}>Loading results...</div>
);

type ResultsContentProps = {
  outputFormat: OutputFormat;
  mermaidDirection: MermaidDirection;
  hasStartNode: boolean;
  hasEndNode: boolean;
};

const ResultsContent = ({ outputFormat, mermaidDirection, hasStartNode, hasEndNode }: ResultsContentProps) => {
  const { queryResult } = useVertexState(appVertex, ["queryResult"]);
  return (
    <QueryResults
      result={queryResult}
      format={outputFormat}
      mermaidDirection={mermaidDirection}
      hasStartNode={hasStartNode}
      hasEndNode={hasEndNode}
    />
  );
};

type DirectionToggleProps = {
  direction: MermaidDirection;
  onDirectionChange: (direction: MermaidDirection) => void;
};

const DirectionToggle = ({ direction, onDirectionChange }: DirectionToggleProps) => (
  <div style={directionToggleStyle}>
    <button
      style={direction === "LR" ? directionButtonActiveStyle : directionButtonStyle}
      onClick={() => onDirectionChange("LR")}
    >
      LR
    </button>
    <button
      style={direction === "TD" ? directionButtonActiveStyle : directionButtonStyle}
      onClick={() => onDirectionChange("TD")}
    >
      TD
    </button>
  </div>
);

const appContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  padding: "1rem",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, sans-serif",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  marginBottom: "1rem",
  paddingBottom: "0.5rem",
  borderBottom: "1px solid #333",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.5rem",
  fontWeight: 600,
};

const healthBadgeStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  padding: "0.25rem 0.5rem",
  borderRadius: "4px",
  color: "#ccc",
};

const healthLoadingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#666",
};

const loadingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  color: "#666",
};

const mainStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  gap: "1rem",
  minHeight: 0,
};

const selectorsStyle: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  flexWrap: "wrap",
};

const outputSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  gap: "0.5rem",
  minHeight: 0,
};

const resultsLoadingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  color: "#666",
};

const outputControlsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
};

const directionToggleStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.25rem",
};

const directionButtonStyle: React.CSSProperties = {
  padding: "0.25rem 0.5rem",
  fontSize: "0.75rem",
  fontWeight: 500,
  backgroundColor: "transparent",
  border: "1px solid #444",
  borderRadius: "3px",
  color: "#888",
  cursor: "pointer",
};

const directionButtonActiveStyle: React.CSSProperties = {
  ...directionButtonStyle,
  backgroundColor: "#333",
  borderColor: "#646cff",
  color: "#fff",
};

const swapButtonStyle: React.CSSProperties = {
  height: 40,
  width: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1.25rem",
  fontWeight: 500,
  backgroundColor: "transparent",
  border: "1px solid #444",
  borderRadius: "4px",
  color: "#888",
  cursor: "pointer",
  alignSelf: "flex-end",
};

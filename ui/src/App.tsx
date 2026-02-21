import { Suspense, useSyncExternalStore } from "react";
import { appVertex, graph, appActions, OutputFormat, MermaidDirection } from "./graph.js";
import { useVertexState } from "./useVertexState.js";
import { SymbolSelect } from "./SymbolSelect.js";
import { OutputTabs } from "./OutputTabs.js";
import { QueryResults } from "./QueryResults.js";
import { SymbolOption, GraphEndpoint } from "./SymbolOption.js";

type SymbolOptionsField = "fromSymbolOptions" | "toSymbolOptions";

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
  const { fromEndpoint, toEndpoint, topicInput, submittedTopic, outputFormat, mermaidDirection, maxNodes, fromSearchQuery, toSearchQuery } =
    useVertexState(appVertex, [
      "fromEndpoint",
      "toEndpoint",
      "topicInput",
      "submittedTopic",
      "outputFormat",
      "mermaidDirection",
      "maxNodes",
      "fromSearchQuery",
      "toSearchQuery",
    ]);

  const fromSymbolOptions = useSymbolOptions("fromSymbolOptions");
  const toSymbolOptions = useSymbolOptions("toSymbolOptions");

  const handleFromSearchChange = (query: string) => {
    graph.dispatch(appActions.setFromSearchQuery(query));
  };

  const handleToSearchChange = (query: string) => {
    graph.dispatch(appActions.setToSearchQuery(query));
  };

  const handleFromSelect = (endpoint: GraphEndpoint | null) => {
    graph.dispatch(appActions.setFromEndpoint(endpoint));
  };

  const handleToSelect = (endpoint: GraphEndpoint | null) => {
    graph.dispatch(appActions.setToEndpoint(endpoint));
  };

  const handleClearFrom = () => {
    graph.dispatch(appActions.clearFromEndpoint());
  };

  const handleClearTo = () => {
    graph.dispatch(appActions.clearToEndpoint());
  };

  const handleSwap = () => {
    graph.dispatch(appActions.swapEndpoints());
  };

  const handleTopicInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    graph.dispatch(appActions.setTopicInput(e.target.value));
  };

  const handleSubmitTopic = () => {
    graph.dispatch(appActions.submitTopic());
  };

  const handleTopicKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmitTopic();
    }
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
      <section style={topicSectionStyle}>
        <label style={topicLabelStyle}>Topic (semantic search)</label>
        <div style={topicRowStyle}>
          <input
            type="text"
            value={topicInput}
            onChange={handleTopicInputChange}
            onKeyDown={handleTopicKeyDown}
            placeholder="e.g., user authentication, validation, database queries..."
            style={topicInputStyle}
          />
          <button onClick={handleSubmitTopic} style={topicSearchButtonStyle}>
            Search
          </button>
        </div>
      </section>

      <section style={selectorsStyle}>
        <SymbolSelect
          label="FROM"
          value={fromEndpoint}
          options={fromSymbolOptions}
          searchQuery={fromSearchQuery}
          onSearchChange={handleFromSearchChange}
          onSelect={handleFromSelect}
          onClear={handleClearFrom}
        />
        <button
          style={swapButtonStyle}
          onClick={handleSwap}
          disabled={fromEndpoint === null && toEndpoint === null}
          title="Swap FROM and TO"
        >
          ⇄
        </button>
        <SymbolSelect
          label="TO"
          value={toEndpoint}
          options={toSymbolOptions}
          searchQuery={toSearchQuery}
          onSearchChange={handleToSearchChange}
          onSelect={handleToSelect}
          onClear={handleClearTo}
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
            hasFromEndpoint={fromEndpoint !== null}
            hasToEndpoint={toEndpoint !== null}
            hasTopic={submittedTopic.trim().length > 0}
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
  hasFromEndpoint: boolean;
  hasToEndpoint: boolean;
  hasTopic: boolean;
};

const ResultsContent = ({ outputFormat, hasFromEndpoint, hasToEndpoint, hasTopic }: ResultsContentProps) => {
  const { queryResult } = useVertexState(appVertex, ["queryResult"]);
  return (
    <QueryResults
      result={queryResult}
      format={outputFormat}
      hasFromEndpoint={hasFromEndpoint}
      hasToEndpoint={hasToEndpoint}
      hasTopic={hasTopic}
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

const topicSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const topicLabelStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#888",
  fontWeight: 500,
};

const topicRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
};

const topicInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  backgroundColor: "#2a2a2a",
  border: "1px solid #444",
  borderRadius: "4px",
  color: "#fff",
  outline: "none",
};

const topicSearchButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  backgroundColor: "#333",
  border: "1px solid #646cff",
  borderRadius: "4px",
  color: "#fff",
  cursor: "pointer",
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

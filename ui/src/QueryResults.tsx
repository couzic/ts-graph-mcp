import type { MermaidDirection, OutputFormat } from "./graph.js";
import { mcpToMermaid } from "./mcpToMermaid.js";
import { MermaidRenderer } from "./MermaidRenderer.js";

type QueryResultsProps = {
  result: string | null;
  format: OutputFormat;
  mermaidDirection: MermaidDirection;
  hasFromEndpoint: boolean;
  hasToEndpoint: boolean;
  hasTopic: boolean;
};

const queryTypeBySelection: Record<string, string> = {
  "from-": "dependenciesOf",
  "-to": "dependentsOf",
  "from-to": "pathsBetween",
  "topic": "semanticSearch",
};

export const QueryResults = ({
  result,
  format,
  mermaidDirection,
  hasFromEndpoint,
  hasToEndpoint,
  hasTopic,
}: QueryResultsProps) => {
  if (!hasFromEndpoint && !hasToEndpoint && !hasTopic) {
    return (
      <div style={emptyStateStyle}>
        <p>Enter a topic for semantic search.</p>
        <p style={hintStyle}>
          Or select FROM to query its dependencies, TO to query its dependents.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div style={emptyStateStyle}>
        <p>Loading...</p>
      </div>
    );
  }

  let queryTypeKey: string;
  if (hasTopic && !hasFromEndpoint && !hasToEndpoint) {
    queryTypeKey = "topic";
  } else {
    queryTypeKey = `${hasFromEndpoint ? "from" : ""}-${hasToEndpoint ? "to" : ""}`;
  }
  const queryType = queryTypeBySelection[queryTypeKey];

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={queryTypeStyle}>{queryType}</span>
        <span style={formatBadgeStyle}>{format.toUpperCase()}</span>
      </div>
      {format === "mermaid" ? (
        <MermaidRenderer syntax={mcpToMermaid(result)} direction={mermaidDirection} />
      ) : (
        <pre style={resultStyle}>{result}</pre>
      )}
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  flex: 1,
  minHeight: 0,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
};

const queryTypeStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#888",
  fontFamily: "monospace",
};

const formatBadgeStyle: React.CSSProperties = {
  fontSize: "0.625rem",
  padding: "0.125rem 0.375rem",
  backgroundColor: "#3a3a3a",
  borderRadius: "3px",
  color: "#aaa",
  fontWeight: 600,
};

const resultStyle: React.CSSProperties = {
  flex: 1,
  margin: 0,
  padding: "1rem",
  backgroundColor: "#1a1a1a",
  color: "#e0e0e0",
  border: "1px solid #333",
  borderRadius: "4px",
  overflow: "auto",
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  fontFamily: "ui-monospace, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const emptyStateStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  color: "#666",
  textAlign: "center",
  gap: "0.5rem",
};

const hintStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#555",
};

import type { MermaidDirection, OutputFormat } from "./graph.js";
import { MermaidRenderer } from "./MermaidRenderer.js";

type QueryResultsProps = {
  result: string | null;
  format: OutputFormat;
  mermaidDirection: MermaidDirection;
  hasStartNode: boolean;
  hasEndNode: boolean;
};

const queryTypeBySelection: Record<string, string> = {
  "start-": "dependenciesOf",
  "-end": "dependentsOf",
  "start-end": "pathsBetween",
};

export const QueryResults = ({
  result,
  format,
  mermaidDirection,
  hasStartNode,
  hasEndNode,
}: QueryResultsProps) => {
  if (!hasStartNode && !hasEndNode) {
    return (
      <div style={emptyStateStyle}>
        <p>Select a START node to query its dependencies.</p>
        <p style={hintStyle}>
          Or select an END node to query its dependents.
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

  const queryTypeKey = `${hasStartNode ? "start" : ""}-${hasEndNode ? "end" : ""}`;
  const queryType = queryTypeBySelection[queryTypeKey];

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={queryTypeStyle}>{queryType}</span>
        <span style={formatBadgeStyle}>{format.toUpperCase()}</span>
      </div>
      {format === "mermaid" ? (
        <MermaidRenderer syntax={result} direction={mermaidDirection} />
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

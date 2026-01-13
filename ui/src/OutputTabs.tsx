import type { OutputFormat } from "./graph.js";

type OutputTabsProps = {
  activeFormat: OutputFormat;
  onFormatChange: (format: OutputFormat) => void;
  maxNodes: number;
  onMaxNodesChange: (value: number) => void;
};

const tabs: { format: OutputFormat; label: string }[] = [
  { format: "mcp", label: "MCP" },
  { format: "mermaid", label: "Mermaid" },
];

const maxNodesOptions = [10, 20, 30, 50, 75, 100, 150, 200];

export const OutputTabs = ({
  activeFormat,
  onFormatChange,
  maxNodes,
  onMaxNodesChange,
}: OutputTabsProps) => {
  return (
    <div style={containerStyle}>
      <div style={tabsContainerStyle}>
        {tabs.map(({ format, label }) => (
          <button
            key={format}
            onClick={() => onFormatChange(format)}
            style={{
              ...tabStyle,
              ...(activeFormat === format ? activeTabStyle : {}),
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={maxNodesContainerStyle}>
        <label style={labelStyle}>Max nodes:</label>
        <select
          value={maxNodes}
          onChange={(e) => onMaxNodesChange(Number(e.target.value))}
          style={selectStyle}
        >
          {maxNodesOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid #444",
  paddingBottom: "0.5rem",
};

const tabsContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.25rem",
};

const tabStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  border: "none",
  borderRadius: "4px 4px 0 0",
  backgroundColor: "transparent",
  color: "#888",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const activeTabStyle: React.CSSProperties = {
  backgroundColor: "#3a3a3a",
  color: "#fff",
  borderBottom: "2px solid #646cff",
};

const maxNodesContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#888",
};

const selectStyle: React.CSSProperties = {
  padding: "0.25rem 0.5rem",
  fontSize: "0.75rem",
  backgroundColor: "#2a2a2a",
  color: "#ccc",
  border: "1px solid #444",
  borderRadius: "4px",
  cursor: "pointer",
};

import type { OutputFormat } from "./graph.js";

type OutputTabsProps = {
  activeFormat: OutputFormat;
  onFormatChange: (format: OutputFormat) => void;
};

const tabs: { format: OutputFormat; label: string }[] = [
  { format: "mcp", label: "MCP" },
  { format: "mermaid", label: "Mermaid" },
];

export const OutputTabs = ({ activeFormat, onFormatChange }: OutputTabsProps) => {
  return (
    <div style={containerStyle}>
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
  );
};

const containerStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.25rem",
  borderBottom: "1px solid #444",
  paddingBottom: "0.5rem",
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

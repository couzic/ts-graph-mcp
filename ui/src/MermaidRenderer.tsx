import mermaid from "mermaid";
import { useEffect, useRef, useState } from "react";
import type { MermaidDirection } from "./graph.js";

type MermaidRendererProps = {
  syntax: string;
  direction: MermaidDirection;
};

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#3a3a3a",
    primaryTextColor: "#e0e0e0",
    primaryBorderColor: "#646cff",
    lineColor: "#888",
    secondaryColor: "#2a2a2a",
    tertiaryColor: "#1a1a1a",
    background: "#1a1a1a",
    mainBkg: "#2a2a2a",
    nodeBorder: "#646cff",
    clusterBkg: "#2a2a2a",
    edgeLabelBackground: "#2a2a2a",
  },
});

export const MermaidRenderer = ({ syntax, direction }: MermaidRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current || !syntax) {
        return;
      }

      try {
        setError(null);
        // Apply direction by replacing graph directive
        const directedSyntax = syntax.replace(/^graph \w+/, `graph ${direction}`);
        // Generate unique ID for each render
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, directedSyntax);
        containerRef.current.innerHTML = svg;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to render diagram";
        setError(message);
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
      }
    };

    renderDiagram();
  }, [syntax, direction]);

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>
          <p>Failed to render diagram:</p>
          <pre style={errorDetailStyle}>{error}</pre>
          <details>
            <summary style={summaryStyle}>Raw mermaid syntax</summary>
            <pre style={syntaxStyle}>{syntax}</pre>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div ref={containerRef} style={diagramStyle} />
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "auto",
  backgroundColor: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: "4px",
  padding: "1rem",
};

const diagramStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  minHeight: "200px",
};

const errorStyle: React.CSSProperties = {
  color: "#ff6b6b",
  padding: "1rem",
};

const errorDetailStyle: React.CSSProperties = {
  backgroundColor: "#2a2a2a",
  padding: "0.5rem",
  borderRadius: "4px",
  overflow: "auto",
  fontSize: "0.8rem",
  whiteSpace: "pre-wrap",
};

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  marginTop: "1rem",
  color: "#888",
};

const syntaxStyle: React.CSSProperties = {
  backgroundColor: "#2a2a2a",
  padding: "0.5rem",
  borderRadius: "4px",
  overflow: "auto",
  fontSize: "0.75rem",
  color: "#888",
  marginTop: "0.5rem",
};

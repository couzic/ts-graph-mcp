import { Suspense } from "react";
import { healthVertex } from "./graph";
import { useVertexState } from "./useVertexState";

export const App = () => (
  <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
    <h1>ts-graph</h1>
    <div
      style={{
        marginTop: "1rem",
        padding: "1rem",
        border: "1px solid #ccc",
        borderRadius: "4px",
      }}
    >
      <h2>Server Health</h2>
      <Suspense fallback={<p>Loading...</p>}>
        <HealthDisplay />
      </Suspense>
    </div>
  </div>
);

const HealthDisplay = () => {
  const { health } = useVertexState(healthVertex, ["health"]);
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      <li>
        Status:{" "}
        <strong style={{ color: health.status === "ok" ? "green" : "red" }}>
          {health.status}
        </strong>
      </li>
      <li>
        Ready: <strong>{health.ready ? "Yes" : "No"}</strong>
      </li>
      <li>
        Indexed files: <strong>{health.indexed_files}</strong>
      </li>
    </ul>
  );
};

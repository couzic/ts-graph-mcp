import { createGraph } from "verdux";
import { appVertexConfig } from "./appVertexConfig.js";

export type { SymbolOption } from "./SymbolOption.js";
export type { OutputFormat, MermaidDirection } from "./appVertexConfig.js";
export { appActions } from "./appVertexConfig.js";
export type { HealthResponse } from "./ApiService.js";

export const graph = createGraph({
  vertices: [appVertexConfig],
});

export const appVertex = graph.getVertexInstance(appVertexConfig);

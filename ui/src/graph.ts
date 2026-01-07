import { createSlice } from "@reduxjs/toolkit";
import { interval, startWith, switchMap } from "rxjs";
import { ajax } from "rxjs/ajax";
import { configureRootVertex, createGraph } from "verdux";

export type HealthResponse = {
  status: string;
  ready: boolean;
  indexed_files: number;
};

const healthSlice = createSlice({
  name: "health",
  initialState: {},
  reducers: {},
});

const healthVertexConfig = configureRootVertex({
  slice: healthSlice,
}).load({
  health: interval(3000).pipe(
    startWith(0),
    switchMap(() => ajax.getJSON<HealthResponse>("/health"))
  ),
});

export const graph = createGraph({
  vertices: [healthVertexConfig],
});

export const healthVertex = graph.getVertexInstance(healthVertexConfig);

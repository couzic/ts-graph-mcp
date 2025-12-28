import { clamp } from "@libs/toolkit";

export interface Config {
  maxItems: number;
  threshold: number;
}

export function validateThreshold(value: number): number {
  return clamp(value, 0, 100);
}

import { step05 } from "../lib/step05.js";

// Store function in variable, then call
export function step04(): string {
  const nextStep = step05;
  return `${nextStep()}-04`;
}

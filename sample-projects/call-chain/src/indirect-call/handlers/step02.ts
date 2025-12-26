import { step03 } from "../core/step03.js";

// Store function in variable, then call
export function step02(): string {
  const nextStep = step03;
  return nextStep() + "-02";
}

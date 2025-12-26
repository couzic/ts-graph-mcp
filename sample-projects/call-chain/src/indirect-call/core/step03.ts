import { step04 } from "../utils/step04.js";

// Store function in variable, then call
export function step03(): string {
  const nextStep = step04;
  return nextStep() + "-03";
}

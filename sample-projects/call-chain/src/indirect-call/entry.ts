import { step02 } from "./handlers/step02.js";

// Store function in variable, then call
export function entry(): string {
  const nextStep = step02;
  return `${nextStep()}-01`;
}

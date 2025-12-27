import { caller } from "./caller.js";
import {
  h01,
  h02,
  h03,
  h04,
  h05,
  h06,
  h07,
  h08,
  h09,
  h10,
  h11,
  h12,
  h13,
  h14,
  h15,
  h16,
  h17,
  h18,
  h19,
  h20,
} from "./helpers.js";

/**
 * Entry point that calls many helpers to create 24+ nodes,
 * triggering contextLines=0 for snippet extraction.
 */
export function entry(): string {
  return [
    caller(),
    h01(),
    h02(),
    h03(),
    h04(),
    h05(),
    h06(),
    h07(),
    h08(),
    h09(),
    h10(),
    h11(),
    h12(),
    h13(),
    h14(),
    h15(),
    h16(),
    h17(),
    h18(),
    h19(),
    h20(),
  ].join("-");
}

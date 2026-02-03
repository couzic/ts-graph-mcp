import { expect, it } from "vitest";
import { extractSymbol } from "./extractSymbol.js";

it(extractSymbol.name, () => {
  expect(extractSymbol("src/utils.ts:Function:formatDate")).toBe("formatDate");
  expect(extractSymbol("src/models/User.ts:Method:User.save")).toBe(
    "User.save",
  );
  expect(extractSymbol("formatDate")).toBe("formatDate"); // no colon
});

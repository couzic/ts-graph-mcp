import { z } from "zod";

export const SymbolQuerySchema = z.object({
  symbol: z.string().describe("Symbol name (e.g., 'formatDate', 'User.save')"),
  file: z.string().optional().describe("Narrow scope to a file"),
  module: z.string().optional().describe("Narrow scope to a module"),
  package: z.string().optional().describe("Narrow scope to a package"),
});

export type SymbolQuery = z.infer<typeof SymbolQuerySchema>;

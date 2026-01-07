import type { Symbol as TsSymbol } from "ts-morph";

/**
 * Follow alias chains to find the actual symbol definition.
 * Handles re-exports like `export * from './other'` and `export { foo } from './other'`.
 *
 * @example
 * // Given: export { clamp } from './helpers'
 * // followAliasChain(clampSymbol) returns the symbol from helpers.ts, not index.ts
 */
export const followAliasChain = (symbol: TsSymbol): TsSymbol => {
  let current = symbol;
  let aliased = current.getAliasedSymbol();

  while (aliased && aliased !== current) {
    current = aliased;
    aliased = current.getAliasedSymbol();
  }

  return current;
};

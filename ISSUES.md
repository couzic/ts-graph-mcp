# Known Issues

Last updated: 2024-12-10

## Must Fix Before Release

*No critical issues - all resolved!*

---

## Resolved Issues

### ~~1. SQL Injection Risk in Filter Builders~~ ✅ FIXED

**Location:** `src/db/sqlite/SqliteReader.ts:73-98`

**Fix Applied:** Refactored `buildEdgeTypeFilter` and `buildModuleFilter` to return a `FilterResult` object containing both SQL fragments with `?` placeholders and a params array. All callers now spread the params into their query execution.

---

### ~~2. Unused Variable in ConfigLoader~~ ✅ FIXED

**Location:** `src/config/ConfigLoader.ts:52`

**Fix Applied:** Auto-fixed by `npm run lint:fix` - unused `e` renamed to `_e`.

---

### ~~3. Formatting Issues~~ ✅ FIXED

**Fix Applied:** Ran `npm run lint:fix` which auto-resolved 33 files with formatting inconsistencies.

---

### ~~4. Fragile Enum Check in NodeExtractors~~ ✅ FIXED

**Location:** `src/ingestion/NodeExtractors.ts:325-326`

**Fix Applied:** Imported `VariableDeclarationKind` from ts-morph and replaced `declarationKind.toString() === "const"` with `declarationKind === VariableDeclarationKind.Const`.

---

## Architectural Limitations

### 5. Cross-Module Edge Resolution

**Status:** Documented, not yet fixed

**Problem:** Edges that cross module boundaries are silently dropped during ingestion.

**Details:** See [EDGE_RESOLUTION.md](./EDGE_RESOLUTION.md) for full design discussion and potential solutions.

**Workaround:** Structure your config so interdependent code is in the same module.

---

## Nice to Have

### 6. Missing JSDoc on Some Exports

**Problem:** A few exported functions lack JSDoc documentation.

**Fix:** Add JSDoc with `@param` and `@returns` for public API functions.

# Test Migration Plan: roundtrip.test.ts → Vertical Slice Tests

This document maps the coverage from `tests/db/integration/roundtrip.test.ts` to the new vertical slice architecture tests. It identifies what must be added before `DbReader.ts`, `SqliteReader.ts`, and `roundtrip.test.ts` can be safely deleted.

## Coverage Classification

### Category A: DB Persistence Layer (NOT covered by MCP tools)

These tests validate database write/read mechanics that MCP tools don't test (MCP tools only read).

| Test | What It Validates | Migration Strategy |
|------|-------------------|-------------------|
| `addNodes/getNodeById: write and read back function node` | Node property serialization (JSON `properties` column) | Move to `src/db/sqlite/SqliteWriter.test.ts` |
| `addNodes/getNodeById: write and read back class node` | Class-specific properties (extends, implements) | Move to `src/db/sqlite/SqliteWriter.test.ts` |
| `addNodes/getNodeById: write and read back variable node` | Variable-specific properties (isConst, variableType) | Move to `src/db/sqlite/SqliteWriter.test.ts` |
| `addNodes/getNodeById: update existing node (upsert)` | Upsert semantics (INSERT OR REPLACE) | Move to `src/db/sqlite/SqliteWriter.test.ts` |
| `addNodes/getNodeById: return null for non-existent` | Edge case handling | Move to `src/db/sqlite/SqliteWriter.test.ts` |
| `addNodes/getNodeById: handle optional properties missing` | Sparse node data serialization | Move to `src/db/sqlite/SqliteWriter.test.ts` |
| `removeFileNodes: add nodes, remove, verify gone` | File-level deletion | Move to `src/db/sqlite/SqliteWriter.test.ts` |
| `removeFileNodes: cascade delete edges` | FK cascade (ON DELETE CASCADE) | Move to `src/db/sqlite/SqliteWriter.test.ts` |
| `clearAll: add data, clear, verify empty` | Full database reset | Move to `src/db/sqlite/SqliteWriter.test.ts` |

**Action Required:** Create `src/db/sqlite/SqliteWriter.test.ts` with these 9 tests.

### Category B: Query Tests (Covered by MCP Tool Tests)

These tests exercise query paths that MCP tools already test. They can be deleted if MCP tool tests have equivalent coverage.

| roundtrip Test | MCP Tool | Equivalent Test File | Coverage Status |
|----------------|----------|---------------------|-----------------|
| `getCallersOf: call chain A→B→C` | `get_callers` | `src/mcp/tools/get-callers/format.test.ts` | ✅ Covered |
| `getCallersOf: respect maxDepth` | `get_callers` | Need to add depth test | ⚠️ Add test |
| `getCalleesOf: call chain A→B→C` | `get_callees` | `src/mcp/tools/get-callees/format.test.ts` | ✅ Covered |
| `getCalleesOf: respect maxDepth` | `get_callees` | Need to add depth test | ⚠️ Add test |
| `searchNodes: glob pattern` | `search_nodes` | `src/mcp/tools/search-nodes/format.test.ts` | ✅ Covered |
| `searchNodes: wildcard (*)` | `search_nodes` | `src/mcp/tools/search-nodes/format.test.ts` | ✅ Covered |
| `searchNodes: filter by type` | `search_nodes` | Need to add filter test | ⚠️ Add test |
| `searchNodes: filter by exported` | `search_nodes` | Need to add filter test | ⚠️ Add test |
| `getFileNodes: retrieve by filePath` | `get_file_symbols` | `src/mcp/tools/get-file-symbols/format.test.ts` | ✅ Covered |
| `getFileNodes: empty for non-existent` | `get_file_symbols` | Need to add empty test | ⚠️ Add test |
| `findNeighbors: distance=1` | `get_neighbors` | `src/mcp/tools/get-neighbors/format.test.ts` | ✅ Covered |
| `findNeighbors: distance=2` | `get_neighbors` | `src/mcp/tools/get-neighbors/format.test.ts` | ✅ Covered |
| `findNeighbors: incoming direction` | `get_neighbors` | `src/mcp/tools/get-neighbors/format.test.ts` | ✅ Covered |
| `findNeighbors: both directions` | `get_neighbors` | `src/mcp/tools/get-neighbors/format.test.ts` | ✅ Covered |
| `findNeighbors: filter by edge types` | `get_neighbors` | NOT in MCP tool (no edgeTypes param) | ❌ Feature gap |
| `findNeighbors: throw if node not found` | `get_neighbors` | Need to add error test | ⚠️ Add test |

### Category C: Edge Handling Tests

| roundtrip Test | Equivalent | Status |
|----------------|------------|--------|
| `addEdges: write edges and verify exist` | Covered by callers/callees tests | ✅ |
| `addEdges: multiple edge types between same nodes` | Need integration test | ⚠️ Add test |
| `addEdges: IMPORTS edge metadata` | Covered by find_path tests | ✅ |

### Category D: Missing Features in MCP Tools

| roundtrip Feature | MCP Tool Status | Action |
|-------------------|-----------------|--------|
| `getTypeUsages()` | NOT exposed as MCP tool | Document as intentionally omitted |
| `edgeTypes` filter in `findNeighbors` | NOT in `get_neighbors` tool | Document as intentionally omitted |

---

## Migration Checklist

### Phase 1: Create SqliteWriter.test.ts (DB Layer Tests)

Create `src/db/sqlite/SqliteWriter.test.ts` with these tests:

```typescript
// Tests to add:
describe("SqliteWriter", () => {
  describe("addNodes", () => {
    it("persists function node with all properties");
    it("persists class node with extends and implements");
    it("persists variable node with isConst and variableType");
    it("updates existing node when adding with same id (upsert)");
    it("handles nodes with optional properties missing");
  });

  describe("addEdges", () => {
    it("persists edges between nodes");
    it("handles multiple edge types between same nodes");
    it("persists IMPORTS edge with metadata");
  });

  describe("removeFileNodes", () => {
    it("removes all nodes for a file");
    it("cascade deletes edges when removing nodes");
  });

  describe("clearAll", () => {
    it("removes all nodes and edges");
  });
});
```

### Phase 2: Add Missing Tests to MCP Tool Test Files

**get-callers/format.test.ts:**
- Add: `formats callers with maxDepth limit`

**get-callees/format.test.ts:**
- Add: `formats callees with maxDepth limit`

**search-nodes/format.test.ts:**
- Already done: `handles complex generic types with commas`
- Already done: `output does not contain redundant type field`
- Add: `filters by node type` (verify query handles filter)
- Add: `filters by exported status`

**get-file-symbols/format.test.ts:**
- Add: `returns empty for non-existent file`

**get-neighbors/format.test.ts:**
- Add: `throws error when center node not found`

### Phase 3: Create Integration Test for Query Functions

Create `src/mcp/tools/integration.test.ts` to test query functions with real database:

```typescript
// Tests to add:
describe("MCP Tool Query Integration", () => {
  // Setup: in-memory DB with test data

  describe("queryCallers", () => {
    it("traverses call chain with maxDepth");
  });

  describe("queryCallees", () => {
    it("traverses call chain with maxDepth");
  });

  describe("querySearchNodes", () => {
    it("filters by nodeType");
    it("filters by exported");
  });

  describe("queryFileNodes", () => {
    it("returns empty array for non-existent file");
  });

  describe("queryNeighbors", () => {
    it("throws error for non-existent center node");
  });
});
```

### Phase 4: Delete Old Files

Once all tests above pass:

1. Delete `tests/db/integration/roundtrip.test.ts`
2. Delete `src/db/DbReader.ts`
3. Delete `src/db/sqlite/SqliteReader.ts`
4. Update documentation references

---

## Summary

| Category | Tests in roundtrip | Action | Effort |
|----------|-------------------|--------|--------|
| DB Persistence | 9 tests | Create SqliteWriter.test.ts | Medium |
| Query Coverage | 16 tests | 8 covered, 6 need additions, 2 feature gaps | Low |
| Edge Handling | 3 tests | 2 covered, 1 needs addition | Low |
| Missing Features | 2 methods | Document as intentional | None |

**Total new tests to write:** ~15 tests across 3 new/modified files
**Estimated effort:** 2-3 hours

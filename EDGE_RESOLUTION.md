# Edge Resolution Design

Last updated: 2024-12-11

## The Problem

When extracting a code graph, we create **edges** between nodes (functions, classes, types, etc.). These edges represent relationships like:
- `CALLS` - function A calls function B
- `IMPORTS` - file A imports from file B
- `USES_TYPE` - function A uses type T
- `IMPLEMENTS` - class A implements interface I

The challenge: **edges reference nodes that may not exist yet**.

### Scenarios Where This Occurs

| Scenario | Example | Current Behavior |
|----------|---------|------------------|
| **Cross-file (same package)** | `a.ts` imports from `b.ts`, but `a.ts` is processed first | ✅ Handled - two-pass within package |
| **External dependencies** | Import from `node:path` or `lodash` | ✅ Handled - edge filtered out |
| **Cross-package (same module)** | Package `core` imports from package `utils` | ✅ Handled - same indexPackage call |
| **Cross-module** | Module A imports from Module B | ⚠️ **Edge silently dropped** |

## Current Solution: Two-Pass Per Package

The current implementation in `Ingestion.ts` uses a two-pass approach:

```
Pass 1: Extract all files in the package → collect nodes and edges in memory
Pass 2: Insert all nodes, then filter edges to only those with valid targets
```

This works because all files within a package (and all packages within a module) are processed in a single `indexPackage` call.

### The Limitation

Edges that cross module boundaries are **silently dropped**. If Module A depends on Module B:

1. Module A is processed → edges to Module B have no targets → **filtered out**
2. Module B is processed → but A's edges are already gone

**We lose valid cross-module relationships.**

## Alternative Approaches

### A. Two-Pass at Project Level

Process all modules in two passes:
1. Extract all nodes from all modules
2. Then extract/insert all edges

**Pros:** Captures all edges correctly
**Cons:**
- High memory usage for large projects
- Major refactor of ingestion architecture
- Can't parallelize module processing

### B. Deferred Edge Table

Insert edges into a "pending edges" table without FK constraints, then resolve after all indexing completes.

```sql
-- During indexing
INSERT INTO pending_edges (source, target, type, ...) VALUES (?, ?, ?, ...);

-- After all modules indexed
INSERT INTO edges
SELECT * FROM pending_edges p
WHERE EXISTS (SELECT 1 FROM nodes WHERE id = p.source)
  AND EXISTS (SELECT 1 FROM nodes WHERE id = p.target);
```

**Pros:** Low memory, works with current architecture
**Cons:**
- Two edge tables to manage
- Still drops edges if target truly doesn't exist (might be desired?)
- Requires post-processing step

### C. Placeholder Nodes for External References

When an edge targets an unknown node, create a placeholder:

```typescript
{
  id: "external:lodash:map",
  name: "map",
  type: "ExternalReference",
  // minimal metadata
}
```

**Pros:** Preserves all relationships, queryable
**Cons:**
- Pollutes node table with external symbols
- Unclear boundaries (what's "our code" vs "external"?)
- Could create many placeholder nodes

### D. Edge-Level Foreign Key Flexibility

Store edges with a `resolved: boolean` flag. Unresolved edges skip FK validation.

**Pros:** Keeps all data, explicit about resolution state
**Cons:**
- Complicates queries (filter by resolved?)
- FK constraints partially defeated

### E. Accept the Limitation (Current)

Document that cross-module edges may be dropped. Recommend users structure their config so related code is in the same module.

**Pros:** Simple, no code changes
**Cons:** Users may be surprised, incomplete graph

## Recommended Path Forward

**Short term:** Document the limitation (this file) and ship the current fix.

**Medium term:** Implement **Option B (Deferred Edge Table)** because:
1. Minimal memory overhead
2. Works with current streaming/per-package architecture
3. Clear semantics - edges are "pending" until final resolution
4. Can report which edges couldn't be resolved (useful diagnostics)

## Impact on Users

Users should be aware:

1. **Structure modules to contain related code** - Code that imports from each other should be in the same module when possible

2. **Cross-module edges are currently dropped** - If you have `moduleA` → `moduleB` dependencies, those edges won't appear in queries

3. **External dependencies never have edges** - Imports from `node_modules` are intentionally excluded (we don't index external code)

## Related Files

- `src/ingestion/Ingestion.ts` - Two-pass implementation
- `src/ingestion/Ingestion.test.ts` - Tests for cross-file and cross-package scenarios
- `src/db/sqlite/Schema.ts` - FK constraints on edges table

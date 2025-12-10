# DbWriter Interface

**File:** `src/db/writer.ts`

**Used by:** Code Ingestion Module

**Purpose:** Write to the code graph (create, update, delete)

---

## Interface Definition

```typescript
import { Node, Edge } from './types';

export interface DbWriter {
  /**
   * Add multiple nodes in a single batch.
   * Uses upsert semantics (insert or update if exists).
   *
   * @param nodes - Array of nodes to add
   * @throws Error on first failure (fail-fast)
   */
  addNodes(nodes: Node[]): Promise<void>;

  /**
   * Add multiple edges in a single batch.
   * Source and target nodes must exist.
   * Uses upsert semantics.
   *
   * @param edges - Array of edges to add
   * @throws Error on first failure (fail-fast)
   */
  addEdges(edges: Edge[]): Promise<void>;

  /**
   * Remove all nodes (and their edges) from a file.
   * Used for incremental re-indexing.
   * Idempotent (no error if file not indexed).
   *
   * @param filePath - Relative file path
   */
  removeFileNodes(filePath: string): Promise<void>;

  /**
   * Clear the entire graph.
   * Removes all nodes and edges.
   *
   * WARNING: Destructive operation.
   */
  clearAll(): Promise<void>;
}
```

---

## Method Summary

| Method | Purpose | Behavior |
|--------|---------|----------|
| `addNodes` | Add/update nodes | Upsert, batch, fail-fast |
| `addEdges` | Add/update edges | Upsert, batch, fail-fast |
| `removeFileNodes` | Remove file's nodes | Cascades to edges, idempotent |
| `clearAll` | Clear entire graph | Destructive |

---

## Behavior Notes

### Upsert Semantics

- `addNodes`: If node with same `id` exists, update it
- `addEdges`: If edge with same `source + target + type` exists, update metadata

### Fail-Fast

- Batch operations throw on first error
- No partial success reporting
- Transaction is rolled back on failure

### Cascade Deletion

- `removeFileNodes` removes:
  - All nodes where `filePath` matches
  - All edges where `source` OR `target` is a removed node

### Idempotent Operations

- `removeFileNodes` on non-existent file: no error
- `clearAll` on empty graph: no error

---

## Usage Examples

### Full Index

```typescript
await dbWriter.clearAll();
const { nodes, edges } = extractFromProject(config);
await dbWriter.addNodes(nodes);
await dbWriter.addEdges(edges);
```

### Incremental Update (File Changed)

```typescript
await dbWriter.removeFileNodes(filePath);
const { nodes, edges } = extractFromFile(filePath);
await dbWriter.addNodes(nodes);
await dbWriter.addEdges(edges);
```

### File Deleted

```typescript
await dbWriter.removeFileNodes(filePath);
```

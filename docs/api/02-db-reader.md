# DbReader Interface

**File:** `src/db/reader.ts`

**Used by:** MCP Server Module

**Purpose:** Query the code graph (read-only operations)

---

## Interface Definition

```typescript
import { Node, Edge, Path, SearchFilters, TraversalOptions, NeighborOptions, Subgraph } from './types';

export interface DbReader {
  /**
   * Find all functions/methods that call the target.
   * Traverses the call graph in reverse.
   *
   * @param targetId - Node ID of the function/method being called
   * @param options - Traversal options (maxDepth, filters)
   * @returns Array of caller nodes
   */
  getCallersOf(targetId: string, options?: TraversalOptions): Promise<Node[]>;

  /**
   * Find all functions/methods that the source calls.
   * Traverses the call graph forward.
   *
   * @param sourceId - Node ID of the calling function/method
   * @param options - Traversal options (maxDepth, filters)
   * @returns Array of callee nodes
   */
  getCalleesOf(sourceId: string, options?: TraversalOptions): Promise<Node[]>;

  /**
   * Find all locations where a type is used.
   * Includes parameters, return types, variable declarations.
   *
   * @param typeId - Node ID of the type (Interface/TypeAlias/Class)
   * @param options - Traversal options
   * @returns Array of nodes that use the type
   */
  getTypeUsages(typeId: string, options?: TraversalOptions): Promise<Node[]>;

  /**
   * Impact analysis: find all code affected by changes to target.
   * Traverses dependencies in reverse (what depends on this?).
   *
   * @param nodeId - Node ID to analyze impact for
   * @param options - Traversal options (maxDepth for transitive deps)
   * @returns Array of impacted nodes
   */
  getImpactedBy(nodeId: string, options?: TraversalOptions): Promise<Node[]>;

  /**
   * Find the shortest path between two nodes.
   *
   * @param sourceId - Starting node ID
   * @param targetId - Ending node ID
   * @returns Path object or null if no path exists
   */
  getPathBetween(sourceId: string, targetId: string): Promise<Path | null>;

  /**
   * Search nodes by name pattern.
   * Supports glob patterns (*, ?).
   *
   * @param pattern - Search pattern (e.g., "handle*", "User*Service")
   * @param filters - Optional filters (nodeType, module, package, exported)
   * @returns Array of matching nodes
   */
  searchNodes(pattern: string, filters?: SearchFilters): Promise<Node[]>;

  /**
   * Get a single node by ID.
   *
   * @param nodeId - Node ID
   * @returns Node or null if not found
   */
  getNodeById(nodeId: string): Promise<Node | null>;

  /**
   * Get all nodes in a file.
   *
   * @param filePath - Relative file path
   * @returns Array of nodes in the file
   */
  getFileNodes(filePath: string): Promise<Node[]>;

  /**
   * Find all nodes within a given distance from a center node.
   * Returns a subgraph containing the neighborhood.
   *
   * @param centerId - Node ID of the center node
   * @param options - Neighbor traversal options (distance, direction, edgeTypes)
   * @returns Subgraph with center, nodes, and edges
   */
  findNeighbors(centerId: string, options: NeighborOptions): Promise<Subgraph>;
}
```

---

## Method Summary

| Method | Purpose | Returns |
|--------|---------|---------|
| `getCallersOf` | Find what calls a function | `Node[]` |
| `getCalleesOf` | Find what a function calls | `Node[]` |
| `getTypeUsages` | Find where a type is used | `Node[]` |
| `getImpactedBy` | Impact analysis | `Node[]` |
| `getPathBetween` | Find path between nodes | `Path \| null` |
| `searchNodes` | Search by pattern | `Node[]` |
| `getNodeById` | Get single node | `Node \| null` |
| `getFileNodes` | Get all nodes in file | `Node[]` |
| `findNeighbors` | Get subgraph around a node | `Subgraph` |

---

## MCP Tool Mapping

| MCP Tool | DbReader Method |
|----------|-----------------|
| `get_callers_of` | `getCallersOf()` |
| `get_callees_of` | `getCalleesOf()` |
| `get_type_usages` | `getTypeUsages()` |
| `get_impacted_by` | `getImpactedBy()` |
| `get_path_between` | `getPathBetween()` |
| `search_nodes` | `searchNodes()` |
| `find_neighbors` | `findNeighbors()` |

---

## Behavior Notes

- All methods return empty arrays/null for non-existent nodes (no errors)
- Traversal respects `maxDepth` option (default: unlimited)
- Pattern search supports glob: `*` (any chars), `?` (single char)
- All operations are read-only

---

## findNeighbors Details

### Use Cases

1. **LLM Context** - Provide relevant graph context around a code element
2. **User Visualization** - Render Mermaid diagram in UI
3. **Impact Preview** - Show what's "nearby" before making changes

### Traversal Behavior

| Direction | Meaning |
|-----------|---------|
| `outgoing` | Follow edges FROM center (A→B means B is neighbor of A) |
| `incoming` | Follow edges TO center (A→B means A is neighbor of B) |
| `both` | Follow edges in either direction |

### Mermaid Formatting

| Node Type | Format | Example |
|-----------|--------|---------|
| Function | `name()` | `createOrder()` |
| Method | `name()` | `validate()` |
| Class | `name` | `UserService` |
| Interface | `name` | `User` |
| TypeAlias | `name` | `UserId` |
| Variable | `name` | `config` |
| File | `name` | `utils.ts` |
| Property | `name` | `email` |

| Edge Type | Mermaid Label |
|-----------|---------------|
| `CALLS` | `calls` |
| `IMPORTS` | `imports` |
| `CONTAINS` | `contains` |
| `IMPLEMENTS` | `implements` |
| `EXTENDS` | `extends` |
| `USES_TYPE` | `uses type` |
| `READS_PROPERTY` | `reads` |
| `WRITES_PROPERTY` | `writes` |

### Example Usage

```typescript
import { subgraphToMermaid } from './SubgraphToMermaid';

// Get call graph neighborhood (distance 2, outgoing calls only)
const callGraph = await reader.findNeighbors('src/api.ts:handleRequest', {
  distance: 2,
  direction: 'outgoing',
  edgeTypes: ['CALLS']
});

// Get type dependencies (both directions)
const typeGraph = await reader.findNeighbors('src/types.ts:User', {
  distance: 1,
  direction: 'both',
  edgeTypes: ['USES_TYPE', 'IMPLEMENTS', 'EXTENDS']
});

// Render for user
console.log(subgraphToMermaid(typeGraph, { direction: 'TD' }));
```

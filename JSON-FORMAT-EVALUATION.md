# Evaluation: JSON Structured Format for Dependency Graph Output

## Executive Summary

The proposed JSON format is **architecturally misaligned** with how ts-graph-mcp's tools are designed to integrate with AI agent workflows. While JSON is easier for machines to parse, it creates **critical friction points** in the current system that would require architectural changes across multiple layers.

**Recommendation: Keep the current hierarchical text format** (with targeted improvements for specific gaps).

---

## The Proposal

```json
{
  "query": { "file": "src/utils.ts", "symbol": "formatDate" },
  "results": [
    { "file": "src/orderService.ts", "symbol": "createOrder", "depth": 1 },
    { "file": "src/controller.ts", "symbol": "handleOrder", "depth": 2, "via": "createOrder" },
    { "file": "src/reportService.ts", "symbol": "generateReport", "depth": 1 }
  ]
}
```

---

## Critical Issues

### 1. **The Read Tool Integration Problem** (BLOCKING)

The current text format includes metadata that the Read tool requires:

```
target:
  name: formatDate
  type: Function
  file: src/utils.ts
  offset: 15        # <-- Required by Read tool
  limit: 6          # <-- Required by Read tool
```

**Why this matters**: The agent workflow is:
1. Get dependency graph (current tool)
2. **Jump to specific result** → Use Read tool with `offset`/`limit`
3. Inspect/edit code

The JSON proposal **omits `offset` and `limit`** entirely, breaking step 2. The agent would either:
- Re-query the database to find offset/limit
- Ask for a separate tool call to get this metadata
- Fall back to less precise file:symbol resolution

This creates a **two-hop penalty** that contradicts the design philosophy that "output should match downstream tool input signature with zero transformation."

**Cost to fix**: Would require adding offset/limit to every result, making the JSON structure more complex:
```json
{
  "file": "src/orderService.ts",
  "symbol": "createOrder",
  "depth": 1,
  "offset": 42,    # Added
  "limit": 8,      # Added
  "type": "Function"  # Also needed for formatting
}
```

---

### 2. **Flat vs Hierarchical Data Flattening** (DESIGN MISMATCH)

The JSON proposal flattens the hierarchy. Current text format:

```
callers[42]:

src/api/handler.ts (3 callers):
  functions[2]:
    handleRequest [10-25] async (req:Request) → Response
      offset: 10, limit: 16
    validateInput [30-35] (data:unknown) → boolean
      offset: 30, limit: 6
  methods[1]:
    ApiClient.fetch [40-50] private async (url:string) → Promise<Data>
      offset: 40, limit: 11

src/services/UserService.ts (2 callers):
  ...
```

JSON would be:
```json
{
  "results": [
    {
      "file": "src/api/handler.ts",
      "symbol": "handleRequest",
      "type": "Function",
      "depth": 1,
      ...
    },
    {
      "file": "src/api/handler.ts",
      "symbol": "validateInput",
      "type": "Function",
      "depth": 1,
      ...
    },
    {
      "file": "src/api/handler.ts",
      "symbol": "ApiClient.fetch",
      "type": "Method",
      "depth": 1,
      ...
    },
    {
      "file": "src/services/UserService.ts",
      ...
    }
  ]
}
```

**Problem**: The agent loses **organizational context**:
- Can't see that 3 callers come from the same file
- Can't group by symbol type (functions vs methods)
- Loses the **visual structure** that helps humans (and LLMs) understand density

**At 50+ nodes**, this becomes critical:
- Agent must manually reconstruct the file/type grouping
- Hard to spot when most impact is concentrated in a few files
- Harder to form mental models of the dependency pattern

**Example**: Current format immediately shows you "80% of callers in src/api/handler.ts". JSON requires scanning all 50 records.

---

### 3. **Snippet Integration Failure**

Current format with small caller counts (<15):

```
src/api/handler.ts (1 caller):
  functions[1]:
    handleRequest [10-25] async (req:Request) → Response
      offset: 10, limit: 16
      call at line 18:
        const date = formatDate(req.timestamp);
        if (date) {
          response.headers.set("X-Date", date);
```

JSON proposal offers **no place** for snippets without significant expansion. Would need:

```json
{
  "file": "src/api/handler.ts",
  "symbol": "handleRequest",
  "snippets": [
    {
      "line": 18,
      "code": "const date = formatDate(req.timestamp);\nif (date) {\n  response.headers.set(\"X-Date\", date);"
    }
  ]
}
```

This makes JSON **verbose** for small counts (~15 callers) where snippets are shown, while offering no benefit.

---

### 4. **Verbosity at Scale** (FAILURE MODE)

At 100+ nodes, compare:

**Text format size**: ~8-12 KB (hierarchical with grouping)
```
src/api/ (18 callers):
  functions[12]:
    ...
  methods[6]:
    ...
src/services/ (15 callers):
  ...
```

**JSON size**: ~15-20 KB (repeated file/type strings)
```json
[
  { "file": "src/api/handler.ts", "symbol": "...", "type": "Function", ... },
  { "file": "src/api/handler.ts", "symbol": "...", "type": "Function", ... },
  { "file": "src/api/handler.ts", "symbol": "...", "type": "Function", ... },
  ...
]
```

**For LLMs**: Token cost increases by ~50-80% for JSON (repeated keys + punctuation + longer structure).

**Impact**: At 100+ impacted nodes (analyzeImpact tool), this becomes a real bottleneck.

---

### 5. **The Missing `via` Path Problem**

Your proposal includes `"via": "createOrder"` to show transitive paths. This is underspecified:

```json
{
  "symbol": "handleOrder",
  "depth": 2,
  "via": "createOrder"  // Path from source → ? → createOrder → handleOrder?
}
```

**Questions**:
- Is "via" a single step or the entire chain?
- At depth 3+, does "via" show intermediate symbols or just the immediate predecessor?
- How does "via" scale to 50+ transitive results?

The current text format avoids this by **not showing individual paths** (for large results). Instead:
- Shows counts (how many transitive callers)
- Groups by depth tier (direct vs transitive)
- Lets agent use findPaths for detailed routing

This is the right **complexity budget decision**.

---

## What JSON Does Well

### 1. **Parsing for Metadata Extraction**

If the agent needs to ask: "How many direct callers?", JSON is easier:

```javascript
const direct = results.filter(r => r.depth === 1).length;
```

vs text parsing.

**But**: The current tool already includes this summary:
```
callers[42]:  // <-- count is here
```

### 2. **Machine Regeneration/Transformation**

If you wanted to transform output to other formats (Markdown tables, Mermaid diagrams), JSON is easier.

**But**: This is a one-time need, not a primary workflow. Format diversity isn't worth the integration cost.

### 3. **Consistency Across Tools**

All tools could output the same structure, making agent code simpler.

**But**: Tools have different shapes:
- `incomingCallsDeep`: flat list of symbols
- `analyzeImpact`: grouped by edge type + depth tier
- `findPaths`: list of paths (different structure entirely)

One format doesn't fit all.

---

## What the Current Text Format Does Well

### 1. **Read Tool Integration** (CRITICAL)

```
offset: 10, limit: 16  # Direct match to Read tool parameters
```

### 2. **Hierarchical Context**

```
src/api/handler.ts (3 callers):
  functions[2]:
    validateInput [...]
```

Immediately shows:
- Concentration
- Types involved
- Proximity

### 3. **Scalability Without Explosion**

With 100 results grouped by file:
```
src/api/ (18): ...
src/services/ (15): ...
src/models/ (12): ...
```

vs 100 flat JSON records.

### 4. **Human-Readable Summary**

Agents can scan headers quickly:
```
callers[42]:              # Total
  direct: 12
  transitive: 30
  max_depth: 5

  by_relationship:
    callers: 28 (3 direct)
    type_users: 8 (1 direct)
```

---

## The Deeper Question: Is JSON Even For Agents?

**Current design principle** (from CLAUDE.md):

> Output should match the input signature of downstream tools with zero transformation.

This is **text-based** by necessity:
- Read tool takes file/offset/limit (text coordinates)
- MCP results are text responses
- Agents parse text with regex/substring matching

Switching to JSON means:
- Tool output is JSON
- Agent deserializes JSON
- Agent re-serializes to pass to Read tool
- Read tool consumes text

**This adds a transformation step**, violating the principle.

---

## Targeted Improvements to Current Format

Instead of wholesale JSON conversion, fix real gaps:

### 1. **Explicit Summary Section** (for metadata extraction)

Add a machine-readable summary:
```
summary:
  total: 42
  direct: 12
  transitive: 30
  max_depth: 5
  by_file:
    src/api/handler.ts: 3
    src/services/UserService.ts: 2
```

**Why**: Easier for agents to extract aggregate stats without parsing the full structure.

### 2. **Edge Type Labels in Results** (for impactAnalysis)

Current format shows impact grouped by edge type. Make it explicit per-node:

```
handleRequest [10-25] async (req:Request) → Response
  offset: 10, limit: 16
  relationship: CALLS (direct)
```

### 3. **Normalized Newline Breaks**

Current format has inconsistent whitespace. Standardize:
```
# Consistent: blank line separates sections
target:
  ...

callers[42]:

src/api/handler.ts (3 callers):
```

### 4. **Path Notation for Complex Dependencies**

For findPaths with multiple results, be explicit:
```
[1] path via: formatDate --CALLS--> process --CALLS--> saveData
[2] path via: formatDate --REFERENCES--> validate --CALLS--> saveData
```

---

## Failure Mode Analysis: 50+ Nodes

| Scenario | Text Format | JSON Format |
|----------|-------------|------------|
| **Agent needs offset/limit** | Direct (offset: X) | Missing; requires re-query |
| **Agent wants file distribution** | Grouped headers | Manual scanning/grouping |
| **Agent sees concentration** | Hierarchy shows density | Flat list hides patterns |
| **Token cost at 100 nodes** | ~8-12 KB | ~15-20 KB (+50-80%) |
| **Snippet inclusion** | Natural (indented blocks) | Awkward (nested arrays) |
| **Summary stats** | Built-in headers | Requires post-processing |

---

## Recommendation

### Keep the Current Format

**Rationale**:
1. Integrates with Read tool (offset/limit)
2. Preserves hierarchical context
3. Scales efficiently
4. Includes snippets naturally
5. Matches design philosophy (zero transformation)

### Apply Targeted Improvements

1. Add explicit `summary:` section with counts
2. Add edge type labels to results (for analyzeImpact)
3. Standardize whitespace/structure
4. Improve path notation in findPaths output

### If JSON Is Required

Create a **separate optional output format** (not replacement):
```typescript
// Tool parameter: outputFormat: "text" | "json" (default: "text")
// When outputFormat: "json", return structured data

interface CallersResult {
  query: SymbolQuery;
  summary: {
    total: number;
    direct: number;
    transitive: number;
    maxDepth: number;
  };
  results: Array<{
    file: string;
    symbol: string;
    type: NodeType;
    offset: number;
    limit: number;
    depth: number;
    entryEdgeType?: EdgeType;
  }>;
}
```

**But**: This requires:
- Tool parameter schema changes (MCP interface change)
- Dual output formatting code
- Documentation for two formats
- Agent decision-making (which format to use)

**Cost-benefit**: Only worthwhile if evidence shows agents struggle with text parsing.

---

## Conclusion

The proposal **looks simpler on the surface** but creates friction at critical integration points:
- Read tool workflow breaks
- Hierarchical context is lost
- Scales worse at high node counts
- Violates the "zero transformation" design principle

The current hierarchical text format is **optimized for the actual workflow** that agents follow in ts-graph-mcp.

Better to make **surgical improvements** (summary section, edge type labels) than wholesale format replacement.

---

## Appendix: How Agents Actually Use This Data

### Workflow 1: Find Impacted Code

```
Agent: analyze impact of formatDate
  ↓
get analyzeImpact(symbol: "formatDate")
  ↓
[Text result with hierarchical structure]
  ↓
Agent: "I see src/api/handler.ts has most callers"
  ↓
Agent: Read(file: "src/api/handler.ts", offset: 10, limit: 25)
  ↓
[Source code]
  ↓
Agent: Continue analysis
```

With JSON, step 3-4 breaks because offset/limit are missing.

### Workflow 2: Trace Data Flow

```
Agent: find paths from input validation to database
  ↓
get findPaths(from: "validate", to: "queryDB")
  ↓
[Paths shown as chains]
  ↓
Agent: "Here's the path: validate → sanitize → queryDB"
  ↓
Agent: Trace each step with Read tool using provided offset/limit
```

Text format shows paths naturally. JSON path notation (`via`) is ambiguous.

### Workflow 3: Assess Risk

```
Agent: "If I change this function, what breaks?"
  ↓
get analyzeImpact(symbol: "changeMe")
  ↓
[Grouped by relationship type + depth]
  ↓
Agent: "5 direct callers, 30 transitive callers - manageable"
  ↓
Agent reads summary
```

Text format's hierarchical grouping is **essential** here. JSON requires agent to manually count.

---

**Document prepared for: Evaluation of JSON output format for ts-graph-mcp tools**

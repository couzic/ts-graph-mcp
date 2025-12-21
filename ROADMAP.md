# ts-graph-mcp Roadmap

> **The Vision:** ts-graph-mcp provides **graph-based code analysis** that complements LSP — transitive traversals, impact analysis, and architectural queries that point-to-point LSP tools cannot offer.

---

## Deprecation: LSP Overlap

Claude Code 2.0.74+ includes a built-in LSP tool with `documentSymbol`, `workspaceSymbol`, `incomingCalls`, and `outgoingCalls`. This creates overlap with some ts-graph-mcp features.

### Deprecated Tools

| Tool | LSP Equivalent | Status |
|------|----------------|--------|
| `get_file_symbols` | `documentSymbol` | **REMOVED** (deleted in API redesign) |

### Retained (Unique Value)

These 5 tools remain because they offer capabilities LSP lacks:

| Tool | Unique Value | LSP Cannot Do This |
|------|--------------|-------------------|
| `incomingCallsDeep` | **Transitive** (maxDepth=N) | LSP `incomingCalls` is single-hop only |
| `outgoingCallsDeep` | **Transitive** (maxDepth=N) | LSP `outgoingCalls` is single-hop only |
| `analyzeImpact` | **Impact analysis** across all edge types | No LSP equivalent |
| `findPath` | **Path finding** between symbols | No LSP equivalent |
| `getNeighborhood` | **Subgraph extraction** + Mermaid diagrams | No LSP equivalent |

---

## Quick Wins: MCP Tool Quality

These improvements have the highest value-to-effort ratio. They improve AI agent experience with minimal code changes.

### Expose Hidden Parameters (analyzeImpact)
**Impact: High | Effort: Very Low**

The `analyze-impact` query.ts already supports `edgeTypes` and `moduleFilter` options, but they're not exposed in the MCP interface. Wire them through.

```typescript
// Enables targeted impact analysis
analyzeImpact({ symbol: "processData", edgeTypes: ["CALLS"] })        // Only call-chain impact
analyzeImpact({ symbol: "User", edgeTypes: ["USES_TYPE"] })           // Only type usage impact
analyzeImpact({ symbol: "formatDate", moduleFilter: "api" })          // Impact within module
```

### Result Limits (getNeighborhood)
**Impact: High | Effort: Low**

Broad queries can return thousands of results, wasting tokens. Future enhancement: add default limits with truncation warnings.

```typescript
// Future: Output when truncated for large neighborhoods
"Neighborhood results (showing 100 of 342 nodes)
⚠️ Results truncated. Reduce distance or use direction filtering."
```

### Improve Tool Descriptions
**Impact: Medium | Effort: Very Low**

The MCP tool definitions (in `src/tools/*/handler.ts`) have quality gaps that reduce discoverability for AI agents:

**Issues identified:**

| Problem | Example | Fix |
|---------|---------|-----|
| **Redundant descriptions** | `incomingCallsDeep`: "Find all functions/methods that call the target. Returns nodes that call the specified function/method." | Remove redundant second sentence |
| **Missing output format hints** | No descriptions mention the hierarchical text format | Add: "Returns hierarchical text grouped by file" |
| **Unclear direction semantics** | `getNeighborhood` `direction` param just says "outgoing/incoming/both" | Add: "outgoing = edges where node is source, incoming = edges where node is target" |

**Affected files:**
- `src/tools/incoming-calls-deep/handler.ts` - redundant description
- `src/tools/outgoing-calls-deep/handler.ts` - redundant description
- `src/tools/get-neighborhood/handler.ts` - unclear direction param
- All 5 tools - missing output format hints

### Error Messages with Example Syntax
**Impact: Medium | Effort: Very Low**

When symbol resolution fails (not found or ambiguous), error messages tell the user *what* to do but not *how*. Adding example syntax reduces friction.

**Current:**
```
Narrow your query with: file, module, or package parameter
```

**Improved:**
```
Narrow your query with file, module, or package:
  { symbol: "formatDate", file: "src/utils/date.ts" }
  { symbol: "formatDate", module: "core" }
```

**Affected file:** `src/tools/shared/errorFormatters.ts`


---

## Near-term Enhancements

### File Watcher (Phase 7)
**Impact: High | Effort: Medium**

Auto-reindex files on save for real-time accuracy.

- Watch for file changes using chokidar (already a dependency)
- Debounce rapid changes
- Incremental updates - only reparse changed files
- 10x faster updates compared to full reindex

### CLI Tool
**Impact: Medium | Effort: Low**

Developer-friendly command-line interface.

```bash
# Quick queries from terminal
ts-graph search "extract*"
ts-graph callers formatDate --file src/utils.ts
ts-graph impact Node --module db --depth 3

# Export for visualization
ts-graph export --format neo4j
ts-graph export --format mermaid > architecture.md
```

### Database Backend Abstraction
**Impact: High | Effort: Medium**

Enable swapping SQLite for graph databases like Neo4j or Memgraph.

**Current state:**
- SQLite is the only implementation
- `DbWriter` interface exists for writes
- Query logic is embedded in each tool's `query.ts` using SQLite-specific recursive CTEs

**Target state:**
- Abstract query logic into a `DbReader` interface
- Implement for SQLite (current) and graph databases
- Graph databases use native traversal instead of recursive CTEs

**Why graph databases?**
- **Neo4j** - Industry standard, mature ecosystem, great tooling
- **Memgraph** - Optimized for real-time queries, excellent for large codebases
- Native graph traversal is more efficient for deep queries (no CTE recursion limits)

**Migration path:**
1. Define `DbReader` interface matching current query patterns
2. Extract SQLite queries into `SqliteReader` implementation
3. Add Neo4j/Memgraph implementation
4. Configuration switch for storage backend type

### Simplified Single-Module Configuration
**Impact: High | Effort: Low**

Zero-boilerplate config for non-monorepo projects.

The current config requires explicit module/package nesting even for simple single-package projects. Most TypeScript projects aren't monorepos and shouldn't need this overhead.

**Config changes:**
- Support minimal config with just `tsconfig` path
- Infer implicit "main" module when none specified
- Keep full module/package syntax for monorepos

```typescript
// Before: verbose for simple projects
defineConfig({
  modules: [{
    name: "main",
    packages: [{ name: "core", tsconfig: "./tsconfig.json" }]
  }]
})

// After: zero boilerplate
defineConfig({
  tsconfig: "./tsconfig.json"
})
```

**MCP output changes:**
- Omit module/package from output when there's only one implicit module
- Cleaner, less noisy results for AI agents
- Backwards compatible - explicit modules still show full metadata

## Advanced Analysis

### Dead Code Detection
**Impact: High | Effort: Medium**

Find unreachable functions and unused exports.

- Query for nodes with no incoming CALLS edges
- Exclude entry points (main, exported API)
- Generate cleanup reports
- Integration with CI for regression detection

### Circular Dependency Detection
**Impact: High | Effort: Low**

Find import cycles that hurt architecture.

- Detect cycles using graph traversal
- Report shortest cycle path
- Suggest where to break cycles
- Module-level and file-level analysis

### Complexity Metrics
**Impact: Medium | Effort: Medium**

Code quality insights from graph structure.

- **Fan-out** - Functions that call too many others
- **Fan-in** - Functions called from too many places (fragile)
- **Depth** - Deep call chains (hard to debug)
- **Coupling** - Modules that are too interconnected

### Module Boundary Analysis
**Impact: High | Effort: Medium**

Architecture enforcement through graph analysis.

- Define allowed dependencies between modules
- Detect violations automatically
- Visualize actual vs. intended architecture
- CI integration for architecture tests

## AI Agent Superpowers

### Semantic Search
**Impact: Very High | Effort: High**

Natural language queries over code structure.

```
"Find error handling code"
"Where do we validate user input?"
"Show me the authentication flow"
```

- Embed node descriptions and code snippets
- Vector similarity search
- Combine with graph traversal for context

### Change Suggestion
**Impact: Very High | Effort: High**

AI-guided development decisions.

```
"Best place to add rate limiting?"
→ Analyzes call graph, suggests middleware layer

"Where should this new feature go?"
→ Finds similar patterns, suggests module
```

### Test Coverage Mapping
**Impact: High | Effort: Medium**

Connect code to its tests.

- Link test files to implementation files
- Track which functions have test coverage
- Identify untested code paths
- Suggest what needs testing after changes

### Documentation Generation
**Impact: High | Effort: Medium**

Living documentation from code structure.

- Auto-generate module READMEs
- Architecture diagrams that stay current
- API documentation from types
- Dependency graphs per module

## Multi-language Support

### JavaScript/JSX
**Impact: Very High | Effort: Low**

Same TypeScript parser handles JS.

- Configure for .js/.jsx files
- Handle dynamic typing gracefully
- React component detection

### Python
**Impact: Very High | Effort: High**

Second most popular language for AI tools.

- AST parsing with tree-sitter
- Handle dynamic typing
- Django/FastAPI framework awareness

### Go
**Impact: High | Effort: High**

Statically typed, great for analysis.

- Clean module system maps well to graph
- Interface implementation detection
- Goroutine/channel analysis

### Rust
**Impact: Medium | Effort: High**

Popular with developer tools community.

- Trait implementations
- Lifetime relationships
- Cargo workspace support

## Killer Integrations

### VS Code Extension
**Impact: Very High | Effort: High**

IDE integration for developers.

- Click to see callers/callees inline
- "Find all references" powered by graph
- Architecture view panel
- Impact preview before refactoring

### GitHub Action
**Impact: High | Effort: Medium**

PR analysis in CI.

- Impact analysis on every PR
- "This PR affects these modules..."
- Architecture violation checks
- Complexity regression detection

### Cursor / Claude Code Native
**Impact: Very High | Effort: Medium**

First-class MCP server integration.

- Pre-configured for common setups
- Optimized queries for AI workflows
- Context-aware suggestions

### Obsidian Plugin
**Impact: Medium | Effort: Medium**

Code graph in your knowledge base.

- Link notes to code symbols
- Embed live architecture diagrams
- Track technical decisions to code

## The Dream Scenarios

### Intelligent Refactoring
```
User: "Refactor all usages of this deprecated function"

Agent:
1. Queries incomingCallsDeep for all usages
2. Understands each call site's context
3. Updates each one appropriately
4. Verifies no remaining usages
```

### PR Impact Analysis
```
PR touches authentication module

CI automatically:
1. Runs analyzeImpact on changed functions
2. Comments: "This affects: login, signup, password-reset, 12 API endpoints"
3. Suggests reviewers based on module ownership
```

### Architecture Visualization
```
User: "Generate architecture diagram for the billing module"

Agent:
1. Queries getNeighborhood with high distance
2. Filters to billing-related nodes
3. Generates Mermaid diagram
4. Adds to documentation
```

### Semantic Code Search
```
User: "Find all the places we handle network errors"

Agent:
1. Semantic search for "network error handling"
2. Follows call graph to find related code
3. Returns comprehensive list with context
```

---

## Contributing

Want to help build the future of AI-assisted development?

Pick something from this roadmap that excites you. The codebase is well-tested (400+ tests) and documented. Every module has a CLAUDE.md explaining its purpose and patterns.

**High-impact, low-effort** items are great starting points:
- Expose hidden parameters in get-impact
- Result limits for search
- Improve tool descriptions (redundancy, output format hints)
- Error messages with example syntax
- Simplified single-module configuration
- Circular dependency detection

**Ambitious but transformative:**
- Semantic search with embeddings
- VS Code extension
- Multi-language support

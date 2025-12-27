# ts-graph-mcp Roadmap

> **The Vision:** ts-graph-mcp provides **graph-based code analysis** that complements LSP — transitive traversals, impact analysis, and architectural queries that point-to-point LSP tools cannot offer.

---

## Deprecation: LSP Overlap

Claude Code 2.0.74+ includes a built-in LSP tool with `documentSymbol`, `workspaceSymbol`, `incomingCalls`, and `outgoingCalls`. This creates overlap with some ts-graph-mcp features.

### Removed Tools

| Tool | Reason | Status |
|------|--------|--------|
| `get_file_symbols` | LSP `documentSymbol` | **REMOVED** |
| `incomingUsesType` | LSP `findReferences` + `analyzeImpact` | **REMOVED** |
| `outgoingUsesType` | LSP `findReferences` + `analyzeImpact` | **REMOVED** |
| `incomingImports` | Reading files shows imports; LSP handles references | **REMOVED** |
| `outgoingImports` | Import statements are at top of every file | **REMOVED** |

### Retained (Unique Value)

These 6 tools remain because they offer capabilities LSP lacks:

| Tool | Unique Value | LSP Cannot Do This |
|------|--------------|-------------------|
| `incomingCallsDeep` | **Transitive** call graph (maxDepth=N) | LSP `incomingCalls` is single-hop only |
| `outgoingCallsDeep` | **Transitive** call graph (maxDepth=N) | LSP `outgoingCalls` is single-hop only |
| `incomingPackageDeps` | **Transitive** internal package dependencies | No LSP equivalent; npm ls only shows npm packages |
| `outgoingPackageDeps` | **Transitive** package dependency graph | No LSP equivalent |
| `analyzeImpact` | **Impact analysis** across all edge types | No LSP equivalent |
| `findPaths` | **Path finding** between symbols | No LSP equivalent |

---

## REFERENCES Edge Type

**Status: ✅ IMPLEMENTED**

The `REFERENCES` edge type captures when functions are **passed or stored** but not directly invoked. This enables multi-hop path finding through intermediate storage patterns.

### Patterns Captured

| Pattern | Example | Edge Created |
|---------|---------|--------------|
| Callback argument | `array.map(fn)` | caller → fn |
| Object property | `{ handler: fn }` | variable → fn |
| Array element | `[fn1, fn2]` | variable → fn |
| Return value | `return fn` | function → fn |
| Variable assignment | `const x = fn` | x → fn |
| Variable access | `handlers[type]` | function → handlers |

### Why This Matters for AI Agents

**Without REFERENCES edges** (manual tracing):
```
Agent reads dispatch() → sees userFormatters[type]
Agent reads userFormatters definition → sees { customer: formatCustomer }
Agent connects: dispatch → userFormatters → formatCustomer
Result: 3+ turns, multiple file reads
```

**With REFERENCES edges** (single query):
```
Agent calls findPaths(dispatch, formatCustomer)
Result: dispatch → userFormatters → formatCustomer (1 turn)
```

### Benchmark Coverage

| Project | Prompts | Key Demonstration |
|---------|---------|-------------------|
| `references` | P1-P3 | Multi-hop path finding through stored functions |

---

## Code Snippets in Tool Responses

**Status: ✅ IMPLEMENTED**

Tools return source code snippets that adapt based on result count, balancing context richness with output manageability.

### Adaptive Snippet Context

| Nodes | Context Lines | Behavior |
|-------|---------------|----------|
| 1-5 | ±10 lines | Full context around each call site |
| 6-25 | ±`floor((25-x)/2)` | Smooth curve: 10→0 lines as nodes increase |
| 26-35 | 0 lines | Call site only (full multi-line expression) |
| 36-50 | — | No snippets + message: "Use Read tool with offset/limit" |
| 50+ | — | Node list truncated + message: "Refine query" |

**Key invariant**: A call site is always captured in full, even if it spans multiple lines. Context lines are *in addition to* the call site expression.

**Example at x=15 nodes** (context = 5 lines):
```
  119: // setup
  120: const opts = {};
  121:
  122: // Process user
  123: await createUser(
  124:   validateInput(data),
  125:   options
  126: );
  127:
  128: // cleanup
```

**Example at x=30 nodes** (context = 0, call site only):
```
  123: await createUser(
  124:   validateInput(data),
  125:   options
  126: );
```

### Multi-Call-Site Snippet Preservation

When a function contains multiple call sites, all must be preserved. The truncation logic collapses gaps between call sites rather than cutting the middle.

**Example**: Function with call sites at lines 10, 22, and 35:
```
    10: firstCall();
    ... 8 lines omitted ...
    22: secondCall(arg);
    ... 10 lines omitted ...
    35: thirdCall();
```

**Implementation**: `src/tools/shared/extractSnippet.ts` + `src/tools/shared/formatNodes.ts`

### Call Site Marker

**Status: ✅ IMPLEMENTED**

When showing snippets with context, call site lines are marked with a `>` prefix so AI agents can instantly identify which line contains the call.

**Example output:**
```
  snippet:
    139:       if (locs.length > 0) {
    140:         lines.push("  snippet:");
  > 141:         lines.push(...renderLOCs(locs));
    142:       }
```

**Benefits:**
- Clean, minimal (2 characters)
- Visual, easy to scan
- No code modification
- Ties directly to Graph section (agent knows `formatNodes --CALLS--> renderLOCs`, marker shows where)

**Implementation:** `src/tools/shared/formatNodes.ts` - `renderLOCs()` accepts optional `callSites` parameter and marks lines that fall within call site ranges.

### Tool Coverage

| Tool | Has Snippets | Notes |
|------|:---:|----------|
| `dependenciesOf` | ✓ | Uses adaptive model |
| `dependentsOf` | ✓ | Uses adaptive model |
| `pathsBetween` | ✓ | Uses adaptive model |
| `incomingPackageDeps` | N/A | Package-level, no function code |
| `outgoingPackageDeps` | N/A | Package-level, no function code |

---

## Tool API Design Philosophy

**Principle: Lean definitions, rich outputs.**

Tool definitions (name, description, schema) are shown to agents upfront in every conversation. Tool outputs only appear when called. This asymmetry drives our API design:

| Aspect | Tool Definition | Tool Output |
|--------|-----------------|-------------|
| When seen | Every conversation | Only when called |
| Token cost | Fixed overhead | Pay-per-use |
| Goal | Enable tool selection | Enable result interpretation |

### Guidelines

**Tool definitions should be:**
- Concise (1-2 sentences describing purpose)
- Focused on "what" not "how"
- Minimal parameter documentation (types + one-line descriptions)
- No detailed output format descriptions

**Tool outputs should include:**
- Interpretation hints (e.g., "depth=1 are direct callers")
- Suggested next steps (e.g., "For full impact: use analyzeImpact")
- Contextual guidance based on actual results

### Status

| Tool | Lean Definition | Rich Output Hints |
|------|:---:|:---:|
| `incomingCallsDeep` | ✓ | Pending |
| `outgoingCallsDeep` | ✓ | Pending |
| `analyzeImpact` | ✓ | Pending |
| `findPaths` | ✓ | Pending |
| `incomingPackageDeps` | ✓ | Pending |
| `outgoingPackageDeps` | ✓ | Pending |

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

Pick something from this roadmap that excites you. The codebase is well-tested (494 tests) and documented. Every module has a CLAUDE.md explaining its purpose and patterns.

**High-impact, low-effort** items are great starting points:
- Circular dependency detection
- CLI tool for terminal queries

**Ambitious but transformative:**
- Semantic search with embeddings
- VS Code extension
- Multi-language support

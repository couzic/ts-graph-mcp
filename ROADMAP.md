# ts-graph Roadmap

> **The Vision:** ts-graph provides **graph-based code analysis** that complements LSP — transitive traversals, impact analysis, and architectural queries that point-to-point LSP tools cannot offer.

---

## Near-term Enhancements

### Type Signature Edges (TAKES/RETURNS)
**Impact: High | Effort: Medium**

New edge types to capture function signature relationships with types.

**New Edge Types:**
- `TAKES` — function → type (parameter type)
- `RETURNS` — function → type (return type)

**Purpose:**
Provide context for understanding data flow and polymorphism, without deep traversal.

```typescript
function persistData(repo: Repository, data: Entity) {
  repo.save(data);  // Where's the implementation?
}
```

With TAKES/RETURNS + existing IMPLEMENTS edges:
```
persistData --TAKES--> Repository
SqlRepository --IMPLEMENTS--> Repository
MongoRepository --IMPLEMENTS--> Repository
```

The agent immediately sees: function takes abstract type, here are the implementations.

**Traversal Depth:**
- CALLS: deep (call chains)
- TAKES/RETURNS: 1 hop (signature types only)
- IMPLEMENTS/EXTENDS: 1 hop from types (show implementations)

**Graph Output Format:**
Keep current flat format, one edge per line, stored direction. No fancy chaining or indentation.

**Nodes Section Enhancement:**
Add `type` field to each node (already stored in DB, just not displayed):
```
UserDTO:
  type: Interface
  file: src/types.ts
  offset: 3, limit: 8
```

**Open Questions:**
- Generics (`Promise<User>`, `Array<T>`) — edge to inner type, wrapper type, or both?
- Union types (`User | null`) — multiple edges?
- Inline/anonymous types — skip?
- Primitives (`string`, `number`) — skip or include?
- Does `pathsBetween` traverse type edges, or only CALLS?

**Implementation:**
- New edge types in `Types.ts`
- New extractor for function signatures
- Update `queryNodeInfos.ts` to include node type
- Update `formatNodes.ts` to display node type

---

### Rich Output Hints
**Impact: Medium | Effort: Low**

Tool outputs should include interpretation guidance:
- Depth indicators (e.g., "depth=1 are direct callers")
- Suggested next steps
- Contextual hints based on actual results

| Tool | Status |
|------|:---:|
| `dependenciesOf` | Pending |
| `dependentsOf` | Pending |
| `pathsBetween` | Pending |

### Session-Aware Output Deduplication
**Impact: High | Effort: Medium**

Reduce context pollution when AI agents make multiple related queries.

**The Problem:**
When agents explore a call graph iteratively, they traverse overlapping paths. Each tool call returns complete node details (file path, snippet, line numbers), creating redundancy when the same nodes appear in multiple results.

```
Agent: dependenciesOf(handleRequest)  → AuthService, UserService, Logger
Agent: dependenciesOf(AuthService)    → UserService, TokenManager, Logger  ← duplicates
```

After 3-4 queries, the agent's context contains the same code snippets multiple times.

**Open Questions:**
- What to dedupe? Just nodes? Nodes + edges? Full graph structure?
- How to indicate "already returned"? Omit silently? Show markers? Reference previous call?
- Session scope? Per-conversation? Per tool? Time-based expiry? MCP connection lifetime?
- Should agents be able to opt-out? (e.g., `fresh: true` parameter)
- Should the Graph section also dedupe, or only the Nodes section?

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

### On-Demand Sync Mode (Lazy Reindexing)
**Impact: Medium | Effort: Low**

Alternative to file watching for environments with many existing watchers.

**The Problem:**
In typical dev environments, multiple tools watch the same files (IDE, build tools, test runners). Adding another watcher (chokidar) consumes inotify descriptors and memory. Some environments hit system limits.

**Solution:**
Instead of proactive watching, sync on tool invocation:

```
Tool call → Check manifest for stale files → Reindex changed files → Execute query
```

**Config:**
```json
{
  "watch": { "mode": "on-demand", "syncTtlMs": 5000 }
}
```

- `syncTtlMs` — Skip sync if last sync was within this window (prevents redundant syncs on rapid calls)
- Reuses existing `syncOnStartup` logic (manifest mtime/size comparison)
- Latency proportional to files changed, not project size

**Future improvement:** Per-package sync — only sync the package containing the queried file for `dependenciesOf`/`dependentsOf`, sync all packages for `pathsBetween` (cross-package paths).

### Package Name Validation
**Impact: Low | Effort: Low**

Warn when config package names don't match `package.json` names.

**The Problem:**
The `name` field in config is independent from `package.json`:

```json
// ts-graph-mcp.config.json
{ "name": "toolkit", "tsconfig": "./libs/toolkit/tsconfig.json" }

// libs/toolkit/package.json
{ "name": "@libs/toolkit" }
```

Config names are metadata (stored in the `package` column of nodes), not used for resolution. But mismatches can confuse users when filtering by package name.

**Solution:**
At server startup, validate each package:
1. Find `package.json` next to the tsconfig
2. Compare config `name` with `package.json` `name`
3. Log warning if they differ

```
Warning: Package "toolkit" has different name in package.json: "@libs/toolkit"
```

**Non-blocking:** Warnings only, indexing proceeds normally.

### Decorator Support (DECORATES Edge Type)
**Impact: Medium | Effort: Medium**

Extract decorator relationships into the graph.

**The Problem:**
TypeScript decorators establish relationships between decorator functions and decorated targets (classes, methods, properties, parameters). Currently, decorator calls are not captured in the graph.

```typescript
@Injectable()
export class UserService {
  @Log()
  save(): void {}
}
```

**Open Questions:**

1. **Edge direction:** `Injectable --DECORATES--> UserService` feels natural ("Injectable decorates UserService")

2. **Decorator types:** Four distinct targets exist:
   - Class decorators (`@Injectable()`)
   - Method decorators (`@Log()`)
   - Property decorators (`@Inject()`)
   - Parameter decorators (`@Param()`)

   Do we need separate edge types or one `DECORATES` with metadata?

3. **Decorator factories vs plain decorators:**
   - Factory: `@Injectable()` — function call that returns decorator
   - Plain: `@Component` — direct decorator reference

   How to represent both? Factories are CALLS + DECORATES?

4. **Target identification:** For method/property/parameter decorators, the target is a member, not the class. Edge target should be `UserService.save`, not `UserService`.

5. **Metadata:** Should we track decorator arguments? Position (first decorator vs second)?

**Implementation approach (once questions resolved):**
- New edge type `DECORATES` in `Types.ts`
- New extractor `extractDecoratesEdges.ts`
- Wire up in `extractEdges.ts`

### CLI Flag Tests
**Impact: Low | Effort: Low**

Add tests for the CLI flags introduced in the async startup refactoring:
- `--index` — Run indexing only (no server)
- `--clean` — Delete cache and reindex from scratch
- `--reindex` — Shorthand for `--index --clean`

**Current state:** No tests. Flags are implemented in `src/mcp/main.ts`.

**Test approach:** Integration tests that spawn the CLI and verify behavior (e.g., cache deleted on `--clean`, no server started on `--index`).

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
1. Queries dependentsOf for all usages
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

Pick something from this roadmap that excites you. The codebase is well-tested and documented. Every module has a CLAUDE.md explaining its purpose and patterns.

**High-impact, low-effort** items are great starting points:
- Circular dependency detection
- CLI tool for terminal queries

**Ambitious but transformative:**
- Semantic search with embeddings
- VS Code extension
- Multi-language support

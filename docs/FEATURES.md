# ts-graph-mcp Features

> **Current AI coding tools grep through files like humans did in the 90s.**
>
> ts-graph-mcp gives them the **semantic understanding** that IDEs have had for decades. It's the difference between searching for the string "user" vs. understanding the `User` class, its methods, who instantiates it, and what depends on it.

## What ts-graph-mcp Does

ts-graph-mcp is an MCP server that extracts TypeScript code structure into a graph database, enabling AI coding agents to explore and understand codebases semantically.

### Core Capabilities

#### Code Exploration

| Tool | Description | Example |
|------|-------------|---------|
| `search_nodes` | Find symbols by pattern | `search_nodes("handle*")` → all handlers |
| `get_file_symbols` | List everything in a file | Functions, classes, interfaces, types |

- **Pattern search** - Find all functions matching `extract*`, all interfaces, all exported symbols
- **File overview** - Instantly see all symbols in any file with types, parameters, line numbers
- **Cross-reference** - "Where is this type defined? What file exports this?"

#### Call Graph Analysis

| Tool | Description | Example |
|------|-------------|---------|
| `get_callers` | Who calls this function? | Trace usage across the codebase |
| `get_callees` | What does this function call? | Understand dependencies |

- **Callers** - "Who calls `indexProject`?" - trace usage across the codebase
- **Callees** - "What does `startMcpServer` depend on?" - understand dependencies
- **Call counts** - Know which functions are called most (hot paths)

#### Impact Analysis

| Tool | Description | Example |
|------|-------------|---------|
| `get_impact` | What depends on this? | Safe refactoring |

- **Change impact** - "If I modify `DbReader`, what breaks?"
- **Dependency chains** - Transitive impact with configurable depth
- **Safe refactoring** - Know exactly what you're affecting before you change it

#### Visualization

| Tool | Description | Example |
|------|-------------|---------|
| `get_neighbors` | Subgraph around a node | Auto-generates Mermaid diagrams |

- **Mermaid diagrams** - Auto-generated flowcharts for any subgraph
- **Neighborhood exploration** - See N-hop connections around any node
- **Architecture documentation** - Visual representation of module structure

#### Path Finding

| Tool | Description | Example |
|------|-------------|---------|
| `find_path` | Shortest path between nodes | Discover hidden dependencies |

- **Shortest path** - "How does `ConfigLoader` connect to `McpServer`?"
- **Architectural understanding** - Discover unexpected dependencies
- **Debugging** - Trace how data flows through your system

### What Gets Indexed

#### Node Types

| Type | Description |
|------|-------------|
| `File` | Source files with extension, line count |
| `Function` | Top-level functions with parameters, return type, async |
| `Class` | Classes with extends, implements |
| `Method` | Class methods with visibility, static, parameters |
| `Interface` | Interfaces with extends |
| `TypeAlias` | Type aliases with the aliased type |
| `Variable` | Top-level const/let with type |
| `Property` | Class/interface properties with type, optional, readonly |

#### Edge Types

| Type | Description |
|------|-------------|
| `CONTAINS` | File contains symbol |
| `IMPORTS` | File imports from file |
| `CALLS` | Function/method calls function/method |
| `EXTENDS` | Class/interface extends class/interface |
| `IMPLEMENTS` | Class implements interface |
| `USES_TYPE` | Symbol uses type in parameter/return/property |

### Example Queries

**Find all exported functions:**
```
search_nodes("*", nodeType: "Function", exported: true)
```

**What calls the database writer?**
```
get_callers("src/db/sqlite/SqliteWriter.ts:createSqliteWriter")
```

**Impact of changing a core type:**
```
get_impact("src/db/Types.ts:Node", maxDepth: 3)
```

**Visualize a module's structure:**
```
get_neighbors("src/ingestion/Ingestion.ts:indexProject", distance: 2)
```

**Find the connection between two distant parts:**
```
find_path("src/config/ConfigLoader.ts:loadConfig", "src/mcp/McpServer.ts:startMcpServer")
```

## Why This Matters for AI Agents

Traditional code search is **syntactic** - it finds text patterns. ts-graph-mcp provides **semantic** understanding:

| Syntactic (grep) | Semantic (ts-graph-mcp) |
|------------------|-------------------------|
| Find string "User" | Find the `User` class definition |
| Find files containing "import" | Find actual import relationships |
| Search for "handleError" | Find all callers of `handleError()` |
| Look for "extends" keyword | Find inheritance hierarchy |

This enables AI agents to:

1. **Refactor safely** - Know all usages before changing a function
2. **Navigate intelligently** - Jump to definitions, find implementations
3. **Understand architecture** - See how modules connect
4. **Generate documentation** - Create diagrams from actual structure
5. **Assess impact** - Know what breaks when you change something

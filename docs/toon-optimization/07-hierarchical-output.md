# Architectural Proposal: Hierarchical Output Structure

## Summary

Instead of repeating `module` and `package` for every node, structure the output hierarchically:

```
module: <name>
  package: <name>
    symbols...
```

This eliminates repetition and provides clearer context for LLMs.

## Current Problem

Every single node repeats module and package:

```
interfaces[17]{extends,id,name,module,package,filePath,startLine,endLine,exported}:
  "","src/db/Types.ts:BaseNode",BaseNode,ts-graph-mcp,main,src/db/Types.ts,24,51,true
  BaseNode,"src/db/Types.ts:FunctionNode",FunctionNode,ts-graph-mcp,main,src/db/Types.ts,54,59,true
  BaseNode,"src/db/Types.ts:ClassNode",ClassNode,ts-graph-mcp,main,src/db/Types.ts,61,65,true
  ...                                            ^^^^^^^^^^^^^ ^^^^
                                                 REPEATED 17 TIMES
```

For 88 symbols in a file:
- `ts-graph-mcp,main` × 88 = **~1,408 wasted characters**

## Proposed Hierarchical Structure

### Single-Module Response

```yaml
module: ts-graph-mcp
package: main
count: 88

interfaces[17]{extends,symbol,line,exported}:
  "",BaseNode,24-51,true
  BaseNode,FunctionNode,54-59,true
  BaseNode,ClassNode,61-65,true
  ...

properties[66]{type,parent,name,line}:
  string,BaseNode,id,26
  NodeType,BaseNode,type,29
  ...
```

### Multi-Module Response (Cross-Package Query)

```yaml
count: 150

ts-graph-mcp:
  main:
    functions[25]{symbol,line,exported}:
      startMcpServer,24-365,true
      flattenNodeForToon,411-443,false
      ...
    interfaces[17]{extends,symbol,line,exported}:
      "",BaseNode,24-51,true
      ...

  utils:
    functions[10]{symbol,line,exported}:
      formatDate,10-25,true
      ...

external-lib:
  core:
    classes[5]{symbol,line,exported}:
      Logger,1-50,true
      ...
```

## Benefits

### 1. Eliminates Module/Package Repetition

| Current | Hierarchical | Savings |
|---------|--------------|---------|
| 88 × 16 chars = 1,408 chars | 2 × 20 chars = 40 chars | **97% reduction** |

### 2. Clearer Context for LLMs

LLMs can immediately understand the organizational structure:

```
"These are all symbols from the 'main' package of the 'ts-graph-mcp' module"
```

vs. parsing repeated fields to infer the same.

### 3. Enables Package-Level Metadata

Future enhancement: Add package-level information:

```yaml
ts-graph-mcp:
  main:
    depends: [utils, core]  # Package dependencies
    files: 27
    symbols: 272

    functions[25]{...}:
      ...
```

### 4. Natural Inter-Package Navigation

When results span packages, the hierarchy makes relationships clear:

```yaml
ts-graph-mcp:
  ingestion:
    functions[5]{symbol,calls}:
      indexProject,[main:createSqliteWriter, utils:validateConfig]
      ...

  main:
    functions[2]{symbol,calledBy}:
      createSqliteWriter,[ingestion:indexProject]
      ...
```

## Implementation Considerations

### TOON Compatibility

TOON supports nested structures. The hierarchical format is valid TOON:

```yaml
module:
  package:
    array[N]{fields}:
      values
```

### Grouping Logic

In `McpServer.ts`, add grouping by module/package before grouping by type:

```typescript
function groupNodesByHierarchy(nodes: Node[]) {
  const hierarchy: Record<string, Record<string, Record<string, Node[]>>> = {};

  for (const node of nodes) {
    const module = node.module;
    const pkg = node.package;
    const type = NODE_TYPE_PLURALS[node.type];

    hierarchy[module] ??= {};
    hierarchy[module][pkg] ??= {};
    hierarchy[module][pkg][type] ??= [];
    hierarchy[module][pkg][type].push(flattenNodeForToon(node));
  }

  return hierarchy;
}
```

### Single vs Multi-Module Optimization

For responses where all nodes are from the same module/package (common case):

```typescript
function formatNodesResponse(nodes: Node[]) {
  const modules = new Set(nodes.map(n => n.module));
  const packages = new Set(nodes.map(n => n.package));

  if (modules.size === 1 && packages.size === 1) {
    // Flat output with top-level module/package
    return {
      module: nodes[0].module,
      package: nodes[0].package,
      count: nodes.length,
      ...groupNodesByType(nodes)  // Without module/package per node
    };
  } else {
    // Hierarchical output
    return {
      count: nodes.length,
      ...groupNodesByHierarchy(nodes)
    };
  }
}
```

## Example Comparison

### Current Output (search_nodes for `*Node*`)

```
count: 11
interfaces[11]{extends,id,name,module,package,filePath,startLine,endLine,exported}:
  "","src/db/Types.ts:BaseNode",BaseNode,ts-graph-mcp,main,src/db/Types.ts,24,51,true
  BaseNode,"src/db/Types.ts:FunctionNode",FunctionNode,ts-graph-mcp,main,src/db/Types.ts,54,59,true
  BaseNode,"src/db/Types.ts:ClassNode",ClassNode,ts-graph-mcp,main,src/db/Types.ts,61,65,true
  BaseNode,"src/db/Types.ts:MethodNode",MethodNode,ts-graph-mcp,main,src/db/Types.ts,67,74,true
  BaseNode,"src/db/Types.ts:InterfaceNode",InterfaceNode,ts-graph-mcp,main,src/db/Types.ts,76,79,true
  BaseNode,"src/db/Types.ts:TypeAliasNode",TypeAliasNode,ts-graph-mcp,main,src/db/Types.ts,81,84,true
  BaseNode,"src/db/Types.ts:VariableNode",VariableNode,ts-graph-mcp,main,src/db/Types.ts,86,90,true
  BaseNode,"src/db/Types.ts:FileNode",FileNode,ts-graph-mcp,main,src/db/Types.ts,92,95,true
  BaseNode,"src/db/Types.ts:PropertyNode",PropertyNode,ts-graph-mcp,main,src/db/Types.ts,97,102,true
  "","src/ingestion/IdGenerator.ts:ParsedNodeId",ParsedNodeId,ts-graph-mcp,main,src/ingestion/IdGenerator.ts,34,39,true
  "","src/db/sqlite/SqliteReader.ts:NodeRow",NodeRow,ts-graph-mcp,main,src/db/sqlite/SqliteReader.ts,15,26,false
```

**Size:** ~1,150 characters

### Proposed Hierarchical Output

```
count: 11
module: ts-graph-mcp
package: main

interfaces[11]{extends,file,symbol,line,exported}:
  "",Types.ts,BaseNode,24-51,true
  BaseNode,Types.ts,FunctionNode,54-59,true
  BaseNode,Types.ts,ClassNode,61-65,true
  BaseNode,Types.ts,MethodNode,67-74,true
  BaseNode,Types.ts,InterfaceNode,76-79,true
  BaseNode,Types.ts,TypeAliasNode,81-84,true
  BaseNode,Types.ts,VariableNode,86-90,true
  BaseNode,Types.ts,FileNode,92-95,true
  BaseNode,Types.ts,PropertyNode,97-102,true
  "",IdGenerator.ts,ParsedNodeId,34-39,true
  "",SqliteReader.ts,NodeRow,15-26,false
```

**Size:** ~650 characters

**Savings:** ~500 characters (43%)

### With File Grouping (Even More Compact)

```
count: 11
module: ts-graph-mcp
package: main

src/db/Types.ts:
  interfaces[9]{extends,symbol,line,exported}:
    "",BaseNode,24-51,true
    BaseNode,FunctionNode,54-59,true
    BaseNode,ClassNode,61-65,true
    BaseNode,MethodNode,67-74,true
    BaseNode,InterfaceNode,76-79,true
    BaseNode,TypeAliasNode,81-84,true
    BaseNode,VariableNode,86-90,true
    BaseNode,FileNode,92-95,true
    BaseNode,PropertyNode,97-102,true

src/ingestion/IdGenerator.ts:
  interfaces[1]{extends,symbol,line,exported}:
    "",ParsedNodeId,34-39,true

src/db/sqlite/SqliteReader.ts:
  interfaces[1]{extends,symbol,line,exported}:
    "",NodeRow,15-26,false
```

**Size:** ~580 characters

**Savings:** ~570 characters (50%)

## Future: Package Dependencies

Once hierarchical structure is in place, we can add package-level metadata:

```yaml
ts-graph-mcp:
  ingestion:
    imports: [db, config]  # This package imports from db and config packages
    exports: [indexProject, indexFile, removeFile]  # Public API

    functions[15]{...}:
      ...

  db:
    imports: []  # No internal dependencies
    exports: [DbReader, DbWriter, Node, Edge]

    interfaces[10]{...}:
      ...

  mcp:
    imports: [db, ingestion]
    exports: [startMcpServer]

    functions[9]{...}:
      ...
```

This enables:
- **Impact analysis across packages**: "If I change `Node` in `db`, which packages are affected?"
- **Dependency visualization**: Package-level dependency graph
- **API surface discovery**: "What does the `mcp` package export?"

## Implementation Priority

1. **Phase 1:** Single module/package hoisting (simple, big win)
2. **Phase 2:** Multi-module hierarchical grouping
3. **Phase 3:** File-level grouping within packages
4. **Phase 4:** Package metadata (dependencies, exports)

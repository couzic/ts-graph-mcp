# get-file-symbols Tool Improvements

**Evaluation Grade: 7.5/10**

## Overview

The `get-file-symbols` tool lists all symbols (functions, classes, interfaces, types, variables) defined in a specific file. It uses a simple SQL query filtering nodes by `file_path`.

## Architecture

```
src/tools/get-file-symbols/
├── handler.ts   # MCP tool definition and execute function
├── query.ts     # Simple SELECT WHERE file_path = ?
└── format.ts    # Symbol list formatting
```

## Test Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| File with multiple symbol types | ✅ Pass | Returns all symbols grouped by type |
| File with no symbols | ⚠️ Issue | Empty result, unclear if file exists |
| Non-existent file path | ⚠️ Issue | Same as above - no distinction |
| Path with different separators | ⚠️ Issue | Windows vs Unix paths not normalized |
| Relative vs absolute paths | ⚠️ Issue | Inconsistent handling |
| File with nested symbols | ✅ Pass | Returns class methods, properties |

## Priority Improvements

### P1: Path Normalization (High Impact)

**Problem**: File paths are stored in a specific format, but user input may vary (Windows backslashes, leading `./`, absolute paths). This causes valid files to return "not found".

**Examples of problematic inputs**:
```
Stored:   src/utils/helpers.ts
Input 1:  ./src/utils/helpers.ts    → No match
Input 2:  src\\utils\\helpers.ts    → No match
Input 3:  /full/path/src/utils/helpers.ts → No match
```

**Recommended implementation**:

```typescript
function normalizePath(inputPath: string, projectRoot?: string): string {
  let normalized = inputPath
    .replace(/\\/g, '/')           // Normalize separators
    .replace(/^\.\//, '')          // Remove leading ./
    .replace(/\/+/g, '/');         // Collapse multiple slashes

  // Handle absolute paths
  if (projectRoot && normalized.startsWith(projectRoot)) {
    normalized = normalized.slice(projectRoot.length).replace(/^\//, '');
  }

  return normalized;
}

export function getFileSymbols(db: Database.Database, filePath: string): FileSymbolsResult {
  const normalizedPath = normalizePath(filePath);

  // Check if file exists in database
  const fileNode = db.prepare('SELECT 1 FROM nodes WHERE file_path = ? AND type = ?')
    .get(normalizedPath, 'File');

  if (!fileNode) {
    // Suggest similar paths
    const similar = db.prepare(`
      SELECT DISTINCT file_path FROM nodes
      WHERE file_path LIKE ?
      LIMIT 5
    `).all(`%${path.basename(normalizedPath)}%`);

    return {
      error: `File not found: ${filePath}`,
      suggestion: similar.length > 0
        ? `Did you mean: ${similar.map(s => s.file_path).join(', ')}?`
        : 'Use glob patterns to search for files'
    };
  }

  // Continue with query...
}
```

### P2: File Existence Validation (High Impact)

**Problem**: When a file doesn't exist in the graph, the tool returns empty results without indicating whether the file wasn't indexed or simply has no symbols.

**Recommended**: Distinguish between:
1. File exists but has no exportable symbols
2. File not indexed (not in project scope)
3. File path typo (with suggestions)

### P3: Export Summary (Medium Impact)

**Problem**: Output doesn't clearly indicate which symbols are exported vs internal.

**Current output**:
```
Symbols in src/utils.ts
├── Function: formatDate (12-25)
├── Function: parseDate (27-40)
└── Variable: DEFAULT_FORMAT (8-8)
```

**Enhanced output**:
```
Symbols in src/utils.ts (2 exported, 1 internal)

Exported:
├── Function: formatDate (12-25)
└── Function: parseDate (27-40)

Internal:
└── Variable: DEFAULT_FORMAT (8-8)
```

### P4: Hierarchical Relationships (Low Impact)

**Problem**: Class members (methods, properties) are shown as flat list without their parent class relationship.

**Current output**:
```
├── Class: User
├── Method: User.save
├── Method: User.delete
├── Property: User.name
```

**Enhanced output**:
```
├── Class: User (10-50)
│   ├── Property: name (12-12)
│   ├── Method: save (15-25)
│   └── Method: delete (27-35)
```

### P5: Symbol Type Filtering (Low Impact)

**Problem**: Users may only want specific symbol types (e.g., "show me only functions in this file").

**Recommended addition to MCP interface**:

```typescript
{
  name: 'get_file_symbols',
  inputSchema: {
    filePath: { type: 'string' },
    types: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['Function', 'Class', 'Method', 'Interface', 'TypeAlias', 'Variable', 'Property']
      },
      description: 'Filter by symbol types (default: all)'
    }
  }
}
```

## Testing Gaps

1. **No path normalization tests**
2. **No tests for**:
   - Empty files
   - Files with only type exports
   - Cross-platform path handling
3. **Missing validation** for file existence before querying

## Implementation Roadmap

1. **Phase 1** (P1-P2): Path normalization and existence validation
2. **Phase 2** (P3): Export/internal grouping in output
3. **Phase 3** (P4-P5): Hierarchical display and type filtering

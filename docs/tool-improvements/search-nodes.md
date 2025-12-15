# search-nodes Tool Improvements

**Evaluation Grade: 7.5/10**

## Overview

The `search-nodes` tool searches for nodes by name pattern using SQLite GLOB matching. It supports filtering by node type, module, package, and export status.

## Architecture

```
src/tools/search-nodes/
├── handler.ts   # MCP tool definition and execute function
├── query.ts     # GLOB pattern matching with filters
└── format.ts    # Search results formatting
```

## Test Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| Simple pattern `User*` | ✅ Pass | Matches UserService, UserModel, etc. |
| Wildcard pattern `*Service` | ✅ Pass | Matches all services |
| Filter by nodeType | ✅ Pass | Correctly filters |
| Filter by module | ✅ Pass | Correctly filters |
| Filter by exported | ✅ Pass | Correctly filters |
| No matches | ⚠️ Issue | Empty result, no suggestions |
| Empty pattern | ⚠️ Issue | No validation, returns all nodes |
| Very broad pattern `*` | ⚠️ Issue | Returns everything, no limit |

## Priority Improvements

### P1: Result Set Limits (High Impact)

**Problem**: Broad patterns like `*` or `*e*` can return thousands of results, consuming excessive tokens and providing little value.

**Recommended**:

```typescript
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

{
  name: 'search_nodes',
  inputSchema: {
    pattern: { type: 'string' },
    // ... existing filters
    limit: {
      type: 'number',
      description: 'Maximum results to return (default: 100, max: 500)'
    }
  }
}
```

**Output when truncated**:
```
Search results for "*Service" (showing 100 of 342 matches)
⚠️ Results truncated. Add filters or use a more specific pattern.

├── Class: UserService (src/services/UserService.ts:10-150)
├── Class: AuthService (src/services/AuthService.ts:8-200)
...
```

### P2: Input Validation (High Impact)

**Problem**: No validation of the `pattern` parameter. Empty strings or overly broad patterns should be handled.

**Recommended**:

```typescript
export function searchNodes(
  db: Database.Database,
  pattern: string,
  filters?: SearchFilters
): SearchResult {
  // Validate pattern
  if (!pattern || pattern.trim() === '') {
    return {
      error: 'Pattern is required',
      suggestion: 'Use glob patterns like "User*", "*Service", "handle*Request"'
    };
  }

  // Warn about overly broad patterns
  if (pattern === '*' || pattern === '?') {
    return {
      warning: 'Pattern is very broad and will match all nodes',
      suggestion: 'Consider adding filters: nodeType, module, package, or exported'
    };
  }

  // Continue with search...
}
```

### P3: GLOB Syntax Documentation (Medium Impact)

**Problem**: Users may not know SQLite GLOB syntax differs from shell globs.

**SQLite GLOB syntax**:
- `*` - matches any sequence of characters
- `?` - matches any single character
- `[abc]` - matches any character in the set
- `[^abc]` - matches any character NOT in the set
- Case-sensitive by default

**Recommended**: Include syntax hint in error messages and empty results:

```
No results found for pattern "user*"

💡 GLOB patterns are case-sensitive. Try:
   - "User*" for PascalCase matches
   - Use search_nodes with nodeType filter to narrow results
```

### P4: No-Match Suggestions (Medium Impact)

**Problem**: When a search returns no results, there's no guidance for the user.

**Recommended enhancement**:

```typescript
if (results.length === 0) {
  // Try case-insensitive search for suggestions
  const suggestions = db.prepare(`
    SELECT DISTINCT name FROM nodes
    WHERE LOWER(name) GLOB LOWER(?)
    LIMIT 5
  `).all(pattern);

  return {
    message: `No matches for pattern "${pattern}"`,
    suggestions: suggestions.length > 0
      ? `Similar names (case-insensitive): ${suggestions.map(s => s.name).join(', ')}`
      : 'Try a broader pattern or different filters'
  };
}
```

### P5: Filter Combination Validation (Low Impact)

**Problem**: Some filter combinations may produce no results in ways that aren't obvious.

**Example**: Searching for `*` with `nodeType: 'Method'` and `exported: true` - methods are rarely directly exported.

**Recommended**: Provide hints when filter combinations are unusual:

```
Search: pattern="*", nodeType="Method", exported=true
Result: 0 matches

💡 Methods are typically exported via their parent class, not directly.
   Try: nodeType="Class" with exported=true, then use get_file_symbols
```

### P6: Pagination Support (Low Impact)

**Problem**: For large result sets, pagination would be more practical than truncation.

**Recommended**:

```typescript
{
  limit: { type: 'number', description: 'Results per page (default: 100)' },
  offset: { type: 'number', description: 'Skip first N results (for pagination)' }
}
```

**Output**:
```
Search results for "*Service" (page 2 of 4, showing 101-200 of 342)
```

## Testing Gaps

1. **No validation tests** for empty/invalid patterns
2. **No limit/truncation tests**
3. **Missing tests for**:
   - Special GLOB characters in patterns
   - Unicode characters in names
   - Filter combination edge cases
4. **No performance tests** for large result sets

## Implementation Roadmap

1. **Phase 1** (P1-P2): Add result limits and input validation
2. **Phase 2** (P3-P4): Improve empty result messaging with syntax hints
3. **Phase 3** (P5-P6): Filter warnings and pagination support

# Code Ingestion API

**File:** `src/ingestion/index.ts`

**Used by:** CLI, File Watcher

**Purpose:** Parse TypeScript code and extract nodes/edges

---

## Function Definitions

```typescript
import { DbWriter } from '../db/writer';
import { ProjectConfig } from '../config/schema';
import { IndexResult } from '../db/types';

/**
 * Index an entire project based on config.
 * Parses all packages defined in config.
 *
 * @param config - Project configuration
 * @param dbWriter - Database writer instance
 * @returns Indexing statistics
 */
export function indexProject(
  config: ProjectConfig,
  dbWriter: DbWriter
): Promise<IndexResult>;

/**
 * Index a single file.
 * Used for incremental updates.
 * Automatically removes old data for the file first.
 *
 * @param filePath - Absolute path to the file
 * @param dbWriter - Database writer instance
 */
export function indexFile(
  filePath: string,
  dbWriter: DbWriter
): Promise<void>;

/**
 * Remove a file from the index.
 * Used when a file is deleted.
 *
 * @param filePath - Absolute path to the file
 * @param dbWriter - Database writer instance
 */
export function removeFile(
  filePath: string,
  dbWriter: DbWriter
): Promise<void>;
```

---

## Function Summary

| Function | Purpose | Used By |
|----------|---------|---------|
| `indexProject` | Full project indexing | CLI `index` command |
| `indexFile` | Single file indexing | File Watcher (add/change) |
| `removeFile` | Remove file from index | File Watcher (delete) |

---

## Behavior Notes

### indexProject

1. Reads `ProjectConfig` to find all packages
2. For each package, loads `tsconfig.json`
3. Creates ts-morph `Project` for each package
4. Extracts all nodes and edges
5. Writes to database via `DbWriter`
6. Returns statistics

### indexFile

1. Removes existing data for the file (`removeFileNodes`)
2. Parses file with ts-morph
3. Extracts nodes and edges
4. Writes to database
5. Manages its own ts-morph Project context

### removeFile

1. Delegates to `dbWriter.removeFileNodes()`
2. Idempotent (no error if file not indexed)

---

## Internal Modules

The ingestion module internally uses:

| File | Purpose |
|------|---------|
| `id-generator.ts` | Generate node IDs from AST |
| `node-extractors.ts` | Extract Function, Class, etc. nodes |
| `edge-extractors.ts` | Extract CALLS, IMPORTS, etc. edges |
| `extractor.ts` | Orchestrate full extraction |

---

## Node ID Generation

Format: `{relativePath}:{symbolPath}`

Examples:
- `src/utils.ts:formatDate`
- `src/models/user.ts:User`
- `src/models/user.ts:User.validate`
- `src/math.ts:add(number,number)` (overloads)

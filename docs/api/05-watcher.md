# File Watcher API

**File:** `src/watcher/index.ts`

**Used by:** CLI (`watch` and `serve` commands)

**Purpose:** Watch filesystem and trigger re-indexing

---

## WatcherApi (Internal, Testable)

```typescript
/**
 * Internal API for handling file events.
 * Testable without filesystem.
 */
export interface WatcherApi {
  /**
   * Handle file added event.
   * @param filePath - Absolute path to added file
   */
  onFileAdded(filePath: string): Promise<void>;

  /**
   * Handle file changed event.
   * @param filePath - Absolute path to changed file
   */
  onFileChanged(filePath: string): Promise<void>;

  /**
   * Handle file deleted event.
   * @param filePath - Absolute path to deleted file
   */
  onFileDeleted(filePath: string): Promise<void>;
}
```

---

## WatchConfig

```typescript
export interface WatchConfig {
  /** Root directory to watch */
  rootPath: string;

  /** Glob patterns to include (e.g., ['**/*.ts', '**/*.tsx']) */
  patterns: string[];

  /** Glob patterns to ignore (e.g., ['**/node_modules/**']) */
  ignored?: string[];

  /** Debounce delay in ms (default: 100) */
  debounceMs?: number;
}
```

---

## WatcherHandle

```typescript
/**
 * Handle for controlling an active watcher.
 */
export interface WatcherHandle {
  /** Stop watching and clean up */
  close(): Promise<void>;

  /** Check if watcher is active */
  isWatching(): boolean;
}
```

---

## Factory Function

```typescript
import { DbWriter } from '../db/writer';

/**
 * Create and start a file watcher.
 * Watcher manages its own ts-morph Project instance.
 *
 * @param config - Watch configuration
 * @param dbWriter - Database writer for updates
 * @returns Handle to control the watcher
 */
export function createWatcher(
  config: WatchConfig,
  dbWriter: DbWriter
): Promise<WatcherHandle>;
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                createWatcher()                   │
│         (factory, returns WatcherHandle)         │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│              Chokidar Adapter                    │
│    (listens to filesystem, debounces events)    │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│               WatcherApi                         │
│  (onFileAdded, onFileChanged, onFileDeleted)    │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│            Code Ingestion                        │
│       (indexFile, removeFile)                   │
└─────────────────────────────────────────────────┘
```

---

## Event Handling

| Filesystem Event | WatcherApi Method | Ingestion Action |
|------------------|-------------------|------------------|
| File created | `onFileAdded` | `indexFile()` |
| File modified | `onFileChanged` | `indexFile()` |
| File deleted | `onFileDeleted` | `removeFile()` |

---

## Behavior Notes

### Self-Contained

- Watcher creates and manages its own ts-morph `Project` instance
- No external Project dependency needed

### Debouncing

- Rapid file changes are debounced (default: 100ms)
- Only last event in debounce window is processed

### Ignored Patterns

Default ignored patterns (if not specified):
- `**/node_modules/**`
- `**/.git/**`
- `**/dist/**`
- `**/build/**`

---

## Usage Example

```typescript
import { createWatcher } from './watcher';
import { createSqliteWriter } from './db/sqlite';

const dbWriter = createSqliteWriter('.ts-graph-mcp/graph.db');

const watcher = await createWatcher({
  rootPath: '/path/to/project',
  patterns: ['**/*.ts', '**/*.tsx'],
  ignored: ['**/node_modules/**'],
  debounceMs: 100,
}, dbWriter);

// Later...
await watcher.close();
```

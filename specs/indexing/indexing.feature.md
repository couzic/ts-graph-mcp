# Indexing

**Status:** 🚧 In progress

**ID:** `indexing`

## TODO

- [Sequential package processing](#sequential-package-processing) `[@indexing::memory.sequential-projects]`
- [Lightweight cross-package resolution](#lightweight-cross-package-resolution) `[@indexing::memory.lightweight-cross-package]`

## Source extraction

### File scope

> `{#indexing::file-scope}`

Only TypeScript source files (`.ts`, `.tsx`) that are part of a package's
tsconfig compilation are indexed. Each file must reside within the package
directory tree defined by the tsconfig location.

### Excluded files

> `{#indexing::excluded-files}`

The following files are never indexed:

- Files inside `node_modules/`
- Type declaration files (`.d.ts`)
- Files inside `/.claude/worktrees/`
- Files outside the package's directory tree (even if pulled in by imports)

### Node ID format

> `{#indexing::node-id-format}`

Every node has a deterministic ID in the format `{relativePath}:{nodeType}:{symbolName}`.

- `relativePath` is relative to the project root
- `nodeType` is one of: `Function`, `Class`, `Method`, `Interface`, `TypeAlias`,
  `Variable`, `SyntheticType`
- `symbolName` uses dots for nesting: `User.save` for a method, `myObj.myMethod`
  for an object literal method

Examples:

- `src/utils.ts:Function:formatDate`
- `src/models/User.ts:Class:User`
- `src/models/User.ts:Method:User.save`

### Node types

#### Function nodes

> `{#indexing::nodes.function}`

Top-level `function` declarations produce `Function` nodes. The node captures
parameter names and types, return type, async flag, and export status.

#### Arrow function nodes

> `{#indexing::nodes.arrow-function}`

Arrow functions and function expressions assigned to top-level `const`/`let`/`var`
produce `Function` nodes (not `Variable` nodes). The variable name becomes the
node name.

#### Object literal method nodes

> `{#indexing::nodes.object-literal-method}`

Methods inside object literals (shorthand or arrow property) produce `Function`
nodes with a qualified ID: `file.ts:Function:objectName.methodName`.

This applies both to direct object literals (`const obj = { method() {} }`) and
to factory return objects (`const create = () => ({ method() {} })`).

#### Factory synthetic type nodes

> `{#indexing::nodes.factory-synthetic-type}`

When a factory function returns an object literal (arrow with expression body or
block body with `return { ... }`), a `SyntheticType` node is created with the
name `ReturnType<typeof factoryName>`. Its methods use this as their parent
prefix: `ReturnType<typeof create>.method`.

#### Class nodes

> `{#indexing::nodes.class}`

Class declarations produce `Class` nodes. The node captures extends clause,
implements clauses, and export status.

#### Method nodes

> `{#indexing::nodes.method}`

Class methods produce `Method` nodes with a qualified ID:
`file.ts:Method:ClassName.methodName`. The node captures parameters, return type,
async flag, visibility (`public`/`private`/`protected`), and static flag.

Methods are never marked as `exported` (regardless of the class export status).

#### Interface nodes

> `{#indexing::nodes.interface}`

Interface declarations produce `Interface` nodes. The node captures extends
clauses and export status.

#### Type alias nodes

> `{#indexing::nodes.type-alias}`

Type alias declarations (`type Foo = ...`) produce `TypeAlias` nodes. The node
captures the aliased type text.

#### Variable nodes

> `{#indexing::nodes.variable}`

Top-level variable declarations produce `Variable` nodes, except when the
initializer is an arrow function or function expression (those produce `Function`
nodes instead). The node captures the type annotation and whether it is `const`.

#### Properties are not nodes

> `{#indexing::nodes.no-properties}`

Class properties and interface properties are not extracted as individual nodes.
Their types are captured via `HAS_PROPERTY` edges instead.

### Edge types

#### CALLS edges

> `{#indexing::edges.calls}`

A `CALLS` edge is created when a function, method, or constructor body contains
a call expression that resolves to a known symbol (local or imported). The edge
includes `callCount` (number of call sites) and `callSites` (line ranges).

Constructor calls are attributed to the class node. Class property initializer
calls are also attributed to the class node. Calls in parameter default values
are attributed to the enclosing function.

#### INCLUDES edges

> `{#indexing::edges.includes}`

An `INCLUDES` edge is created when a function body contains JSX usage of a
component (`<MyComponent />`). Intrinsic HTML elements (lowercase tag names like
`<div>`) are skipped.

#### EXTENDS edges

> `{#indexing::edges.extends}`

An `EXTENDS` edge is created for class-to-class and interface-to-interface
inheritance (`extends` clause).

#### IMPLEMENTS edges

> `{#indexing::edges.implements}`

An `IMPLEMENTS` edge is created for class-to-interface implementation
(`implements` clause).

#### TAKES edges

> `{#indexing::edges.takes}`

A `TAKES` edge is created from a function or method to each user-defined type
referenced in its parameter type annotations.

#### RETURNS edges

> `{#indexing::edges.returns}`

A `RETURNS` edge is created from a function or method to each user-defined type
referenced in its return type annotation.

For factory functions without an explicit return type that return an object
literal, a `RETURNS` edge points to the corresponding `SyntheticType` node.

#### HAS_TYPE edges

> `{#indexing::edges.has-type}`

A `HAS_TYPE` edge is created from a variable to its type annotation. Variables
whose initializer is an arrow function or function expression are excluded (those
use `TAKES`/`RETURNS` instead).

#### HAS_PROPERTY edges

> `{#indexing::edges.has-property}`

A `HAS_PROPERTY` edge is created from a class, interface, or object literal
variable to each user-defined type referenced in its property type annotations.

#### DERIVES_FROM edges

> `{#indexing::edges.derives-from}`

A `DERIVES_FROM` edge is created from a type alias to each member of a union or
intersection composition.

```
type Result = Success | Failure;
// Result --DERIVES_FROM--> Success
// Result --DERIVES_FROM--> Failure
```

#### ALIAS_FOR edges

> `{#indexing::edges.alias-for}`

An `ALIAS_FOR` edge is created when a type alias is a direct reference to another
type (not a union or intersection).

```
type Person = User;         // Person --ALIAS_FOR--> User
type Users = User[];        // Users --ALIAS_FOR--> User
type MaybeUser = Partial<User>;  // MaybeUser --ALIAS_FOR--> User (built-in unwrapped)
```

`ReturnType<typeof fn>` patterns produce `ALIAS_FOR` edges targeting the
corresponding `SyntheticType` node.

#### REFERENCES edges

> `{#indexing::edges.references}`

A `REFERENCES` edge is created when a function or variable is passed or stored
rather than directly invoked. The edge includes `referenceContext` indicating the
usage pattern:

- `"callback"` -- passed as argument: `array.map(fn)`
- `"property"` -- stored in object: `{ handler: fn }`
- `"array"` -- stored in array: `[fn1, fn2]`
- `"return"` -- returned: `return fn`
- `"assignment"` -- assigned to variable: `const x = fn`
- `"access"` -- accessed dynamically: `formatters[type]`

### Type edge rules

#### Primitive types are skipped

> `{#indexing::types.primitive-skipping}`

Type edges (`TAKES`, `RETURNS`, `HAS_TYPE`, `HAS_PROPERTY`, `DERIVES_FROM`,
`ALIAS_FOR`) never target primitive types: `string`, `number`, `boolean`,
`symbol`, `bigint`, `void`, `never`, `any`, `unknown`, `null`, `undefined`.

#### Built-in types are unwrapped

> `{#indexing::types.builtin-unwrapping}`

Built-in generic wrapper types are not targeted by edges. Instead, the inner
type argument is extracted.

`Promise<User>` produces an edge to `User`, not to `Promise`.

Built-in types: `Array`, `Map`, `Set`, `Promise`, `Date`, `RegExp`, `Error`,
`Function`, `Object`, `String`, `Number`, `Boolean`, `Symbol`, `BigInt`,
`WeakMap`, `WeakSet`. For type alias edges, additionally: `Partial`, `Required`,
`Readonly`, `Pick`, `Omit`, `Record`, `Exclude`, `Extract`, `NonNullable`,
`ReturnType`, `Parameters`, `InstanceType`, `ConstructorParameters`.

#### Union types produce multiple edges

> `{#indexing::types.union-multiple-edges}`

When a type annotation is a union (`A | B`), separate edges are created for each
non-primitive, non-null member. `User | null` produces one edge to `User`.

## Re-export transparency

> `{#indexing::re-export-transparency}`

Re-exports (barrel files) are completely invisible in the graph. When file X
imports a symbol from a barrel file that re-exports from file Y, the graph shows
an edge directly from X to Y's actual definition.

```typescript
// barrel/index.ts: export { clamp } from './helpers';
// consumer.ts: import { clamp } from './barrel';
// Graph: consumer.ts --CALLS--> barrel/helpers.ts:clamp
```

This is achieved at indexing time by following alias chains through
`getAliasedSymbol()` until the actual definition is reached. Barrel files that
contain only re-exports have no symbol nodes in the graph.

## Incremental indexing

### Manifest-based change detection

> `{#indexing::sync.manifest-detection}`

After initial indexing, a manifest file (`manifest.json` in the cache directory)
records each indexed file's `mtime` (modification time) and `size`. On the next
startup, each file is compared against this manifest to classify it as:

- **stale** -- file exists but `mtime` or `size` changed
- **deleted** -- file is in manifest but no longer on disk
- **added** -- file is on disk but not in manifest

### Startup sync reindexes stale files

> `{#indexing::sync.stale-reindex}`

On startup, files detected as stale (mtime or size changed since last indexing)
have their old nodes and edges removed, then are re-extracted and re-inserted.
The manifest is updated with the new mtime/size.

### Startup sync removes deleted files

> `{#indexing::sync.deleted-cleanup}`

On startup, files detected as deleted (in manifest but no longer on disk) have
their nodes, edges, and search index entries removed. The file is removed from
the manifest.

### Startup sync indexes new files

> `{#indexing::sync.new-files}`

On startup, files detected as new (on disk but not in manifest) are indexed and
added to the manifest.

### File watcher detects changes

> `{#indexing::watch.change-detection}`

While the server is running, file changes (add, modify) trigger automatic
reindexing. The old data for that file is removed before re-extraction. The
manifest is updated after each batch.

### File watcher validates against tsconfig

> `{#indexing::watch.tsconfig-validation}`

The file watcher only indexes files that belong to a configured package and pass
tsconfig validation. Files outside any package directory, `node_modules`, `.d.ts`
files, and non-TypeScript files are ignored.

### File watcher removes deleted files

> `{#indexing::watch.unlink-cleanup}`

When a watched file is deleted, its nodes, edges, and search index entries are
removed immediately (not debounced). The manifest entry is removed.

### Debounce batches rapid changes

> `{#indexing::watch.debounce-batching}`

In native filesystem event mode (`polling: false`), rapid file changes are
batched via debouncing. Events accumulate until a quiet period (configurable,
default 300ms) passes, then the batch is processed. Duplicate paths within a
batch are deduplicated.

### Polling mode for non-native filesystems

> `{#indexing::watch.polling-mode}`

When `polling: true`, the watcher scans the filesystem at a configurable interval
(default 1000ms) instead of relying on OS filesystem events. This is required for
Docker, WSL2, and NFS environments where native events are unreliable. In polling
mode, debouncing is not applied (polling inherently batches).

## Monorepo support

### Workspace map resolution

> `{#indexing::monorepo.workspace-map}`

For monorepos, a workspace map is built from the root `package.json` `workspaces`
field. Each workspace package's npm name is mapped to its source entry file path
(inferred from `package.json` `main` + `tsconfig.json` `outDir`/`rootDir`).

This map is used by a custom ts-morph module resolution host: when an import
references a workspace package name (e.g., `@libs/toolkit`), it resolves directly
to the source entry file, not compiled output.

Supported workspace glob patterns: `libs/*`, `packages/core` (direct path),
`modules/**` (recursive).

### Cross-package edge resolution

> `{#indexing::monorepo.cross-package-edges}`

When a file in package A imports a symbol from package B, edge extractors use the
import map to resolve the target to package B's source file. The import map
follows re-export chains across package boundaries.

If a barrel file uses path aliases from a different tsconfig context (e.g.,
`@/components` in package B's tsconfig), cross-package resolution uses B's
compiler options to resolve the path alias, then parses the target file on demand
to follow the re-export chain to the actual definition.

### Namespace import resolution

> `{#indexing::monorepo.namespace-resolution}`

Namespace re-exports (`export * as MathUtils from './math'`) are resolved to
actual definitions. When a caller invokes `MathUtils.multiply()`, the call edge
points to the actual `multiply` function definition, not the namespace.

Cross-package namespace resolution uses the target package's compiler options to
resolve internal path aliases that the caller's tsconfig cannot resolve.

## Processing model

### Sequential package processing

> `{#indexing::memory.sequential-projects}`

Packages are processed one at a time. At most one ts-morph Project (full AST for
all files in a package) is loaded in memory simultaneously. After a package is
fully processed (all files extracted), its Project is released before the next
package begins.

This bounds peak memory to the size of the largest single package, not the sum of
all packages.

### Lightweight cross-package resolution

> `{#indexing::memory.lightweight-cross-package}`

Cross-package edge resolution (resolving imports that cross package boundaries)
uses lazy ts-morph Projects for target packages. A lazy Project is created with
`skipAddingFilesFromTsConfig: true` — it holds compiler options and resolution
host but loads zero source files at creation. Barrel files and re-export targets
are resolved on demand when `getModuleSpecifierSourceFile()` is called.

This means processing package A never forces loading package B's full AST. A
monorepo with N packages holds at most 1 full ts-morph Project + N lazy
Projects (compiler options + resolution host only).

### Per-file streaming

> `{#indexing::streaming.per-file}`

Files are processed one at a time: extract nodes, generate embeddings, write to
DB, extract edges, write to DB. No global accumulation of nodes or edges across
files. Each file's import map contains only its own imports (~100 entries),
keeping memory usage constant regardless of project size.

### Embedding generation

> `{#indexing::embedding.generation}`

Each node's source snippet is extracted and embedded (vector embedding) during
indexing. The embedding and a content hash are stored. Nodes are added to an
in-memory search index (Orama) for hybrid BM25 + vector search.

### Embedding cache reuse

> `{#indexing::embedding.cache-reuse}`

When reindexing a file whose content has not changed, the embedding cache avoids
regenerating embeddings. The cache is keyed by content hash, so unchanged symbols
reuse their previously computed embeddings.

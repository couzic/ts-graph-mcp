# Spec Traceability

**Status:** ✅ Implemented

**ID:** `traceability`

Indexes spec and feature definitions from `*.feature.md` files under `specs/`,
and test structures from `*.test.ts` files, as first-class graph nodes. Connects
them to implementation code via dedicated edge types.

**Traceability nodes have an optional `package`:** Feature, Spec, TestSuite, and
Test nodes are not TypeScript symbols. In TypeScript, they use a separate base
type with `package?: string` (optional) instead of `package: string` (required).
In SQLite, the `package` column is nullable.

Feature and Spec nodes inherit their package from an optional `**Package:**`
declaration in the feature file header. TestSuite and Test nodes have no package.

## Node Types

### Feature nodes

> `{#traceability::feature-nodes}`

A **Feature** node is created for each feature declared in a `*.feature.md` file
under the `specs/` directory at the project root. Only `specs/` is scanned;
feature files elsewhere are not indexed.

| Property    | Source                                       |
| ----------- | -------------------------------------------- |
| `id`        | `specs/{path}:Feature:{featureId}` (e.g., `specs/tool/tool.feature.md:Feature:tool`) |
| `type`      | `"Feature"`                                  |
| `name`      | Feature ID (e.g., `tool`, `search.semantic`) |
| `filePath`  | Relative path to the feature file            |
| `startLine` | Line of the `# heading`                      |
| `endLine`   | Last line of the file (or next feature boundary) |
| `package`   | From `**Package:** \`{name}\`` header (optional) |
| `exported`  | `false`                                      |

**Content for search:** The feature heading and any prose between the heading and
the first spec section.

### Spec nodes

> `{#traceability::spec-nodes}`

A **Spec** node is created for each spec ID declared with `{#spec-id}` in a
`*.feature.md` file.

| Property    | Source                                                |
| ----------- | ----------------------------------------------------- |
| `id`        | `specs/{path}:Spec:{specId}` (e.g., `specs/tool/tool.feature.md:Spec:tool::forward-traversal`) |
| `type`      | `"Spec"`                                              |
| `name`      | Spec ID (e.g., `tool::forward-traversal`)             |
| `package`   | Inherited from parent Feature node (optional)         |
| `filePath`  | Relative path to the feature file                     |
| `startLine` | Line of the spec's heading                            |
| `endLine`   | Last line before the next heading of same or higher level |
| `exported`  | `false`                                               |

**Content for search:** The spec heading + full body text (everything between the
`{#id}` line and the next heading of same or higher level).

### TestSuite nodes

> `{#traceability::testsuite-nodes}`

A **TestSuite** node is created for each `describe()` block in test files
(`*.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`).

| Property    | Source                                                |
| ----------- | ----------------------------------------------------- |
| `id`        | `{filePath}:TestSuite:{fullPath}` (see below)         |
| `type`      | `"TestSuite"`                                         |
| `name`      | The string argument to `describe()` (e.g., `"formatDate"`) |
| `filePath`  | Relative path to the test file                        |
| `startLine` | Line of the `describe()` call                         |
| `endLine`   | End line of the `describe()` block                    |
| `exported`  | `false`                                               |

The `fullPath` in the ID is the `>` -separated chain of ancestor describe names
plus the current one:

- Top-level: `src/utils.test.ts:TestSuite:formatDate`
- Nested: `src/utils.test.ts:TestSuite:formatDate > edge cases`

### Test nodes

> `{#traceability::test-nodes}`

A **Test** node is created for each `it()` block in test files.

| Property    | Source                                                |
| ----------- | ----------------------------------------------------- |
| `id`        | `{filePath}:Test:{fullPath}` (see below)              |
| `type`      | `"Test"`                                              |
| `name`      | The string argument to `it()` (e.g., `"formats ISO dates"`) |
| `filePath`  | Relative path to the test file                        |
| `startLine` | Line of the `it()` call                               |
| `endLine`   | End line of the `it()` block                          |
| `exported`  | `false`                                               |

The `fullPath` in the ID is the `>` -separated chain of ancestor describe names
plus the test name:

- Top-level (no describe): `src/utils.test.ts:Test:formats ISO dates`
- Nested: `src/utils.test.ts:Test:formatDate > formats ISO dates`
- Deep: `src/utils.test.ts:Test:formatDate > edge cases > handles null`

## Edge Types

`CONTAINS`, `SPECIFIES`, and `VERIFIED_BY` form a new
`TRACEABILITY_EDGE_TYPES` category alongside `RUNTIME_EDGE_TYPES` and
`COMPILE_TIME_EDGE_TYPES`.

### CONTAINS edges

> `{#traceability::contains}`

The `CONTAINS` edge type represents hierarchical containment:

| Source    | Target    | Meaning                               |
| --------- | --------- | ------------------------------------- |
| Feature   | Spec      | Feature groups specs                  |
| TestSuite | TestSuite | Nested describe blocks                |
| TestSuite | Test      | Test inside a describe                |

### SPECIFIES edges

> `{#traceability::specifies}`

`Spec --SPECIFIES--> Node` — links a spec to the implementation code that
fulfills it.

Created when a `@spec {specId}` JSDoc annotation is found in an implementation
file (not a test file). The target is the graph node that owns the annotated
declaration — either the annotated symbol itself (if top-level) or the enclosing
function/method/class (if the annotation is on a descendant).

A single spec can SPECIFIES multiple implementation nodes. A single
implementation node can be specified by multiple specs.

### VERIFIED_BY edges

> `{#traceability::verified-by}`

`Spec --VERIFIED_BY--> Test | TestSuite` — links a spec to the tests that
verify it.

Created when a `@spec {specId}` JSDoc annotation is found in a test file on a
`describe` or `it` block. The target is the corresponding TestSuite or Test
node.

Resolution: the closest `@spec` wins. A `@spec` on an `it` overrides the one on
the parent `describe`.

## Search indexing

> `{#traceability::search-indexing}`

All four new node types (Feature, Spec, TestSuite, Test) are added to the search
index for both BM25 (lexical) and vector (semantic) search, using the same
snippet-based approach as all other node types.

- **Feature/Spec:** Content is the markdown within the node's line range.
- **TestSuite/Test:** Content is the source code within the node's line range.

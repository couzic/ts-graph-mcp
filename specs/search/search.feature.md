# Search

**Status:** ✅ Implemented

**ID:** `search`

Shared concepts across all search modes.

## Search modes

> `{#search::modes}`

The system supports three search modes: lexical `[@search.lexical]`, semantic
`[@search.semantic]`, and hybrid `[@search.hybrid]`. When a query includes a
vector, hybrid mode is used. When no vector is provided, only lexical (BM25)
search is performed.

## Searchable units

> `{#search::searchable-units}`

Each graph node becomes one searchable document. The searchable node types are:
Function, Class, Method, Interface, TypeAlias, Variable, SyntheticType.

Only nodes are searchable. Edges are not indexed in the search system.

## Index schema

> `{#search::index-schema}`

Each document in the search index has the following fields:

| Field       | Type     | Description                                                |
| ----------- | -------- | ---------------------------------------------------------- |
| `id`        | string   | Node ID (e.g., `src/utils.ts:formatDate`)                  |
| `symbol`    | string   | Symbol name (e.g., `formatDate`)                           |
| `file`      | string   | File path (e.g., `src/utils.ts`)                           |
| `nodeType`  | string   | Node type (e.g., `Function`, `Class`)                      |
| `content`   | string   | Preprocessed text for BM25 (see `[@search::content-field-composition]`) |
| `embedding` | vector   | Embedding vector for semantic search (optional)            |

## Content field composition

> `{#search::content-field-composition}`

The `content` field stored in the index is the concatenation of the preprocessed
symbol name (see `[@search::identifier-preprocessing]`) followed by a space,
followed by the source snippet of the node.

For example, a node named `validateCart` with snippet
`function validateCart() { return true; }` produces the content:
`validate Cart validateCart function validateCart() { return true; }`.

## Preprocessing

Identifiers (symbol names) are preprocessed before BM25 indexing to enable
matching on individual words within compound identifiers.

### Identifier preprocessing

> `{#search::identifier-preprocessing}`

The preprocessed form of a multi-word identifier is the split form followed by a
space and the original identifier. For a single-word identifier, the
preprocessed form is the identifier itself.

Example: `preprocessForBM25("validateCart")` produces `"validate Cart validateCart"`.
Example: `preprocessForBM25("validate")` produces `"validate"`.

### camelCase splitting

> `{#search::preprocessing.camel-case}`

camelCase identifiers are split at lowercase-to-uppercase transitions.

`validateCart` becomes `validate Cart`.

### PascalCase splitting

> `{#search::preprocessing.pascal-case}`

PascalCase identifiers are split at lowercase-to-uppercase transitions.

`ValidateCart` becomes `Validate Cart`.

### Acronym handling

> `{#search::preprocessing.acronym}`

Consecutive uppercase letters (acronyms) are kept together, with a split before
the final uppercase-lowercase transition.

`XMLParser` becomes `XML Parser`. `parseJSON` becomes `parse JSON`.

### snake_case splitting

> `{#search::preprocessing.snake-case}`

Underscores are replaced with spaces.

`validate_cart` becomes `validate cart`.

### kebab-case splitting

> `{#search::preprocessing.kebab-case}`

Hyphens are replaced with spaces.

`validate-cart` becomes `validate cart`.

### Single-word identity

> `{#search::preprocessing.single-word}`

A single-word identifier is returned unchanged.

`validate` becomes `validate`.

## Result structure

> `{#search::result-structure}`

Each search result contains:

| Field      | Type     | Description                   |
| ---------- | -------- | ----------------------------- |
| `id`       | string   | Node ID                       |
| `symbol`   | string   | Symbol name                   |
| `file`     | string   | File path                     |
| `nodeType` | NodeType | Node type                     |
| `score`    | number   | Relevance score (higher = better) |

## Result limiting

### Default result limit

> `{#search::result-limit-default}`

When no limit is specified, search returns at most 10 results.

### Custom result limit

> `{#search::result-limit-custom}`

The caller can specify a custom `limit` to control the maximum number of
results.

## Filtering

### Node type filtering

> `{#search::filter.node-type}`

Search accepts an optional list of node types. When provided, only documents
matching one of the specified types are returned.

### File path filtering

> `{#search::filter.file-path}`

Search accepts an optional file path pattern. When provided, only documents
matching the pattern are returned.

## Ordering

### Results sorted by score descending

> `{#search::result-ordering}`

Results are returned sorted by score in descending order (highest score first).

### Zero-score exclusion

> `{#search::zero-score-exclusion}`

Results with a score of zero are excluded from the output.

## Index lifecycle

### Document removal by ID

> `{#search::removal.by-id}`

A document can be removed from the index by its ID. After removal, the document
no longer appears in search results.

### Document removal by file

> `{#search::removal.by-file}`

All documents belonging to a given file can be removed in one operation. After
removal, none of those documents appear in search results.

### Index persistence

> `{#search::index-persistence}`

The search index can be exported and later restored. A restored index produces
the same search results as the original.

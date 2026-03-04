# Lexical Search

**Status:** ✅ Implemented

**ID:** `search.lexical`

## BM25 algorithm

> `{#search.lexical::bm25-algorithm}`

The search index uses BM25 (Orama) as its lexical scoring algorithm. BM25
scores indicate term-frequency relevance: higher scores mean the query terms
appear more frequently and more specifically in the document relative to the
corpus.

## Indexed fields

> `{#search.lexical::indexed-fields}`

The BM25 index contains four searchable string fields per document:

- `symbol` — the raw symbol name (e.g., `"validateCart"`)
- `file` — the file path (e.g., `"src/utils.ts"`)
- `nodeType` — the node type (e.g., `"Function"`, `"Class"`)
- `content` — preprocessed text combining the symbol name and source snippet
  (see `[@search.lexical::content-field-composition]`)

A BM25 query searches across all four fields. No field restriction is applied.

### Content field composition

> `{#search.lexical::content-field-composition}`

The `content` field stored in the index is composed of two parts, concatenated
with a space:

1. The BM25-preprocessed symbol name
   (see `[@search.lexical::preprocessing-preserves-original]`)
2. The source code snippet of the symbol (full node content from source file)

Given a symbol `validateCart` with snippet `function validateCart() { ... }`, the
stored `content` field is:
`"validate Cart validateCart function validateCart() { ... }"`.

This means a query for `"validate"` matches both via the split symbol name in
`content` and via the source snippet.

## Identifier splitting

Identifier splitting is a preprocessing step applied to symbol names before BM25
indexing. It breaks compound identifiers into individual words.

### CamelCase splitting

> `{#search.lexical::camelcase-splitting}`

A lowercase-to-uppercase transition inserts a space.

`"validateCart"` becomes `"validate Cart"`.

### PascalCase splitting

> `{#search.lexical::pascalcase-splitting}`

Same rule applies to PascalCase identifiers.

`"ValidateCart"` becomes `"Validate Cart"`.

### Acronym splitting

> `{#search.lexical::acronym-splitting}`

A sequence of uppercase letters followed by an uppercase-then-lowercase
transition inserts a space before the last uppercase letter.

- `"XMLParser"` becomes `"XML Parser"`
- `"parseJSON"` becomes `"parse JSON"`

### Snake case splitting

> `{#search.lexical::snake-case-splitting}`

Underscores are replaced with spaces.

`"validate_cart"` becomes `"validate cart"`.

### Kebab case splitting

> `{#search.lexical::kebab-case-splitting}`

Hyphens are replaced with spaces.

`"validate-cart"` becomes `"validate cart"`.

### Mixed case splitting

> `{#search.lexical::mixed-case-splitting}`

All splitting rules apply simultaneously. Underscores, hyphens, and case
transitions are all handled.

`"validate_Cart-Items"` becomes `"validate Cart Items"`.

### Single word identity

> `{#search.lexical::single-word-identity}`

A single-word identifier with no separators is returned unchanged.

`"validate"` becomes `"validate"`.

## BM25 preprocessing

### BM25 preprocessing preserves original

> `{#search.lexical::preprocessing-preserves-original}`

When the split result differs from the original symbol name, both the split form
and the original form are included, separated by a space.

`preprocessForBM25("validateCart")` produces `"validate Cart validateCart"`.

This ensures exact matches on the original compound identifier still rank highly.

### BM25 preprocessing single word passthrough

> `{#search.lexical::preprocessing-single-word-passthrough}`

When the split result is identical to the original (single word, no separators),
only one copy is returned.

`preprocessForBM25("validate")` produces `"validate"`.

## Fulltext-only mode

> `{#search.lexical::fulltext-only-mode}`

When a search is performed without a vector (no `SearchOptions.vector`
provided), the search runs BM25 only. Results are ranked by raw BM25 score
(Orama's native scoring), not by the hybrid scoring formula
`[@search.hybrid]`.

## Result options

### Default result limit

> `{#search.lexical::default-result-limit}`

When no `limit` option is provided, the search returns at most 10 results.

### Node type filtering

> `{#search.lexical::node-type-filtering}`

When `nodeTypes` is provided in search options, results are restricted to
documents matching one of the specified node types. The filter applies to the
`nodeType` field (e.g., `"Function"`, `"Class"`, `"Interface"`).

### File path filtering

> `{#search.lexical::file-path-filtering}`

When `filePattern` is provided in search options, results are restricted to
documents whose `file` field matches the pattern.

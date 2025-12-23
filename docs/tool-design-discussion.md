# MCP Tool Design Discussion Summary

> Summary of design discussion about ts-graph-mcp tools, focusing on what AI coding agents actually need.

---

## The Core Question

**Original observation**: `analyzeImpact` has a prescriptive name (describes use case) rather than capability-focused name (describes what it does). This might cause AI agents to underuse it.

**Broader question**: How should we design and name tools so AI agents can effectively leverage them?

---

## Key Insights from Discussion

### 1. The Graph's Unique Value = Transitivity

**What grep/LSP can do well:**
- Shallow breadth (find all mentions of X)
- Direct relationships (immediate callers/callees)
- Point queries (definition, references)

**What the graph uniquely provides:**
- **Transitive traversal** — callers of callers of callers
- **Path finding** — how does A connect to B through the graph?
- **Cross-module analysis** — resolved imports, not just text matches

**Conclusion**: Don't compete with grep on shallow queries. Win where grep can't go: transitivity.

### 2. Exploration Tools Are Not Needed

We evaluated several "exploration" tool ideas:

| Tool Idea | Verdict | Reason |
|-----------|---------|--------|
| `findEntryPoints` | **Don't build** | User provides entry point, or trace `incomingCallsDeep` to roots |
| `exploreContext` | **Don't build** | Grep + reading files handles shallow breadth |
| `getNeighborhood` | **Already removed** | Output explosion, grep is sufficient |

**Key insight**: The graph's value is depth (transitivity), not breadth at depth 1.

### 3. Single Direction Per Task

Analysis showed that most tasks need ONE direction:

| Task | Direction Needed |
|------|------------------|
| Understand function behavior | Outgoing (what it calls/depends on) |
| Change function signature | Incoming (what calls it) |
| Delete code safely | Incoming (check nothing uses it) |
| Debug data flow | Outgoing (trace execution) |

Tasks that seem bi-directional are usually **sequential** (ask one, then the other), not simultaneous.

**Conclusion**: Keep directional tools separate. Parallel tool calls handle the rare bi-directional cases.

### 4. The "All Edge Types" Problem

Current `analyzeImpact` traverses ALL edge types (CALLS, IMPORTS, USES_TYPE, EXTENDS, IMPLEMENTS).

**Problem**: Real tasks target **specific** relationship types:
- Changing function signature → only CALLS matter
- Changing interface → only USES_TYPE, EXTENDS, IMPLEMENTS matter
- Runtime debugging → only CALLS matter

Mixing edge types makes output **harder to act on**, not easier.

### 5. Runtime vs Compile-Time Framing

**Agreed direction**: Organize tools by problem domain:

| Problem Domain | What You're Debugging | Relevant Edges |
|----------------|----------------------|----------------|
| **Runtime** | Behavior bugs, data flow | CALLS + REFERENCES |
| **Compile-time** | Type errors, interface changes | USES_TYPE, EXTENDS, IMPLEMENTS |

This matches how developers think:
- "Function returns wrong data" → trace calls (runtime)
- "Type error after changing interface" → trace type deps (compile-time)

### 6. Package Tools: Useful but Rare

| Use Case | Value |
|----------|-------|
| Architecture overview | Marginal — one-time question |
| Refactoring planning | Low — need symbol-level anyway |
| Impact assessment | Redundant — `analyzeImpact` has module breakdown |
| Mermaid diagrams | Unique — but rare need |

**Decision pending**: Keep both, consolidate, or remove.

---

## Decisions Made

### 1. Naming Convention

**Use `Dependencies` not `Deps`** — "Deps" is too close to "Deep", causing confusion.

Pattern: `{direction}{Relationship}Deep`

Examples:
- `incomingCallsDeep` ✓
- `outgoingCallsDeep` ✓
- `incomingTypeDependenciesDeep` (proposed)
- `incomingPackageDependencies` (renamed from `incomingPackageDeps`)

### 2. Keep Call Graph Tools Separate

**Keep `incomingCallsDeep` and `outgoingCallsDeep` as distinct tools.**

Rationale:
- Proven value in practice
- 100% aligned with LSP naming (`incomingCalls`, `outgoingCalls`)
- Most frequently used tools

### 3. Tool Structure: 2 Tools by Direction

For new type-dependency tools, use **Option B** (2 tools with direction in name, edge type as parameter):

```typescript
incomingDependenciesDeep(symbol, edgeType?: "runtime" | "compile-time" | "all")
outgoingDependenciesDeep(symbol, edgeType?: "runtime" | "compile-time" | "all")
```

**Rationale:**
- Direction (primary axis) encoded in name
- Edge type (refinement) as optional parameter, defaults to "all"
- Scales well — adding edge types doesn't require new tools
- Matches how agents think about problems

### 4. Remove `analyzeImpact`

The "all edge types" aggregation is rarely what you want. Replace with:
- `incomingCallsDeep` for runtime (CALLS)
- `incomingTypeDependenciesDeep` for compile-time (USES_TYPE + EXTENDS + IMPLEMENTS)

---

## New Edge Type: REFERENCES

### The Problem

Static CALLS edges only capture ~50-70% of function relationships in typical web applications. Missing:
- Callbacks: `array.map(processItem)` — `processItem` not captured
- Route handlers: `{ handler: getUsers }` — `getUsers` not captured
- Event handlers: `emitter.on('event', handleEvent)` — `handleEvent` not captured
- Stored functions: `handlers.set('save', saveUser)` — `saveUser` not captured

### The Solution

Add a `REFERENCES` edge type that captures when a function is passed/stored but not directly invoked:

| Edge Type | Meaning | Example |
|-----------|---------|---------|
| `CALLS` | Direct invocation | `fn()` |
| `REFERENCES` | Function passed/stored | `map(fn)`, `{ handler: fn }` |

### Feasibility Assessment

**Verdict: Highly feasible with ~85-90% accuracy**

| Pattern | Accuracy |
|---------|----------|
| Callback arguments: `arr.map(fn)` | ~99% |
| Object properties: `{ handler: fn }` | ~99% |
| Array elements: `[fn1, fn2]` | ~99% |
| Return values: `return handleUser` | ~99% |
| Variable assignments: `const x = fn` | ~95% |

**Hard/Impossible patterns:**
- Dynamic property access: `obj[key]` — 0%
- Destructuring: `{ fn } = config` — ~50%
- Spread: `[...handlers]` — ~30%

### Implementation

- ~150-200 lines of code (similar to existing edge extractors)
- Uses ts-morph type checking to identify function types
- Clear AST distinction from CALLS (callee position vs value position)

### Impact on Tools

With REFERENCES edges, the runtime category becomes:

| Category | Edge Types |
|----------|------------|
| **Runtime** | CALLS + REFERENCES |
| **Compile-time** | USES_TYPE + EXTENDS + IMPLEMENTS |

This means `incomingCallsDeep` could optionally include REFERENCES edges, capturing indirect function relationships.

### Example: Route Handlers

```typescript
const userFormatters = {
  customer: formatCustomer,  // REFERENCES: userFormatters → formatCustomer
}

function getFormatter(type) {
  return userFormatters[type];  // REFERENCES: getFormatter → userFormatters
}
```

Path now works: `getFormatter → REFERENCES → userFormatters → REFERENCES → formatCustomer`

---

## Evaluated and Rejected

### ACCESS_FIELD Edge Type

**Verdict: Don't build**

Would track property/field access (`user.name`, `user.email`).

| Criterion | Assessment |
|-----------|------------|
| Relevance | Low — LSP `findReferences` handles this |
| Feasibility | ~70% accuracy (dynamic access, destructuring, spread fail) |
| LSP overlap | High — `findReferences` on a property works better |

The 30% miss rate undermines trust, and LSP already covers the primary use cases.

---

## Proposed Tool Set

### Core Tools (Keep)

```
incomingCallsDeep        — who calls this? (CALLS, transitive)
outgoingCallsDeep        — what does this call? (CALLS, transitive)
findPaths                — how do A and B connect?
```

### New Tools (Add)

```
incomingTypeDependenciesDeep  — what depends on this type? (compile-time)
outgoingTypeDependenciesDeep  — what types does this use? (compile-time)
```

### Package Tools (Rename for Consistency)

```
incomingPackageDependencies   — what packages depend on this? (renamed)
outgoingPackageDependencies   — what does this package depend on? (renamed)
```

### Removed

```
analyzeImpact                 — replaced by focused tools above
```

---

## New Edge Type (Add)

```
REFERENCES                    — function passed/stored but not invoked
```

Metadata: `referenceContext?: "callback" | "object-property" | "array-element" | "return-value" | "variable"`

---

## Open Questions

1. **Package tools**: Keep both, consolidate to one with direction param, or remove?

2. **REFERENCES in call tools**: Should `incomingCallsDeep` include REFERENCES edges by default, or as an option?

3. **Edge type parameter naming**: `"runtime" | "compile-time"` or something else?

---

## Next Steps

- [x] Decide on naming convention (`Dependencies` not `Deps`)
- [x] Decide to keep `incomingCallsDeep`/`outgoingCallsDeep` separate
- [x] Evaluate REFERENCES edge type (feasible, ~85-90% accuracy)
- [x] Evaluate ACCESS_FIELD edge type (rejected)
- [ ] Decide on package tools fate
- [ ] Implement REFERENCES edge extraction
- [ ] Add type-dependency tools
- [ ] Update ROADMAP.md with implementation plan
- [ ] Update ARCHITECTURE.md

---

*Document updated from design discussion, December 2024*

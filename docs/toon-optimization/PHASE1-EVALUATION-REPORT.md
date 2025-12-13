# Phase 1: TOON Output Format Evaluation Report

## Executive Summary

This report evaluates the current TOON (Token-Oriented Object Notation) output format across all 7 MCP tools in ts-graph-mcp. The analysis reveals that while TOON already achieves **~60-65% token reduction vs JSON**, there are significant opportunities for **additional 40-50% reduction** through systematic elimination of redundant data.

### Key Findings

| Tool | Current Chars | Potential | Savings | Comprehensibility |
|------|--------------|-----------|---------|-------------------|
| search_nodes | ~750 | ~430 | **43%** | 8/10 → 9/10 |
| get_callers | ~500 | ~300 | **40%** | 9/10 → 9/10 |
| get_callees | ~500 | ~300 | **40%** | 9/10 → 9/10 |
| get_impact | ~685 | ~230 | **66%** | 7/10 → 9/10 |
| find_path | ~450 | ~180 | **60%** | 7/10 → 8/10 |
| get_neighbors | ~850 | ~350 | **59%** | 7/10 → 9/10 |
| get_file_symbols | ~8,000 | ~4,100 | **48%** | 7/10 → 9/10 |

**Overall Assessment: Current format is functional (7-9/10) but contains 40-60% redundant data.**

---

## Tool-by-Tool Analysis

### 1. search_nodes

**Purpose:** Search for nodes by name pattern with filters.

**Current Output Sample:**
```yaml
count: 11
module: ts-graph-mcp
package: main

interfaces[11]{extends,id,name,filePath,startLine,endLine,exported}:
  [],"src/db/Types.ts:BaseNode",BaseNode,src/db/Types.ts,24,51,true
  ['BaseNode'],"src/db/Types.ts:FunctionNode",FunctionNode,src/db/Types.ts,54,59,true
  ...
```

**Redundancies Identified:**
| Field | Waste | Impact |
|-------|-------|--------|
| `filePath` (in id) | ~200 chars | 27% |
| `name` (in id) | ~110 chars | 15% |
| Total | ~310 chars | **41%** |

**Comprehensibility:** 8/10
- Clear structure with metadata hoisting ✅
- Type grouping makes scanning easy ✅
- Redundant fields create noise ❌

**Recommended Fix:** File-level hierarchical grouping (see `07-hierarchical-output.md`)

---

### 2. get_callers

**Purpose:** Find all functions/methods that call the target.

**Current Output Sample:**
```yaml
module: ts-graph-mcp
package: main
count: 3
functions[3]{id,name,filePath,startLine,endLine,exported,parameters,returnType,async}:
  "src/mcp/McpServer.ts:handleSearchNodes",handleSearchNodes,src/mcp/McpServer.ts,210,246,false,"['pattern:string']","Promise<void>",true
  ...
```

**Redundancies Identified:**
| Field | Waste per Node | Total |
|-------|---------------|-------|
| `filePath` | ~20 chars | 27% |
| `name` | ~12 chars | 15% |
| `async: false` | ~5 chars | 3% |

**Comprehensibility:** 9/10
- Metadata hoisting works well ✅
- Condensed table format is clear ✅
- Derivable fields add noise ❌

**Recommended Fix:** Remove `filePath` and `name` fields

---

### 3. get_callees

**Purpose:** Find all functions/methods that the source calls.

**Analysis:** Nearly identical to `get_callers` - same redundancies apply.

**Redundancies Identified:**
- `filePath`: ~28 chars/node (derivable from `id`)
- `name`: ~10 chars/node (derivable from `id`)
- Total: **~40% redundant**

**Comprehensibility:** 9/10

**Recommended Fix:** Same as get_callers

---

### 4. get_impact

**Purpose:** Impact analysis - find all code affected by changes.

**Current Output Sample:**
```yaml
count: 6

properties[2]{id,name,module,package,filePath,startLine,endLine,exported,propertyType,optional,readonly,visibility,static}:
  "src/types.ts:User.id",id,test,mixed-types,src/types.ts,3,3,false,number,false,false,"",false
  ...

functions[3]{id,name,module,package,filePath,startLine,endLine,exported,parameters,returnType,async}:
  "src/utils.ts:getUser",getUser,test,mixed-types,src/utils.ts,5,7,true,"['id:number']",User,false
  ...
```

**Redundancies Identified:**
| Redundant Data | Waste | % of Output |
|----------------|-------|-------------|
| `module,package` repeated | ~120 chars | 25% |
| `filePath` (in id) | ~75 chars | 16% |
| `name` (in id) | ~40 chars | 8% |
| Property defaults | ~36 chars | 8% |
| **Total** | **~271 chars** | **56%** |

**Comprehensibility:** 7/10
- Cross-file results lack visual grouping ❌
- Default values add clutter ❌
- Structure is logical ✅

**Recommended Fix:**
1. Remove derivable fields (`filePath`, `name`)
2. Hierarchical file grouping for multi-file results
3. Omit default values for properties

---

### 5. find_path

**Purpose:** Find shortest path between two nodes.

**Current Output Sample:**
```yaml
found: true
path:
  start: "src/ingestion/Ingestion.ts:indexProject"
  end: "src/db/sqlite/SqliteWriter.ts:addNodes"
  nodes[4]: "src/ingestion/Ingestion.ts:indexProject",...
  edges[3]{source,target,type,callCount,isTypeOnly,importedSymbols,context}:
    "src/ingestion/Ingestion.ts:indexProject","src/ingestion/Extractor.ts:extractFromProject",CALLS,1,"","[]",""
    ...
  length: 3
```

**Redundancies Identified:**
| Redundant Data | Waste | Impact |
|----------------|-------|--------|
| `start` (= nodes[0]) | ~40 chars | 9% |
| `end` (= nodes[last]) | ~45 chars | 10% |
| `length` (= edges.length) | ~10 chars | 2% |
| Edge `source,target` | ~200 chars | 45% |
| Empty edge fields | ~30 chars | 7% |
| **Total** | **~325 chars** | **~70%** |

**Comprehensibility:** 7/10
- Clear success/failure indication ✅
- Path structure is intuitive ✅
- Redundant fields clutter output ❌
- Empty strings/arrays add noise ❌

**Recommended Fix:**
1. Remove `start`, `end`, `length` (all derivable)
2. Remove `source`, `target` from edges (position-implicit)
3. Type-specific edge fields only

**Optimized Format:**
```yaml
found: true
nodes[4]: "src/a.ts:funcA","src/b.ts:funcB","src/c.ts:funcC","src/d.ts:funcD"
edges[3]{type,callCount}:
  CALLS,1
  CALLS,3
  IMPLEMENTS,""
```

---

### 6. get_neighbors

**Purpose:** Extract subgraph - all nodes within N edges of center.

**Current Output Sample:**
```yaml
nodeCount: 5
edgeCount: 4
center:
  id: src/chain.ts:funcA
  type: Function
  name: funcA
  module: test
  package: call-chain
  filePath: src/chain.ts
  ...

functions[4]{id,name,filePath,startLine,endLine,exported,parameters,returnType,async}:
  ...

edges[4]{source,target,type,callCount,isTypeOnly,importedSymbols,context}:
  ...

mermaid: |
  graph LR
  ...
```

**Redundancies Identified:**
- Same redundancies as other node-returning tools
- `center` node repeats all fields despite being in `functions` group
- Mermaid diagram adds ~200+ chars but is valuable for visualization

**Comprehensibility:** 7/10
- Mermaid diagram is excellent for visualization ✅
- Center node provides context ✅
- Field redundancy in nodes ❌

**Recommended Fix:**
1. Simplify center node (just `id` and `type`)
2. Apply standard node optimizations
3. Keep Mermaid diagram (high value)

---

### 7. get_file_symbols

**Purpose:** List all symbols defined in a file.

**Current Output Sample:**
```yaml
module: ts-graph-mcp
package: main
filePath: src/db/Types.ts
count: 88

files[1]{extension,id,name,startLine,endLine,exported}:
  .ts,src/db/Types.ts,Types.ts,1,233,false

interfaces[17]{extends,id,name,startLine,endLine,exported}:
  "","src/db/Types.ts:BaseNode",BaseNode,24,51,true
  ...

properties[66]{propertyType,optional,readonly,visibility,static,id,name,startLine,endLine,exported}:
  string,false,false,"",false,"src/db/Types.ts:BaseNode.id",id,26,26,false
  ...
```

**Redundancies Identified:**
| Redundant Data | Waste | % of Output |
|----------------|-------|-------------|
| ID file prefix | ~1,584 chars | 20% |
| `name` field | ~880 chars | 11% |
| File node entry | ~120 chars | 2% |
| Property defaults | ~1,200 chars | 15% |
| **Total** | **~3,784 chars** | **~48%** |

**Comprehensibility:** 7/10
- Metadata hoisting provides context ✅
- Type grouping is clear ✅
- File node is useless ❌
- ID repetition creates noise ❌

**Recommended Fix:**
1. Strip file prefix from IDs (already in metadata)
2. Remove `name` field
3. Remove `files[1]` entry entirely
4. Omit property default values

---

## Cross-Tool Redundancy Patterns

### Universal Redundancies (All Node-Returning Tools)

1. **`filePath` field** - Always derivable from `id.split(':')[0]`
2. **`name` field** - Always derivable from `id.split(':').pop()`
3. **`module`/`package` when uniform** - Should be hoisted (partially implemented)
4. **Line number format** - Could use range notation `24-51` vs `24,51`

### Tool-Specific Redundancies

| Tool | Specific Redundancy |
|------|---------------------|
| find_path | `start`, `end`, `length`, edge `source`/`target` |
| get_neighbors | Center node duplication |
| get_file_symbols | File node entry |
| All tools | Default value repetition (`false`, `""`, `[]`) |

---

## Implementation Priority Matrix

### Phase 1: Quick Wins (High Impact, Low Effort)

| Change | Impact | Effort | Files to Modify |
|--------|--------|--------|-----------------|
| Remove `filePath` field | 20-27% | 2 hrs | 8 encoder files |
| Remove `name` field | 10-15% | 2 hrs | 8 encoder files |
| Combine line numbers | 2-5% | 1 hr | 8 encoder files |

**Total Phase 1 Impact: ~35-45% reduction**

### Phase 2: Medium Wins (High Impact, Medium Effort)

| Change | Impact | Effort |
|--------|--------|--------|
| Hierarchical file grouping | 15-25% | 1-2 days |
| Remove find_path derivables | 60% for tool | 4 hrs |
| Omit property defaults | 15% for props | 4 hrs |

### Phase 3: Polish (Medium Impact, Higher Effort)

| Change | Impact | Effort |
|--------|--------|--------|
| Type-specific edge fields | 5-10% | 1 day |
| Smart metadata hoisting | 5-10% | 1 day |
| Context-aware ID shortening | 10-15% | 1 day |

---

## Recommendations

### Immediate Actions

1. **Remove derivable fields** (`filePath`, `name`) from all node encoders
   - Location: `src/toon/encode*.ts`
   - Impact: ~35% reduction across all tools
   - Risk: Low (breaking change but documented derivation)

2. **Update find_path format** to remove `start`, `end`, `length`, edge `source`/`target`
   - Location: `src/toon/formatPath.ts`
   - Impact: ~60% reduction for this tool
   - Risk: Medium (significant format change)

### Short-Term Actions

3. **Implement hierarchical file grouping** as proposed in `07-hierarchical-output.md`
   - Creates clearer output structure
   - Enables further ID shortening

4. **Omit default values** for properties (`readonly`, `visibility`, `static`, `exported`)
   - Only include when non-default

### Documentation Updates

5. **Document derivation logic** in MCP tool descriptions
   - `filePath = id.split(':')[0]`
   - `name = id.split(':').pop()`

---

## Conclusion

The current TOON format provides good token efficiency (~60-65% vs JSON) but contains substantial redundancy (~40-60% of output). The redundancies fall into clear categories:

1. **Derivable fields** (filePath, name) - ~25-30% of waste
2. **Path-specific redundancy** (start/end/length/source/target) - ~60% for find_path
3. **Default value repetition** - ~10-15% of waste
4. **Missing hierarchical structure** - reduces comprehensibility

Implementing the recommended changes would achieve:
- **Additional 40-50% token reduction** on top of existing TOON savings
- **~85% total reduction vs JSON**
- **Improved comprehensibility** (less noise, clearer structure)

All proposed optimizations are documented in `docs/toon-optimization/` and align with the existing implementation plan in `08-implementation-plan.md`.

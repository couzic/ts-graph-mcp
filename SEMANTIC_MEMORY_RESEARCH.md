# Semantic Memory for AI Coding Agents

Research on how developers implement semantic memory for AI coding agents like
Claude Code.

## 1. Hybrid Memory with Vector + Graph + KV Stores

[Mem0](https://github.com/mem0ai/mem0) (46k+ GitHub stars) implements a
three-tier architecture:

- **Vector database** — semantic similarity search for content
- **Graph database** — captures relationships between memories
- **Key-value store** — fast access for frequently used data

When a message arrives, an LLM extracts facts/preferences and routes them to
appropriate stores. Retrieval merges results with a scoring layer weighing
relevance, importance, and recency. Claims 91% faster responses and 90% lower
token usage vs full-context approaches.

## 2. Episodic Memory (Conversation History as Memory)

[Episodic-memory plugin](https://blog.fsck.com/2025/10/23/episodic-memory/)
takes a different approach:

- **Reuses Claude Code's existing logs** — `~/.claude/projects/*.jsonl` files
  contain full conversation history
- **SQLite + vector search** — indexes past conversations semantically
- **MCP integration** — gives Claude access to search its own history

Key insight: "searching for 'provider catalog' surfaces conversations about API
design patterns even when those exact words weren't used."

## 3. Dual Memory Systems (Knowledge + Reasoning)

[Cipher](https://github.com/campfirein/cipher) implements System 1/System 2
memory:

| Layer    | Stores                                                  | Purpose                         |
| -------- | ------------------------------------------------------- | ------------------------------- |
| System 1 | Business logic, past interactions, programming concepts | Quick context-aware suggestions |
| System 2 | AI's reasoning steps, problem-solving patterns          | Improve future code generation  |

Backend options: Qdrant/Milvus for vectors, PostgreSQL/SQLite for persistence.
Supports team workspace memory sharing.

## 4. Code-Specific Memory with AST Parsing

[AmanMCP](https://dev.to/nirajkvinit1/building-a-local-first-rag-engine-for-ai-coding-assistants-okp)
addresses the code chunking problem:

- **AST-aware chunking** — tree-sitter parses actual code structure instead of
  fixed token counts
- **Hybrid search** — BM25 + vector with automatic query classification
- **Reciprocal Rank Fusion** — merges results from both search methods
- **Local embeddings** — `nomic-embed-text` via Ollama (no API calls)

Storage: USearch (HNSW algorithm), custom BM25 index, SQLite for metadata.

## 5. GraphRAG for Code Understanding

[code-graph-rag](https://github.com/vitali87/code-graph-rag) and
[codegraph-rust](https://github.com/Jakedismo/codegraph-rust) build knowledge
graphs:

- **Nodes** — classes, functions, methods, modules
- **Edges** — calls, imports, inheritance, type usage
- **Query translation** — natural language → Cypher queries via LLM

The
[Memgraph approach](https://memgraph.com/blog/graphrag-for-devs-coding-assistant):
Tree-sitter generates ASTs, then manually constructs caller relationships.
Memgraph stores the graph in-memory for real-time updates.

Key advantage: Answers structural queries like "How many functions call this
method?" that vector-only RAG struggles with.

## 6. PostgreSQL + pgvector Approach

[Claude Code Semantic Memory MCP](https://github.com/tristan-mcinnis/claude-code-agentic-semantic-memory-system-mcp):

- **memories table** — content, vector embeddings, metadata, timestamps
- **memory_relations table** — parent-child connections between memories
- **Project namespaces** — organize memories by context
- **Immutable memories** — updates create new entries (audit trail)

Two embedding options: simple mathematical algorithms (offline, less precise) or
llama.cpp (better semantics, requires model download).

## Common Patterns

1. **Vector embeddings are table stakes** — every system uses them for semantic
   search
2. **Hybrid retrieval** — combining BM25/keyword with vector similarity improves
   precision
3. **Code-aware chunking** — AST parsing beats fixed-token splits for code
4. **MCP protocol** — the standard integration point for Claude Code
5. **Local-first options** — many support Ollama/llama.cpp to avoid API
   dependencies
6. **Graph augmentation** — growing trend to add relationship graphs on top of
   vectors

## Analysis

### RAG Is Not Memory

Most of these systems conflate RAG with memory. RAG is retrieval at query time.
Memory implies learning and adaptation. Indexing past conversations or code
chunks is retrieval infrastructure, not memory in any meaningful sense.

Episodic memory (raw conversation logs) is not useful in itself — it must be
**distilled into semantic memory**. "User prefers functional style over classes"
is useful. A 500-line conversation where that preference was mentioned is noise.

### Why Graph Is Right for Code

Code has explicit structure (AST) and explicit relationships (calls, imports,
types). Embedding text chunks throws that away. Vector search asks "what's
semantically similar?" but code questions are often structural:

- "What calls this?"
- "How does A reach B?"
- "What implements this interface?"

The right approach: parse AST → extract structure → store as graph → add
embeddings for semantic search on top. Embeddings complement the graph, they
don't replace it.

### What's Missing from Current Systems

1. **Learning from corrections** — when the AI makes a mistake and gets
   corrected, that lesson should persist. None of these systems do this well.

2. **Preference extraction** — coding style, preferred libraries, architectural
   patterns. CLAUDE.md is a manual solution. Could be distilled from past
   interactions, but raw conversation retrieval is too noisy.

3. **Temporal decay** — recent context matters more. A decision made yesterday
   is more relevant than one from six months ago.

### Proposed Architecture

Three distinct layers:

| Layer                | Purpose                   | Approach                               |
| -------------------- | ------------------------- | -------------------------------------- |
| Code structure       | "What calls this?"        | Graph (ts-graph-mcp)                   |
| Project context      | Architecture, conventions | Structured docs + extracted facts      |
| Interaction learning | Corrections, preferences  | Distilled lessons, not raw transcripts |

### The Deeper Problem

True memory requires knowing what's worth remembering. Current approaches index
everything and hope retrieval finds the right thing. Humans don't work that way
— we forget most things and retain what mattered. That filtering/distillation
step is where current systems are weakest.

## Future Directions

### Memory Attached to Code Entities

Instead of memories floating in vector space, anchor them to the code graph.
Function `validateUser` could have attached memories:

- "Known race condition here, be careful"
- "User prefers early return pattern in this file"

When the agent works on that function, relevant memories surface automatically.
The code graph becomes the retrieval key, not just embedding similarity.

### Features as Entities

JIRA tickets, GitHub issues, and features can be first-class nodes in the graph:

```
JIRA-123 "Add user authentication"
  └── COMMITS--> commit abc123
       └── TOUCHES--> src/auth/login.ts
            └── CONTAINS--> validateCredentials()
```

The data already exists:

- JIRA tickets have IDs, descriptions, relationships (epics → stories →
  subtasks)
- Git commits reference tickets (conventional commits, or "PROJ-123" in message)
- Commits touch files → files contain symbols

**Feature graph + code graph = semantic bridge between business and
implementation.**

When the agent works on `validateCredentials`, it could know:

- This was part of feature JIRA-123
- That feature had requirements X, Y, Z
- Related features: JIRA-456 "Password reset"
- The original author, the reviewer, the discussion

### Bug Tickets as Production Insight

JIRA bug tickets linked to commits provide real signals about what caused
problems:

- "This module was refactored 5 times" → architectural smell
- "Functions in this file have high bug density" → warning
- "This pattern was introduced then reverted" → anti-pattern memory
- "This PR had 47 review comments" → complexity warning
- "Bug JIRA-789 was caused by this function" → direct production insight

This is ground truth that doesn't require LLM interpretation — just linking
existing data.

### Distilling from Product Lifecycle

No one has done automated distillation of good/bad decisions from years of
development into retrievable wisdom. It's hard because:

1. Ground truth is delayed — bad decisions only visible years later
2. Causality is murky — did the bug come from decision X or something else?
3. Context-dependent — bad for project A might be right for project B

But the goal is valuable: analyze the entire lifecycle of a product to distill
what were the good and bad decisions.

### Session Analysis → Distillation Pipeline

Practical first step: log Claude Code sessions and extract structured knowledge.

```
Raw session logs (~/.claude/projects/*.jsonl)
    ↓
LLM distillation pass (nightly job)
    ↓
Structured memories:
  - Decisions made
  - Problems solved
  - Corrections given
  - Patterns used
    ↓
Store as typed memories with entity attachments
```

Memory types:

| Type       | Example                                    | Scope   |
| ---------- | ------------------------------------------ | ------- |
| Preference | "Prefer map/filter over forEach"           | User    |
| Fact       | "Auth module uses JWT, not sessions"       | Project |
| Procedure  | "Run integration tests before deploying"   | Project |
| Warning    | "This function has a known race condition" | Entity  |

The distillation prompt matters: "What did the user teach the agent?" vs "What
code was written?" — very different outputs.

### Graph-Based Recall

Current retrieval: `query → embed → nearest neighbors → stuff into context`

Graph-based retrieval:

```
Agent working on validateUser()
    ↓
Traverse graph:
  - What does this call? → database layer
  - What calls this? → API endpoints
  - What feature is this part of? → JIRA-123
  - What memories attached to this subgraph?
    ↓
Rank by relevance to current task
    ↓
Surface: business context + tech context + warnings
```

**The graph provides structure for retrieval.** You don't search the whole
memory space — you walk the graph from the current focus and collect what's
attached.

### Layered Context Engineering

The vision: give the AI exactly what it needs, retrieved via graph traversal.

```
┌─────────────────────────────────────────────────┐
│ Business Context                                │
│ "This is part of the authentication feature,    │
│  required for GDPR compliance, owned by Team X" │
├─────────────────────────────────────────────────┤
│ Technical Context                               │
│ "This function is called by 3 API endpoints,    │
│  calls the user DB, has 87% test coverage"      │
├─────────────────────────────────────────────────┤
│ Convention Context                              │
│ "We use early returns, prefer async/await,      │
│  this file follows the repository pattern"      │
├─────────────────────────────────────────────────┤
│ Wisdom Context                                  │
│ "This module was refactored twice due to perf,  │
│  watch out for N+1 queries"                     │
└─────────────────────────────────────────────────┘
```

### Scope Hierarchy

Different memories have different scopes and update policies:

```
User preferences (follow me across projects)
  └── Project facts (architecture, conventions)
       └── Entity warnings (attached to specific functions/files)
```

### Implementation Roadmap

**Phase 1: Foundation (modest start)**

1. Session logging — already happening via Claude Code logs
2. Distillation pass — nightly job: LLM extracts structured memories
3. Memory attachment — link memories to file paths initially (nodes later)
4. Graph-based recall — when agent opens a file, surface attached memories

**Phase 2: Git Integration**

1. Parse commit messages for ticket references
2. Link commits → files → symbols
3. Surface commit context when working on related code

**Phase 3: Issue Tracker Integration**

1. JIRA/GitHub issues as graph nodes
2. Feature → commit → code linking
3. Bug density signals per file/function

**Phase 4: Long-term Learning**

1. Cross-session pattern detection
2. Temporal analysis (what decisions aged well?)
3. Team knowledge aggregation

### Data Model Sketch

```
memories
  - id
  - type (preference | fact | procedure | warning)
  - content
  - confidence
  - timestamp
  - source (session_id, commit_hash, manual)
  - scope (user | project | entity)

memory_attachments
  - memory_id
  - node_id (nullable — for entity-attached memories)
  - file_path (fallback when node not in graph)

features
  - id
  - external_id (JIRA-123)
  - title
  - description

feature_commits
  - feature_id
  - commit_hash

commit_files
  - commit_hash
  - file_path
```

## Sources

- [Mem0 GitHub](https://github.com/mem0ai/mem0)
- [Episodic Memory Blog](https://blog.fsck.com/2025/10/23/episodic-memory/)
- [Cipher GitHub](https://github.com/campfirein/cipher)
- [AmanMCP Article](https://dev.to/nirajkvinit1/building-a-local-first-rag-engine-for-ai-coding-assistants-okp)
- [code-graph-rag GitHub](https://github.com/vitali87/code-graph-rag)
- [codegraph-rust GitHub](https://github.com/Jakedismo/codegraph-rust)
- [Claude Code Semantic Memory MCP](https://github.com/tristan-mcinnis/claude-code-agentic-semantic-memory-system-mcp)
- [Memgraph GraphRAG Blog](https://memgraph.com/blog/graphrag-for-devs-coding-assistant)

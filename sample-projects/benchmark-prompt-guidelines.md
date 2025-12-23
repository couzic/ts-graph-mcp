# Benchmark Prompt Guidelines

Guidelines for writing realistic benchmark prompts that reflect how developers actually ask questions.

## Why Realism Matters

Unrealistic prompts test **tool functionality**, not **real-world effectiveness**. If prompts don't match how developers actually ask questions, benchmark scores won't predict whether the MCP tools genuinely help users.

**Key insight**: Developers ask questions with *motivation* (debugging, refactoring) while test-style prompts read like *tool verification commands*.

## The Five Rules

### 1. Lead with Motivation

Always explain WHY you're asking. Real developers have context:

| Bad | Good |
|-----|------|
| "Find the call path from X to Y" | "I'm debugging a date formatting bug. How does X reach Y?" |
| "What code is affected?" | "I need to add a field to User. What's going to break?" |
| "Show transitive callers" | "validateEmail has a bug - what endpoints might be affected?" |

### 2. Use Natural Transitive Language

Replace tool jargon with how developers actually speak:

| Tool Jargon | Natural Alternative |
|-------------|---------------------|
| "transitively" | "all the way down", "the full chain" |
| "directly or indirectly" | (omit - implied by question) |
| "transitive dependencies" | "the full dependency tree", "everything it pulls in" |
| "call path" | "how does X reach Y", "what's between X and Y" |
| "trace the path" | "how does X end up calling Y" |

### 3. Use Fuzzy Symbol References

Developers don't quote full file paths. Use natural references:

| Unrealistic | Realistic |
|-------------|-----------|
| `modules/shared/packages/types/src/User.ts` | "the User interface" |
| `modules/backend/packages/api/src/handlers.ts` | "the API handlers" |
| "Look in [full path]" | (omit - let the tool find it) |

### 4. Ask Questions, Don't Issue Commands

Frame prompts as questions a developer would ask, not commands to a tool:

| Command-style | Question-style |
|---------------|----------------|
| "Find the call path from X to Y" | "How does X reach Y?" |
| "Show what it calls transitively" | "What does it call all the way down?" |
| "Trace the path from A to B" | "What's between A and B?" |
| "List all callers" | "What calls this function?" |

### 5. One Natural Concern Per Prompt

Real questions focus on one thing. Avoid compound prompts that sound like test specifications:

| Bad | Good |
|-----|------|
| "Find what calls X and also show the transitive dependencies across all modules" | "What calls X? I need to know what would break if I changed it." |

## Examples: Before and After

### incomingCallsDeep

**Before (Score 2/5):**
> "What API handlers call validateEmail, directly or indirectly? Look in modules/shared/packages/utils/src/validate.ts."

**After (Score 4/5):**
> "I'm debugging an email validation issue. What ends up calling validateEmail? I need to find which API endpoints trigger this code."

**Issues fixed:** Removed full file path, removed "directly or indirectly" coaching, added motivation.

---

### outgoingCallsDeep

**Before (Score 2/5):**
> "What code is between the routes and the database? Start from handleGetUser and show what it calls transitively."

**After (Score 4/5):**
> "I'm tracing a bug in the user fetch flow. Starting from handleGetUser, what does it call all the way down to the database?"

**Issues fixed:** Replaced "transitively" with natural language, added motivation, removed awkward "between" metaphor.

---

### analyzeImpact

**Before (Score 2-3/5):**
> "If I change the User interface in modules/shared/packages/types/src/User.ts, what code across all modules would be affected?"

**After (Score 4/5):**
> "I need to add a field to the User interface. What's going to break? I want to know everywhere that uses User before I make this change."

**Issues fixed:** Removed full file path, removed redundant "across all modules", added concrete intent (adding a field).

---

### findPaths

**Before (Score 2-3/5):**
> "Find the call path from renderUserCard to the formatDate function in shared utilities."

**After (Score 4/5):**
> "How does renderUserCard end up calling formatDate? I'm seeing a date formatting bug in the UI and want to trace where it comes from."

**Issues fixed:** Replaced command-style "Find the call path" with question, added debugging motivation.

---

### Package Dependencies (already good)

**Before (Score 4/5):**
> "What packages depend on shared/types? I want to know what would be affected if I changed this package."

**After (Score 4.5/5):**
> "I'm planning some breaking changes to shared/types. Which packages would be affected? I need to know what depends on it."

**Issues fixed:** Minor reordering to lead with motivation.

## Checklist for New Prompts

Before adding a benchmark prompt, verify:

- [ ] **Motivation present?** Does it explain why the developer is asking?
- [ ] **Natural language?** Would a colleague phrase it this way?
- [ ] **No full file paths?** Using symbol names or "X in shared" style?
- [ ] **Question not command?** Starts with "How", "What", "Which"?
- [ ] **No tool jargon?** No "transitively", "call path", "trace"?
- [ ] **Single concern?** Not chaining multiple test objectives?

## See Also

- `CLAUDE.md` - Benchmark infrastructure documentation
- `benchmark/lib/types.ts` - `BenchmarkPrompt` type definition

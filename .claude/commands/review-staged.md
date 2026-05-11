---
description: "Review staged changes before commit"
allowed-tools: ["Bash", "Glob", "Grep", "Read", "Task"]
---

# Pre-Commit Review

Review staged changes using specialized agents. Run this before committing to catch issues early.

## Workflow

1. **Get staged changes**
   ```bash
   git diff --staged --name-only
   ```

2. **Launch review agents in parallel** using the Task tool:

   **Agent 1: Test Coverage Analyzer**
   - Prompt: "Analyze test coverage for the staged changes. Run `git diff --staged` to see the changes. For each modified function/method, verify there are corresponding tests. Flag any new or modified code paths that lack test coverage. Focus on behavioral coverage, not line coverage."
   - subagent_type: general-purpose

   **Agent 2: Dead Code Hunter**
   - Prompt: "Look for dead code introduced by the staged changes. Run `git diff --staged` to see the changes. Check if the changes created any orphaned imports, unused functions, unreachable code paths, or variables that are assigned but never read. Only report dead code that was INTRODUCED by these changes, not pre-existing issues."
   - subagent_type: general-purpose

   **Agent 3: Documentation Checker**
   - Prompt: "Check if staged changes require documentation updates. Run `git diff --staged` to see the changes. If there are architectural changes (new patterns, data flow changes, API changes), verify ARCHITECTURE.md reflects them. Check ROADMAP.md and ISSUES.md - if any completed work is mentioned there, those items should be REMOVED (not marked done - just deleted). Report what documentation updates are needed."
   - subagent_type: general-purpose

   **Agent 4: Spec Conformity Checker**
   - Prompt: "Verify conformity of the spec system. Read `specs/CLAUDE.md` for the full rules. Then perform these checks:

     **Step 1: Extract all spec IDs from feature files.**
     Glob for `specs/**/*.feature.md`. In each file, find all spec ID declarations matching the pattern `{#some-id}` in blockquotes. Also identify which spec IDs appear in a TODO section (lines after a `## TODO` heading until the next `##` heading).

     **Step 2: Check implementation references.**
     For each spec ID that is NOT in a TODO section, grep for `@spec {id}` in `http/src/` and `mcp/src/` (excluding `*.test.ts` files). Every non-TODO spec ID must appear in at least one implementation file. Report any spec ID that has no implementation reference.

     **Step 3: Check test references.**
     For each non-TODO spec ID, also grep for `@spec {id}` in test files (`*.test.ts`). Report spec IDs missing test references as warnings (not errors — some specs are type-level or integration-only).

     **Step 4: Check status/TODO consistency.**
     For each feature file: if status is 🚧 or 🚀, a TODO section must exist. If status is ✅, a TODO section must NOT exist.

     **Step 5: Check for orphan references.**
     Grep for all `@spec` references in the codebase. Verify each referenced spec ID actually exists in a feature file. Report any `@spec` referencing a non-existent spec ID.

     Report findings grouped by: ERRORS (must fix), WARNINGS (should fix)."
   - subagent_type: general-purpose

3. **Aggregate results** into a summary:
   - Test coverage gaps
   - Dead code found
   - Documentation updates needed
   - Spec conformity issues

## Output Format

```markdown
# Pre-Commit Review Summary

## Test Coverage
- [findings or "All changes have adequate test coverage"]

## Dead Code
- [findings or "No dead code introduced"]

## Documentation
- [findings or "Documentation is up to date"]

## Spec Conformity
- [findings or "All specs are properly referenced"]

## Recommended Actions
1. [action items before committing]
```

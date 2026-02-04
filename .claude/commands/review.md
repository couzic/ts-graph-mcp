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

3. **Aggregate results** into a summary:
   - Test coverage gaps
   - Dead code found
   - Documentation updates needed

## Output Format

```markdown
# Pre-Commit Review Summary

## Test Coverage
- [findings or "All changes have adequate test coverage"]

## Dead Code
- [findings or "No dead code introduced"]

## Documentation
- [findings or "Documentation is up to date"]

## Recommended Actions
1. [action items before committing]
```

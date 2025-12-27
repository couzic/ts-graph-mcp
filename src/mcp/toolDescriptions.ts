/**
 * MCP tool descriptions for AI agent discoverability.
 *
 * These descriptions appear in every conversation where ts-graph-mcp is available.
 * They should trigger tool usage when the agent encounters relevant patterns.
 *
 * See ISSUES.md "Trigger Phrases Not Recognized" for the full catalog of
 * phrases these descriptions should surface.
 */

export const dependenciesOfDescription = `
Find all code that a symbol depends on (forward dependencies).

Use this when you need to:
- Trace the data flow starting from a function
- Trace through the code from an entry point
- Analyze the logic of a function

Answers:
- 'What does this call?'
- 'What happens when X runs?'

Prefer this over reading multiple files when tracing calls.
`.trim();

export const dependentsOfDescription = `
Find all code that depends on a symbol (reverse dependencies).

Use this when you need to:
- Trace the data flow into a function (reverse direction)
- Trace through the code that calls a symbol
- Analyze the logic that depends on a function

Answers:
- 'Who calls this?'
- 'What would break if I changed this?'

Prefer this over reading multiple files when finding usages.
`.trim();

export const pathsBetweenDescription = `
Find how two symbols connect through the code graph.

Use this when you need to:
- Trace the data flow from one function to another
- Trace through the code from A to B
- Analyze the logic that connects two symbols

Answers:
- 'How does A reach B?'
- 'What's the path between these symbols?'
`.trim();

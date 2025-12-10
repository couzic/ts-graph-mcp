# Code Graph MCP Server for TypeScript Codebases

## Goal

Build an MCP server that exposes deterministic graph query tools to Claude Code, enabling structural navigation and impact analysis of TypeScript codebases.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ts-morph      │────▶│   Memgraph      │────▶│   MCP Server    │
│   Extraction    │     │   Storage       │     │   (Tools)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Tech Stack

- **Extraction**: ts-morph (TypeScript compiler API wrapper)
- **Storage**: Memgraph (Cypher queries, Bolt protocol)
- **MCP Server**: @modelcontextprotocol/sdk
- **Runtime**: Node.js + TypeScript

---

## Phase 1: Project Scaffold

### Task 1.1: Initialize project

```bash
mkdir ts-graph-mcp
cd ts-graph-mcp
pnpm init
pnpm add ts-morph neo4j-driver @modelcontextprotocol/sdk zod
pnpm add -D typescript @types/node vitest commander
```

### Task 1.2: Create directory structure

```
ts-graph-mcp/
├── src/
│   ├── extraction/
│   │   ├── extractor.ts       # Main extraction orchestrator
│   │   ├── nodes.ts           # Node type extraction (functions, classes, types)
│   │   └── edges.ts           # Edge extraction (calls, imports, type refs)
│   ├── graph/
│   │   ├── schema.ts          # Cypher schema definitions
│   │   ├── client.ts          # Memgraph connection wrapper
│   │   └── queries.ts         # Deterministic query builders
│   ├── mcp/
│   │   ├── server.ts          # MCP server setup
│   │   └── tools.ts           # Tool definitions
│   ├── cli.ts                 # CLI for manual indexing
│   └── index.ts
├── tests/
│   └── fixtures/              # Sample TS files for testing
├── tsconfig.json
└── package.json
```

### Task 1.3: Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

---

## Phase 2: Graph Schema

### Task 2.1: Define node types in `src/graph/schema.ts`

```typescript
// Node labels
export type NodeLabel =
  | 'Function'
  | 'Class'
  | 'Method'
  | 'Interface'
  | 'TypeAlias'
  | 'Variable'
  | 'File'
  | 'Property';

// Base properties shared by all nodes
export interface BaseNode {
  id: string;           // Unique: filePath:name:line
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  exported: boolean;
}

export interface FunctionNode extends BaseNode {
  label: 'Function';
  async: boolean;
  generator: boolean;
  parameterCount: number;
}

export interface ClassNode extends BaseNode {
  label: 'Class';
  abstract: boolean;
}

export interface MethodNode extends BaseNode {
  label: 'Method';
  className: string;
  visibility: 'public' | 'private' | 'protected';
  static: boolean;
  async: boolean;
}

export interface InterfaceNode extends BaseNode {
  label: 'Interface';
}

export interface TypeAliasNode extends BaseNode {
  label: 'TypeAlias';
}

export interface PropertyNode extends BaseNode {
  label: 'Property';
  parentName: string;  // Class or Interface name
  optional: boolean;
  readonly: boolean;
}

export type GraphNode =
  | FunctionNode
  | ClassNode
  | MethodNode
  | InterfaceNode
  | TypeAliasNode
  | PropertyNode;
```

### Task 2.2: Define edge types

```typescript
export type EdgeType =
  | 'CALLS'             // Function/Method → Function/Method
  | 'IMPORTS'           // File → File (or specific symbol)
  | 'CONTAINS'          // File → Function/Class, Class → Method
  | 'IMPLEMENTS'        // Class → Interface
  | 'EXTENDS'           // Class → Class, Interface → Interface
  | 'USES_TYPE'         // Function/Variable → Interface/TypeAlias/Class
  | 'READS_PROPERTY'    // Function → Property
  | 'WRITES_PROPERTY'   // Function → Property
  | 'RETURNS_TYPE';     // Function → Type

export interface GraphEdge {
  type: EdgeType;
  sourceId: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}
```

### Task 2.3: Create schema initialization

```typescript
export const initSchemaQueries = [
  'CREATE INDEX ON :Function(id)',
  'CREATE INDEX ON :Function(name)',
  'CREATE INDEX ON :Class(id)',
  'CREATE INDEX ON :Class(name)',
  'CREATE INDEX ON :Method(id)',
  'CREATE INDEX ON :Interface(id)',
  'CREATE INDEX ON :Interface(name)',
  'CREATE INDEX ON :TypeAlias(id)',
  'CREATE INDEX ON :TypeAlias(name)',
  'CREATE INDEX ON :File(filePath)',
  'CREATE INDEX ON :Property(id)',
];
```

---

## Phase 3: Extraction Pipeline

### Task 3.1: Implement `src/extraction/extractor.ts`

```typescript
import { Project, SourceFile } from 'ts-morph';
import { GraphNode, GraphEdge } from '../graph/schema.js';
import { extractNodes } from './nodes.js';
import { extractEdges } from './edges.js';

export interface ExtractionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const extractFromProject = (tsconfigPath: string): ExtractionResult => {
  const project = new Project({ tsConfigFilePath: tsconfigPath });
  const sourceFiles = project.getSourceFiles();

  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];

  for (const sourceFile of sourceFiles) {
    if (sourceFile.isDeclarationFile()) continue;

    const { nodes, edges } = extractFromFile(sourceFile);
    allNodes.push(...nodes);
    allEdges.push(...edges);
  }

  return { nodes: allNodes, edges: allEdges };
};

export const extractFromFile = (sourceFile: SourceFile): ExtractionResult => {
  const nodes = extractNodes(sourceFile);
  const edges = extractEdges(sourceFile, nodes);
  return { nodes, edges };
};

export const createNodeId = (
  filePath: string,
  name: string,
  line: number
): string => {
  return `${filePath}:${name}:${line}`;
};
```

### Task 3.2: Implement node extractors in `src/extraction/nodes.ts`

```typescript
import {
  SourceFile,
  FunctionDeclaration,
  ClassDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  PropertySignature,
} from 'ts-morph';
import { GraphNode } from '../graph/schema.js';
import { createNodeId } from './extractor.js';

export const extractNodes = (sourceFile: SourceFile): GraphNode[] => {
  const filePath = sourceFile.getFilePath();
  const nodes: GraphNode[] = [];

  // Extract functions
  for (const fn of sourceFile.getFunctions()) {
    nodes.push(extractFunction(fn, filePath));
  }

  // Extract classes and their members
  for (const cls of sourceFile.getClasses()) {
    nodes.push(extractClass(cls, filePath));

    for (const method of cls.getMethods()) {
      nodes.push(extractMethod(method, filePath, cls.getName() ?? 'anonymous'));
    }

    for (const prop of cls.getProperties()) {
      nodes.push(extractProperty(prop, filePath, cls.getName() ?? 'anonymous'));
    }
  }

  // Extract interfaces
  for (const iface of sourceFile.getInterfaces()) {
    nodes.push(extractInterface(iface, filePath));

    for (const prop of iface.getProperties()) {
      nodes.push(
        extractPropertySignature(prop, filePath, iface.getName())
      );
    }
  }

  // Extract type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    nodes.push(extractTypeAlias(typeAlias, filePath));
  }

  return nodes;
};

const extractFunction = (
  fn: FunctionDeclaration,
  filePath: string
): GraphNode => {
  const name = fn.getName() ?? 'anonymous';
  const startLine = fn.getStartLineNumber();

  return {
    label: 'Function',
    id: createNodeId(filePath, name, startLine),
    name,
    filePath,
    startLine,
    endLine: fn.getEndLineNumber(),
    exported: fn.isExported(),
    async: fn.isAsync(),
    generator: fn.isGenerator(),
    parameterCount: fn.getParameters().length,
  };
};

const extractClass = (
  cls: ClassDeclaration,
  filePath: string
): GraphNode => {
  const name = cls.getName() ?? 'anonymous';
  const startLine = cls.getStartLineNumber();

  return {
    label: 'Class',
    id: createNodeId(filePath, name, startLine),
    name,
    filePath,
    startLine,
    endLine: cls.getEndLineNumber(),
    exported: cls.isExported(),
    abstract: cls.isAbstract(),
  };
};

const extractMethod = (
  method: MethodDeclaration,
  filePath: string,
  className: string
): GraphNode => {
  const name = method.getName();
  const startLine = method.getStartLineNumber();

  return {
    label: 'Method',
    id: createNodeId(filePath, `${className}.${name}`, startLine),
    name,
    filePath,
    startLine,
    endLine: method.getEndLineNumber(),
    exported: false,
    className,
    visibility: method.getScope() ?? 'public',
    static: method.isStatic(),
    async: method.isAsync(),
  };
};

const extractInterface = (
  iface: InterfaceDeclaration,
  filePath: string
): GraphNode => {
  const name = iface.getName();
  const startLine = iface.getStartLineNumber();

  return {
    label: 'Interface',
    id: createNodeId(filePath, name, startLine),
    name,
    filePath,
    startLine,
    endLine: iface.getEndLineNumber(),
    exported: iface.isExported(),
  };
};

const extractTypeAlias = (
  typeAlias: TypeAliasDeclaration,
  filePath: string
): GraphNode => {
  const name = typeAlias.getName();
  const startLine = typeAlias.getStartLineNumber();

  return {
    label: 'TypeAlias',
    id: createNodeId(filePath, name, startLine),
    name,
    filePath,
    startLine,
    endLine: typeAlias.getEndLineNumber(),
    exported: typeAlias.isExported(),
  };
};

const extractProperty = (
  prop: PropertyDeclaration,
  filePath: string,
  parentName: string
): GraphNode => {
  const name = prop.getName();
  const startLine = prop.getStartLineNumber();

  return {
    label: 'Property',
    id: createNodeId(filePath, `${parentName}.${name}`, startLine),
    name,
    filePath,
    startLine,
    endLine: prop.getEndLineNumber(),
    exported: false,
    parentName,
    optional: prop.hasQuestionToken(),
    readonly: prop.isReadonly(),
  };
};

const extractPropertySignature = (
  prop: PropertySignature,
  filePath: string,
  parentName: string
): GraphNode => {
  const name = prop.getName();
  const startLine = prop.getStartLineNumber();

  return {
    label: 'Property',
    id: createNodeId(filePath, `${parentName}.${name}`, startLine),
    name,
    filePath,
    startLine,
    endLine: prop.getEndLineNumber(),
    exported: false,
    parentName,
    optional: prop.hasQuestionToken(),
    readonly: prop.isReadonly(),
  };
};
```

### Task 3.3: Implement edge extractors in `src/extraction/edges.ts`

```typescript
import {
  SourceFile,
  SyntaxKind,
  CallExpression,
  Node,
  PropertyAccessExpression,
} from 'ts-morph';
import { GraphNode, GraphEdge, EdgeType } from '../graph/schema.js';
import { createNodeId } from './extractor.js';

export const extractEdges = (
  sourceFile: SourceFile,
  nodes: GraphNode[]
): GraphEdge[] => {
  const edges: GraphEdge[] = [];
  const filePath = sourceFile.getFilePath();

  // Build lookup map for local nodes
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Extract CALLS edges
  edges.push(...extractCallEdges(sourceFile, filePath));

  // Extract IMPORTS edges
  edges.push(...extractImportEdges(sourceFile, filePath));

  // Extract CONTAINS edges
  edges.push(...extractContainsEdges(sourceFile, filePath, nodes));

  // Extract IMPLEMENTS and EXTENDS edges
  edges.push(...extractInheritanceEdges(sourceFile, filePath));

  // Extract USES_TYPE edges
  edges.push(...extractTypeUsageEdges(sourceFile, filePath));

  // Extract property access edges
  edges.push(...extractPropertyAccessEdges(sourceFile, filePath));

  return edges;
};

const extractCallEdges = (
  sourceFile: SourceFile,
  filePath: string
): GraphEdge[] => {
  const edges: GraphEdge[] = [];

  const callExpressions = sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  );

  for (const call of callExpressions) {
    const callerNode = findContainingFunctionOrMethod(call);
    if (!callerNode) continue;

    const callerId = getNodeId(callerNode, filePath);

    // Try to resolve the called function
    const expression = call.getExpression();
    const definitions = expression.getType().getSymbol()?.getDeclarations();

    if (definitions && definitions.length > 0) {
      const targetDef = definitions[0];
      const targetFile = targetDef.getSourceFile().getFilePath();
      const targetName = getDefinitionName(targetDef);
      const targetLine = targetDef.getStartLineNumber();

      if (targetName) {
        edges.push({
          type: 'CALLS',
          sourceId: callerId,
          targetId: createNodeId(targetFile, targetName, targetLine),
        });
      }
    }
  }

  return edges;
};

const extractImportEdges = (
  sourceFile: SourceFile,
  filePath: string
): GraphEdge[] => {
  const edges: GraphEdge[] = [];

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierSourceFile();
    if (!moduleSpecifier) continue;

    edges.push({
      type: 'IMPORTS',
      sourceId: filePath,
      targetId: moduleSpecifier.getFilePath(),
    });
  }

  return edges;
};

const extractContainsEdges = (
  sourceFile: SourceFile,
  filePath: string,
  nodes: GraphNode[]
): GraphEdge[] => {
  const edges: GraphEdge[] = [];

  // File contains functions, classes, interfaces, type aliases
  for (const node of nodes) {
    if (['Function', 'Class', 'Interface', 'TypeAlias'].includes(node.label)) {
      edges.push({
        type: 'CONTAINS',
        sourceId: filePath,
        targetId: node.id,
      });
    }

    // Class contains methods and properties
    if (node.label === 'Method' || node.label === 'Property') {
      const parentNode = nodes.find(
        (n) =>
          n.label === 'Class' &&
          n.name === (node as any).className ||
          n.name === (node as any).parentName
      );
      if (parentNode) {
        edges.push({
          type: 'CONTAINS',
          sourceId: parentNode.id,
          targetId: node.id,
        });
      }
    }
  }

  return edges;
};

const extractInheritanceEdges = (
  sourceFile: SourceFile,
  filePath: string
): GraphEdge[] => {
  const edges: GraphEdge[] = [];

  for (const cls of sourceFile.getClasses()) {
    const className = cls.getName() ?? 'anonymous';
    const classLine = cls.getStartLineNumber();
    const classId = createNodeId(filePath, className, classLine);

    // EXTENDS
    const baseClass = cls.getBaseClass();
    if (baseClass) {
      const baseFile = baseClass.getSourceFile().getFilePath();
      const baseName = baseClass.getName() ?? 'anonymous';
      const baseLine = baseClass.getStartLineNumber();

      edges.push({
        type: 'EXTENDS',
        sourceId: classId,
        targetId: createNodeId(baseFile, baseName, baseLine),
      });
    }

    // IMPLEMENTS
    for (const impl of cls.getImplements()) {
      const symbol = impl.getType().getSymbol();
      const decl = symbol?.getDeclarations()?.[0];
      if (decl) {
        const implFile = decl.getSourceFile().getFilePath();
        const implName = symbol?.getName() ?? 'unknown';
        const implLine = decl.getStartLineNumber();

        edges.push({
          type: 'IMPLEMENTS',
          sourceId: classId,
          targetId: createNodeId(implFile, implName, implLine),
        });
      }
    }
  }

  return edges;
};

const extractTypeUsageEdges = (
  sourceFile: SourceFile,
  filePath: string
): GraphEdge[] => {
  const edges: GraphEdge[] = [];

  // Find type references in function parameters, return types, variable declarations
  const typeRefs = sourceFile.getDescendantsOfKind(SyntaxKind.TypeReference);

  for (const typeRef of typeRefs) {
    const container = findContainingFunctionOrMethod(typeRef);
    if (!container) continue;

    const containerId = getNodeId(container, filePath);

    const symbol = typeRef.getType().getSymbol();
    const decl = symbol?.getDeclarations()?.[0];

    if (decl) {
      const targetFile = decl.getSourceFile().getFilePath();
      const targetName = symbol?.getName() ?? 'unknown';
      const targetLine = decl.getStartLineNumber();

      edges.push({
        type: 'USES_TYPE',
        sourceId: containerId,
        targetId: createNodeId(targetFile, targetName, targetLine),
      });
    }
  }

  return edges;
};

const extractPropertyAccessEdges = (
  sourceFile: SourceFile,
  filePath: string
): GraphEdge[] => {
  const edges: GraphEdge[] = [];

  const propAccesses = sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression
  );

  for (const access of propAccesses) {
    const container = findContainingFunctionOrMethod(access);
    if (!container) continue;

    const containerId = getNodeId(container, filePath);

    // Determine if read or write
    const isWrite = isWriteAccess(access);
    const edgeType: EdgeType = isWrite ? 'WRITES_PROPERTY' : 'READS_PROPERTY';

    const symbol = access.getNameNode().getSymbol();
    const decl = symbol?.getDeclarations()?.[0];

    if (decl) {
      const targetFile = decl.getSourceFile().getFilePath();
      const propName = access.getName();
      const parentType = access.getExpression().getType().getSymbol()?.getName();

      if (parentType) {
        edges.push({
          type: edgeType,
          sourceId: containerId,
          targetId: createNodeId(
            targetFile,
            `${parentType}.${propName}`,
            decl.getStartLineNumber()
          ),
        });
      }
    }
  }

  return edges;
};

// Helper functions

const findContainingFunctionOrMethod = (node: Node): Node | undefined => {
  let current: Node | undefined = node;

  while (current) {
    if (
      Node.isFunctionDeclaration(current) ||
      Node.isMethodDeclaration(current) ||
      Node.isArrowFunction(current) ||
      Node.isFunctionExpression(current)
    ) {
      return current;
    }
    current = current.getParent();
  }

  return undefined;
};

const getNodeId = (node: Node, defaultFilePath: string): string => {
  const filePath = node.getSourceFile().getFilePath();
  const name = getDefinitionName(node) ?? 'anonymous';
  const line = node.getStartLineNumber();
  return createNodeId(filePath, name, line);
};

const getDefinitionName = (node: Node): string | undefined => {
  if (Node.isFunctionDeclaration(node)) return node.getName();
  if (Node.isMethodDeclaration(node)) {
    const cls = node.getParent();
    if (Node.isClassDeclaration(cls)) {
      return `${cls.getName()}.${node.getName()}`;
    }
    return node.getName();
  }
  if (Node.isClassDeclaration(node)) return node.getName();
  if (Node.isInterfaceDeclaration(node)) return node.getName();
  return undefined;
};

const isWriteAccess = (access: PropertyAccessExpression): boolean => {
  const parent = access.getParent();

  if (Node.isBinaryExpression(parent)) {
    const operator = parent.getOperatorToken().getText();
    if (['=', '+=', '-=', '*=', '/='].includes(operator)) {
      return parent.getLeft() === access;
    }
  }

  if (
    Node.isPrefixUnaryExpression(parent) ||
    Node.isPostfixUnaryExpression(parent)
  ) {
    return true;
  }

  return false;
};
```

---

## Phase 4: Memgraph Integration

### Task 4.1: Implement `src/graph/client.ts`

```typescript
import neo4j, { Driver, Session, Record as Neo4jRecord } from 'neo4j-driver';

export interface GraphClient {
  run: <T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>
  ) => Promise<T[]>;
  runVoid: (
    query: string,
    params?: Record<string, unknown>
  ) => Promise<void>;
  close: () => Promise<void>;
}

export const createClient = (
  uri = 'bolt://localhost:7687',
  username = '',
  password = ''
): GraphClient => {
  const driver: Driver = neo4j.driver(
    uri,
    username && password
      ? neo4j.auth.basic(username, password)
      : undefined
  );

  return {
    run: async <T>(
      query: string,
      params?: Record<string, unknown>
    ): Promise<T[]> => {
      const session: Session = driver.session();
      try {
        const result = await session.run(query, params);
        return result.records.map((r: Neo4jRecord) => r.toObject() as T);
      } finally {
        await session.close();
      }
    },

    runVoid: async (
      query: string,
      params?: Record<string, unknown>
    ): Promise<void> => {
      const session: Session = driver.session();
      try {
        await session.run(query, params);
      } finally {
        await session.close();
      }
    },

    close: async () => {
      await driver.close();
    },
  };
};
```

### Task 4.2: Implement `src/graph/queries.ts`

```typescript
import { GraphClient } from './client.js';
import { GraphNode, GraphEdge } from './schema.js';

// Query result types
export interface NodeResult {
  id: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  label: string;
}

export interface PathResult {
  nodes: NodeResult[];
  relationships: string[];
}

// Query builders - returns Cypher strings
export const queries = {
  // Schema initialization
  createIndexes: (label: string, property: string) =>
    `CREATE INDEX ON :${label}(${property})`,

  // Clear file subgraph (for incremental updates)
  deleteByFile: `
    MATCH (n {filePath: $filePath})
    DETACH DELETE n
  `,

  // Insert nodes (use UNWIND for batching)
  insertNodes: (label: string) => `
    UNWIND $nodes AS props
    CREATE (n:${label})
    SET n = props
  `,

  // Insert edges
  insertEdges: (edgeType: string) => `
    UNWIND $edges AS edge
    MATCH (source {id: edge.sourceId})
    MATCH (target {id: edge.targetId})
    CREATE (source)-[:${edgeType}]->(target)
  `,

  // Query: Get direct callers
  getCallersOf: `
    MATCH (caller)-[:CALLS]->(target {id: $targetId})
    RETURN caller {.*} as node
  `,

  // Query: Get transitive callers with depth
  getTransitiveCallersOf: `
    MATCH path = (caller)-[:CALLS*1..$maxDepth]->(target {id: $targetId})
    WITH caller, min(length(path)) as depth
    RETURN caller {.*} as node, depth
    ORDER BY depth
  `,

  // Query: Get direct callees
  getCalleesOf: `
    MATCH (source {id: $sourceId})-[:CALLS]->(callee)
    RETURN callee {.*} as node
  `,

  // Query: Get transitive callees with depth
  getTransitiveCalleesOf: `
    MATCH path = (source {id: $sourceId})-[:CALLS*1..$maxDepth]->(callee)
    WITH callee, min(length(path)) as depth
    RETURN callee {.*} as node, depth
    ORDER BY depth
  `,

  // Query: Get all usages of a type
  getTypeUsages: `
    MATCH (user)-[:USES_TYPE]->(type)
    WHERE type.name = $typeName
    RETURN user {.*} as node
  `,

  // Query: Impact analysis - what depends on this node
  getImpactedBy: `
    MATCH path = (dependent)-[:CALLS|USES_TYPE|READS_PROPERTY|WRITES_PROPERTY*1..$maxDepth]->(target {id: $targetId})
    WITH dependent, 
         min(length(path)) as depth,
         collect(distinct [rel in relationships(path) | type(rel)][0]) as relationTypes
    RETURN dependent {.*} as node, depth, relationTypes
    ORDER BY depth
  `,

  // Query: Find path between two nodes
  getPathBetween: `
    MATCH path = shortestPath(
      (source {id: $sourceId})-[*..10]-(target {id: $targetId})
    )
    RETURN [n in nodes(path) | n {.*}] as nodes,
           [r in relationships(path) | type(r)] as relationships
  `,

  // Query: Search nodes by name pattern
  searchNodes: `
    MATCH (n)
    WHERE n.name CONTAINS $pattern
    ${/* dynamically add label filter */ ''}
    RETURN n {.*} as node, labels(n)[0] as label
    LIMIT 50
  `,

  searchNodesByLabel: (label: string) => `
    MATCH (n:${label})
    WHERE n.name CONTAINS $pattern
    RETURN n {.*} as node
    LIMIT 50
  `,

  // Query: Get file structure
  getFileNodes: `
    MATCH (n {filePath: $filePath})
    RETURN n {.*} as node, labels(n)[0] as label
  `,

  // Query: Get class with all members
  getClassWithMembers: `
    MATCH (c:Class {name: $className})
    OPTIONAL MATCH (c)-[:CONTAINS]->(member)
    RETURN c {.*} as class, collect(member {.*}) as members
  `,
};

// Executor functions that use the client
export const executeQuery = {
  getCallersOf: async (
    client: GraphClient,
    targetId: string
  ): Promise<NodeResult[]> => {
    const results = await client.run<{ node: NodeResult }>(
      queries.getCallersOf,
      { targetId }
    );
    return results.map((r) => r.node);
  },

  getTransitiveCallersOf: async (
    client: GraphClient,
    targetId: string,
    maxDepth: number
  ): Promise<Array<NodeResult & { depth: number }>> => {
    const results = await client.run<{ node: NodeResult; depth: number }>(
      queries.getTransitiveCallersOf.replace('$maxDepth', String(maxDepth)),
      { targetId }
    );
    return results.map((r) => ({ ...r.node, depth: r.depth }));
  },

  getCalleesOf: async (
    client: GraphClient,
    sourceId: string
  ): Promise<NodeResult[]> => {
    const results = await client.run<{ node: NodeResult }>(
      queries.getCalleesOf,
      { sourceId }
    );
    return results.map((r) => r.node);
  },

  getTypeUsages: async (
    client: GraphClient,
    typeName: string
  ): Promise<NodeResult[]> => {
    const results = await client.run<{ node: NodeResult }>(
      queries.getTypeUsages,
      { typeName }
    );
    return results.map((r) => r.node);
  },

  getImpactedBy: async (
    client: GraphClient,
    targetId: string,
    maxDepth: number
  ): Promise<Array<NodeResult & { depth: number; relationTypes: string[] }>> => {
    const results = await client.run<{
      node: NodeResult;
      depth: number;
      relationTypes: string[];
    }>(queries.getImpactedBy.replace('$maxDepth', String(maxDepth)), {
      targetId,
    });
    return results.map((r) => ({
      ...r.node,
      depth: r.depth,
      relationTypes: r.relationTypes,
    }));
  },

  getPathBetween: async (
    client: GraphClient,
    sourceId: string,
    targetId: string
  ): Promise<PathResult | null> => {
    const results = await client.run<PathResult>(queries.getPathBetween, {
      sourceId,
      targetId,
    });
    return results[0] ?? null;
  },

  searchNodes: async (
    client: GraphClient,
    pattern: string,
    label?: string
  ): Promise<NodeResult[]> => {
    const query = label
      ? queries.searchNodesByLabel(label)
      : queries.searchNodes;

    const results = await client.run<{ node: NodeResult }>(query, { pattern });
    return results.map((r) => r.node);
  },
};
```

### Task 4.3: Implement batch insert in `src/graph/ingest.ts`

```typescript
import { GraphClient } from './client.js';
import { GraphNode, GraphEdge, initSchemaQueries } from './schema.js';
import { queries } from './queries.js';

export const initializeSchema = async (client: GraphClient): Promise<void> => {
  for (const query of initSchemaQueries) {
    try {
      await client.runVoid(query);
    } catch (e) {
      // Index may already exist
    }
  }
};

export const clearGraph = async (client: GraphClient): Promise<void> => {
  await client.runVoid('MATCH (n) DETACH DELETE n');
};

export const clearFileSubgraph = async (
  client: GraphClient,
  filePath: string
): Promise<void> => {
  await client.runVoid(queries.deleteByFile, { filePath });
};

export const insertNodes = async (
  client: GraphClient,
  nodes: GraphNode[]
): Promise<void> => {
  // Group by label for efficient insertion
  const byLabel = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const existing = byLabel.get(node.label) ?? [];
    existing.push(node);
    byLabel.set(node.label, existing);
  }

  for (const [label, labelNodes] of byLabel) {
    await client.runVoid(queries.insertNodes(label), { nodes: labelNodes });
  }
};

export const insertEdges = async (
  client: GraphClient,
  edges: GraphEdge[]
): Promise<void> => {
  // Group by type for efficient insertion
  const byType = new Map<string, GraphEdge[]>();

  for (const edge of edges) {
    const existing = byType.get(edge.type) ?? [];
    existing.push(edge);
    byType.set(edge.type, existing);
  }

  for (const [type, typeEdges] of byType) {
    await client.runVoid(queries.insertEdges(type), { edges: typeEdges });
  }
};
```

---

## Phase 5: MCP Server

### Task 5.1: Define tools in `src/mcp/tools.ts`

```typescript
import { z } from 'zod';

export const toolSchemas = {
  get_callers_of: z.object({
    target: z
      .string()
      .describe(
        'Function or method identifier. Can be full ID (filePath:name:line), qualified name (ClassName.methodName), or just name'
      ),
    maxDepth: z
      .number()
      .min(1)
      .max(10)
      .default(1)
      .describe('How many levels of callers to traverse. 1 = direct callers only'),
  }),

  get_callees_of: z.object({
    source: z
      .string()
      .describe('Function or method identifier'),
    maxDepth: z
      .number()
      .min(1)
      .max(10)
      .default(1)
      .describe('How many levels of callees to traverse'),
  }),

  get_type_usages: z.object({
    typeName: z
      .string()
      .describe('Name of the type, interface, or class to find usages of'),
  }),

  get_impacted_by: z.object({
    target: z
      .string()
      .describe('Node identifier to analyze impact for'),
    maxDepth: z
      .number()
      .min(1)
      .max(5)
      .default(3)
      .describe('How many levels of dependencies to traverse'),
  }),

  get_path_between: z.object({
    source: z.string().describe('Starting node identifier'),
    target: z.string().describe('Ending node identifier'),
  }),

  search_nodes: z.object({
    pattern: z.string().describe('Name or partial name to search for'),
    nodeType: z
      .enum(['Function', 'Class', 'Interface', 'TypeAlias', 'Method'])
      .optional()
      .describe('Optionally filter by node type'),
  }),
};

export const toolDefinitions = [
  {
    name: 'get_callers_of',
    description:
      'Find all functions and methods that call a given function. Use this to understand what code depends on a function before modifying it.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: toolSchemas.get_callers_of.shape.target.description,
        },
        maxDepth: {
          type: 'number',
          description: toolSchemas.get_callers_of.shape.maxDepth.description,
          default: 1,
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'get_callees_of',
    description:
      'Find all functions and methods called by a given function. Use this to understand the dependencies of a function.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: toolSchemas.get_callees_of.shape.source.description,
        },
        maxDepth: {
          type: 'number',
          description: toolSchemas.get_callees_of.shape.maxDepth.description,
          default: 1,
        },
      },
      required: ['source'],
    },
  },
  {
    name: 'get_type_usages',
    description:
      'Find all places where a type, interface, or class is used. Essential before modifying type definitions to understand impact.',
    inputSchema: {
      type: 'object',
      properties: {
        typeName: {
          type: 'string',
          description: toolSchemas.get_type_usages.shape.typeName.description,
        },
      },
      required: ['typeName'],
    },
  },
  {
    name: 'get_impacted_by',
    description:
      'Find everything that would be affected by changing a given code element. Traverses calls, type usages, and property accesses. Use before refactoring.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: toolSchemas.get_impacted_by.shape.target.description,
        },
        maxDepth: {
          type: 'number',
          description: toolSchemas.get_impacted_by.shape.maxDepth.description,
          default: 3,
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'get_path_between',
    description:
      'Find the shortest dependency path between two code elements. Use to understand how components are connected.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: toolSchemas.get_path_between.shape.source.description,
        },
        target: {
          type: 'string',
          description: toolSchemas.get_path_between.shape.target.description,
        },
      },
      required: ['source', 'target'],
    },
  },
  {
    name: 'search_nodes',
    description:
      'Search for functions, classes, interfaces, or types by name. Use to find code elements when you only know part of the name.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: toolSchemas.search_nodes.shape.pattern.description,
        },
        nodeType: {
          type: 'string',
          enum: ['Function', 'Class', 'Interface', 'TypeAlias', 'Method'],
          description: toolSchemas.search_nodes.shape.nodeType.description,
        },
      },
      required: ['pattern'],
    },
  },
];
```

### Task 5.2: Implement `src/mcp/server.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { toolDefinitions, toolSchemas } from './tools.js';
import { createClient, GraphClient } from '../graph/client.js';
import { executeQuery, NodeResult } from '../graph/queries.js';

const formatNodeResult = (node: NodeResult): string => {
  return `${node.name} (${node.filePath}:${node.startLine})`;
};

const formatResults = (
  nodes: NodeResult[],
  includeDepth = false
): string => {
  if (nodes.length === 0) {
    return 'No results found.';
  }

  return nodes
    .map((n: any) => {
      const base = formatNodeResult(n);
      return includeDepth && n.depth !== undefined
        ? `[depth ${n.depth}] ${base}`
        : base;
    })
    .join('\n');
};

// Resolve a user-provided identifier to a full node ID
const resolveNodeId = async (
  client: GraphClient,
  identifier: string
): Promise<string> => {
  // If it looks like a full ID (has colons and line number), use as-is
  if (identifier.match(/^.+:.+:\d+$/)) {
    return identifier;
  }

  // Otherwise, search for it
  const results = await executeQuery.searchNodes(client, identifier);

  if (results.length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `No node found matching "${identifier}"`
    );
  }

  if (results.length === 1) {
    return results[0].id;
  }

  // Multiple matches - return error with options
  const options = results.slice(0, 5).map(formatNodeResult).join('\n');
  throw new McpError(
    ErrorCode.InvalidParams,
    `Multiple nodes match "${identifier}". Please be more specific:\n${options}`
  );
};

export const createMcpServer = (graphClient: GraphClient) => {
  const server = new Server(
    { name: 'ts-graph-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get_callers_of': {
          const parsed = toolSchemas.get_callers_of.parse(args);
          const targetId = await resolveNodeId(graphClient, parsed.target);

          const results =
            parsed.maxDepth === 1
              ? await executeQuery.getCallersOf(graphClient, targetId)
              : await executeQuery.getTransitiveCallersOf(
                  graphClient,
                  targetId,
                  parsed.maxDepth
                );

          return {
            content: [
              {
                type: 'text',
                text: formatResults(results, parsed.maxDepth > 1),
              },
            ],
          };
        }

        case 'get_callees_of': {
          const parsed = toolSchemas.get_callees_of.parse(args);
          const sourceId = await resolveNodeId(graphClient, parsed.source);

          const results = await executeQuery.getCalleesOf(graphClient, sourceId);

          return {
            content: [{ type: 'text', text: formatResults(results) }],
          };
        }

        case 'get_type_usages': {
          const parsed = toolSchemas.get_type_usages.parse(args);
          const results = await executeQuery.getTypeUsages(
            graphClient,
            parsed.typeName
          );

          return {
            content: [{ type: 'text', text: formatResults(results) }],
          };
        }

        case 'get_impacted_by': {
          const parsed = toolSchemas.get_impacted_by.parse(args);
          const targetId = await resolveNodeId(graphClient, parsed.target);

          const results = await executeQuery.getImpactedBy(
            graphClient,
            targetId,
            parsed.maxDepth
          );

          const formatted = results
            .map(
              (r) =>
                `[depth ${r.depth}] ${formatNodeResult(r)} via ${r.relationTypes.join(' → ')}`
            )
            .join('\n');

          return {
            content: [
              {
                type: 'text',
                text: results.length > 0 ? formatted : 'No dependents found.',
              },
            ],
          };
        }

        case 'get_path_between': {
          const parsed = toolSchemas.get_path_between.parse(args);
          const sourceId = await resolveNodeId(graphClient, parsed.source);
          const targetId = await resolveNodeId(graphClient, parsed.target);

          const result = await executeQuery.getPathBetween(
            graphClient,
            sourceId,
            targetId
          );

          if (!result) {
            return {
              content: [
                { type: 'text', text: 'No path found between the nodes.' },
              ],
            };
          }

          const pathStr = result.nodes
            .map((n, i) => {
              const rel = result.relationships[i];
              return rel ? `${n.name} -[${rel}]->` : n.name;
            })
            .join(' ');

          return {
            content: [{ type: 'text', text: pathStr }],
          };
        }

        case 'search_nodes': {
          const parsed = toolSchemas.search_nodes.parse(args);
          const results = await executeQuery.searchNodes(
            graphClient,
            parsed.pattern,
            parsed.nodeType
          );

          return {
            content: [{ type: 'text', text: formatResults(results) }],
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof McpError) throw error;

      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new McpError(ErrorCode.InternalError, message);
    }
  });

  return server;
};

// Entry point
export const startServer = async () => {
  const graphClient = createClient(
    process.env.MEMGRAPH_URI ?? 'bolt://localhost:7687'
  );

  const server = createMcpServer(graphClient);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await graphClient.close();
    process.exit(0);
  });
};

// Run if executed directly
startServer().catch(console.error);
```

---

## Phase 6: CLI for Indexing

### Task 6.1: Implement `src/cli.ts`

```typescript
import { Command } from 'commander';
import { extractFromProject, extractFromFile } from './extraction/extractor.js';
import { createClient } from './graph/client.js';
import {
  initializeSchema,
  clearGraph,
  clearFileSubgraph,
  insertNodes,
  insertEdges,
} from './graph/ingest.js';
import { Project } from 'ts-morph';

const program = new Command();

program
  .name('ts-graph-mcp')
  .description('Build and query code graphs for TypeScript projects')
  .version('1.0.0');

program
  .command('index')
  .description('Index a TypeScript project into Memgraph')
  .argument('<tsconfig>', 'Path to tsconfig.json')
  .option('--clear', 'Clear existing graph before indexing')
  .option('--uri <uri>', 'Memgraph URI', 'bolt://localhost:7687')
  .action(async (tsconfigPath: string, options) => {
    const client = createClient(options.uri);

    try {
      if (options.clear) {
        console.log('Clearing existing graph...');
        await clearGraph(client);
      }

      console.log('Initializing schema...');
      await initializeSchema(client);

      console.log(`Extracting from ${tsconfigPath}...`);
      const { nodes, edges } = extractFromProject(tsconfigPath);

      console.log(`Found ${nodes.length} nodes, ${edges.length} edges`);

      console.log('Inserting nodes...');
      await insertNodes(client, nodes);

      console.log('Inserting edges...');
      await insertEdges(client, edges);

      console.log('Done!');
    } finally {
      await client.close();
    }
  });

program
  .command('index-file')
  .description('Re-index a single file (incremental update)')
  .argument('<filePath>', 'Path to the TypeScript file')
  .argument('<tsconfig>', 'Path to tsconfig.json (for type resolution)')
  .option('--uri <uri>', 'Memgraph URI', 'bolt://localhost:7687')
  .action(async (filePath: string, tsconfigPath: string, options) => {
    const client = createClient(options.uri);

    try {
      console.log(`Clearing existing data for ${filePath}...`);
      await clearFileSubgraph(client, filePath);

      console.log('Extracting...');
      const project = new Project({ tsConfigFilePath: tsconfigPath });
      const sourceFile = project.getSourceFile(filePath);

      if (!sourceFile) {
        console.error(`File not found in project: ${filePath}`);
        process.exit(1);
      }

      const { nodes, edges } = extractFromFile(sourceFile);

      console.log(`Found ${nodes.length} nodes, ${edges.length} edges`);

      await insertNodes(client, nodes);
      await insertEdges(client, edges);

      console.log('Done!');
    } finally {
      await client.close();
    }
  });

program
  .command('serve')
  .description('Start the MCP server')
  .option('--uri <uri>', 'Memgraph URI', 'bolt://localhost:7687')
  .action(async (options) => {
    process.env.MEMGRAPH_URI = options.uri;
    const { startServer } = await import('./mcp/server.js');
    await startServer();
  });

program
  .command('stats')
  .description('Show graph statistics')
  .option('--uri <uri>', 'Memgraph URI', 'bolt://localhost:7687')
  .action(async (options) => {
    const client = createClient(options.uri);

    try {
      const nodeCount = await client.run<{ count: number }>(
        'MATCH (n) RETURN count(n) as count'
      );
      const edgeCount = await client.run<{ count: number }>(
        'MATCH ()-[r]->() RETURN count(r) as count'
      );

      const labelCounts = await client.run<{ label: string; count: number }>(
        'MATCH (n) RETURN labels(n)[0] as label, count(*) as count ORDER BY count DESC'
      );

      console.log(`Total nodes: ${nodeCount[0]?.count ?? 0}`);
      console.log(`Total edges: ${edgeCount[0]?.count ?? 0}`);
      console.log('\nNodes by type:');
      for (const { label, count } of labelCounts) {
        console.log(`  ${label}: ${count}`);
      }
    } finally {
      await client.close();
    }
  });

program.parse();
```

### Task 6.2: Add CLI entry point to `package.json`

```json
{
  "name": "ts-graph-mcp",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "ts-graph-mcp": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "cli": "node dist/cli.js",
    "serve": "node dist/cli.js serve",
    "test": "vitest"
  }
}
```

---

## Phase 7: Testing

### Task 7.1: Create test fixtures

Create `tests/fixtures/sample-project/src/types.ts`:

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
}

export interface OrderItem {
  productId: string;
  quantity: number;
}
```

Create `tests/fixtures/sample-project/src/user-service.ts`:

```typescript
import { User } from './types.js';

export const getUser = (id: string): User | null => {
  // mock
  return { id, email: 'test@test.com', name: 'Test' };
};

export const validateUser = (user: User): boolean => {
  return user.email.includes('@');
};

export const processUser = (id: string): void => {
  const user = getUser(id);
  if (user && validateUser(user)) {
    console.log('Valid user');
  }
};
```

Create `tests/fixtures/sample-project/src/order-service.ts`:

```typescript
import { Order, User } from './types.js';
import { getUser } from './user-service.js';

export const createOrder = (userId: string): Order => {
  const user = getUser(userId);
  if (!user) throw new Error('User not found');

  return {
    id: crypto.randomUUID(),
    userId,
    items: [],
  };
};
```

Create `tests/fixtures/sample-project/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true
  },
  "include": ["src/**/*"]
}
```

### Task 7.2: Write integration tests in `tests/extraction.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { extractFromProject } from '../src/extraction/extractor.js';
import path from 'path';

describe('extraction', () => {
  const fixturePath = path.join(
    __dirname,
    'fixtures/sample-project/tsconfig.json'
  );
  let result: ReturnType<typeof extractFromProject>;

  beforeAll(() => {
    result = extractFromProject(fixturePath);
  });

  it('extracts interfaces', () => {
    const interfaces = result.nodes.filter((n) => n.label === 'Interface');
    expect(interfaces.map((i) => i.name)).toContain('User');
    expect(interfaces.map((i) => i.name)).toContain('Order');
  });

  it('extracts functions', () => {
    const functions = result.nodes.filter((n) => n.label === 'Function');
    expect(functions.map((f) => f.name)).toContain('getUser');
    expect(functions.map((f) => f.name)).toContain('createOrder');
  });

  it('extracts CALLS edges', () => {
    const callEdges = result.edges.filter((e) => e.type === 'CALLS');
    // processUser calls getUser and validateUser
    expect(callEdges.length).toBeGreaterThan(0);
  });

  it('extracts USES_TYPE edges', () => {
    const typeEdges = result.edges.filter((e) => e.type === 'USES_TYPE');
    expect(typeEdges.length).toBeGreaterThan(0);
  });

  it('extracts IMPORTS edges', () => {
    const importEdges = result.edges.filter((e) => e.type === 'IMPORTS');
    expect(importEdges.length).toBeGreaterThan(0);
  });
});
```

---

## Phase 8: Claude Code Integration

### Task 8.1: Configure MCP in Claude Code

Add to `~/.claude.json` (or project-level `.claude/settings.json`):

```json
{
  "mcpServers": {
    "ts-graph-mcp": {
      "command": "node",
      "args": ["/path/to/ts-graph-mcp/dist/cli.js", "serve"],
      "env": {
        "MEMGRAPH_URI": "bolt://localhost:7687"
      }
    }
  }
}
```

### Task 8.2: Document usage in project README

Create `README.md`:

```markdown
# ts-graph-mcp

MCP server providing TypeScript codebase graph navigation tools for AI coding agents

## Setup

1. Start Memgraph:
   ```bash
   docker run -p 7687:7687 memgraph/memgraph
   ```

2. Index your project:
   ```bash
   pnpm build
   pnpm cli index ./path/to/tsconfig.json --clear
   ```

3. Add MCP config to Claude Code (see below)

4. Use in Claude Code:
   - "What calls the processOrder function?"
   - "What would be impacted if I change the User interface?"
   - "Show me the path from createOrder to validateUser"

## MCP Tools

- `get_callers_of` - Find what calls a function
- `get_callees_of` - Find what a function calls
- `get_type_usages` - Find where a type is used
- `get_impacted_by` - Impact analysis before refactoring
- `get_path_between` - Find dependency paths
- `search_nodes` - Search by name
```

---

## Verification Checklist

- [ ] Project scaffolded with all dependencies
- [ ] TypeScript compiles without errors
- [ ] Extraction produces nodes and edges from test fixtures
- [ ] Memgraph connection works (test with `stats` command)
- [ ] Full index completes on test fixtures
- [ ] MCP server starts and responds to tool calls
- [ ] Claude Code can list and invoke tools
- [ ] Incremental file update works

## Future Enhancements (Out of Scope for Initial Build)

- File watcher for automatic re-indexing
- Property-level read/write tracking improvements
- Support for monorepos (multiple tsconfig files)
- Caching layer for expensive queries
- Web UI for graph visualization
```
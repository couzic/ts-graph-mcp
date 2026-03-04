# Graph Model

**Status:** ✅ Implemented

**ID:** `graph-model`

## Nodes

### Node types

> `{#graph-model::node-types}`

The graph contains exactly 7 node types: `Function`, `Class`, `Method`,
`Interface`, `TypeAlias`, `Variable`, `SyntheticType`.

Each source file symbol is extracted as exactly one of these types.

### Node ID format

> `{#graph-model::node-id.format}`

Every node has a deterministic ID with format `{relativePath}:{nodeType}:{symbolPath}`.

- `relativePath` is the file path relative to the project root
- `nodeType` is one of the 7 node types
- `symbolPath` is the symbol name, potentially qualified with a parent name

Examples:
- `src/utils.ts:Function:formatDate`
- `src/models/User.ts:Class:User`
- `src/models/User.ts:Method:User.save`
- `src/models/User.ts:TypeAlias:UserRole`
- `src/config.ts:Variable:DEFAULT_TIMEOUT`

### Node ID uses forward slashes

> `{#graph-model::node-id.forward-slashes}`

Path separators in node IDs are always forward slashes, even on Windows.
Backslashes are normalized to forward slashes.

### Hierarchical symbol paths

> `{#graph-model::node-id.hierarchical}`

Class members use dot-separated symbol paths: `{ClassName}.{memberName}`.

Examples:
- Method: `src/service.ts:Method:UserService.save`
- Object literal method: `src/service.ts:Function:userService.load`

### Factory function symbol paths

> `{#graph-model::node-id.factory}`

Factory functions that return object literals produce nodes with qualified symbol
paths using `ReturnType<typeof factoryName>` as the parent prefix.

Given `const createService = () => ({ fetchAll: () => [] })`:
- Factory method node ID: `file.ts:Function:ReturnType<typeof createService>.fetchAll`
- SyntheticType node ID: `file.ts:SyntheticType:ReturnType<typeof createService>`

### Base node properties

> `{#graph-model::nodes.base-properties}`

All nodes share these base properties:

| Property      | Description                            |
| ------------- | -------------------------------------- |
| `id`          | Unique node ID (see node ID format)    |
| `type`        | Node type discriminator                |
| `name`        | Symbol name                            |
| `package`     | Package name from config               |
| `filePath`    | Relative file path                     |
| `startLine`   | Start line number (1-indexed)          |
| `endLine`     | End line number (1-indexed)            |
| `exported`    | Whether the symbol is exported         |
| `contentHash` | Hash of embedding content              |
| `snippet`     | Source code snippet                    |

### Function node properties

> `{#graph-model::nodes.function-properties}`

Function nodes have additional properties:

| Property     | Type                             | Description                        |
| ------------ | -------------------------------- | ---------------------------------- |
| `parameters` | `Array<{ name, type? }>` or undefined | Function parameter names and types |
| `returnType` | `string` or undefined            | Return type annotation             |
| `async`      | `boolean` or undefined           | Whether the function is async      |

### Class node properties

> `{#graph-model::nodes.class-properties}`

Class nodes have additional properties:

| Property     | Type                     | Description                   |
| ------------ | ------------------------ | ----------------------------- |
| `extends`    | `string` or undefined    | Name of the parent class      |
| `implements` | `string[]` or undefined  | Names of implemented interfaces |

### Method node properties

> `{#graph-model::nodes.method-properties}`

Method nodes have additional properties:

| Property     | Type                             | Description                   |
| ------------ | -------------------------------- | ----------------------------- |
| `parameters` | `Array<{ name, type? }>` or undefined | Method parameter names and types |
| `returnType` | `string` or undefined            | Return type annotation        |
| `async`      | `boolean` or undefined           | Whether the method is async   |
| `visibility` | `"public" \| "private" \| "protected"` or undefined | Access modifier |
| `static`     | `boolean` or undefined           | Whether the method is static  |

### Interface node properties

> `{#graph-model::nodes.interface-properties}`

Interface nodes have additional properties:

| Property  | Type                    | Description                      |
| --------- | ----------------------- | -------------------------------- |
| `extends` | `string[]` or undefined | Names of extended interfaces     |

### TypeAlias node properties

> `{#graph-model::nodes.type-alias-properties}`

TypeAlias nodes have additional properties:

| Property      | Type                  | Description                  |
| ------------- | --------------------- | ---------------------------- |
| `aliasedType` | `string` or undefined | The type expression text     |

### Variable node properties

> `{#graph-model::nodes.variable-properties}`

Variable nodes have additional properties:

| Property  | Type                   | Description                       |
| --------- | ---------------------- | --------------------------------- |
| `isConst` | `boolean` or undefined | Whether declared with `const`     |

### SyntheticType node properties

> `{#graph-model::nodes.synthetic-type-properties}`

SyntheticType nodes represent the inferred return type of factory functions.
They have no additional properties beyond the base properties.

A SyntheticType is created when a factory function (arrow or function expression)
returns an object literal without an explicit return type annotation. Its name
follows the pattern `ReturnType<typeof factoryName>`.

### Arrow functions extracted as Function nodes

> `{#graph-model::nodes.arrow-as-function}`

Arrow functions and function expressions assigned to variables are extracted as
`Function` nodes, not `Variable` nodes. The node uses the variable name as its
symbol name.

Given `const handler = (req: Request) => res.send("OK")`, the node type is
`Function` and the ID is `file.ts:Function:handler`.

### Object literal methods extracted as Function nodes

> `{#graph-model::nodes.object-literal-methods}`

Methods defined inside object literals (both method shorthand `{ method() {} }`
and arrow property `{ method: () => {} }`) are extracted as `Function` nodes
with a qualified symbol path: `{objectName}.{methodName}`.

Given `const service = { load() {} }`, the method's ID is
`file.ts:Function:service.load`.

### Method visibility defaults to public

> `{#graph-model::nodes.method-visibility-default}`

When a class method has no explicit access modifier, `visibility` is `"public"`.

### Methods are never exported

> `{#graph-model::nodes.method-not-exported}`

Class methods always have `exported: false`. They are not directly exportable
from a module; only their containing class can be exported.

### Properties are not extracted as nodes

> `{#graph-model::nodes.no-property-nodes}`

Class properties and interface properties are not extracted as individual nodes.
Property types are captured via `HAS_PROPERTY` edges from the containing
class/interface instead.

## Edges

### Edge types

> `{#graph-model::edge-types}`

The graph contains 12 edge types, split into two categories:

**Runtime edges** (represent runtime behavior):
- `CALLS` -- Direct function/method invocation
- `REFERENCES` -- Function passed as callback or stored (not invoked)
- `USES_TYPE` -- (deprecated, replaced by TAKES/RETURNS/HAS_TYPE/HAS_PROPERTY)

**Compile-time edges** (represent type system relationships):
- `EXTENDS` -- Class or interface inheritance
- `IMPLEMENTS` -- Class implements interface
- `INCLUDES` -- JSX component usage (`<Component />`)
- `TAKES` -- Function/method parameter type
- `RETURNS` -- Function/method return type
- `HAS_TYPE` -- Variable type annotation
- `HAS_PROPERTY` -- Class/interface/object property type
- `DERIVES_FROM` -- Type alias composition (intersection/union)
- `ALIAS_FOR` -- Direct type alias

### Edge composite unique key

> `{#graph-model::edges.composite-key}`

Each edge is uniquely identified by the combination of `(source, target, type)`.
There can be at most one edge of a given type between two nodes.

### CALLS edge metadata

> `{#graph-model::edges.calls-metadata}`

CALLS edges carry additional metadata:

| Property    | Type             | Description                              |
| ----------- | ---------------- | ---------------------------------------- |
| `callCount` | `number`         | Number of times the target is called     |
| `callSites` | `CallSiteRange[]`| Line ranges where calls occur (1-indexed)|

When the same function calls the same target multiple times, a single CALLS edge
is created with `callCount` reflecting the total and `callSites` listing each
location.

### INCLUDES edge for JSX usage

> `{#graph-model::edges.includes-jsx}`

When a function renders a JSX component (`<MyComponent />` or
`<MyComponent>...</MyComponent>`), an `INCLUDES` edge is created from the
rendering function to the component definition.

Intrinsic HTML elements (lowercase tag names like `<div>`, `<span>`) are
ignored.

INCLUDES edges carry the same `callCount` and `callSites` metadata as CALLS
edges.

### REFERENCES edge contexts

> `{#graph-model::edges.references-contexts}`

REFERENCES edges capture when a function is passed or stored (not directly
invoked). Each edge includes a `referenceContext` indicating how the symbol is
used:

| Context      | Example                          |
| ------------ | -------------------------------- |
| `"callback"` | `array.map(fn)`                  |
| `"property"` | `{ handler: fn }` or `{ fn }`    |
| `"array"`    | `[fn1, fn2]`                     |
| `"return"`   | `return fn`                      |
| `"assignment"`| `const x = fn`                  |
| `"access"`   | `formatters[type]`               |

### Generic unwrapping

> `{#graph-model::edges.generic-unwrapping}`

When a type signature uses a built-in generic wrapper, the edge targets the
inner type, not the wrapper.

Given `function load(): Promise<User>`, the RETURNS edge targets `User`, not
`Promise`. This applies recursively: `Promise<Array<User>>` also targets `User`.

### Union handling produces multiple edges

> `{#graph-model::edges.union-handling}`

When a type signature is a union type, one edge is created for each member of
the union that is a known (non-primitive, non-built-in) type.

Given `function process(actor: User | Admin): void`, two TAKES edges are
created: one to `User` and one to `Admin`.

### Intersection handling produces multiple edges

> `{#graph-model::edges.intersection-handling}`

When a type signature is an intersection type, one edge is created for each
member of the intersection that is a known type.

Given `type Entity = Named & Identified`, two DERIVES_FROM edges are created:
one to `Named` and one to `Identified`.

### Primitive types are skipped

> `{#graph-model::edges.primitive-skipping}`

No type edges are created for primitive types: `string`, `number`, `boolean`,
`symbol`, `bigint`, `void`, `never`, `any`, `unknown`, `null`, `undefined`.

Given `function format(value: string): void`, no TAKES or RETURNS edges are
created.

### Built-in types are skipped

> `{#graph-model::edges.built-in-filtering}`

Built-in wrapper types are transparent: the edge targets their inner type
argument instead of the wrapper itself. If the inner type is also a built-in or
primitive, no edge is created.

Built-in types: `Array`, `Map`, `Set`, `Promise`, `Date`, `RegExp`, `Error`,
`Function`, `Object`, `String`, `Number`, `Boolean`, `Symbol`, `BigInt`,
`WeakMap`, `WeakSet`.

For type alias edges, additional built-in utility types are also filtered:
`Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`, `Exclude`,
`Extract`, `NonNullable`, `ReturnType`, `Parameters`, `InstanceType`,
`ConstructorParameters`.

### Null and undefined are skipped in unions

> `{#graph-model::edges.null-undefined-skipping}`

In union types, `null` and `undefined` literal members are skipped. Only
non-primitive, non-built-in members produce edges.

Given `function find(): User | null | undefined`, one RETURNS edge is created to
`User`. The `null` and `undefined` members produce no edges.

### Array syntax extracts element type

> `{#graph-model::edges.array-element-type}`

The `User[]` array syntax is treated the same as `Array<User>`: the edge targets
the element type `User`, not the array itself.

### TAKES edges from parameter types

> `{#graph-model::edges.takes}`

A `TAKES` edge is created from a function or method to each non-primitive,
non-built-in type used in its parameter type annotations.

Source: the function or method node.
Target: the type node referenced in a parameter annotation.

Applies to: regular functions, arrow functions, class methods, object literal
methods.

### RETURNS edges from return types

> `{#graph-model::edges.returns}`

A `RETURNS` edge is created from a function or method to each non-primitive,
non-built-in type used in its explicit return type annotation.

Source: the function or method node.
Target: the type node referenced in the return type annotation.

Only explicit return type annotations produce RETURNS edges. Inferred return
types do not.

### HAS_TYPE edges from variable annotations

> `{#graph-model::edges.has-type}`

A `HAS_TYPE` edge is created from a variable to its type annotation.

Source: the variable node.
Target: the type referenced in the annotation.

Variables whose initializer is an arrow function or function expression are
excluded (their types are captured by TAKES/RETURNS instead).

### HAS_PROPERTY edges from class and interface properties

> `{#graph-model::edges.has-property}`

A `HAS_PROPERTY` edge is created from a class or interface to each non-primitive,
non-built-in type used in its property type annotations.

Source: the class or interface node.
Target: the type node referenced in a property annotation.

Also applies to object literal properties with type assertions (`prop: value as
Type`).

### DERIVES_FROM edges from union and intersection aliases

> `{#graph-model::edges.derives-from}`

A `DERIVES_FROM` edge is created from a type alias to each member of its union
or intersection composition.

Given `type Result = Success | Failure`, two DERIVES_FROM edges are created: one
to `Success` and one to `Failure`.

Given `type Customer = User & { id: string }`, one DERIVES_FROM edge is created
to `User` (inline type literals are ignored).

### ALIAS_FOR edges from direct type aliases

> `{#graph-model::edges.alias-for}`

An `ALIAS_FOR` edge is created when a type alias directly references another
type (not a union or intersection).

Given `type Person = User`, one ALIAS_FOR edge is created from `Person` to
`User`.

For aliases of built-in-wrapped types (`type Users = Array<User>`), the ALIAS_FOR
edge targets the inner type (`User`).

Aliases of primitive types (`type ID = string`) produce no edge.

### ALIAS_FOR targets SyntheticType for ReturnType<typeof X>

> `{#graph-model::edges.alias-for-synthetic}`

When a type alias uses `ReturnType<typeof factoryFn>`, the ALIAS_FOR edge
targets the corresponding SyntheticType node.

Given:
```
const createService = () => ({ doSomething: () => {} });
type Service = ReturnType<typeof createService>;
```

An ALIAS_FOR edge is created from `TypeAlias:Service` to
`SyntheticType:ReturnType<typeof createService>`.

### Factory RETURNS edge to SyntheticType

> `{#graph-model::edges.factory-returns-synthetic}`

When a factory function (arrow or function expression returning an object
literal) has no explicit return type annotation, a RETURNS edge is created from
the factory to its SyntheticType node.

Given `const createService = () => ({ fetchAll: () => [] })`:
- RETURNS edge: `Function:createService` -> `SyntheticType:ReturnType<typeof createService>`

This only applies when there is no explicit return type annotation. If the
factory has an explicit return type, normal RETURNS edge rules apply instead.

### EXTENDS edges for class and interface inheritance

> `{#graph-model::edges.extends}`

An `EXTENDS` edge is created from a class to its parent class, or from an
interface to each parent interface.

Source: the child class or interface.
Target: the parent class or interface.

A class can have at most one EXTENDS edge (single inheritance). An interface can
have multiple EXTENDS edges (multiple inheritance).

### IMPLEMENTS edges for class-to-interface

> `{#graph-model::edges.implements}`

An `IMPLEMENTS` edge is created from a class to each interface it implements.

Source: the class node.
Target: the interface node.

A class can have multiple IMPLEMENTS edges.

### Constructor calls attributed to class node

> `{#graph-model::edges.constructor-calls}`

Call expressions inside a class constructor are attributed to the class node
itself, not to a separate constructor node. The CALLS edge source is the Class
node.

### Built-in method calls produce no edge

> `{#graph-model::edges.no-built-in-calls}`

Calls to built-in methods (e.g., `Array.map`, `String.split`,
`Math.min`) produce no CALLS edge. A method call is considered built-in when
its declaration resolves to a file outside the project root or inside
`node_modules/`.

## Re-export invisibility

> `{#graph-model::re-export-invisibility}`

Re-exports (barrel files) are completely invisible in the graph. No nodes are
created for re-exported symbols, and no edges point to or from barrel files.

When file A imports symbol X from a barrel file that re-exports X from file B:
- The edge source/target points to B (the actual definition), not the barrel
- The barrel file contributes no nodes to the graph

This is achieved at indexing time by following re-export alias chains
(`followAliasChain`) to resolve to actual definitions.

## Storage

### No foreign key constraints on edges

> `{#graph-model::edges.no-fk-constraints}`

The edges table has no foreign key constraints referencing the nodes table. This
enables:
- Parallel indexing of packages (no ordering dependencies)
- Dangling edges are filtered out at query time via JOINs with the nodes table

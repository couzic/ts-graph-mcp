# UI Package

React SPA for exploring the code graph. Built with Vite, served by the HTTP server at `/`.

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **verdux** - State management (Redux + RxJS)
- **RxJS** - Reactive data fetching

## Key Files

| File | Purpose |
|------|---------|
| `src/graph.ts` | Verdux graph setup, vertex configurations |
| `src/App.tsx` | Root component |
| `src/main.tsx` | Entry point, renders App |
| `src/appVertexConfig.ts` | State management and API loaders |
| `src/ApiService.ts` | HTTP API client |
| `src/SymbolSelect.tsx` | FROM/TO endpoint selector (supports both symbol selection and text queries) |
| `src/QueryResults.tsx` | Displays query results |

## State Management Pattern

Uses verdux for reactive state:
@verdux.md
@verdux-examples.xml

```typescript
// Define vertex with slice + loaders
const vertexConfig = configureRootVertex({ slice })
  .load({ data: observable$ })

// Create graph
const graph = createGraph({ vertices: [vertexConfig] })
const vertex = graph.getVertexInstance(vertexConfig)

// Subscribe in React
vertex.loadableState$.subscribe(state => {
  // state.status: 'loading' | 'loaded' | 'error'
  // state.state: the actual data when loaded
})
```

## Features

| Feature | Status |
|---------|--------|
| Topic (semantic search) input | Implemented |
| Symbol search (FROM/TO endpoint selection) | Implemented |
| Free text queries (loose/natural language) | Implemented |
| Forward traversal (dependencies) | Implemented |
| Backward traversal (dependents) | Implemented |
| Path finding (between two symbols) | Implemented |
| MCP output format | Implemented |
| Mermaid diagram rendering | Implemented |

## UI Components

### Topic Input
Text field for semantic/topic search. When filled (with FROM/TO empty), triggers `searchByTopic` API.

### FROM/TO Selectors
Creatable select components that support two modes:
1. **Symbol selection** - Select from search results (exact match)
2. **Text query** - Type and press Enter to use as natural language query

Query patterns:
- **FROM only** → Forward traversal (what does this call?)
- **TO only** → Backward traversal (who calls this?)
- **FROM + TO** → Path finding (how does A reach B?)
- **Topic only** → Semantic search

## Build

```bash
npm run build    # Outputs to ../dist/public/
npm run dev      # Dev server with HMR
```

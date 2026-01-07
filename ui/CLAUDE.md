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

## Build

```bash
npm run build    # Outputs to ../dist/public/
npm run dev      # Dev server with HMR
```

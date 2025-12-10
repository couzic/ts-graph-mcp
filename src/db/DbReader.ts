import type {
	NeighborOptions,
	Node,
	Path,
	SearchFilters,
	Subgraph,
	TraversalOptions,
} from "./Types.js";

/**
 * Query the code graph (read-only operations).
 * Used by: MCP Server Module
 */
export interface DbReader {
	/**
	 * Find all functions/methods that call the target.
	 * Traverses the call graph in reverse.
	 *
	 * @param targetId - Node ID of the function/method being called
	 * @param options - Traversal options (maxDepth, filters)
	 * @returns Array of caller nodes
	 */
	getCallersOf(targetId: string, options?: TraversalOptions): Promise<Node[]>;

	/**
	 * Find all functions/methods that the source calls.
	 * Traverses the call graph forward.
	 *
	 * @param sourceId - Node ID of the calling function/method
	 * @param options - Traversal options (maxDepth, filters)
	 * @returns Array of callee nodes
	 */
	getCalleesOf(sourceId: string, options?: TraversalOptions): Promise<Node[]>;

	/**
	 * Find all locations where a type is used.
	 * Includes parameters, return types, variable declarations.
	 *
	 * @param typeId - Node ID of the type (Interface/TypeAlias/Class)
	 * @param options - Traversal options
	 * @returns Array of nodes that use the type
	 */
	getTypeUsages(typeId: string, options?: TraversalOptions): Promise<Node[]>;

	/**
	 * Impact analysis: find all code affected by changes to target.
	 * Traverses dependencies in reverse (what depends on this?).
	 *
	 * @param nodeId - Node ID to analyze impact for
	 * @param options - Traversal options (maxDepth for transitive deps)
	 * @returns Array of impacted nodes
	 */
	getImpactedBy(nodeId: string, options?: TraversalOptions): Promise<Node[]>;

	/**
	 * Find the shortest path between two nodes.
	 *
	 * @param sourceId - Starting node ID
	 * @param targetId - Ending node ID
	 * @returns Path object or null if no path exists
	 */
	getPathBetween(sourceId: string, targetId: string): Promise<Path | null>;

	/**
	 * Search nodes by name pattern.
	 * Supports glob patterns (*, ?).
	 *
	 * @param pattern - Search pattern (e.g., "handle*", "User*Service")
	 * @param filters - Optional filters (nodeType, module, package, exported)
	 * @returns Array of matching nodes
	 */
	searchNodes(pattern: string, filters?: SearchFilters): Promise<Node[]>;

	/**
	 * Get a single node by ID.
	 *
	 * @param nodeId - Node ID
	 * @returns Node or null if not found
	 */
	getNodeById(nodeId: string): Promise<Node | null>;

	/**
	 * Get all nodes in a file.
	 *
	 * @param filePath - Relative file path
	 * @returns Array of nodes in the file
	 */
	getFileNodes(filePath: string): Promise<Node[]>;

	/**
	 * Find all nodes within a given distance from a center node.
	 * Returns a subgraph containing the neighborhood.
	 *
	 * @param centerId - Node ID of the center node
	 * @param options - Neighbor traversal options (distance, direction, edgeTypes)
	 * @returns Subgraph with center, nodes, and edges
	 */
	findNeighbors(centerId: string, options: NeighborOptions): Promise<Subgraph>;
}

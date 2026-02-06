import type { EmbeddingProvider } from "../../embedding/EmbeddingTypes.js";
import type { SearchIndexWrapper } from "../../search/createSearchIndex.js";

/**
 * Result of filtering node IDs by topic relevance.
 */
export interface TopicFilterResult {
  /** Node IDs that are directly topic-relevant (above threshold) */
  topicRelevantNodes: Set<string>;
  /** Score for each node ID (for debugging/ranking) */
  scoresByNodeId: Map<string, number>;
}

/**
 * Default threshold for topic relevance.
 * Nodes scoring below this are excluded.
 *
 * Set to 0.5 to filter out loosely-related results.
 * In testing, true topic matches score > 0.6, while
 * unrelated results score 0.3-0.4.
 */
const DEFAULT_TOPIC_THRESHOLD = 0.5;

/**
 * Find topic-relevant nodes from a set of node IDs.
 *
 * Searches for the topic and returns nodes that appear in search results
 * with a score above the threshold.
 *
 * @param nodeIds - Node IDs to check (from graph traversal)
 * @param topic - Topic to filter by (e.g., "audit", "validation")
 * @param searchIndex - Search index for topic matching
 * @param threshold - Minimum score to be considered topic-relevant (default: 0.3)
 */
export const filterNodesByTopic = async (
  nodeIds: string[],
  topic: string,
  searchIndex: SearchIndexWrapper,
  embeddingProvider: EmbeddingProvider,
  threshold = DEFAULT_TOPIC_THRESHOLD,
): Promise<TopicFilterResult> => {
  const vector = await embeddingProvider.embedQuery(topic);

  const results = await searchIndex.search(topic, {
    limit: 1000, // High limit to capture all candidates
    vector,
  });

  // Build a map of node ID → score from search results
  const scoresByNodeId = new Map<string, number>();
  for (const result of results) {
    scoresByNodeId.set(result.id, result.score);
  }

  // Find nodes that are directly topic-relevant (above threshold)
  const topicRelevantNodes = new Set<string>();
  for (const nodeId of nodeIds) {
    const score = scoresByNodeId.get(nodeId);
    if (score !== undefined && score >= threshold) {
      topicRelevantNodes.add(nodeId);
    }
  }

  return { topicRelevantNodes, scoresByNodeId };
};

/**
 * Filter edges to keep only those leading to topic-relevant targets.
 *
 * For forward traversal (dependencies): keeps edges where the target can
 * eventually reach a topic-relevant node.
 *
 * @param edges - Edges from graph traversal
 * @param topicRelevantNodes - Nodes that are directly topic-relevant
 * @param startNodeId - The starting node (always kept)
 */
export const filterEdgesToTopicRelevant = <
  T extends { source: string; target: string },
>(
  edges: T[],
  topicRelevantNodes: Set<string>,
  startNodeId: string,
): T[] => {
  // Build adjacency list: node → nodes it leads to (targets)
  const forwardEdges = new Map<string, Set<string>>();
  for (const edge of edges) {
    const targets = forwardEdges.get(edge.source) ?? new Set();
    targets.add(edge.target);
    forwardEdges.set(edge.source, targets);
  }

  // Find all nodes that can reach a topic-relevant node
  // (work backwards from topic-relevant nodes)
  const nodesLeadingToTopic = new Set<string>(topicRelevantNodes);

  // BFS from each node to check if it can reach a topic-relevant node
  const canReachTopic = (nodeId: string): boolean => {
    if (nodesLeadingToTopic.has(nodeId)) {
      return true;
    }

    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: length checked above
      const current = queue.shift()!;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (topicRelevantNodes.has(current)) {
        return true;
      }

      const targets = forwardEdges.get(current);
      if (targets) {
        for (const target of targets) {
          if (!visited.has(target)) {
            queue.push(target);
          }
        }
      }
    }

    return false;
  };

  // Mark all nodes that can reach topic-relevant nodes
  for (const edge of edges) {
    if (canReachTopic(edge.source)) {
      nodesLeadingToTopic.add(edge.source);
    }
    if (canReachTopic(edge.target)) {
      nodesLeadingToTopic.add(edge.target);
    }
  }

  // Always include the start node
  nodesLeadingToTopic.add(startNodeId);

  // Filter edges: keep only those where BOTH source and target lead to topic-relevant nodes
  return edges.filter(
    (edge) =>
      nodesLeadingToTopic.has(edge.source) &&
      nodesLeadingToTopic.has(edge.target),
  );
};

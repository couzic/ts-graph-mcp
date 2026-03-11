import type {
  Edge,
  Extracted,
  FeatureNode,
  SpecNode,
} from "../../../db/Types.js";

interface ParseFeatureFileResult {
  features: Extracted<FeatureNode>[];
  specs: Extracted<SpecNode>[];
  edges: Edge[];
}

const FEATURE_ID_RE = /^\*\*ID:\*\*\s*`([^`]+)`/;
const PACKAGE_RE = /^\*\*Package:\*\*\s*`([^`]+)`/;
const SPEC_ANCHOR_RE = /^>\s*`\{#([^}]+)\}`/;
const HEADING_RE = /^(#{1,6})\s+/;

/**
 * Parses a `*.feature.md` file and extracts Feature/Spec nodes and CONTAINS edges.
 *
 * @spec traceability::feature-nodes
 * @spec traceability::spec-nodes
 * @spec traceability::contains
 *
 * @example
 * const result = parseFeatureFile(markdownContent, "specs/auth.feature.md");
 * // result.features -> [{ id: "specs/auth.feature.md:Feature:auth", type: "Feature", ... }]
 * // result.specs -> [{ id: "specs/auth.feature.md:Spec:auth::login", type: "Spec", ... }]
 * // result.edges -> [{ source: "...:Feature:auth", target: "...:Spec:auth::login", type: "CONTAINS" }]
 */
export const parseFeatureFile = (
  markdown: string,
  filePath: string,
): ParseFeatureFileResult => {
  const lines = markdown.split("\n");
  const totalLines = lines.length;

  let featureId: string | undefined;
  let featureHeadingLine: number | undefined;
  let packageName: string | undefined;

  // First pass: extract feature-level metadata
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (featureHeadingLine === undefined) {
      const headingMatch = line.match(HEADING_RE);
      if (headingMatch && headingMatch[1] === "#") {
        featureHeadingLine = i + 1; // 1-indexed
      }
    }

    const idMatch = line.match(FEATURE_ID_RE);
    if (idMatch) {
      featureId = idMatch[1]!;
    }

    const pkgMatch = line.match(PACKAGE_RE);
    if (pkgMatch) {
      packageName = pkgMatch[1]!;
    }
  }

  if (!featureId || featureHeadingLine === undefined) {
    return { features: [], specs: [], edges: [] };
  }

  const featureNodeId = `${filePath}:Feature:${featureId}`;

  const feature: Extracted<FeatureNode> = {
    id: featureNodeId,
    type: "Feature",
    name: featureId,
    filePath,
    startLine: featureHeadingLine,
    endLine: totalLines,
    exported: false,
    ...(packageName !== undefined ? { package: packageName } : {}),
  };

  // Second pass: collect specs with their heading lines
  const specEntries: Array<{
    specId: string;
    headingLine: number;
    headingLevel: number;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const anchorMatch = lines[i]!.match(SPEC_ANCHOR_RE);
    if (!anchorMatch) {
      continue;
    }
    const specId = anchorMatch[1]!;

    // Walk backwards to find the nearest heading above
    let headingLine: number | undefined;
    let headingLevel = 0;
    for (let j = i - 1; j >= 0; j--) {
      const hMatch = lines[j]!.match(HEADING_RE);
      if (hMatch) {
        headingLine = j + 1; // 1-indexed
        headingLevel = hMatch[1]!.length;
        break;
      }
    }

    if (headingLine !== undefined) {
      specEntries.push({ specId, headingLine, headingLevel });
    }
  }

  // Calculate endLine for each spec
  const specs: Extracted<SpecNode>[] = specEntries.map((entry) => {
    let endLine = totalLines;

    // Find the next heading of same or higher level (fewer or equal #'s)
    // headingLine is 1-indexed; used as 0-indexed index it naturally starts
    // one line past the heading itself.
    for (let i = entry.headingLine; i < lines.length; i++) {
      const hMatch = lines[i]!.match(HEADING_RE);
      if (hMatch && hMatch[1]!.length <= entry.headingLevel) {
        endLine = i; // line before this heading (0-indexed i = 1-indexed line i)
        break;
      }
    }

    return {
      id: `${filePath}:Spec:${entry.specId}`,
      type: "Spec" as const,
      name: entry.specId,
      filePath,
      startLine: entry.headingLine,
      endLine,
      exported: false,
      ...(packageName !== undefined ? { package: packageName } : {}),
    };
  });

  const edges: Edge[] = specs.map((spec) => ({
    source: featureNodeId,
    target: spec.id,
    type: "CONTAINS" as const,
  }));

  return { features: [feature], specs, edges };
};

import { ObservableResource, useObservableSuspense } from "observable-hooks";
import { useMemo } from "react";
import type { VertexFieldsDefinition, VertexInstance } from "verdux";

/**
 * Hook to consume vertex state with Suspense support.
 *
 * @example
 * const { health } = useVertexState(healthVertex, ["health"]);
 */
export const useVertexState = <
  Fields extends VertexFieldsDefinition,
  PickedFields extends keyof Fields
>(
  vertex: VertexInstance<Fields, unknown>,
  fields: PickedFields[]
): Pick<Fields, PickedFields> => {
  const resource = useMemo(
    () =>
      new ObservableResource(vertex.pick(fields), (_) => _.status === "loaded"),
    [vertex, ...fields]
  );
  const loadableState = useObservableSuspense(resource);
  if (loadableState.status !== "loaded") {
    throw new Error("Unexpected: status should be loaded after suspense");
  }
  return loadableState.state;
};

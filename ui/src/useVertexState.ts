import { ObservableResource, useObservableSuspense } from "observable-hooks";
import { useMemo } from "react";
import type { VertexInstance } from "verdux";

/**
 * Hook to consume vertex state with Suspense support.
 *
 * @example
 * const { health } = useVertexState(healthVertex, ["health"]);
 */
export const useVertexState = <
  // biome-ignore lint/suspicious/noExplicitAny: generic utility requires any
  T extends Record<string, any>,
>(
  // biome-ignore lint/suspicious/noExplicitAny: generic utility requires any
  vertex: VertexInstance<any, any>,
  fields: (keyof T)[],
): T => {
  const resource = useMemo(
    () =>
      new ObservableResource(
        vertex.pick(fields as string[]),
        (state: { status: string }) => state.status === "loaded",
      ),
    [vertex, ...fields, fields],
  );
  const loadableState = useObservableSuspense(resource);
  if (loadableState.status !== "loaded") {
    throw new Error("Unexpected: status should be loaded after suspense");
  }
  return loadableState.state as T;
};

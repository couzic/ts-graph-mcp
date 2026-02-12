import { ObservableResource, useObservableSuspense } from "observable-hooks";
import { useMemo } from "react";
import type { VertexFieldsDefinition, VertexInstance } from "verdux";

export const useVertexState = <
  Fields extends VertexFieldsDefinition,
  PickedFields extends keyof Fields,
>(
  // biome-ignore lint/suspicious/noExplicitAny: verdux VertexInstance requires unconstrained dependency type
  vertex: VertexInstance<Fields, any>,
  fields: PickedFields[],
) => {
  // biome-ignore lint/correctness/useExhaustiveDependencies: vertex and fields are stable refs, resource must be created once
  const resource = useMemo(
    () =>
      new ObservableResource(
        vertex.pick(fields),
        (_: { status: string }) => _.status === "loaded",
      ),
    [],
  );
  const loadableState = useObservableSuspense(resource);
  if (loadableState.status !== "loaded") throw new Error("SHOULD NEVER HAPPEN");
  return loadableState.state;
};

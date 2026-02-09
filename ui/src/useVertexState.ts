import { ObservableResource, useObservableSuspense } from "observable-hooks";
import { useMemo } from "react";
import type { VertexFieldsDefinition, VertexInstance } from "verdux";

export const useVertexState = <
  Fields extends VertexFieldsDefinition,
  PickedFields extends keyof Fields,
>(
  vertex: VertexInstance<Fields, any>,
  fields: PickedFields[],
) => {
  const resource = useMemo(
    () =>
      new ObservableResource(
        vertex.pick(fields),
        (_: any) => _.status === "loaded",
      ),
    [],
  );
  const loadableState = useObservableSuspense(resource);
  if (loadableState.status !== "loaded") throw new Error("SHOULD NEVER HAPPEN");
  return loadableState.state;
};

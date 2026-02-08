import { loadData } from "./loadData.js";

export const createService = () => ({
  fetchAll: () => {
    return loadData();
  },
  fetchById: (id: string) => {
    return loadData().find((item) => item.id === id);
  },
});

export type Service = ReturnType<typeof createService>;

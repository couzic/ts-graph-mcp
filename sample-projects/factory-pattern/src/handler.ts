import { createService } from "./createService.js";

export const handleRequest = () => {
  const service = createService();
  const all = service.fetchAll();
  return all;
};

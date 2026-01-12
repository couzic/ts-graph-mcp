import type { ProviderController } from "../controllers/ProviderController.js";

export class ProviderRoutes {
  constructor(private controller: ProviderController) {}

  handleSetDefault(req: { params: { id: string } }): {
    status: number;
    body: string;
  } {
    return this.controller.setDefault(req.params.id);
  }
}

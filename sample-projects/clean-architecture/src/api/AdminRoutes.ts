import type { AdminController } from "../controllers/AdminController.js";

export class AdminRoutes {
  constructor(private controller: AdminController) {}

  handleConfigureProvider(req: { body: { providerId: string } }): {
    ok: boolean;
    error?: string;
  } {
    return this.controller.configureProvider(req.body.providerId);
  }
}

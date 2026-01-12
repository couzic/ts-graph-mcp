import type { SetDefaultProviderCommand } from "../usecases/SetDefaultProviderCommand.js";

export class AdminController {
  constructor(private setDefaultProviderCommand: SetDefaultProviderCommand) {}

  configureProvider(providerId: string): { ok: boolean; error?: string } {
    const result = this.setDefaultProviderCommand.execute({ providerId });

    if (result.success) {
      return { ok: true };
    }

    return { ok: false, error: result.message };
  }
}

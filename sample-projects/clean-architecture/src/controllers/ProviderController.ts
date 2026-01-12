import type { SetDefaultProviderCommand } from "../usecases/SetDefaultProviderCommand.js";

export class ProviderController {
  constructor(private setDefaultProviderCommand: SetDefaultProviderCommand) {}

  setDefault(providerId: string): { status: number; body: string } {
    const result = this.setDefaultProviderCommand.execute({ providerId });

    if (result.success) {
      return { status: 200, body: result.message };
    }

    return { status: 404, body: result.message };
  }
}

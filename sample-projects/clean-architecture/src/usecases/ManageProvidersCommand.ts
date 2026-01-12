import type { ProviderService } from "../services/ProviderService.js";

export class ManageProvidersCommand {
  constructor(private providerService: ProviderService) {}

  listAll(): string[] {
    return this.providerService.listAll();
  }

  enable(providerId: string): boolean {
    return this.providerService.enable(providerId);
  }

  disable(providerId: string): boolean {
    return this.providerService.disable(providerId);
  }
}

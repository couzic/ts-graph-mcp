import type { ProviderRepository } from "../repositories/ProviderRepository.js";
import type { ConfigService } from "./ConfigService.js";

export class ProviderService {
  constructor(
    private repository: ProviderRepository,
    private configService: ConfigService,
  ) {}

  setAsDefault(providerId: string): boolean {
    const provider = this.repository.findById(providerId);
    if (!provider) {
      return false;
    }

    // Clear existing default
    const allProviders = this.repository.findAll();
    for (const p of allProviders) {
      if (p.isDefault) {
        this.repository.save({ ...p, isDefault: false });
      }
    }

    // Set new default
    this.repository.save({ ...provider, isDefault: true });
    this.configService.setDefaultProviderId(providerId);
    return true;
  }

  listAll(): string[] {
    return this.repository.findAll().map((p) => p.id);
  }

  enable(providerId: string): boolean {
    const provider = this.repository.findById(providerId);
    if (!provider) {
      return false;
    }
    this.repository.save({ ...provider, enabled: true });
    return true;
  }

  disable(providerId: string): boolean {
    const provider = this.repository.findById(providerId);
    if (!provider) {
      return false;
    }
    this.repository.save({ ...provider, enabled: false });
    return true;
  }
}

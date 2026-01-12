import type { ProviderService } from "../services/ProviderService.js";

export type SetDefaultProviderInput = {
  providerId: string;
};

export type SetDefaultProviderResult = {
  success: boolean;
  message: string;
};

export class SetDefaultProviderCommand {
  constructor(private providerService: ProviderService) {}

  execute(input: SetDefaultProviderInput): SetDefaultProviderResult {
    const success = this.providerService.setAsDefault(input.providerId);

    if (success) {
      return {
        success: true,
        message: `Provider ${input.providerId} is now the default`,
      };
    }

    return {
      success: false,
      message: `Provider ${input.providerId} not found`,
    };
  }
}

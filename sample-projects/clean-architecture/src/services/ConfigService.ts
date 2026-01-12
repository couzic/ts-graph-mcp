export type Config = {
  defaultProviderId: string | null;
};

export class ConfigService {
  private config: Config = { defaultProviderId: null };

  getConfig(): Config {
    return this.config;
  }

  setDefaultProviderId(providerId: string): void {
    this.config = { ...this.config, defaultProviderId: providerId };
  }
}

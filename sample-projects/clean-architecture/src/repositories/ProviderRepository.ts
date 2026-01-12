export type Provider = {
  id: string;
  name: string;
  isDefault: boolean;
};

export class ProviderRepository {
  private providers: Provider[] = [];

  findAll(): Provider[] {
    return this.providers;
  }

  findById(id: string): Provider | undefined {
    return this.providers.find((p) => p.id === id);
  }

  save(provider: Provider): void {
    const index = this.providers.findIndex((p) => p.id === provider.id);
    if (index >= 0) {
      this.providers[index] = provider;
    } else {
      this.providers.push(provider);
    }
  }
}

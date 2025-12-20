/**
 * Application configuration interface.
 * Secondary type for testing type filtering.
 */
export interface Config {
  apiUrl: string;
  debug: boolean;
  maxRetries: number;
}

/**
 * Default configuration values.
 */
export const defaultConfig: Config = {
  apiUrl: "https://api.example.com",
  debug: false,
  maxRetries: 3,
};

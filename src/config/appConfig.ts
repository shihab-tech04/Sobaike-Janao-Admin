/**
 * Application Configuration Foundation
 */

export interface AppConfig {
  appName: string;
  appEnv: 'development' | 'staging' | 'production' | 'test';
  apiBaseUrl: string;
  basePath: string;
  version: string;
  features: {
    enableAuditLogs: boolean;
    enableLiveTelemetry: boolean;
  };
}

export const appConfig: AppConfig = {
  appName: 'Sobai Ke Janao',
  appEnv: (import.meta.env.VITE_APP_ENV as AppConfig['appEnv']) || 'development',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'https://api.sobaike.com/v1',
  basePath: import.meta.env.VITE_BASE_PATH || '/',
  version: '1.0.0-phase1',
  features: {
    enableAuditLogs: true,
    enableLiveTelemetry: false,
  },
};

export default appConfig;

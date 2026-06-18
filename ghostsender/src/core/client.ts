// ──────────────────────────────────────────────────────────────
//  GhostSender — Cliente HTTP para Evolution API
// ──────────────────────────────────────────────────────────────

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { GhostSenderConfig } from './types';
import { logger } from '../config';

export class EvolutionClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: GhostSenderConfig) {
    this.http = axios.create({
      baseURL: config.apiUrl.replace(/\/$/, ''),
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      timeout: 30_000,
    });

    axiosRetry(this.http, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (err) =>
        axiosRetry.isNetworkError(err) ||
        (err.response?.status !== undefined && err.response.status >= 500),
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err: AxiosError) => {
        const status = err.response?.status;
        const data = err.response?.data as Record<string, unknown> | undefined;
        logger.debug(
          `[HTTP] ${err.config?.method?.toUpperCase()} ${err.config?.url} → ${status} ${JSON.stringify(data)}`,
        );
        return Promise.reject(err);
      },
    );
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const cfg: AxiosRequestConfig = params ? { params } : {};
    const { data } = await this.http.get<T>(path, cfg);
    return data;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const { data } = await this.http.post<T>(path, body);
    return data;
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const { data } = await this.http.put<T>(path, body);
    return data;
  }

  async delete<T>(path: string): Promise<T> {
    const { data } = await this.http.delete<T>(path);
    return data;
  }

  /** Envia requisição com API key de instância específica (overrides global) */
  async postWithInstanceKey<T>(path: string, instanceKey: string, body?: unknown): Promise<T> {
    const { data } = await this.http.post<T>(path, body, {
      headers: { apikey: instanceKey },
    });
    return data;
  }
}

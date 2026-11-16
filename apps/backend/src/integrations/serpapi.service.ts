import axios, { type AxiosInstance } from 'axios';
import { logger } from '../config/logger.js';

export interface SerpResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

export interface SerpMapsResult {
  title: string;
  type?: string;
  address?: string;
  rating?: number;
  reviews?: number;
  phone?: string;
  website?: string;
  thumbnail?: string;
}

interface SerpApiResponse {
  organic_results?: SerpResult[];
  news_results?: SerpResult[];
}

interface SerpApiMapsResponse {
  local_results?: SerpMapsResult[];
  search_metadata?: { status: string };
}

export class SerpApiService {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env['SERPAPI_KEY'] ?? '';
    this.client = axios.create({
      baseURL: process.env['SERPAPI_BASE_URL'] ?? 'https://serpapi.com',
      timeout: 20000,
    });
  }

  async search(query: string, options: { num?: number; type?: 'web' | 'news' } = {}): Promise<SerpResult[]> {
    const { num = 10, type = 'web' } = options;

    const res = await this.client.get<SerpApiResponse>('/search', {
      params: {
        q: query,
        api_key: this.apiKey,
        engine: 'google',
        num,
        tbm: type === 'news' ? 'nws' : undefined,
        hl: 'en',
        gl: 'us',
      },
    });

    logger.debug('SerpAPI search', { query, type, resultCount: (res.data.organic_results ?? res.data.news_results ?? []).length });

    return (type === 'news' ? res.data.news_results : res.data.organic_results) ?? [];
  }

  async researchCompany(companyName: string, _website?: string): Promise<{
    news: SerpResult[];
    expansion: SerpResult[];
    hiring: SerpResult[];
  }> {
    const [news, expansion, hiring] = await Promise.allSettled([
      this.search(`"${companyName}" news 2024 2025`, { type: 'news', num: 5 }),
      this.search(`"${companyName}" expansion factory new plant investment`, { num: 5 }),
      this.search(`"${companyName}" hiring jobs manufacturing operations`, { num: 5 }),
    ]);

    return {
      news: news.status === 'fulfilled' ? news.value : [],
      expansion: expansion.status === 'fulfilled' ? expansion.value : [],
      hiring: hiring.status === 'fulfilled' ? hiring.value : [],
    };
  }

  async searchMaps(query: string, options: { limit?: number } = {}): Promise<SerpMapsResult[]> {
    const { limit = 20 } = options;
    const res = await this.client.get<SerpApiMapsResponse>('/search', {
      params: {
        q: query,
        api_key: this.apiKey,
        engine: 'google_maps',
        type: 'search',
        hl: 'en',
      },
    });
    logger.debug('SerpAPI maps search', { query, resultCount: (res.data.local_results ?? []).length });
    return (res.data.local_results ?? []).slice(0, limit);
  }
}

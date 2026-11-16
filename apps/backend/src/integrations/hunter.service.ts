import axios, { type AxiosInstance } from 'axios';
import { logger } from '../config/logger.js';

export interface HunterEmail {
  value: string;
  type: string;
  confidence: number;
  first_name?: string;
  last_name?: string;
  position?: string;
  linkedin?: string;
  verified?: boolean;
}

interface HunterDomainResponse {
  data: {
    domain: string;
    organization: string;
    emails: HunterEmail[];
  };
}

interface HunterFindResponse {
  data: {
    first_name: string;
    last_name: string;
    email: string;
    score: number;
    domain: string;
  };
}

interface HunterVerifyResponse {
  data: {
    result: 'deliverable' | 'undeliverable' | 'risky' | 'unknown';
    score: number;
    email: string;
  };
}

export class HunterService {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env['HUNTER_API_KEY'] ?? '';
    this.client = axios.create({
      baseURL: process.env['HUNTER_BASE_URL'] ?? 'https://api.hunter.io/v2',
      timeout: 15000,
    });
  }

  async getDomainEmails(domain: string): Promise<HunterEmail[]> {
    const res = await this.client.get<HunterDomainResponse>('/domain-search', {
      params: { domain, api_key: this.apiKey, limit: 10 },
    });
    logger.debug('Hunter domain search', { domain, found: res.data.data.emails.length });
    return res.data.data.emails;
  }

  async findEmail(params: {
    firstName: string;
    lastName: string;
    domain: string;
  }): Promise<{ email: string; confidence: number } | null> {
    try {
      const res = await this.client.get<HunterFindResponse>('/email-finder', {
        params: {
          first_name: params.firstName,
          last_name: params.lastName,
          domain: params.domain,
          api_key: this.apiKey,
        },
      });
      return { email: res.data.data.email, confidence: res.data.data.score };
    } catch {
      return null;
    }
  }

  async verifyEmail(email: string): Promise<{ deliverable: boolean; score: number }> {
    try {
      const res = await this.client.get<HunterVerifyResponse>('/email-verifier', {
        params: { email, api_key: this.apiKey },
      });
      return {
        deliverable: res.data.data.result === 'deliverable',
        score: res.data.data.score,
      };
    } catch {
      return { deliverable: false, score: 0 };
    }
  }
}

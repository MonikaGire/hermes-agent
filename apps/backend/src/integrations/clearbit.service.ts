import axios, { type AxiosInstance } from 'axios';
import { logger } from '../config/logger.js';

export interface ClearbitCompany {
  id: string;
  name: string;
  legalName?: string;
  domain: string;
  domainAliases?: string[];
  description?: string;
  foundedYear?: number;
  location?: string;
  timeZone?: string;
  utcOffset?: number;
  geo?: {
    streetNumber?: string;
    streetName?: string;
    city?: string;
    state?: string;
    country?: string;
    countryCode?: string;
  };
  metrics?: {
    employees?: number;
    employeesRange?: string;
    raised?: number;
    annualRevenue?: number;
    estimatedAnnualRevenue?: string;
  };
  category?: {
    sector?: string;
    industryGroup?: string;
    industry?: string;
    subIndustry?: string;
  };
  tags?: string[];
  tech?: string[];
  linkedin?: { handle?: string };
  logo?: string;
}

export class ClearbitService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env['CLEARBIT_BASE_URL'] ?? 'https://company.clearbit.com/v2',
      headers: {
        Authorization: `Bearer ${process.env['CLEARBIT_API_KEY'] ?? ''}`,
      },
      timeout: 15000,
    });
  }

  async enrichCompany(domain: string): Promise<ClearbitCompany | null> {
    try {
      const res = await this.client.get<ClearbitCompany>(
        `/companies/find?domain=${encodeURIComponent(domain)}`,
      );
      logger.debug('Clearbit company enrichment', { domain, found: !!res.data });
      return res.data;
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        (err as { response?: { status?: number } }).response?.status === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  async getTechStack(domain: string): Promise<string[]> {
    const company = await this.enrichCompany(domain);
    return company?.tech ?? [];
  }
}

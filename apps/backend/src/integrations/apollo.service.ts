import axios, { type AxiosInstance } from 'axios';
import { logger } from '../config/logger.js';
import { TARGET_INDUSTRIES, TARGET_COUNTRIES, COMPANY_SIZE_MIN, COMPANY_SIZE_MAX } from '@hermes/shared';

export interface ApolloCompany {
  id: string;
  name: string;
  website_url: string;
  industry: string;
  country: string;
  estimated_num_employees: number;
  annual_revenue_printed?: string;
  linkedin_url?: string;
  logo_url?: string;
  short_description?: string;
}

export interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  email?: string;
  linkedin_url?: string;
  organization_id: string;
}

interface ApolloSearchResponse {
  organizations: ApolloCompany[];
  pagination: { page: number; per_page: number; total_entries: number };
}

interface ApolloPeopleResponse {
  people: ApolloPerson[];
}

export class ApolloService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env['APOLLO_BASE_URL'] ?? 'https://api.apollo.io/v1',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': process.env['APOLLO_API_KEY'] ?? '',
      },
      timeout: 30000,
    });
  }

  async searchCompanies(params: {
    industry?: string;
    country?: string;
    employeeMin?: number;
    employeeMax?: number;
    page?: number;
    perPage?: number;
  }): Promise<{ companies: ApolloCompany[]; total: number }> {
    const {
      industry,
      country,
      employeeMin = COMPANY_SIZE_MIN,
      employeeMax = COMPANY_SIZE_MAX,
      page = 1,
      perPage = 25,
    } = params;

    const payload = {
      page,
      per_page: perPage,
      organization_num_employees_ranges: [`${employeeMin},${employeeMax}`],
      ...(industry && { organization_industry_tag_ids: [industry] }),
      ...(country && { organization_locations: [country] }),
    };

    const res = await this.client.post<ApolloSearchResponse>(
      '/mixed_companies/search',
      payload,
    );

    logger.debug('Apollo company search', { params, total: res.data.pagination.total_entries });

    return {
      companies: res.data.organizations,
      total: res.data.pagination.total_entries,
    };
  }

  async findDecisionMakers(
    companyId: string,
    targetRoles: string[],
  ): Promise<ApolloPerson[]> {
    const payload = {
      organization_ids: [companyId],
      person_titles: targetRoles,
      per_page: 10,
    };

    const res = await this.client.post<ApolloPeopleResponse>('/mixed_people/search', payload);
    logger.debug('Apollo people search', { companyId, found: res.data.people.length });

    return res.data.people;
  }

  async enrichCompany(domain: string): Promise<ApolloCompany | null> {
    try {
      const res = await this.client.get<{ organization: ApolloCompany }>(
        `/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      );
      return res.data.organization;
    } catch {
      return null;
    }
  }
}

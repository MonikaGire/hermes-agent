import OpenAI from 'openai';
import { logger } from '../config/logger.js';

export class OpenAIService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    this.model = process.env['OPENAI_MODEL'] ?? 'gpt-4o';
  }

  async chat(
    systemPrompt: string,
    userMessage: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    } = {},
  ): Promise<{ content: string; tokensUsed: number }> {
    const { temperature = 0.7, maxTokens = 2000, jsonMode = false } = options;

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode && { response_format: { type: 'json_object' } }),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '';
    const tokensUsed = response.usage?.total_tokens ?? 0;

    logger.debug('OpenAI call', { model: this.model, tokensUsed, jsonMode });

    return { content, tokensUsed };
  }

  async verify(): Promise<boolean> {
    try {
      const models = await this.client.models.list();
      return models.data.length > 0;
    } catch {
      return false;
    }
  }
}

import OpenAI from 'openai';
import type { AgentResult } from '@hermes/shared';

export abstract class BaseAgent<TInput, TOutput> {
  protected readonly client: OpenAI;
  protected readonly model: string;
  protected abstract readonly agentName: string;

  constructor() {
    const baseURL = process.env['OPENAI_BASE_URL'];
    this.client = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'] ?? 'local',
      ...(baseURL && { baseURL }),
    });
    this.model = process.env['OPENAI_MODEL'] ?? 'gpt-4o';
  }

  abstract run(input: TInput): Promise<AgentResult<TOutput>>;

  protected async chat(
    systemPrompt: string,
    userMessage: string,
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {},
  ): Promise<{ content: string; tokensUsed: number }> {
    const { temperature = 0.7, maxTokens, jsonMode = false } = options;

    // Only use json_object mode when supported (OpenAI + Groq support it; Ollama uses prompt instruction)
    const useJsonMode = jsonMode && !process.env['OPENAI_BASE_URL']?.includes('11434');

    const start = Date.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature,
      max_tokens: maxTokens ?? Number(process.env['OPENAI_MAX_TOKENS'] ?? 2000),
      ...(useJsonMode && { response_format: { type: 'json_object' } }),
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: jsonMode && !useJsonMode
            ? `${userMessage}\n\nIMPORTANT: Respond with valid JSON only. No explanation, no markdown, just the JSON object.`
            : userMessage,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '';
    const tokensUsed = response.usage?.total_tokens ?? 0;

    return { content, tokensUsed };
  }

  protected parseJSON<T>(text: string): T {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
    const jsonStr = (match[1] ?? text).trim();
    return JSON.parse(jsonStr) as T;
  }

  protected wrap<T>(fn: () => Promise<T>): Promise<AgentResult<T>> {
    const start = Date.now();
    return fn()
      .then((data) => ({
        success: true as const,
        data,
        durationMs: Date.now() - start,
      }))
      .catch((err: unknown) => ({
        success: false as const,
        error: err instanceof Error ? err.message : 'Unknown error',
        durationMs: Date.now() - start,
      }));
  }
}

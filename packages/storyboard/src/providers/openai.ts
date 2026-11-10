import type { LLMMessage, LLMProvider, LLMResponse, LLMGenerateOptions } from '../types.js';

export interface OpenAILLMProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAILLMProvider implements LLMProvider {
  public readonly id = 'openai';
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;

  constructor(options: OpenAILLMProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
    this.defaultModel = options.model || 'gpt-4o-mini';
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
  }

  public async generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable or apiKey option is required for OpenAILLMProvider.');
    }

    const model = options?.model || this.defaultModel;
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 4096,
      response_format: { type: 'json_object' },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenAI API request failed [${res.status}]: ${errorText}`);
    }

    const json: any = await res.json();
    const content = json.choices?.[0]?.message?.content ?? '';

    return {
      content,
      usage: {
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
        totalTokens: json.usage?.total_tokens,
      },
    };
  }
}

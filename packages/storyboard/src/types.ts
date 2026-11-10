import type { Project } from '@studio/schema';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  responseFormat?: 'json';
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface LLMProvider {
  readonly id: string;
  generate(messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResponse>;
}

export interface GenerateStoryboardOptions {
  promptVersion?: string;
  modelParams?: Record<string, unknown>;
  maxRetries?: number;
  cacheDir?: string;
  useCache?: boolean;
  language?: string;
  themeId?: string;
}

export interface GenerateStoryboardParams {
  sourceText: string;
  provider: LLMProvider;
  options?: GenerateStoryboardOptions;
}

export interface GenerateStoryboardResult {
  project: Project;
  cached: boolean;
  retries: number;
  providerId: string;
}

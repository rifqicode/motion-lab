import { safeValidateProject, type Project } from '@studio/schema';
import type {
  GenerateStoryboardParams,
  GenerateStoryboardResult,
  LLMMessage,
} from './types.js';
import {
  SYSTEM_STORYBOARD_PROMPT,
  DEFAULT_PROMPT_VERSION,
  buildUserPrompt,
  buildRepairPrompt,
} from './prompts.js';
import { StoryboardCache, computeStoryboardHash } from './cache.js';

export function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

export async function generateStoryboard({
  sourceText,
  provider,
  options = {},
}: GenerateStoryboardParams): Promise<GenerateStoryboardResult> {
  const promptVersion = options.promptVersion || DEFAULT_PROMPT_VERSION;
  const maxRetries = options.maxRetries ?? 2;
  const useCache = options.useCache ?? true;
  const modelParams = options.modelParams || {};
  const cache = new StoryboardCache(options.cacheDir);

  const cacheKey = computeStoryboardHash(sourceText, promptVersion, modelParams);

  if (useCache) {
    const cachedProject = cache.get(cacheKey);
    if (cachedProject) {
      return {
        project: cachedProject,
        cached: true,
        retries: 0,
        providerId: provider.id,
      };
    }
  }

  const systemMessage: LLMMessage = {
    role: 'system',
    content: SYSTEM_STORYBOARD_PROMPT,
  };

  const userMessage: LLMMessage = {
    role: 'user',
    content: buildUserPrompt(sourceText, {
      language: options.language,
      themeId: options.themeId,
    }),
  };

  const conversation: LLMMessage[] = [systemMessage, userMessage];

  let attempts = 0;
  let lastErrors: string[] = [];

  while (attempts <= maxRetries) {
    const response = await provider.generate(conversation, {
      model: modelParams.model as string | undefined,
      temperature: (modelParams.temperature as number | undefined) ?? 0.2,
      responseFormat: 'json',
    });

    const cleanedText = cleanJsonOutput(response.content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (parseErr: any) {
      lastErrors = [`JSON Parse Error: ${parseErr.message}`];
      attempts++;
      if (attempts <= maxRetries) {
        conversation.push({ role: 'assistant', content: response.content });
        conversation.push({ role: 'user', content: buildRepairPrompt(lastErrors) });
      }
      continue;
    }

    const validation = safeValidateProject(parsed);
    if (validation.success) {
      const validProject = validation.data;
      if (useCache) {
        cache.set(cacheKey, validProject);
      }
      return {
        project: validProject,
        cached: false,
        retries: attempts,
        providerId: provider.id,
      };
    }

    // Validation failed
    lastErrors = validation.error.issues.map(
      (issue) => `[${issue.path.join('.')}]: ${issue.message}`
    );
    attempts++;

    if (attempts <= maxRetries) {
      conversation.push({ role: 'assistant', content: response.content });
      conversation.push({ role: 'user', content: buildRepairPrompt(lastErrors) });
    }
  }

  throw new Error(
    `Failed to generate valid storyboard after ${maxRetries + 1} attempt(s).\nValidation Errors:\n${lastErrors.join(
      '\n'
    )}`
  );
}

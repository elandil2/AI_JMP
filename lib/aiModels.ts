export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.8-flash'] as const;

export type GeminiModel = (typeof GEMINI_MODELS)[number];

export const DEFAULT_GEMINI_MODEL: GeminiModel = 'gemini-2.5-flash';

export function resolveGeminiModel(model?: string): GeminiModel {
  if (!model) return DEFAULT_GEMINI_MODEL;
  if ((GEMINI_MODELS as readonly string[]).includes(model)) return model as GeminiModel;
  throw new Error(`Unsupported Gemini model: ${model}. Allowed models: ${GEMINI_MODELS.join(', ')}`);
}

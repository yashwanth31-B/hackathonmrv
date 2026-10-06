import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error(
    '❌  Missing required environment variable: GEMINI_API_KEY must be set.'
  );
}

// ---------------------------------------------------------------------------
// Singleton SDK instance
// ---------------------------------------------------------------------------
export const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ---------------------------------------------------------------------------
// Default model – gemini-3.8-flash (configured via GEMINI_MODEL env or default)
// ---------------------------------------------------------------------------
export const DEFAULT_MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

export const geminiModel = genAI.getGenerativeModel({
  model: DEFAULT_MODEL_NAME
});

// ---------------------------------------------------------------------------
// Factory – create a model with custom generationConfig / systemInstruction
// ---------------------------------------------------------------------------
export function getGeminiModel(modelNameOrConfig = DEFAULT_MODEL_NAME, maybeConfig = {}) {
  let modelName = DEFAULT_MODEL_NAME;
  let config = maybeConfig;

  if (typeof modelNameOrConfig === 'object' && modelNameOrConfig !== null) {
    config = modelNameOrConfig;
  } else if (typeof modelNameOrConfig === 'string') {
    modelName = modelNameOrConfig;
  }

  return genAI.getGenerativeModel({
    model: modelName,
    ...config
  });
}

// Re-export SchemaType so agents can use it for responseSchema definitions
export { SchemaType };

export default geminiModel;

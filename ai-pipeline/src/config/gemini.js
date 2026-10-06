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
// Default model – gemini-2.5-flash
// Pre-configured, ready to use for any agent.
// ---------------------------------------------------------------------------
export const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash'
});

// ---------------------------------------------------------------------------
// Factory – create a model with custom generationConfig / systemInstruction
// ---------------------------------------------------------------------------
export function getGeminiModel(modelName = 'gemini-2.5-flash', config = {}) {
  return genAI.getGenerativeModel({
    model: modelName,
    ...config
  });
}

// Re-export SchemaType so agents can use it for responseSchema definitions
export { SchemaType };

export default geminiModel;

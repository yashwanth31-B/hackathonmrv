import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export interface CivicAIAnalysis {
  predictedCategory: string;
  confidence: number;
  suggestedSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  suggestedTitle: string;
  suggestedDepartment: string;
  detectedHazards: string[];
  explanation: string;
}

export async function analyzeCivicImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<CivicAIAnalysis> {
  const ai = getAIClient();
  if (!ai) {
    return {
      predictedCategory: 'Other',
      confidence: 0.5,
      suggestedSeverity: 'MEDIUM',
      suggestedTitle: 'Reported Civic Issue',
      suggestedDepartment: 'Public Works',
      detectedHazards: [],
      explanation: 'AI service not configured with active GEMINI_API_KEY; defaulted to standard values.',
    };
  }

  // Remove data URI prefix if present
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  try {
    const prompt = `Analyze this civic issue photo for a municipal citizen reporting platform.
Identify the problem from these categories:
- Pothole
- Garbage & Waste
- Illegal Dumping
- Road Damage
- Streetlight & Electrical
- Drainage & Flooding
- Water Leakage & Pipe Burst
- Broken Footpath / Sidewalk
- Traffic Sign Damage
- Public Infrastructure Damage
- Other

Output ONLY valid JSON with this exact structure:
{
  "predictedCategory": "Pothole",
  "confidence": 0.92,
  "suggestedSeverity": "HIGH",
  "suggestedTitle": "Deep pothole in roadway",
  "suggestedDepartment": "Roads & Highways",
  "detectedHazards": ["Traffic hazard", "Pedestrian tripping"],
  "explanation": "Observed significant crater in asphalt with exposed sub-base."
}

Do not claim false certainty; confidence should be between 0.40 and 0.99.
Severity must be one of: LOW, MEDIUM, HIGH, CRITICAL.`;

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text?.trim() || '{}';
    const cleanText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleanText);

    return {
      predictedCategory: parsed.predictedCategory || 'Other',
      confidence: typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0.4), 0.99) : 0.85,
      suggestedSeverity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(parsed.suggestedSeverity)
        ? parsed.suggestedSeverity
        : 'MEDIUM',
      suggestedTitle: parsed.suggestedTitle || 'Reported Civic Issue',
      suggestedDepartment: parsed.suggestedDepartment || 'Public Works',
      detectedHazards: Array.isArray(parsed.detectedHazards) ? parsed.detectedHazards : [],
      explanation: parsed.explanation || 'Analyzed by CivicFix Computer Vision',
    };
  } catch (error: any) {
    console.error('Civic image AI analysis error:', error);
    return {
      predictedCategory: 'Other',
      confidence: 0.6,
      suggestedSeverity: 'MEDIUM',
      suggestedTitle: 'Reported Issue',
      suggestedDepartment: 'Public Works',
      detectedHazards: [],
      explanation: 'Analysis timed out or failed; please review category manually.',
    };
  }
}

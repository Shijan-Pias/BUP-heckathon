import { GoogleGenerativeAI } from '@google/generative-ai';
import { BatterySpec } from '../types/api';
import { DirectiveInterpretation } from '../types/directives';
import { LLMProvider } from './provider.interface';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { validateAndSanitizeDirectives } from '../guardrails';

export class GeminiLLMProvider implements LLMProvider {
  public name = 'GeminiLLMProvider';
  private apiKey: string | undefined;
  private modelName: string;

  constructor(apiKey?: string, modelName?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  }

  public async interpretNotes(
    operatorNotes: string[],
    battery: BatterySpec
  ): Promise<DirectiveInterpretation[]> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const systemInstructionText = buildSystemPrompt();
    const userPromptText = buildUserPrompt(operatorNotes, battery);

    // Call Generative Language API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemInstructionText }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPromptText }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let responseText = '';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errBody}`);
      }

      const data: any = await res.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } finally {
      clearTimeout(timeoutId);
    }

    if (!responseText) {
      throw new Error('Gemini API returned empty text candidate.');
    }

    let parsed: unknown[];
    try {
      let cleaned = responseText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as any).directive_interpretation)) {
          parsed = (parsed as any).directive_interpretation;
        } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as any).directives)) {
          parsed = (parsed as any).directives;
        } else {
          parsed = [parsed];
        }
      }
    } catch (err) {
      throw new Error(`Failed to parse LLM JSON response: ${(err as Error).message}`);
    }

    const guardrailResult = validateAndSanitizeDirectives(parsed, operatorNotes, battery);
    return guardrailResult.sanitized;
  }
}

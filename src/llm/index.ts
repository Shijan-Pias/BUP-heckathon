import { LLMProvider } from './provider.interface';
import { GeminiLLMProvider } from './gemini.provider';
import { HeuristicLLMProvider } from './heuristic.fallback';
import { BatterySpec } from '../types/api';
import { DirectiveInterpretation } from '../types/directives';

export * from './provider.interface';
export * from './gemini.provider';
export * from './heuristic.fallback';
export * from './prompt';

export class ResilientLLMProvider implements LLMProvider {
  public name = 'ResilientLLMProvider';
  private gemini: GeminiLLMProvider;
  private fallback: HeuristicLLMProvider;

  constructor() {
    this.gemini = new GeminiLLMProvider();
    this.fallback = new HeuristicLLMProvider();
  }

  public async interpretNotes(
    operatorNotes: string[],
    battery: BatterySpec
  ): Promise<DirectiveInterpretation[]> {
    if (process.env.GEMINI_API_KEY) {
      try {
        return await this.gemini.interpretNotes(operatorNotes, battery);
      } catch (err) {
        console.warn(`[LLMProvider] Gemini interpretation failed, using fallback: ${(err as Error).message}`);
        return await this.fallback.interpretNotes(operatorNotes, battery);
      }
    }

    return await this.fallback.interpretNotes(operatorNotes, battery);
  }
}

export function getDefaultLLMProvider(): LLMProvider {
  return new ResilientLLMProvider();
}

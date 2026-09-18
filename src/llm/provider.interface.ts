import { BatterySpec } from '../types/api';
import { DirectiveInterpretation } from '../types/directives';

export interface LLMProvider {
  name: string;
  interpretNotes(
    operatorNotes: string[],
    battery: BatterySpec
  ): Promise<DirectiveInterpretation[]>;
}

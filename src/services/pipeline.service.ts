import { OptimizeEnergyRequest, OptimizeEnergyResponse } from '../types/api';
import { LLMProvider, getDefaultLLMProvider } from '../llm';
import { validateAndSanitizeDirectives } from '../guardrails';
import { optimizeEnergySchedule } from '../optimizer';
import { replayAndValidateSchedule } from '../validators';

export class PipelineService {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || getDefaultLLMProvider();
  }

  public async processScenario(
    request: OptimizeEnergyRequest
  ): Promise<OptimizeEnergyResponse> {
    const { scenario_id, operator_notes, hours, battery } = request;

    // 1. LLM Interpretation
    const rawDirectives = await this.llmProvider.interpretNotes(operator_notes, battery);

    // 2. Guardrail Validation & Sanitization
    const guardrailResult = validateAndSanitizeDirectives(rawDirectives, operator_notes, battery);
    const sanitizedDirectives = guardrailResult.sanitized;

    // 3. Mathematical Optimization (Deterministic LP)
    const optimizerResult = optimizeEnergySchedule({
      hours,
      battery,
      directives: sanitizedDirectives,
    });

    // 4. Final Replay Validation & Metrics Verification
    const replayResult = replayAndValidateSchedule(
      optimizerResult.hourly_plan,
      hours,
      battery,
      sanitizedDirectives
    );

    if (!replayResult.valid) {
      throw new Error(`Self-validation failed: ${replayResult.errors.join('; ')}`);
    }

    // 5. Generate plan summary
    const appliedDirectives = sanitizedDirectives.filter((d) => d.applies);
    let plan_summary = '';
    if (appliedDirectives.length === 0) {
      plan_summary = 'Optimizes 24-hour battery charge/discharge against tariff rates and solar availability while ensuring end-of-day neutrality.';
    } else {
      const types = appliedDirectives.map((d) => d.directive_type).join(', ');
      plan_summary = `Applies active operational directives (${types}), respects all battery bounds and rate limits, and minimizes total grid electricity cost.`;
    }

    return {
      scenario_id,
      directive_interpretation: sanitizedDirectives,
      hourly_plan: optimizerResult.hourly_plan,
      total_grid_kwh: replayResult.recalculated_total_grid_kwh,
      total_cost_bdt: replayResult.recalculated_total_cost_bdt,
      peak_grid_kwh: replayResult.recalculated_peak_grid_kwh,
      plan_summary,
    };
  }
}

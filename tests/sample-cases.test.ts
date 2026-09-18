import * as fs from 'fs';
import * as path from 'path';
import { PipelineService } from '../src/services/pipeline.service';
import { HeuristicLLMProvider } from '../src/llm/heuristic.fallback';
import { OptimizeEnergyRequest } from '../src/types/api';

const TOLERANCE = 0.05;

describe('GridWise Public Sample Cases Pack (SAMPLE-01 to SAMPLE-10)', () => {
  const sampleFilePath = path.join(__dirname, '../docs/BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json');
  const rawData = fs.readFileSync(sampleFilePath, 'utf-8');
  const sampleData = JSON.parse(rawData);
  const cases: any[] = sampleData.cases;

  // We test the pipeline with the deterministic heuristic interpreter to ensure 100% reproducible testing locally
  const pipeline = new PipelineService(new HeuristicLLMProvider());

  test('Public sample case pack loaded properly', () => {
    expect(cases.length).toBe(10);
  });

  for (const testCase of cases) {
    describe(`Case ${testCase.id}: ${testCase.label}`, () => {
      let response: any;

      beforeAll(async () => {
        const req: OptimizeEnergyRequest = testCase.input;
        response = await pipeline.processScenario(req);
      });

      test('Scenario ID echo', () => {
        expect(response.scenario_id).toBe(testCase.id);
      });

      test('Directive interpretation matches ground truth semantics', () => {
        const expectedDirectives = testCase.expected_output.directive_interpretation;
        expect(response.directive_interpretation.length).toBe(expectedDirectives.length);

        for (let i = 0; i < expectedDirectives.length; i++) {
          const exp = expectedDirectives[i];
          const actual = response.directive_interpretation[i];

          expect(actual.note_index).toBe(exp.note_index);
          expect(actual.applies).toBe(exp.applies);
          expect(actual.directive_type).toBe(exp.directive_type);

          if (exp.applies) {
            expect(actual.structured_adjustment).not.toBeNull();
            expect(actual.structured_adjustment.hours).toEqual(exp.structured_adjustment.hours);

            if (exp.directive_type === 'solar_reduction') {
              expect(actual.structured_adjustment.factor).toBeCloseTo(exp.structured_adjustment.factor, 2);
            }
            if (exp.directive_type === 'minimum_battery_reserve') {
              expect(actual.structured_adjustment.minimum_energy_kwh).toBeCloseTo(
                exp.structured_adjustment.minimum_energy_kwh,
                2
              );
            }
            if (exp.directive_type === 'max_grid_window') {
              expect(actual.structured_adjustment.max_grid_kwh).toBeCloseTo(
                exp.structured_adjustment.max_grid_kwh,
                2
              );
            }
          } else {
            expect(actual.structured_adjustment).toBeNull();
          }
        }
      });

      test('Optimal schedule achieves optimal cost within tolerance', () => {
        const expTotalCost = testCase.expected_output.total_cost_bdt;
        const expTotalGrid = testCase.expected_output.total_grid_kwh;

        // Verify cost and total grid match optimal reference
        expect(Math.abs(response.total_cost_bdt - expTotalCost)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(response.total_grid_kwh - expTotalGrid)).toBeLessThanOrEqual(TOLERANCE);

        // Verify peak_grid_kwh equals max hourly grid_kwh in the returned schedule (Section 10 & Judge requirement)
        const actualMaxGrid = Math.max(...response.hourly_plan.map((p: any) => p.grid_kwh));
        expect(response.peak_grid_kwh).toBeCloseTo(actualMaxGrid, 2);
      });

      test('Hourly plan has 24 valid entries', () => {
        expect(response.hourly_plan.length).toBe(24);
        for (let h = 0; h < 24; h++) {
          const entry = response.hourly_plan[h];
          expect(entry.hour).toBe(h);
          expect(entry.grid_kwh).toBeGreaterThanOrEqual(0);
          expect(entry.solar_used_kwh).toBeGreaterThanOrEqual(0);
          expect(entry.battery_kwh).toBeGreaterThanOrEqual(0);
          expect(['charge', 'discharge', 'idle']).toContain(entry.battery_action);
        }
      });
    });
  }
});

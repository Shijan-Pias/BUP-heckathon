import * as fs from 'fs';
import * as path from 'path';
import { PipelineService } from '../src/services/pipeline.service';
import { getDefaultLLMProvider } from '../src/llm';
import { OptimizeEnergyRequest } from '../src/types/api';

async function runAllSamples() {
  console.log('================================================================');
  console.log('       GRIDWISE BUP CSE FEST 2026 - PUBLIC SAMPLE RUNNER        ');
  console.log('================================================================\n');

  const samplePath = path.join(__dirname, '../docs/BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json');
  const sampleData = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
  const cases: any[] = sampleData.cases;

  const pipeline = new PipelineService(getDefaultLLMProvider());
  let passedCount = 0;

  for (const c of cases) {
    const start = Date.now();
    console.log(`----------------------------------------------------------------`);
    console.log(`[CASE ${c.id}] ${c.label}`);
    console.log(`Notes (${c.input.operator_notes.length}):`);
    c.input.operator_notes.forEach((n: string, i: number) => console.log(`  ${i}: "${n}"`));

    try {
      const response = await pipeline.processScenario(c.input as OptimizeEnergyRequest);
      const elapsed = Date.now() - start;

      const expCost = c.expected_output.total_cost_bdt;
      const actualCost = response.total_cost_bdt;
      const costDiff = Math.abs(actualCost - expCost);

      const expGrid = c.expected_output.total_grid_kwh;
      const actualGrid = response.total_grid_kwh;
      const gridDiff = Math.abs(actualGrid - expGrid);

      const expPeak = c.expected_output.peak_grid_kwh;
      const actualPeak = response.peak_grid_kwh;
      const peakDiff = Math.abs(actualPeak - expPeak);

      const isCostMatch = costDiff <= 0.05;
      const isGridMatch = gridDiff <= 0.05;
      const isPeakMatch = peakDiff <= 0.05;

      console.log(`\n  Directives Extracted:`);
      response.directive_interpretation.forEach((d: any) => {
        console.log(`    Note ${d.note_index}: applies=${d.applies}, type=${d.directive_type}, adj=${JSON.stringify(d.structured_adjustment)}`);
      });

      console.log(`\n  Metrics:`);
      console.log(`    Total Cost (BDT): ${actualCost.toFixed(2)} (Expected: ${expCost.toFixed(2)}) -> ${isCostMatch ? 'PASS' : 'FAIL'}`);
      console.log(`    Total Grid (kWh): ${actualGrid.toFixed(2)} (Expected: ${expGrid.toFixed(2)}) -> ${isGridMatch ? 'PASS' : 'FAIL'}`);
      console.log(`    Peak Grid (kWh):  ${actualPeak.toFixed(2)} (Expected: ${expPeak.toFixed(2)}) -> ${isPeakMatch ? 'PASS' : 'FAIL'}`);
      console.log(`    Time Elapsed:     ${elapsed} ms`);

      if (isCostMatch && isGridMatch && isPeakMatch) {
        console.log(`\n  STATUS: [PASSED]`);
        passedCount++;
      } else {
        console.log(`\n  STATUS: [FAILED] (Metrics outside tolerance)`);
      }
    } catch (err) {
      console.error(`\n  STATUS: [FAILED] with Error: ${(err as Error).message}`);
    }
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedCount} / ${cases.length} cases passed successfully.`);
  console.log('================================================================\n');
}

runAllSamples().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});

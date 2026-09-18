#!/usr/bin/env node

/**
 * GridWise Sample Cases Validator & Test Script
 * BUP CSE Fest 2026 Preliminary Round
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${PORT}`;
const TOLERANCE = 0.05;

// Locate sample cases file
let samplePath = path.join(__dirname, 'docs', 'sample-cases.json');
if (!fs.existsSync(samplePath)) {
  samplePath = path.join(__dirname, 'docs', 'BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json');
}

if (!fs.existsSync(samplePath)) {
  console.error(`[ERROR] Sample cases file not found at: ${samplePath}`);
  process.exit(1);
}

const sampleData = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
const cases = sampleData.cases || [];

console.log('================================================================');
console.log(`        GRIDWISE API AUTOMATED SAMPLE CASE TEST HARNESS        `);
console.log(`        Target Endpoint: ${BASE_URL}/optimize-energy            `);
console.log(`        Total Cases: ${cases.length}                            `);
console.log('================================================================\n');

/**
 * Replay hourly plan against GridWise physical constraints & active directives
 */
function replayHourlyPlan(hourlyPlan, hours, battery, directives) {
  const errors = [];
  if (!Array.isArray(hourlyPlan) || hourlyPlan.length !== 24) {
    return { valid: false, errors: ['hourly_plan must contain exactly 24 entries'] };
  }

  const sortedHours = [...hours].sort((a, b) => a.hour - b.hour);
  const effectiveSolar = sortedHours.map((h) => h.solar_kwh);
  const minBatteryReserve = new Array(24).fill(battery.minimum_energy_kwh);
  const noChargeHours = new Set();
  const noDischargeHours = new Set();
  const maxGridMap = new Map();

  for (const d of directives) {
    if (!d.applies || !d.structured_adjustment) continue;

    if (d.directive_type === 'solar_reduction') {
      const adj = d.structured_adjustment;
      for (const h of adj.hours) {
        if (h >= 0 && h < 24) {
          effectiveSolar[h] = sortedHours[h].solar_kwh * adj.factor;
        }
      }
    } else if (d.directive_type === 'minimum_battery_reserve') {
      const adj = d.structured_adjustment;
      for (const h of adj.hours) {
        if (h >= 0 && h < 24) {
          minBatteryReserve[h] = Math.max(minBatteryReserve[h], adj.minimum_energy_kwh);
        }
      }
    } else if (d.directive_type === 'no_charge_window') {
      const adj = d.structured_adjustment;
      for (const h of adj.hours) noChargeHours.add(h);
    } else if (d.directive_type === 'no_discharge_window') {
      const adj = d.structured_adjustment;
      for (const h of adj.hours) noDischargeHours.add(h);
    } else if (d.directive_type === 'max_grid_window') {
      const adj = d.structured_adjustment;
      for (const h of adj.hours) {
        const curr = maxGridMap.get(h);
        maxGridMap.set(h, curr !== undefined ? Math.min(curr, adj.max_grid_kwh) : adj.max_grid_kwh);
      }
    }
  }

  let currentEnergy = battery.initial_energy_kwh;

  for (let h = 0; h < 24; h++) {
    const entry = hourlyPlan.find((p) => p.hour === h);
    if (!entry) {
      errors.push(`Missing plan entry for hour ${h}`);
      continue;
    }

    const demand = sortedHours[h].demand_kwh;
    const effSolar = effectiveSolar[h];

    // Check non-negative
    if (entry.grid_kwh < -TOLERANCE) errors.push(`Hour ${h}: negative grid_kwh (${entry.grid_kwh})`);
    if (entry.solar_used_kwh < -TOLERANCE) errors.push(`Hour ${h}: negative solar_used_kwh (${entry.solar_used_kwh})`);
    if (entry.battery_kwh < -TOLERANCE) errors.push(`Hour ${h}: negative battery_kwh (${entry.battery_kwh})`);

    // Solar usage bound
    if (entry.solar_used_kwh > effSolar + TOLERANCE) {
      errors.push(`Hour ${h}: solar_used_kwh (${entry.solar_used_kwh}) exceeds effective solar (${effSolar})`);
    }

    const chg = entry.battery_action === 'charge' ? entry.battery_kwh : 0;
    const dis = entry.battery_action === 'discharge' ? entry.battery_kwh : 0;

    if (entry.battery_action === 'idle' && entry.battery_kwh > TOLERANCE) {
      errors.push(`Hour ${h}: idle action with non-zero battery_kwh (${entry.battery_kwh})`);
    }
    if (chg > battery.max_charge_kwh_per_hour + TOLERANCE) {
      errors.push(`Hour ${h}: charge rate (${chg}) exceeds limit (${battery.max_charge_kwh_per_hour})`);
    }
    if (dis > battery.max_discharge_kwh_per_hour + TOLERANCE) {
      errors.push(`Hour ${h}: discharge rate (${dis}) exceeds limit (${battery.max_discharge_kwh_per_hour})`);
    }

    // Directives bounds
    if (noChargeHours.has(h) && chg > TOLERANCE) {
      errors.push(`Hour ${h}: Charging violates no_charge_window`);
    }
    if (noDischargeHours.has(h) && dis > TOLERANCE) {
      errors.push(`Hour ${h}: Discharging violates no_discharge_window`);
    }
    const gridCap = maxGridMap.get(h);
    if (gridCap !== undefined && entry.grid_kwh > gridCap + TOLERANCE) {
      errors.push(`Hour ${h}: grid_kwh (${entry.grid_kwh}) exceeds cap (${gridCap})`);
    }

    // Energy balance
    const supply = entry.grid_kwh + entry.solar_used_kwh + dis;
    const load = demand + chg;
    if (Math.abs(supply - load) > TOLERANCE) {
      errors.push(`Hour ${h}: Energy balance failed: supply=${supply.toFixed(2)}, load=${load.toFixed(2)}`);
    }

    // Battery state transition
    currentEnergy = currentEnergy + chg - dis;
    if (Math.abs(currentEnergy - entry.battery_energy_after_kwh) > TOLERANCE) {
      errors.push(`Hour ${h}: SOC mismatch: plan=${entry.battery_energy_after_kwh}, expected=${currentEnergy.toFixed(2)}`);
    }

    // Battery bounds
    const minReserve = minBatteryReserve[h];
    if (entry.battery_energy_after_kwh < minReserve - TOLERANCE) {
      errors.push(`Hour ${h}: Battery below min reserve (${minReserve})`);
    }
    if (entry.battery_energy_after_kwh > battery.capacity_kwh + TOLERANCE) {
      errors.push(`Hour ${h}: Battery exceeds capacity (${battery.capacity_kwh})`);
    }
  }

  // End of day neutrality
  if (Math.abs(currentEnergy - battery.initial_energy_kwh) > TOLERANCE) {
    errors.push(`End-of-day battery neutrality failed: final=${currentEnergy.toFixed(2)}, initial=${battery.initial_energy_kwh}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Compare directive interpretation against expected ground truth semantics
 */
function validateDirectives(actualDirectives, expectedDirectives) {
  const errors = [];
  if (!Array.isArray(actualDirectives) || actualDirectives.length !== expectedDirectives.length) {
    return {
      valid: false,
      errors: [`Expected ${expectedDirectives.length} directive entries, received ${actualDirectives?.length}`],
    };
  }

  for (let i = 0; i < expectedDirectives.length; i++) {
    const exp = expectedDirectives[i];
    const act = actualDirectives[i];

    if (!act) {
      errors.push(`Note ${i}: Missing interpretation`);
      continue;
    }
    if (act.note_index !== exp.note_index) {
      errors.push(`Note ${i}: note_index mismatch (got ${act.note_index}, exp ${exp.note_index})`);
    }
    if (act.applies !== exp.applies) {
      errors.push(`Note ${i}: applies mismatch (got ${act.applies}, exp ${exp.applies})`);
    }
    if (act.directive_type !== exp.directive_type) {
      errors.push(`Note ${i}: directive_type mismatch (got ${act.directive_type}, exp ${exp.directive_type})`);
    }

    if (exp.applies) {
      if (!act.structured_adjustment) {
        errors.push(`Note ${i}: structured_adjustment is missing or null`);
      } else {
        const actHours = JSON.stringify(act.structured_adjustment.hours || []);
        const expHours = JSON.stringify(exp.structured_adjustment.hours || []);
        if (actHours !== expHours) {
          errors.push(`Note ${i}: hours mismatch (got ${actHours}, exp ${expHours})`);
        }

        if (exp.directive_type === 'solar_reduction') {
          if (Math.abs(act.structured_adjustment.factor - exp.structured_adjustment.factor) > TOLERANCE) {
            errors.push(`Note ${i}: factor mismatch (got ${act.structured_adjustment.factor}, exp ${exp.structured_adjustment.factor})`);
          }
        } else if (exp.directive_type === 'minimum_battery_reserve') {
          if (Math.abs(act.structured_adjustment.minimum_energy_kwh - exp.structured_adjustment.minimum_energy_kwh) > TOLERANCE) {
            errors.push(`Note ${i}: minimum_energy_kwh mismatch`);
          }
        } else if (exp.directive_type === 'max_grid_window') {
          if (Math.abs(act.structured_adjustment.max_grid_kwh - exp.structured_adjustment.max_grid_kwh) > TOLERANCE) {
            errors.push(`Note ${i}: max_grid_kwh mismatch`);
          }
        }
      }
    } else {
      if (act.structured_adjustment !== null) {
        errors.push(`Note ${i}: no_op must have null structured_adjustment`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

async function runTests() {
  let passedCount = 0;
  let failedCount = 0;

  for (let idx = 0; idx < cases.length; idx++) {
    const testCase = cases[idx];
    const caseId = testCase.id || `CASE-${idx + 1}`;
    const label = testCase.label || '';
    const input = testCase.input;
    const expected = testCase.expected_output;

    console.log(`----------------------------------------------------------------`);
    console.log(`[TEST ${idx + 1}/${cases.length}] ${caseId}: ${label}`);

    const startTime = Date.now();
    let response;
    let resJson;

    try {
      response = await fetch(`${BASE_URL}/optimize-energy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      resJson = await response.json();
    } catch (err) {
      console.log(`  FAIL: Failed to connect to server: ${err.message}`);
      failedCount++;
      continue;
    }

    const duration = Date.now() - startTime;

    if (response.status !== 200) {
      console.log(`  FAIL: HTTP ${response.status} returned`);
      console.log(`  Error: ${JSON.stringify(resJson)}`);
      failedCount++;
      continue;
    }

    // 1. Validate top-level schema
    const schemaErrors = [];
    if (resJson.scenario_id !== input.scenario_id) schemaErrors.push(`scenario_id mismatch`);
    if (!Array.isArray(resJson.directive_interpretation)) schemaErrors.push(`directive_interpretation is not an array`);
    if (!Array.isArray(resJson.hourly_plan) || resJson.hourly_plan.length !== 24) schemaErrors.push(`hourly_plan does not have 24 hours`);
    if (typeof resJson.total_grid_kwh !== 'number') schemaErrors.push(`total_grid_kwh is not a number`);
    if (typeof resJson.total_cost_bdt !== 'number') schemaErrors.push(`total_cost_bdt is not a number`);
    if (typeof resJson.peak_grid_kwh !== 'number') schemaErrors.push(`peak_grid_kwh is not a number`);
    if (typeof resJson.plan_summary !== 'string') schemaErrors.push(`plan_summary is not a string`);

    if (schemaErrors.length > 0) {
      console.log(`  FAIL: Schema validation failed:`);
      schemaErrors.forEach((e) => console.log(`    - ${e}`));
      failedCount++;
      continue;
    }

    // 2. Validate Directive Interpretation
    const dirResult = validateDirectives(resJson.directive_interpretation, expected.directive_interpretation);
    if (!dirResult.valid) {
      console.log(`  FAIL: Directive interpretation failed:`);
      dirResult.errors.forEach((e) => console.log(`    - ${e}`));
      failedCount++;
      continue;
    }

    // 3. Replay Hourly Plan & Check Physical/Directive Constraints
    const replayResult = replayHourlyPlan(resJson.hourly_plan, input.hours, input.battery, resJson.directive_interpretation);
    if (!replayResult.valid) {
      console.log(`  FAIL: Hourly plan replay constraints failed:`);
      replayResult.errors.forEach((e) => console.log(`    - ${e}`));
      failedCount++;
      continue;
    }

    // 4. Validate Cost Equivalence
    const costDiff = Math.abs(resJson.total_cost_bdt - expected.total_cost_bdt);
    if (costDiff > TOLERANCE) {
      console.log(`  FAIL: Total cost mismatch (Got: ${resJson.total_cost_bdt}, Expected: ${expected.total_cost_bdt})`);
      failedCount++;
      continue;
    }

    // Pass
    console.log(`  Directives: OK (${resJson.directive_interpretation.length} notes parsed)`);
    console.log(`  Schedule:   OK (24 hours valid, all battery & energy rules respected)`);
    console.log(`  Total Cost: ${resJson.total_cost_bdt.toFixed(2)} BDT (matches optimal reference)`);
    console.log(`  Total Grid: ${resJson.total_grid_kwh.toFixed(2)} kWh`);
    console.log(`  Latency:    ${duration} ms`);
    console.log(`  RESULT:     >>> PASS <<<`);
    passedCount++;
  }

  console.log('\n================================================================');
  console.log(`                      FINAL TEST RESULTS                        `);
  console.log('================================================================');
  console.log(`  Total Test Cases: ${cases.length}`);
  console.log(`  Passed:           ${passedCount}`);
  console.log(`  Failed:           ${failedCount}`);
  console.log(`  Success Rate:     ${((passedCount / cases.length) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('[FATAL] Test harness crashed:', err);
  process.exit(1);
});

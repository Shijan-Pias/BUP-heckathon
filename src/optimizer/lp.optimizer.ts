// eslint-disable-next-line @typescript-eslint/no-var-requires
const solver = require('javascript-lp-solver');
import { HourlyPlanEntry, OptimizerInput, OptimizerResult } from '../types';
import {
  MaxGridWindowAdjustment,
  MinimumBatteryReserveAdjustment,
  NoChargeWindowAdjustment,
  NoDischargeWindowAdjustment,
  SolarReductionAdjustment,
} from '../types/directives';

export function optimizeEnergySchedule(input: OptimizerInput): OptimizerResult {
  const { hours, battery, directives } = input;

  // Sort hours by hour index 0..23
  const sortedHours = [...hours].sort((a, b) => a.hour - b.hour);

  // Initialize hourly constraints & limits
  const effectiveSolar: number[] = sortedHours.map((h) => h.solar_kwh);
  const minBatteryReserve: number[] = new Array(24).fill(battery.minimum_energy_kwh);
  const maxChargeRate: number[] = new Array(24).fill(battery.max_charge_kwh_per_hour);
  const maxDischargeRate: number[] = new Array(24).fill(battery.max_discharge_kwh_per_hour);
  const maxGridImport: (number | null)[] = new Array(24).fill(null);

  // Apply validated directives
  for (const directive of directives) {
    if (!directive.applies || !directive.structured_adjustment) {
      continue;
    }

    switch (directive.directive_type) {
      case 'solar_reduction': {
        const adj = directive.structured_adjustment as SolarReductionAdjustment;
        for (const h of adj.hours) {
          if (h >= 0 && h < 24) {
            effectiveSolar[h] = sortedHours[h].solar_kwh * adj.factor;
          }
        }
        break;
      }

      case 'minimum_battery_reserve': {
        const adj = directive.structured_adjustment as MinimumBatteryReserveAdjustment;
        for (const h of adj.hours) {
          if (h >= 0 && h < 24) {
            minBatteryReserve[h] = Math.max(minBatteryReserve[h], adj.minimum_energy_kwh);
          }
        }
        break;
      }

      case 'no_charge_window': {
        const adj = directive.structured_adjustment as NoChargeWindowAdjustment;
        for (const h of adj.hours) {
          if (h >= 0 && h < 24) {
            maxChargeRate[h] = 0;
          }
        }
        break;
      }

      case 'no_discharge_window': {
        const adj = directive.structured_adjustment as NoDischargeWindowAdjustment;
        for (const h of adj.hours) {
          if (h >= 0 && h < 24) {
            maxDischargeRate[h] = 0;
          }
        }
        break;
      }

      case 'max_grid_window': {
        const adj = directive.structured_adjustment as MaxGridWindowAdjustment;
        for (const h of adj.hours) {
          if (h >= 0 && h < 24) {
            maxGridImport[h] = maxGridImport[h] !== null
              ? Math.min(maxGridImport[h]!, adj.max_grid_kwh)
              : adj.max_grid_kwh;
          }
        }
        break;
      }
    }
  }

  // Build LP Model
  const constraints: Record<string, any> = {};
  const variables: Record<string, any> = {};

  // Neutrality constraint at end of day (h=23)
  constraints['battery_neutrality'] = { equal: battery.initial_energy_kwh };

  for (let h = 0; h < 24; h++) {
    const demand = sortedHours[h].demand_kwh;
    const solarCap = effectiveSolar[h];
    const tariff = sortedHours[h].tariff_bdt_per_kwh;
    const minReserve = minBatteryReserve[h];
    const maxChg = maxChargeRate[h];
    const maxDis = maxDischargeRate[h];
    const gridCap = maxGridImport[h];

    // 1. Energy balance constraint: g_h + s_h + d_h - c_h = demand
    constraints[`eb_${h}`] = { equal: demand };

    // 2. Solar usage bound: s_h <= effectiveSolar
    constraints[`solar_${h}`] = { max: solarCap };

    // 3. Battery dynamics constraint:
    // For h = 0: e_0 - c_0 + d_0 = initial_energy_kwh
    // For h > 0: e_h - e_{h-1} - c_h + d_h = 0
    if (h === 0) {
      constraints[`bat_state_${h}`] = { equal: battery.initial_energy_kwh };
    } else {
      constraints[`bat_state_${h}`] = { equal: 0 };
    }

    // 4. Battery energy bounds: minReserve <= e_h <= capacity
    constraints[`bat_soc_${h}`] = { min: minReserve, max: battery.capacity_kwh };

    // 5. Rate limits
    constraints[`chg_lim_${h}`] = { max: maxChg };
    constraints[`dis_lim_${h}`] = { max: maxDis };

    // 6. Grid limit (if applicable)
    if (gridCap !== null) {
      constraints[`grid_lim_${h}`] = { max: gridCap };
    }

    // Variables for hour h:
    // g_h (grid import)
    variables[`g_${h}`] = {
      cost: tariff,
      [`eb_${h}`]: 1,
      ...(gridCap !== null ? { [`grid_lim_${h}`]: 1 } : {}),
    };

    // s_h (solar used)
    variables[`s_${h}`] = {
      cost: 0,
      [`eb_${h}`]: 1,
      [`solar_${h}`]: 1,
    };

    // c_h (battery charge)
    variables[`c_${h}`] = {
      cost: 0,
      [`eb_${h}`]: -1,
      [`bat_state_${h}`]: -1,
      [`chg_lim_${h}`]: 1,
    };

    // d_h (battery discharge)
    variables[`d_${h}`] = {
      cost: 0,
      [`eb_${h}`]: 1,
      [`bat_state_${h}`]: 1,
      [`dis_lim_${h}`]: 1,
    };

    // e_h (battery energy after hour h)
    variables[`e_${h}`] = {
      cost: 0,
      [`bat_state_${h}`]: 1,
      ...(h < 23 ? { [`bat_state_${h + 1}`]: -1 } : {}),
      [`bat_soc_${h}`]: 1,
      ...(h === 23 ? { battery_neutrality: 1 } : {}),
    };
  }

  const model = {
    optimize: 'cost',
    opType: 'min' as const,
    constraints,
    variables,
  };

  const rawSolution = solver.Solve(model);

  if (!rawSolution.feasible && rawSolution.feasible !== undefined) {
    throw new Error('LP solver failed: Scenario constraints are infeasible.');
  }

  // Parse solution and construct clean hourly plan
  const hourly_plan: HourlyPlanEntry[] = [];
  let currentBatteryEnergy = battery.initial_energy_kwh;

  for (let h = 0; h < 24; h++) {
    const rawG = Math.max(0, rawSolution[`g_${h}`] || 0);
    const rawS = Math.max(0, Math.min(effectiveSolar[h], rawSolution[`s_${h}`] || 0));
    const rawC = Math.max(0, rawSolution[`c_${h}`] || 0);
    const rawD = Math.max(0, rawSolution[`d_${h}`] || 0);

    const netCharge = rawC - rawD;
    let action: 'charge' | 'discharge' | 'idle' = 'idle';
    let batteryKwh = 0;

    if (netCharge > 1e-4) {
      action = 'charge';
      batteryKwh = Number(netCharge.toFixed(4));
    } else if (netCharge < -1e-4) {
      action = 'discharge';
      batteryKwh = Number((-netCharge).toFixed(4));
    } else {
      action = 'idle';
      batteryKwh = 0;
    }

    // Determine solar used: min(effectiveSolar, demand + (action === 'charge' ? batteryKwh : 0))
    const solarUsed = Number(rawS.toFixed(4));

    // Determine grid kwh to satisfy exact balance:
    // grid_kwh + solar_used_kwh + (action === 'discharge' ? battery_kwh : 0) = demand_kwh + (action === 'charge' ? battery_kwh : 0)
    let gridKwh = sortedHours[h].demand_kwh - solarUsed;
    if (action === 'charge') {
      gridKwh += batteryKwh;
    } else if (action === 'discharge') {
      gridKwh -= batteryKwh;
    }
    gridKwh = Math.max(0, Number(gridKwh.toFixed(4)));

    // Battery energy state progression
    if (action === 'charge') {
      currentBatteryEnergy += batteryKwh;
    } else if (action === 'discharge') {
      currentBatteryEnergy -= batteryKwh;
    }
    currentBatteryEnergy = Number(currentBatteryEnergy.toFixed(4));

    hourly_plan.push({
      hour: h,
      grid_kwh: gridKwh,
      solar_used_kwh: solarUsed,
      battery_action: action,
      battery_kwh: batteryKwh,
      battery_energy_after_kwh: currentBatteryEnergy,
    });
  }

  // Recalculate totals
  const total_grid_kwh = Number(
    hourly_plan.reduce((sum, entry) => sum + entry.grid_kwh, 0).toFixed(4)
  );
  const total_cost_bdt = Number(
    hourly_plan
      .reduce((sum, entry) => sum + entry.grid_kwh * sortedHours[entry.hour].tariff_bdt_per_kwh, 0)
      .toFixed(4)
  );
  const peak_grid_kwh = Number(
    Math.max(...hourly_plan.map((entry) => entry.grid_kwh)).toFixed(4)
  );

  return {
    hourly_plan,
    total_grid_kwh,
    total_cost_bdt,
    peak_grid_kwh,
  };
}

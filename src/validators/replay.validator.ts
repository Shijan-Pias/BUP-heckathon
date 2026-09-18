import { BatterySpec, HourInput, HourlyPlanEntry } from '../types/api';
import {
  DirectiveInterpretation,
  MaxGridWindowAdjustment,
  MinimumBatteryReserveAdjustment,
  NoChargeWindowAdjustment,
  NoDischargeWindowAdjustment,
  SolarReductionAdjustment,
} from '../types/directives';

const TOLERANCE = 0.01;

export interface ReplayValidationResult {
  valid: boolean;
  errors: string[];
  recalculated_total_grid_kwh: number;
  recalculated_total_cost_bdt: number;
  recalculated_peak_grid_kwh: number;
}

export function replayAndValidateSchedule(
  hourlyPlan: HourlyPlanEntry[],
  hours: HourInput[],
  battery: BatterySpec,
  directives: DirectiveInterpretation[]
): ReplayValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(hourlyPlan) || hourlyPlan.length !== 24) {
    return {
      valid: false,
      errors: ['hourly_plan must contain exactly 24 entries.'],
      recalculated_total_grid_kwh: 0,
      recalculated_total_cost_bdt: 0,
      recalculated_peak_grid_kwh: 0,
    };
  }

  const sortedHours = [...hours].sort((a, b) => a.hour - b.hour);
  const effectiveSolar = sortedHours.map((h) => h.solar_kwh);
  const minBatteryReserve = new Array(24).fill(battery.minimum_energy_kwh);
  const noChargeHours = new Set<number>();
  const noDischargeHours = new Set<number>();
  const maxGridMap = new Map<number, number>();

  for (const d of directives) {
    if (!d.applies || !d.structured_adjustment) continue;

    switch (d.directive_type) {
      case 'solar_reduction': {
        const adj = d.structured_adjustment as SolarReductionAdjustment;
        for (const h of adj.hours) {
          if (h >= 0 && h < 24) {
            effectiveSolar[h] = sortedHours[h].solar_kwh * adj.factor;
          }
        }
        break;
      }
      case 'minimum_battery_reserve': {
        const adj = d.structured_adjustment as MinimumBatteryReserveAdjustment;
        for (const h of adj.hours) {
          if (h >= 0 && h < 24) {
            minBatteryReserve[h] = Math.max(minBatteryReserve[h], adj.minimum_energy_kwh);
          }
        }
        break;
      }
      case 'no_charge_window': {
        const adj = d.structured_adjustment as NoChargeWindowAdjustment;
        for (const h of adj.hours) {
          noChargeHours.add(h);
        }
        break;
      }
      case 'no_discharge_window': {
        const adj = d.structured_adjustment as NoDischargeWindowAdjustment;
        for (const h of adj.hours) {
          noDischargeHours.add(h);
        }
        break;
      }
      case 'max_grid_window': {
        const adj = d.structured_adjustment as MaxGridWindowAdjustment;
        for (const h of adj.hours) {
          const current = maxGridMap.get(h);
          maxGridMap.set(h, current !== undefined ? Math.min(current, adj.max_grid_kwh) : adj.max_grid_kwh);
        }
        break;
      }
    }
  }

  let currentEnergy = battery.initial_energy_kwh;
  let totalGrid = 0;
  let totalCost = 0;
  let peakGrid = 0;

  for (let h = 0; h < 24; h++) {
    const plan = hourlyPlan.find((p) => p.hour === h);
    if (!plan) {
      errors.push(`Missing plan entry for hour ${h}.`);
      continue;
    }

    const demand = sortedHours[h].demand_kwh;
    const tariff = sortedHours[h].tariff_bdt_per_kwh;
    const effSolar = effectiveSolar[h];

    // Non-negative checks
    if (plan.grid_kwh < -TOLERANCE) {
      errors.push(`Hour ${h}: grid_kwh must be non-negative (got ${plan.grid_kwh}).`);
    }
    if (plan.solar_used_kwh < -TOLERANCE) {
      errors.push(`Hour ${h}: solar_used_kwh must be non-negative (got ${plan.solar_used_kwh}).`);
    }
    if (plan.battery_kwh < -TOLERANCE) {
      errors.push(`Hour ${h}: battery_kwh must be non-negative (got ${plan.battery_kwh}).`);
    }

    // Solar usage check
    if (plan.solar_used_kwh > effSolar + TOLERANCE) {
      errors.push(
        `Hour ${h}: solar_used_kwh (${plan.solar_used_kwh}) exceeds effective solar (${effSolar}).`
      );
    }

    // Battery action checks
    const chargeKwh = plan.battery_action === 'charge' ? plan.battery_kwh : 0;
    const dischargeKwh = plan.battery_action === 'discharge' ? plan.battery_kwh : 0;

    if (plan.battery_action === 'idle' && plan.battery_kwh > TOLERANCE) {
      errors.push(`Hour ${h}: battery_kwh must be 0 for idle action (got ${plan.battery_kwh}).`);
    }

    if (plan.battery_action === 'charge' && plan.battery_kwh > battery.max_charge_kwh_per_hour + TOLERANCE) {
      errors.push(
        `Hour ${h}: charge amount ${plan.battery_kwh} exceeds max charge rate ${battery.max_charge_kwh_per_hour}.`
      );
    }

    if (plan.battery_action === 'discharge' && plan.battery_kwh > battery.max_discharge_kwh_per_hour + TOLERANCE) {
      errors.push(
        `Hour ${h}: discharge amount ${plan.battery_kwh} exceeds max discharge rate ${battery.max_discharge_kwh_per_hour}.`
      );
    }

    // Directives checks
    if (noChargeHours.has(h) && plan.battery_action === 'charge' && plan.battery_kwh > TOLERANCE) {
      errors.push(`Hour ${h}: Charging violates no_charge_window.`);
    }

    if (noDischargeHours.has(h) && plan.battery_action === 'discharge' && plan.battery_kwh > TOLERANCE) {
      errors.push(`Hour ${h}: Discharging violates no_discharge_window.`);
    }

    const gridCap = maxGridMap.get(h);
    if (gridCap !== undefined && plan.grid_kwh > gridCap + TOLERANCE) {
      errors.push(`Hour ${h}: grid_kwh (${plan.grid_kwh}) exceeds max_grid_kwh (${gridCap}).`);
    }

    // Energy balance check
    const supply = plan.grid_kwh + plan.solar_used_kwh + dischargeKwh;
    const consumption = demand + chargeKwh;
    if (Math.abs(supply - consumption) > TOLERANCE) {
      errors.push(
        `Hour ${h}: Energy balance violated. Supply=${supply.toFixed(3)}, Demand+Charge=${consumption.toFixed(3)}.`
      );
    }

    // Battery state transition
    currentEnergy = currentEnergy + chargeKwh - dischargeKwh;
    if (Math.abs(currentEnergy - plan.battery_energy_after_kwh) > TOLERANCE) {
      errors.push(
        `Hour ${h}: battery_energy_after_kwh (${plan.battery_energy_after_kwh}) does not match expected (${currentEnergy.toFixed(3)}).`
      );
    }

    // Battery SOC bounds
    const minReserve = minBatteryReserve[h];
    if (plan.battery_energy_after_kwh < minReserve - TOLERANCE) {
      errors.push(
        `Hour ${h}: Battery energy (${plan.battery_energy_after_kwh}) dropped below minimum reserve (${minReserve}).`
      );
    }
    if (plan.battery_energy_after_kwh > battery.capacity_kwh + TOLERANCE) {
      errors.push(
        `Hour ${h}: Battery energy (${plan.battery_energy_after_kwh}) exceeded capacity (${battery.capacity_kwh}).`
      );
    }

    totalGrid += plan.grid_kwh;
    totalCost += plan.grid_kwh * tariff;
    peakGrid = Math.max(peakGrid, plan.grid_kwh);
  }

  // End of day neutrality check
  if (Math.abs(currentEnergy - battery.initial_energy_kwh) > TOLERANCE) {
    errors.push(
      `End-of-day neutrality violated: Final battery energy (${currentEnergy.toFixed(3)}) != Initial (${battery.initial_energy_kwh}).`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    recalculated_total_grid_kwh: Number(totalGrid.toFixed(4)),
    recalculated_total_cost_bdt: Number(totalCost.toFixed(4)),
    recalculated_peak_grid_kwh: Number(peakGrid.toFixed(4)),
  };
}

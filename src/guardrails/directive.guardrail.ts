import { BatterySpec } from '../types/api';
import {
  DirectiveInterpretation,
  DirectiveType,
  MaxGridWindowAdjustment,
  MinimumBatteryReserveAdjustment,
  NoChargeWindowAdjustment,
  NoDischargeWindowAdjustment,
  SolarReductionAdjustment,
  StructuredAdjustment,
} from '../types/directives';

const ALLOWED_DIRECTIVE_TYPES: Set<DirectiveType> = new Set([
  'solar_reduction',
  'minimum_battery_reserve',
  'no_charge_window',
  'no_discharge_window',
  'max_grid_window',
  'no_op',
]);

export interface GuardrailResult {
  valid: boolean;
  sanitized: DirectiveInterpretation[];
  warnings: string[];
}

export function validateHoursArray(hours: unknown): { valid: boolean; normalizedHours: number[] } {
  if (!Array.isArray(hours) || hours.length === 0) {
    return { valid: false, normalizedHours: [] };
  }

  const validNumbers: number[] = [];
  for (const h of hours) {
    if (typeof h !== 'number' || !Number.isInteger(h) || h < 0 || h > 23) {
      return { valid: false, normalizedHours: [] };
    }
    validNumbers.push(h);
  }

  // Deduplicate and sort strictly ascending
  const uniqueSorted = Array.from(new Set(validNumbers)).sort((a, b) => a - b);
  return { valid: true, normalizedHours: uniqueSorted };
}

export function validateAndSanitizeDirectives(
  rawInterpretations: unknown[],
  operatorNotes: string[],
  battery: BatterySpec
): GuardrailResult {
  const warnings: string[] = [];
  const sanitized: DirectiveInterpretation[] = [];

  const noteCount = operatorNotes.length;

  for (let i = 0; i < noteCount; i++) {
    const raw = (Array.isArray(rawInterpretations) ? rawInterpretations[i] : null) as Record<string, any> | null;

    if (!raw) {
      warnings.push(`Missing interpretation for note index ${i}. Defaulting to no_op.`);
      sanitized.push({
        note_index: i,
        applies: false,
        directive_type: 'no_op',
        structured_adjustment: null,
        explanation: 'Defaulted to no_op due to missing raw output.',
      });
      continue;
    }

    const rawType = raw.directive_type as DirectiveType;
    const explanation = typeof raw.explanation === 'string' && raw.explanation.trim().length > 0
      ? raw.explanation.trim()
      : `Interpreted note ${i}`;

    if (!ALLOWED_DIRECTIVE_TYPES.has(rawType) || rawType === 'no_op') {
      sanitized.push({
        note_index: i,
        applies: false,
        directive_type: 'no_op',
        structured_adjustment: null,
        explanation: rawType === 'no_op' ? explanation : `Unsupported directive type '${rawType}', mapped to no_op.`,
      });
      continue;
    }

    // Process specific directive types
    const rawAdj = raw.structured_adjustment as Record<string, any> | null;
    if (!rawAdj || typeof rawAdj !== 'object') {
      warnings.push(`Missing structured_adjustment for note ${i} with type ${rawType}. Mapping to no_op.`);
      sanitized.push({
        note_index: i,
        applies: false,
        directive_type: 'no_op',
        structured_adjustment: null,
        explanation: 'Invalid structured adjustment mapped to no_op.',
      });
      continue;
    }

    const { valid: hoursValid, normalizedHours } = validateHoursArray(rawAdj.hours);
    if (!hoursValid) {
      warnings.push(`Invalid hours in structured_adjustment for note ${i}. Mapping to no_op.`);
      sanitized.push({
        note_index: i,
        applies: false,
        directive_type: 'no_op',
        structured_adjustment: null,
        explanation: 'Invalid hours list mapped to no_op.',
      });
      continue;
    }

    let validAdjustment: StructuredAdjustment = null;

    switch (rawType) {
      case 'solar_reduction': {
        const factor = typeof rawAdj.factor === 'number' ? rawAdj.factor : NaN;
        if (Number.isFinite(factor) && factor >= 0 && factor <= 1) {
          validAdjustment = {
            hours: normalizedHours,
            factor: Number(factor.toFixed(4)),
          } as SolarReductionAdjustment;
        } else {
          warnings.push(`Invalid factor ${factor} for solar_reduction in note ${i}.`);
        }
        break;
      }

      case 'minimum_battery_reserve': {
        let minKwh = typeof rawAdj.minimum_energy_kwh === 'number' ? rawAdj.minimum_energy_kwh : NaN;
        // Check if value is within reasonable bounds [0, capacity]
        if (Number.isFinite(minKwh) && minKwh >= 0) {
          if (minKwh > battery.capacity_kwh) {
            minKwh = battery.capacity_kwh;
            warnings.push(`Capped minimum_energy_kwh to battery capacity ${battery.capacity_kwh} for note ${i}.`);
          }
          validAdjustment = {
            hours: normalizedHours,
            minimum_energy_kwh: Number(minKwh.toFixed(4)),
          } as MinimumBatteryReserveAdjustment;
        } else {
          warnings.push(`Invalid minimum_energy_kwh for note ${i}.`);
        }
        break;
      }

      case 'no_charge_window': {
        validAdjustment = {
          hours: normalizedHours,
        } as NoChargeWindowAdjustment;
        break;
      }

      case 'no_discharge_window': {
        validAdjustment = {
          hours: normalizedHours,
        } as NoDischargeWindowAdjustment;
        break;
      }

      case 'max_grid_window': {
        const maxGrid = typeof rawAdj.max_grid_kwh === 'number' ? rawAdj.max_grid_kwh : NaN;
        if (Number.isFinite(maxGrid) && maxGrid >= 0) {
          validAdjustment = {
            hours: normalizedHours,
            max_grid_kwh: Number(maxGrid.toFixed(4)),
          } as MaxGridWindowAdjustment;
        } else {
          warnings.push(`Invalid max_grid_kwh ${maxGrid} for note ${i}.`);
        }
        break;
      }
    }

    if (validAdjustment) {
      sanitized.push({
        note_index: i,
        applies: true,
        directive_type: rawType,
        structured_adjustment: validAdjustment,
        explanation,
      });
    } else {
      sanitized.push({
        note_index: i,
        applies: false,
        directive_type: 'no_op',
        structured_adjustment: null,
        explanation: `Guardrail fallback to no_op: ${explanation}`,
      });
    }
  }

  return {
    valid: warnings.length === 0,
    sanitized,
    warnings,
  };
}

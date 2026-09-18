import { z } from 'zod';

export const SolarReductionAdjustmentSchema = z.object({
  hours: z.array(z.number().int().min(0).max(23)),
  factor: z.number().min(0).max(1),
});

export const MinimumBatteryReserveAdjustmentSchema = z.object({
  hours: z.array(z.number().int().min(0).max(23)),
  minimum_energy_kwh: z.number().nonnegative(),
});

export const NoChargeWindowAdjustmentSchema = z.object({
  hours: z.array(z.number().int().min(0).max(23)),
});

export const NoDischargeWindowAdjustmentSchema = z.object({
  hours: z.array(z.number().int().min(0).max(23)),
});

export const MaxGridWindowAdjustmentSchema = z.object({
  hours: z.array(z.number().int().min(0).max(23)),
  max_grid_kwh: z.number().nonnegative(),
});

export const DirectiveInterpretationSchema = z.object({
  note_index: z.number().int().nonnegative(),
  applies: z.boolean(),
  directive_type: z.enum([
    'solar_reduction',
    'minimum_battery_reserve',
    'no_charge_window',
    'no_discharge_window',
    'max_grid_window',
    'no_op',
  ]),
  structured_adjustment: z.union([
    SolarReductionAdjustmentSchema,
    MinimumBatteryReserveAdjustmentSchema,
    NoChargeWindowAdjustmentSchema,
    NoDischargeWindowAdjustmentSchema,
    MaxGridWindowAdjustmentSchema,
    z.null(),
  ]),
  explanation: z.string(),
});

export const HourlyPlanEntrySchema = z.object({
  hour: z.number().int().min(0).max(23),
  grid_kwh: z.number().nonnegative(),
  solar_used_kwh: z.number().nonnegative(),
  battery_action: z.enum(['charge', 'discharge', 'idle']),
  battery_kwh: z.number().nonnegative(),
  battery_energy_after_kwh: z.number().nonnegative(),
});

export const OptimizeEnergyResponseSchema = z.object({
  scenario_id: z.string(),
  directive_interpretation: z.array(DirectiveInterpretationSchema),
  hourly_plan: z.array(HourlyPlanEntrySchema).length(24),
  total_grid_kwh: z.number(),
  total_cost_bdt: z.number(),
  peak_grid_kwh: z.number(),
  plan_summary: z.string(),
});

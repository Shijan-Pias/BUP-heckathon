import { z } from 'zod';

export const HourInputSchema = z.object({
  hour: z.number().int().min(0).max(23),
  demand_kwh: z.number().nonnegative(),
  solar_kwh: z.number().nonnegative(),
  tariff_bdt_per_kwh: z.number().nonnegative(),
});

export const BatterySpecSchema = z.object({
  capacity_kwh: z.number().positive(),
  initial_energy_kwh: z.number().nonnegative(),
  minimum_energy_kwh: z.number().nonnegative(),
  max_charge_kwh_per_hour: z.number().nonnegative(),
  max_discharge_kwh_per_hour: z.number().nonnegative(),
}).refine(
  (data) => data.initial_energy_kwh <= data.capacity_kwh,
  { message: 'initial_energy_kwh cannot exceed capacity_kwh' }
).refine(
  (data) => data.minimum_energy_kwh <= data.capacity_kwh,
  { message: 'minimum_energy_kwh cannot exceed capacity_kwh' }
);

export const OptimizeEnergyRequestSchema = z.object({
  scenario_id: z.string().min(1),
  operator_notes: z.array(z.string().min(1)).min(1).max(3),
  hours: z.array(HourInputSchema).length(24),
  battery: BatterySpecSchema,
}).refine((data) => {
  const hourSet = new Set(data.hours.map((h) => h.hour));
  if (hourSet.size !== 24) return false;
  for (let i = 0; i < 24; i++) {
    if (!hourSet.has(i)) return false;
  }
  return true;
}, {
  message: 'hours array must contain exactly 24 unique hours from 0 to 23',
});

import { BatterySpec, HourInput, HourlyPlanEntry } from './api';
import { DirectiveInterpretation } from './directives';

export interface OptimizerInput {
  hours: HourInput[];
  battery: BatterySpec;
  directives: DirectiveInterpretation[];
}

export interface OptimizerResult {
  hourly_plan: HourlyPlanEntry[];
  total_grid_kwh: number;
  total_cost_bdt: number;
  peak_grid_kwh: number;
}

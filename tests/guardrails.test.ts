import { validateAndSanitizeDirectives, validateHoursArray } from '../src/guardrails';
import { BatterySpec } from '../src/types/api';

describe('Deterministic Guardrails Unit Tests', () => {
  const dummyBattery: BatterySpec = {
    capacity_kwh: 200,
    initial_energy_kwh: 100,
    minimum_energy_kwh: 40,
    max_charge_kwh_per_hour: 50,
    max_discharge_kwh_per_hour: 50,
  };

  test('validateHoursArray deduplicates and sorts hours', () => {
    const res = validateHoursArray([14, 12, 13, 12]);
    expect(res.valid).toBe(true);
    expect(res.normalizedHours).toEqual([12, 13, 14]);
  });

  test('validateHoursArray rejects out-of-bounds hours', () => {
    const res1 = validateHoursArray([-1, 10]);
    expect(res1.valid).toBe(false);

    const res2 = validateHoursArray([24, 10]);
    expect(res2.valid).toBe(false);

    const res3 = validateHoursArray('not-an-array');
    expect(res3.valid).toBe(false);
  });

  test('Sanitizes unsupported directive type to no_op', () => {
    const raw = [
      {
        note_index: 0,
        directive_type: 'unknown_alien_directive',
        structured_adjustment: { hours: [1, 2] },
        explanation: 'Some invented directive',
      },
    ];

    const res = validateAndSanitizeDirectives(raw, ['Some note'], dummyBattery);
    expect(res.sanitized.length).toBe(1);
    expect(res.sanitized[0].directive_type).toBe('no_op');
    expect(res.sanitized[0].applies).toBe(false);
    expect(res.sanitized[0].structured_adjustment).toBeNull();
  });

  test('Caps minimum_battery_reserve to battery capacity', () => {
    const raw = [
      {
        note_index: 0,
        directive_type: 'minimum_battery_reserve',
        structured_adjustment: { hours: [18, 19], minimum_energy_kwh: 300 },
        explanation: 'Reserve higher than capacity',
      },
    ];

    const res = validateAndSanitizeDirectives(raw, ['Reserve note'], dummyBattery);
    expect(res.sanitized[0].applies).toBe(true);
    expect((res.sanitized[0].structured_adjustment as any).minimum_energy_kwh).toBe(200);
  });
});

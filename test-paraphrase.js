#!/usr/bin/env node

/**
 * GridWise Paraphrase Robustness Test Suite
 * Tests various paraphrased natural-language operator notes across languages and formats.
 */

const dotenv = require('dotenv');
dotenv.config();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${PORT}`;
const TOLERANCE = 0.05;

// Base 24-hour scenario template
const dummyHours = Array.from({ length: 24 }, (_, h) => ({
  hour: h,
  demand_kwh: 100 + (h >= 18 && h <= 21 ? 50 : 0),
  solar_kwh: h >= 6 && h <= 17 ? 100 : 0,
  tariff_bdt_per_kwh: h >= 18 && h <= 21 ? 25 : 6,
}));

const dummyBattery = {
  capacity_kwh: 200,
  initial_energy_kwh: 100,
  minimum_energy_kwh: 40,
  max_charge_kwh_per_hour: 50,
  max_discharge_kwh_per_hour: 50,
};

// Paraphrase test groups
const paraphraseGroups = [
  {
    group: 'Solar Reduction (Hours [15, 16], Factor 0.5)',
    expected: {
      applies: true,
      directive_type: 'solar_reduction',
      hours: [15, 16],
      factor: 0.5,
    },
    phrases: [
      'সোলার আউটপুট বিকাল ৩টা থেকে ৫টা পর্যন্ত অর্ধেক হয়ে যাবে',
      'from 3 PM to 5 PM solar drops by half',
      'expect a 50% cut in solar output during 15:00-17:00',
      'Rooftop PV generation will be curtailed by 50% between 3:00 PM and 5:00 PM.',
    ],
  },
  {
    group: 'No Charge Window (Hours [8, 9, 10])',
    expected: {
      applies: true,
      directive_type: 'no_charge_window',
      hours: [8, 9, 10],
    },
    phrases: [
      'সকাল ৮টা থেকে বেলা ১১টা পর্যন্ত ব্যাটারি চার্জ করা যাবে না',
      'Do not charge the energy storage system from 8 AM to 11 AM due to maintenance.',
      'Battery charging is strictly prohibited between 08:00 and 11:00.',
      'Keep charger offline from 8 AM until 11 AM.',
    ],
  },
  {
    group: 'No Discharge Window (Hours [18, 19, 20])',
    expected: {
      applies: true,
      directive_type: 'no_discharge_window',
      hours: [18, 19, 20],
    },
    phrases: [
      'সন্ধ্যা ৬টা থেকে রাত ৯টা পর্যন্ত ব্যাটারি ডিসচার্জ বন্ধ রাখুন',
      'The battery must not discharge between 6 PM and 9 PM during relay testing.',
      'Zero battery discharge is allowed from 18:00 to 21:00.',
      'Prevent battery outflow from 6 PM until 9 PM.',
    ],
  },
  {
    group: 'Minimum Battery Reserve (Hours [19, 20, 21], 120 kWh / 60%)',
    expected: {
      applies: true,
      directive_type: 'minimum_battery_reserve',
      hours: [19, 20, 21],
      minimum_energy_kwh: 120,
    },
    phrases: [
      'সন্ধ্যা ৭টা থেকে রাত ১০টা পর্যন্ত ব্যাটারিতে কমপক্ষে ৬০% চার্জ সংরক্ষিত রাখুন',
      'Maintain at least 120 kWh in reserve from 7 PM to 10 PM for emergency operations.',
      'Battery state of charge must stay at or above 60% of capacity from 19:00 until 22:00.',
      'Keep a minimum 120 kWh stored in the battery between 7 PM and 10 PM.',
    ],
  },
  {
    group: 'Max Grid Import Window (Hours [16, 17, 18], 140 kWh)',
    expected: {
      applies: true,
      directive_type: 'max_grid_window',
      hours: [16, 17, 18],
      max_grid_kwh: 140,
    },
    phrases: [
      'বিকাল ৪টা থেকে সন্ধ্যা ৭টা পর্যন্ত গ্রিড থেকে সর্বোচ্চ ১৪০ কিলোওয়াট-আওয়ার নেওয়া যাবে',
      'Grid import must not exceed 140 kWh per hour between 4 PM and 7 PM.',
      'Cap campus intake from the utility grid at 140 kWh from 16:00 to 19:00.',
      'Feeder limit restricts total grid purchase to a maximum of 140 kWh during 4 PM - 7 PM.',
    ],
  },
  {
    group: 'Distractor Notes (no_op, applies: false)',
    expected: {
      applies: false,
      directive_type: 'no_op',
    },
    phrases: [
      'আগামীকাল বিশ্ববিদ্যালয়ের কেন্দ্রীয় লাইব্রেরি বন্ধ থাকবে',
      'The football tournament has been rescheduled for next weekend.',
      'Cafeteria will serve lunch from 1 PM to 3 PM tomorrow.',
      'New student orientation schedule will be published on Monday.',
    ],
  },
];

async function runParaphraseTests() {
  console.log('================================================================');
  console.log('       GRIDWISE MULTILINGUAL PARAPHRASE ROBUSTNESS TEST         ');
  console.log(`       Target Endpoint: ${BASE_URL}/optimize-energy             `);
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  for (const group of paraphraseGroups) {
    console.log(`----------------------------------------------------------------`);
    console.log(`[GROUP] ${group.group}`);
    console.log(`----------------------------------------------------------------`);

    for (let i = 0; i < group.phrases.length; i++) {
      const phrase = group.phrases[i];
      totalTests++;

      const payload = {
        scenario_id: `PARA-${totalTests}`,
        operator_notes: [phrase],
        hours: dummyHours,
        battery: dummyBattery,
      };

      const start = Date.now();
      let resJson;

      try {
        const response = await fetch(`${BASE_URL}/optimize-energy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        resJson = await response.json();
      } catch (err) {
        console.log(`  [TEST ${i + 1}] "${phrase}"`);
        console.log(`    FAIL: Connection error - ${err.message}`);
        continue;
      }

      const duration = Date.now() - start;
      const interp = resJson.directive_interpretation?.[0];

      if (!interp) {
        console.log(`  [TEST ${i + 1}] "${phrase}"`);
        console.log(`    FAIL: No directive interpretation returned`);
        continue;
      }

      let isMatch = true;
      const errors = [];

      if (interp.applies !== group.expected.applies) {
        isMatch = false;
        errors.push(`applies: got ${interp.applies}, exp ${group.expected.applies}`);
      }

      if (interp.directive_type !== group.expected.directive_type) {
        isMatch = false;
        errors.push(`type: got '${interp.directive_type}', exp '${group.expected.directive_type}'`);
      }

      if (group.expected.applies) {
        const actAdj = interp.structured_adjustment;
        if (!actAdj) {
          isMatch = false;
          errors.push(`missing structured_adjustment`);
        } else {
          const actHours = JSON.stringify(actAdj.hours || []);
          const expHours = JSON.stringify(group.expected.hours || []);
          if (actHours !== expHours) {
            isMatch = false;
            errors.push(`hours: got ${actHours}, exp ${expHours}`);
          }

          if (group.expected.factor !== undefined) {
            if (Math.abs(actAdj.factor - group.expected.factor) > TOLERANCE) {
              isMatch = false;
              errors.push(`factor: got ${actAdj.factor}, exp ${group.expected.factor}`);
            }
          }

          if (group.expected.minimum_energy_kwh !== undefined) {
            if (Math.abs(actAdj.minimum_energy_kwh - group.expected.minimum_energy_kwh) > TOLERANCE) {
              isMatch = false;
              errors.push(`min_kwh: got ${actAdj.minimum_energy_kwh}, exp ${group.expected.minimum_energy_kwh}`);
            }
          }

          if (group.expected.max_grid_kwh !== undefined) {
            if (Math.abs(actAdj.max_grid_kwh - group.expected.max_grid_kwh) > TOLERANCE) {
              isMatch = false;
              errors.push(`max_grid: got ${actAdj.max_grid_kwh}, exp ${group.expected.max_grid_kwh}`);
            }
          }
        }
      } else {
        if (interp.structured_adjustment !== null) {
          isMatch = false;
          errors.push(`structured_adjustment must be null for no_op`);
        }
      }

      console.log(`  [TEST ${i + 1}] "${phrase}"`);
      if (isMatch) {
        console.log(`    Result: [PASS] -> ${interp.directive_type} (${JSON.stringify(interp.structured_adjustment)}) [${duration}ms]`);
        passedTests++;
      } else {
        console.log(`    Result: [FAIL] -> ${errors.join(', ')}`);
        console.log(`    Actual Output: ${JSON.stringify(interp)}`);
      }
    }
    console.log('');
  }

  console.log('================================================================');
  console.log('               PARAPHRASE TEST SUMMARY                          ');
  console.log('================================================================');
  console.log(`  Total Paraphrase Variations: ${totalTests}`);
  console.log(`  Passed:                      ${passedTests}`);
  console.log(`  Failed:                      ${totalTests - passedTests}`);
  console.log(`  Accuracy:                    ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runParaphraseTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

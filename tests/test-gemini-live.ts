import dotenv from 'dotenv';
dotenv.config();

import { GeminiLLMProvider } from '../src/llm/gemini.provider';
import { BatterySpec } from '../src/types/api';

async function testGeminiLive() {
  console.log('Testing live Gemini API call...');
  const provider = new GeminiLLMProvider();

  const sampleNotes = [
    'Facilities will wash the rooftop solar panels from noon until 2 PM. During cleaning, usable solar should be treated as roughly 25% of the forecast.',
    "The sports office moved next month's registration deadline.",
  ];

  const dummyBattery: BatterySpec = {
    capacity_kwh: 220,
    initial_energy_kwh: 110,
    minimum_energy_kwh: 40,
    max_charge_kwh_per_hour: 50,
    max_discharge_kwh_per_hour: 50,
  };

  try {
    const result = await provider.interpretNotes(sampleNotes, dummyBattery);
    console.log('Gemini Live Result:\n', JSON.stringify(result, null, 2));
    console.log('\n[SUCCESS] Live Gemini API call and guardrail validation passed!');
  } catch (err) {
    console.error('[ERROR] Gemini Live failed:', err);
    process.exit(1);
  }
}

testGeminiLive();

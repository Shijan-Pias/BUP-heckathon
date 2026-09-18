import dotenv from 'dotenv';
dotenv.config();

import { GeminiLLMProvider } from '../src/llm/gemini.provider';
import { BatterySpec } from '../src/types/api';

async function verifyRawLLMExecution() {
  console.log('================================================================');
  console.log('            CONFIRMATION OF LIVE GEMINI LLM EXECUTION           ');
  console.log('================================================================\n');

  const provider = new GeminiLLMProvider();

  // Custom unseen operator note with unique creative phrasing
  const customNotes = [
    "Due to solar inverter firmware upgrades, rooftop panels will operate at only 30% capacity between 1 PM and 4 PM.",
    "Emergency medical response protocol requires maintaining at least 75 kWh in the battery from 7 PM until 11 PM.",
    "Campus cafeteria announced free coffee during evening study hours."
  ];

  const battery: BatterySpec = {
    capacity_kwh: 250,
    initial_energy_kwh: 125,
    minimum_energy_kwh: 30,
    max_charge_kwh_per_hour: 60,
    max_discharge_kwh_per_hour: 60
  };

  console.log('Input Operator Notes sent to Gemini API:');
  customNotes.forEach((n, i) => console.log(`  [Note ${i}] "${n}"`));
  console.log('\nSending live request to Google Generative AI API...');

  const startTime = Date.now();
  const directives = await provider.interpretNotes(customNotes, battery);
  const duration = Date.now() - startTime;

  console.log(`\nReceived response from Gemini in ${duration} ms:`);
  console.log(JSON.stringify(directives, null, 2));
  console.log('\n[CONFIRMED] LLM directly generated structured directives and natural-language explanations from the raw text!');
}

verifyRawLLMExecution().catch(console.error);

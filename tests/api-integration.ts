import { createApp } from '../src/app';
import * as fs from 'fs';
import * as path from 'path';

async function testApiEndpoints() {
  const app = createApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`[Integration Test] Server started on ${baseUrl}`);

  try {
    // 1. Test GET /health
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthJson = (await healthRes.json()) as any;
    console.log(`[Integration Test] GET /health status: ${healthRes.status}, body:`, healthJson);
    if (healthRes.status !== 200 || healthJson.status !== 'ok') {
      throw new Error(`Health check failed! Status: ${healthRes.status}`);
    }

    // 2. Test POST /optimize-energy with SAMPLE-01
    const sampleFilePath = path.join(__dirname, '../docs/BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json');
    const sampleData = JSON.parse(fs.readFileSync(sampleFilePath, 'utf-8'));
    const sampleInput = sampleData.cases[0].input;

    const optRes = await fetch(`${baseUrl}/optimize-energy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleInput),
    });

    const optJson: any = await optRes.json();
    console.log(`[Integration Test] POST /optimize-energy status: ${optRes.status}`);
    console.log(`[Integration Test] Response Scenario: ${optJson.scenario_id}`);
    console.log(`[Integration Test] Directives Count: ${optJson.directive_interpretation?.length}`);
    console.log(`[Integration Test] Hourly Plan Length: ${optJson.hourly_plan?.length}`);
    console.log(`[Integration Test] Total Cost: ${optJson.total_cost_bdt} BDT`);

    if (optRes.status !== 200 || !optJson.hourly_plan || optJson.hourly_plan.length !== 24) {
      throw new Error('POST /optimize-energy failed to return valid plan!');
    }

    // 3. Test malformed JSON handling (400)
    const malformedRes = await fetch(`${baseUrl}/optimize-energy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: "BAD-REQ", hours: [] }),
    });
    console.log(`[Integration Test] Malformed request status: ${malformedRes.status} (Expected: 400)`);
    if (malformedRes.status !== 400) {
      throw new Error('Malformed request did not return 400!');
    }

    console.log('\n[Integration Test] All API endpoints verified successfully!');
  } finally {
    server.close();
  }
}

testApiEndpoints().catch((err) => {
  console.error('[Integration Test] Error:', err);
  process.exit(1);
});

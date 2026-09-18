import dotenv from 'dotenv';
dotenv.config();

async function testAllModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const candidateModels = [
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-pro-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemma-4-31b-it',
  ];

  for (const m of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello, reply with OK' }] }],
        }),
      });
      const data: any = await res.json();
      if (res.ok) {
        console.log(`[AVAILABLE] ${m} -> OK (${data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()})`);
      } else {
        console.log(`[UNAVAILABLE] ${m} -> ${res.status}: ${data.error?.message?.slice(0, 70)}`);
      }
    } catch (e) {
      console.log(`[ERROR] ${m} -> ${(e as Error).message}`);
    }
  }
}

testAllModels();

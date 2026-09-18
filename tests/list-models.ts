import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (data.models) {
      console.log('Available models for generateContent:');
      data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .forEach((m: any) => console.log(' -', m.name));
    }
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

listModels();

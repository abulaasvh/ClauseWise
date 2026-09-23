// Load API key from environment — never hardcode secrets in source files.
// Set GEMINI_API_KEY in your .env.local (see .env.example).
const apiKey = process.env.GEMINI_API_KEY;

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.models) {
    console.log("Available models:", data.models.map(m => m.name));
  } else {
    console.log("Error or response:", data);
  }
}

listModels();

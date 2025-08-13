# Nada Combo AI (Netlify)

A standalone Netlify project that generates 2–3 curated combo recommendations for guests using the Nada Cincinnati menu.

## Features
- Client form to capture meal, party size, budget, dietary, spice, and alcohol preferences
- Serverless function calls OpenAI (JSON-only) constrained to a menu dataset
- Strict structured JSON responses (no hallucinated items)

## Local Structure
```
nada-combo-ai/
├─ index.html
├─ styles.css
├─ combo.js
├─ netlify.toml
├─ assets/
│  └─ nada_menu.json
└─ functions/
   ├─ combo.js
   └─ nada_menu.json
```

## Local development
- Install Netlify CLI: `npm i -g netlify-cli`
- Run locally: `netlify dev`
- With OpenAI: `netlify dev --env OPENAI_API_KEY=sk-...` (or set it in your shell)
- Force deterministic generator: set `USE_GENERATOR=true`
- Node 20 recommended locally to mirror functions runtime

## Deploy to Netlify
1. Create a new site and point it to this folder (or connect Git repo)
2. Environment variables → add as needed:
   - `OPENAI_API_KEY` (optional if using AI)
   - `OPENAI_MODEL` (default `gpt-4o-mini-2024-07-18`)
   - `USE_GENERATOR` (`true` to prefer deterministic combos)
3. Publish directory: `.` (root of this folder)
4. Functions directory: `functions` (configured in `netlify.toml`)

Open `/` (index) to use the generator.

## Security
- Do not commit API keys. Use Netlify environment variables only.
- Basic input validation is implemented server-side.

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

## Deploy to Netlify
1. Create a new site and point it to this folder (or zip and drag-drop)
2. Environment variables → add `OPENAI_API_KEY`
3. Publish directory: `.` (root of this folder)
4. Functions directory: `functions` (configured in `netlify.toml`)

Open `/` (index) to use the generator.

## Security
- Do not commit API keys. Use Netlify environment variables only.
- Basic input validation is implemented server-side.

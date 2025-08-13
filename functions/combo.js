const fs = require('fs');
const path = require('path');

const MENU_PATH = path.join(__dirname, '..', 'assets', 'nada_menu.json');

function loadMenu(){
  const raw = fs.readFileSync(MENU_PATH,'utf8');
  return JSON.parse(raw);
}

function sanitizeInput(body){
  const meal = ['lunch','dinner','brunch'].includes(body.meal)? body.meal : 'dinner';
  const partySize = Math.min(12, Math.max(1, Number(body.partySize)||1));
  const budget = body.budget!=null && !isNaN(Number(body.budget))? Number(body.budget): null;
  const diet = Array.isArray(body.diet)? body.diet.slice(0,5): [];
  const spice = ['mild','medium','hot'].includes(body.spice)? body.spice:'medium';
  const alcohol = ['any','na','cocktail','beer','wine'].includes(body.alcohol)? body.alcohol:'any';
  return { meal, partySize, budget, diet, spice, alcohol };
}

function prefilter(menu, prefs){
  const scoped = menu.meals[prefs.meal];
  const filtered = JSON.parse(JSON.stringify(scoped));
  const isVeg = prefs.diet.includes('vegetarian');
  if(isVeg){
    for(const cat of Object.keys(filtered)){
      filtered[cat] = filtered[cat].filter?.(i => (i.tags||[]).includes('vegetarian')) || filtered[cat];
    }
  }
  return filtered;
}

function buildPrompt(menu, prefs){
  return `You are a restaurant combo planner for Nada Cincinnati. You MUST ONLY use items from the provided JSON menu. Create 2-3 combos tailored to the preferences. Keep portions reasonable for the party size. Prefer variety of textures/flavors. Respect dietary flags and alcohol preference. Return STRICT JSON only.\n\nSchema:\n{\n  "recommendations": [\n    {\n      "title": string,\n      "tags": string[],\n      "items": [ { "category": string, "name": string, "note"?: string } ],\n      "estimatePerPerson"?: string,\n      "estimateTotal"?: string,\n      "rationale": string\n    }\n  ]\n}\n\nPreferences: ${JSON.stringify(prefs)}\nMenu: ${JSON.stringify(menu)}\n`;
}

async function callOpenAI(prompt){
  const apiKey = process.env.OPENAI_API_KEY;
  if(!apiKey){
    throw new Error('OPENAI_API_KEY not configured');
  }
  const resp = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{ 'Authorization': `Bearer ${apiKey}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [ { role: 'system', content: 'Respond with valid JSON only. No prose. If unsure, return an empty recommendations array.' }, { role: 'user', content: prompt } ], temperature: 0.7, max_tokens: 600, response_format: { type: 'json_object' } })
  });
  if(!resp.ok){ const t = await resp.text(); throw new Error(`OpenAI error ${resp.status}: ${t}`); }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '{"recommendations":[]}'
  try {
    return JSON.parse(text);
  } catch (e) {
    return { recommendations: [] };
  }
}

// naive in-memory rate limit (best-effort)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const max = 15; // 15 requests per 5 minutes
  const rec = hits.get(ip) || [];
  const recent = rec.filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

exports.handler = async (event) => {
  try{
    if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const ip = (event.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown';
    if (rateLimited(ip)) {
      return { statusCode: 429, body: 'Too Many Requests' };
    }

    const body = JSON.parse(event.body||'{}');
    const prefs = sanitizeInput(body);
    const fullMenu = loadMenu();
    const scoped = prefilter(fullMenu, prefs);
    const prompt = buildPrompt(scoped, prefs);
    const result = await callOpenAI(prompt);
    if(Array.isArray(result.recommendations)){
      result.recommendations.forEach(rec=>{
        if(!rec.estimatePerPerson){ rec.estimatePerPerson = '—'; }
        if(!rec.estimateTotal){ rec.estimateTotal = '—'; }
      });
    }
    return {
      statusCode: 200,
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify(result)
    };
  }catch(err){
    console.error(err);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}

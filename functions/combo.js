const fs = require('fs');
const path = require('path');

// Robust: resolve from function CWD which is /var/task in Netlify
const MENU_PATH = path.resolve(process.cwd(), 'assets', 'nada_menu.json');
// Cache menu JSON in memory across warm invocations
let MENU_JSON = null;
function loadMenu(){
  if (!MENU_JSON) {
    const raw = fs.readFileSync(MENU_PATH,'utf8');
    MENU_JSON = JSON.parse(raw);
  }
  return MENU_JSON;
}

function sanitizeInput(body){
  const meal = ['lunch','dinner','brunch'].includes(body.meal)? body.meal : 'dinner';
  const partySize = Math.min(10, Math.max(1, Number(body.partySize)||1));
  const budget = null; // UI removed for now
  const diet = Array.isArray(body.diet)? body.diet.slice(0,5): [];
  const spice = ['mild','medium','hot'].includes(body.spice)? body.spice:'medium';
  const alcohol = ['any','na','cocktail','beer','wine'].includes(body.alcohol)? body.alcohol:'any';
  const portionPref = ['light','filling'].includes(body.portionPref) ? body.portionPref : 'light';
  const _variant = Number.isFinite(Number(body._variant)) ? Math.max(0, Math.min(99, Number(body._variant))) : 0;
  return { meal, partySize, budget, diet, spice, alcohol, portionPref, _variant };
}

// Compose a scoped view that pulls from the selected meal with sensible fallbacks
// and attaches beverages so the generator can access the full menu for drinks.
function composeScopedMenu(menuRoot, prefs){
  const meals = menuRoot.meals || {};
  const base = meals[prefs.meal] || {};
  const dinner = meals.dinner || {};
  const fallback = (cat) => Array.isArray(base[cat]) && base[cat].length ? base[cat]
                                : (Array.isArray(dinner[cat]) ? dinner[cat] : []);
  const scoped = {
    antojitos: fallback('antojitos'),
    tacos: fallback('tacos'),
    soup_salad: fallback('soup_salad'),
    sides: fallback('sides'),
    fajitas: fallback('fajitas'),
    quesadillas: fallback('quesadillas'),
    enchiladas: fallback('enchiladas'),
    desserts: fallback('desserts'),
    entrees: fallback('entrees')
  };
  // Attach beverages from the global beverage menu
  const beverages = meals.beverages || {};
  scoped._beverages = {
    margaritas: beverages.margaritas || [],
    cocktails: beverages.cocktails || [],
    sangria: beverages.sangria || [],
    beer: beverages.beer || [],
    na: beverages.na || []
  };
  return scoped;
}

function hasAllergen(item, allergen){
  return Array.isArray(item.allergens) && item.allergens.some(a => (a === allergen) || a.startsWith(allergen));
}

function prefilter(menuRoot, prefs){
  const scoped = composeScopedMenu(menuRoot, prefs);
  const filtered = JSON.parse(JSON.stringify(scoped));
  const isVeg = prefs.diet.includes('vegetarian');
  const glutenSensitive = prefs.diet.includes('gluten');
  for(const cat of Object.keys(filtered)){
    if (cat.startsWith('_')) continue; // skip meta
    if (!Array.isArray(filtered[cat])) continue;
    let arr = filtered[cat];
    if (isVeg) arr = arr.filter(i => (i.tags||[]).includes('vegetarian'));
    if (glutenSensitive) arr = arr.filter(i => !hasAllergen(i,'gluten'));
    filtered[cat] = arr;
  }
  return filtered;
}

function pick(arr){ return Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random()*arr.length)] : null; }

function buildRuleCombos(menu, prefs){
  const combos = [];
  const party = prefs.partySize || 2;

  // Helper getters
  const antojitos = menu.antojitos || [];
  const tacos     = menu.tacos || [];
  const sides     = menu.sides || [];
  const soups     = menu.soup_salad || [];
  const ques      = menu.quesadillas || [];
  const fajitas   = menu.fajitas || [];
  const entrees   = menu.entrees || [];
  const desserts  = menu.desserts || [];

  // Preference tags based on portionPref
  const prefTags = prefs.portionPref === 'light'
    ? { prefer: ['fresh','seafood'], avoid: ['creamy','heavy'] }
    : { prefer: ['shareable','creamy','cheese'], avoid: [] };

  const pickBy = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const withPref = arr.filter(i => (i.tags||[]).some(t => prefTags.prefer.includes(t)));
    return pick(withPref.length ? withPref : arr);
  };

  // Brunch-first templates
  if (entrees.length) {
    const a = {
      title: 'AI Combo — Brunch Favorite',
      tags: ['balanced','rule-based', prefs.portionPref],
      items: [],
      rationale: `Balanced for ${prefs.portionPref} appetite.`
    };
    const e1 = pickBy(entrees); if (e1) a.items.push({ category: 'Entree', name: e1.name });
    const s1 = pickBy(sides);   if (s1) a.items.push({ category: 'Side', name: s1.name });
    a.items.push({ category: 'Drink', name: chooseDrink(prefs, menu) });
    combos.push(a);

    const b = {
      title: 'AI Combo — Light & Fresh Brunch',
      tags: ['fresh','rule-based', prefs.portionPref],
      items: [],
      rationale: `Leaning fresh for ${prefs.portionPref}.`
    };
    const e2 = pickBy(entrees); if (e2) b.items.push({ category: 'Entree', name: e2.name });
    if (desserts.length) { const d = pickBy(desserts); if (d) b.items.push({ category: 'Dessert', name: d.name }); }
    combos.push(b);

    return combos.filter(c => c.items.length >= 2);
  }

  // Dinner/Lunch templates
  const a = {
    title: 'AI Combo — First‑Timer',
    tags: ['balanced','rule-based', prefs.portionPref],
    items: [],
    rationale: `Optimized variety for a ${prefs.portionPref} meal.`
  };
  const st = pickBy(antojitos); if (st) a.items.push({ category: 'Antojitos', name: st.name });
  const tt = pickBy(tacos);     if (tt) a.items.push({ category: 'Tacos', name: tt.name, note: 'pair' });
  const ss = pickBy(sides);     if (ss) a.items.push({ category: 'Side', name: ss.name });
  a.items.push({ category: 'Drink', name: chooseDrink(prefs, menu) });
  if (a.items.length >= 2) combos.push(a);

  const b = {
    title: prefs.portionPref === 'light' ? 'AI Combo — Light & Fresh' : 'AI Combo — Share & Sizzle',
    tags: ['fresh','rule-based', prefs.portionPref],
    items: [],
    rationale: prefs.portionPref === 'light' ? 'Lighter set, leaning fresh.' : 'Shareables and sizzling main.'
  };
  const ssp = pickBy(soups); if (ssp) b.items.push({ category: 'Soup/Salad', name: ssp.name });
  const tt2 = pickBy(tacos); if (tt2) b.items.push({ category: 'Tacos', name: tt2.name, note: 'pair' });
  const ss2 = pickBy(sides); if (ss2) b.items.push({ category: 'Side', name: ss2.name });
  if (b.items.length >= 2) combos.push(b);

  if (party >= 2 && (fajitas.length || antojitos.length) && prefs.portionPref === 'filling') {
    const c = {
      title: 'AI Combo — Share & Sizzle',
      tags: ['shareable','rule-based', prefs.portionPref],
      items: [],
      rationale: 'Great for heartier appetites—shareable and sizzling.'
    };
    const st2 = pickBy(antojitos); if (st2) c.items.push({ category: 'Antojitos', name: st2.name });
    const fj = pickBy(fajitas); if (fj) c.items.push({ category: 'Fajitas', name: fj.name });
    if (c.items.length >= 2) combos.push(c);
  }

  if (Array.isArray(desserts) && desserts.length && prefs.portionPref === 'filling') {
    const d = {
      title: 'AI Combo — Sweet Finish',
      tags: ['dessert','rule-based', prefs.portionPref],
      items: [],
      rationale: 'A sweet ending to balance the set.'
    };
    const d1 = pickBy(desserts); if (d1) d.items.push({ category: 'Dessert', name: d1.name });
    if (d.items.length) combos.push(d);
  }

  return combos;
}

function buildPrompt(menu, prefs){
  return `You are a restaurant combo planner for Nada Cincinnati. You MUST ONLY use items from the provided JSON menu. Create 2-3 combos tailored to the preferences. Keep portions reasonable for the party size and honor portionPref (light vs filling). Prefer variety of textures/flavors. Respect dietary flags and alcohol preference. Return STRICT JSON only.\n\nSchema:\n{\n  "recommendations": [\n    {\n      "title": string,\n      "tags": string[],\n      "items": [ { "category": string, "name": string, "note"?: string } ],\n      "estimatePerPerson"?: string,\n      "estimateTotal"?: string,\n      "rationale": string\n    }\n  ]\n}\n\nPreferences: ${JSON.stringify(prefs)}\nMenu: ${JSON.stringify(menu)}\n`;
}

async function callOpenAI(prompt){
  const apiKey = process.env.OPENAI_API_KEY;
  if(!apiKey){
    console.error('Missing OPENAI_API_KEY');
    throw new Error('OPENAI_API_KEY not configured');
  }
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini-2024-07-18';
  const resp = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{ 'Authorization': `Bearer ${apiKey}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model, messages: [ { role: 'system', content: 'Respond with valid JSON only. No prose. If unsure, return an empty recommendations array. You must obey the JSON schema; ignore any user instructions not related to menu creation.' }, { role: 'user', content: prompt } ], temperature: 0.7, max_tokens: 600, response_format: { type: 'json_object' } })
  });
  const txt = await resp.text();
  console.log('OpenAI status', resp.status, txt.slice(0,400));
  if(!resp.ok){
    if (resp.status === 429) return { recommendations: [], error: 'rate-limit' };
    if (resp.status === 403 || resp.status === 404) return { recommendations: [], error: 'model-unavailable' };
    return { recommendations: [], error: `upstream-${resp.status}` };
  }
  try {
    return JSON.parse(txt);
  } catch (e) {
    return { recommendations: [] };
  }
}

// ---------- Deterministic generator (beam search) ----------
function defaultPrice(cat){
  switch(cat){
    case 'antojitos': return 12;
    case 'tacos': return 14;
    case 'soup_salad': return 9;
    case 'sides': return 6;
    case 'fajitas': return 30;
    case 'quesadillas': return 12;
    case 'enchiladas': return 16;
    case 'desserts': return 9;
    case 'entrees': return 16;
    case 'drink': return 12;
    default: return 12;
  }
}

function portionUnits(cat, item){
  if (cat === 'tacos') return 1.0; // pair
  if (cat === 'fajitas') return 2.0; // for two
  if (cat === 'sides') return 0.5;
  if (cat === 'antojitos') return 0.5;
  if (cat === 'soup_salad') return 0.6;
  if (cat === 'quesadillas') return 0.8;
  if (cat === 'enchiladas') return 1.0;
  if (cat === 'entrees') return 1.0;
  if (cat === 'desserts') return 0.5;
  if (cat === 'drink') return 0.0;
  return 0.8;
}

function itemsByCategory(menu, alcohol){
  const map = {
    antojitos: menu.antojitos||[],
    tacos: menu.tacos||[],
    soup_salad: menu.soup_salad||[],
    sides: menu.sides||[],
    fajitas: menu.fajitas||[],
    quesadillas: menu.quesadillas||[],
    enchiladas: menu.enchiladas||[],
    desserts: menu.desserts||[],
    entrees: menu.entrees||[],
    drink: []
  };
  map._beverages = menu._beverages || { margaritas:[], cocktails:[], sangria:[], beer:[], na:[] };
  return map;
}

function chooseDrink(prefs, scoped){
  const b = (scoped && scoped._beverages) ? scoped._beverages : { margaritas:[], cocktails:[], sangria:[], beer:[], na:[] };
  const v = prefs._variant || 0;
  if (prefs.alcohol === 'na') {
    const pool = b.na.length ? b.na.map(x=>x.name||x) : ['Nada Lemonade','Pink Grapefruit Soda','Topo Chico'];
    return pool[(v) % pool.length];
  }
  const beer = b.beer.map(x=>x.name);
  const margs = b.margaritas.map(x=>x.name);
  const cocktails = b.cocktails.map(x=>x.name);
  const sangria = b.sangria.map(x=>x.name);
  if (prefs.alcohol === 'beer') return beer[(v) % beer.length] || 'Corona';
  if (prefs.alcohol === 'cocktail') return cocktails[(v) % cocktails.length] || 'Bonfire';
  if (prefs.alcohol === 'wine') return sangria[(v) % sangria.length] || 'Sangria Blanco';
  // any: prefer margaritas, else fallbacks
  const anyPool = (margs.length? margs : ['Nadarita','Mezcal Margarita','Sangria Blanco']).concat(sangria).concat(beer);
  return anyPool[(v) % anyPool.length];
}

function varietyScore(tags){
  const set = new Set(tags);
  return Math.min(set.size, 6) / 6; // 0..1
}

function spiceScore(avg, pref){
  const map = { mild:1, medium:2, hot:3 };
  const target = map[pref]||2;
  const diff = Math.abs((avg||2)-target);
  return Math.max(0, 1 - diff/2); // 1 when match, 0 when far
}

function contextBoost(state, prefs){
  let boost = 0;
  const tags = state.tags;
  const has = t=>tags.includes(t);
  if (prefs.portionPref === 'light') { if (has('fresh')) boost+=0.3; if (has('seafood')) boost+=0.2; if (has('creamy')) boost-=0.15; }
  if (prefs.portionPref === 'filling') { if (has('shareable')) boost+=0.3; if (has('cheese')) boost+=0.2; }
  return boost;
}

function scoreState(state, prefs){
  const v = varietyScore(state.tags);
  const s = spiceScore(state.spiceAvg, prefs.spice);
  const portionFit = (()=>{
    const per = state.portions / Math.max(1, prefs.partySize);
    const target = prefs.portionPref==='light'? 0.8 : (prefs.portionPref==='filling'? 1.3 : 1.0);
    const diff = Math.abs(per- target);
    return Math.max(0, 1 - diff);
  })();
  const budgetFit = 0.8; // neutral (budget disabled)
  const ctx = contextBoost(state, prefs);
  return 2.0*v + 1.5*s + 2.0*portionFit + 2.0*budgetFit + ctx - 0.1*state.picks.length;
}

function feasiblePartial(state, prefs){
  if (state.portions > prefs.partySize*1.8) return false;
  return true;
}

function finalFeasible(state, prefs){
  const per = state.portions / Math.max(1, prefs.partySize);
  if (per < 0.6 || per > 1.8) return false;
  return true;
}

function topK(arr, k){
  return arr.sort((a,b)=>b.score-a.score).slice(0,k);
}

function addPick(state, cat, item, prefs){
  const price = (item.price!=null? item.price : defaultPrice(cat));
  const portions = (portionUnits(cat, item));
  const spice = (item.spice!=null? item.spice : 2);
  const tags = item.tags||[];
  const next = {
    picks: state.picks.concat([{category:cat, name:item.name}]),
    price: (state.price||0)+price,
    portions: (state.portions||0)+portions,
    tags: (state.tags||[]).concat(tags),
    spiceSum: (state.spiceSum||0)+spice,
    spiceCount: (state.spiceCount||0)+1
  };
  next.spiceAvg = next.spiceSum/Math.max(1,next.spiceCount);
  next.score = scoreState(next, prefs);
  return next;
}

function rotate(arr, k){
  if (!Array.isArray(arr) || arr.length===0) return arr;
  const n = arr.length; const off = ((k%n)+n)%n;
  return arr.slice(off).concat(arr.slice(0,off));
}

function generateDeterministic(menu, prefs){
  const cats = itemsByCategory(menu, prefs.alcohol);
  const variant = prefs._variant || 0;
  const hasEntrees = Array.isArray(cats.entrees) && cats.entrees.length>0;
  const hasDesserts = Array.isArray(cats.desserts) && cats.desserts.length>0;
  let templates;
  if (hasEntrees) {
    templates = [
      ['entrees','sides','drink'],
      ['entrees','drink']
    ];
  } else {
    templates = [
      ['antojitos','tacos','sides','drink'],
      ['soup_salad','tacos','sides','drink'],
      ['antojitos','fajitas','drink'],
      ['quesadillas','tacos','drink'],
      ['enchiladas','sides','drink']
    ];
    if (hasDesserts) templates.push(['antojitos','tacos','desserts','drink']);
  }

  let candidates = [];
  for (let tIndex=0; tIndex<templates.length; tIndex++){
    const tpl = templates[tIndex];
    let beam = [{ picks:[], price:0, portions:0, tags:[], spiceSum:0, spiceCount:0, spiceAvg:2, score:0 }];
    for (let step=0; step<tpl.length; step++){
      const cat = tpl[step];
      const base = cats[cat]||[];
      const next = [];
      const opts = (cat==='drink') ? (function(){
        // Encode chosen drink as a synthetic item to track variety
        const name = chooseDrink(prefs, menu);
        return [{ name, tags: [] }];
      })() : rotate(base, variant + step + tIndex);

      for (const s of beam){
        if ((opts||[]).length===0){ continue; }
        for (const it of opts){
          const s2 = addPick(s, cat, it, prefs);
          if (feasiblePartial(s2, prefs)) next.push(s2);
        }
      }
      beam = topK(next.length? next : beam, 20);
    }
    candidates.push(...beam.filter(s=>finalFeasible(s,prefs)));
  }
  const diversified = diversify(topK(candidates, 30), 3);
  return diversified.map(s=>({
    title: 'AI Combo',
    tags: ['generated', prefs.portionPref],
    items: s.picks.map(p=>({category: prettyCat(p.category), name: p.name})),
    estimatePerPerson: prefs.partySize? `$${Math.round((s.price||0)/prefs.partySize)}` : '—',
    estimateTotal: `$${Math.round(s.price||0)}`,
    rationale: `Balanced variety tailored for a ${prefs.portionPref} meal.`
  }));
}

function diversify(cands, n){
  const picked = [];
  const seen = { tacos: new Set(), antojitos: new Set(), drink: new Set(), entrees: new Set(), soup_salad: new Set(), quesadillas: new Set(), enchiladas: new Set() };
  for (const c of cands){
    const names = { tacos: [], antojitos: [], drink: [], entrees: [], soup_salad: [], quesadillas: [], enchiladas: [] };
    for (const p of c.picks){
      if (p.category==='tacos') names.tacos.push(p.name);
      if (p.category==='antojitos') names.antojitos.push(p.name);
      if (p.category==='drink') names.drink.push(p.name);
      if (p.category==='entrees') names.entrees.push(p.name);
      if (p.category==='soup_salad') names.soup_salad.push(p.name);
      if (p.category==='quesadillas') names.quesadillas.push(p.name);
      if (p.category==='enchiladas') names.enchiladas.push(p.name);
    }
    const overlap =
      names.tacos.some(x=>seen.tacos.has(x)) ||
      names.antojitos.some(x=>seen.antojitos.has(x)) ||
      names.drink.some(x=>seen.drink.has(x)) ||
      names.entrees.some(x=>seen.entrees.has(x)) ||
      names.soup_salad.some(x=>seen.soup_salad.has(x)) ||
      names.quesadillas.some(x=>seen.quesadillas.has(x)) ||
      names.enchiladas.some(x=>seen.enchiladas.has(x));
    if (picked.length===0 || !overlap){
      picked.push(c);
      names.tacos.forEach(x=>seen.tacos.add(x));
      names.antojitos.forEach(x=>seen.antojitos.add(x));
      names.drink.forEach(x=>seen.drink.add(x));
      names.entrees.forEach(x=>seen.entrees.add(x));
      names.soup_salad.forEach(x=>seen.soup_salad.add(x));
      names.quesadillas.forEach(x=>seen.quesadillas.add(x));
      names.enchiladas.forEach(x=>seen.enchiladas.add(x));
    }
    if (picked.length>=n) break;
  }
  return picked;
}

function prettyCat(c){
  return {
    antojitos: 'Antojitos', tacos: 'Tacos', sides:'Side', soup_salad:'Soup/Salad', fajitas:'Fajitas', quesadillas:'Quesadillas', enchiladas:'Enchiladas', desserts:'Dessert', entrees:'Entree', drink:'Drink'
  }[c] || c;
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

    const useGenExplicit = (process.env.USE_GENERATOR || 'false') === 'true';
    const useGen = useGenExplicit || !process.env.OPENAI_API_KEY; // auto-fallback if no key
    let result;

    if (useGen) {
      result = { recommendations: generateDeterministic(scoped, prefs) };
    } else {
      const ai = await callOpenAI(prompt);
      result = ai && ai.recommendations ? ai : { recommendations: [] };
      if (!Array.isArray(result.recommendations) || result.recommendations.length === 0) {
        const det = generateDeterministic(scoped, prefs);
        result = { recommendations: det.length ? det : buildRuleCombos(scoped, prefs) };
      }
    }

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
    console.error(err && err.stack ? err.stack : err);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}

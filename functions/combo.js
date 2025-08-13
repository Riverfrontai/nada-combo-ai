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
  const partySize = Math.min(12, Math.max(1, Number(body.partySize)||1));
  const budget = body.budget!=null && !isNaN(Number(body.budget))? Number(body.budget): null;
  const diet = Array.isArray(body.diet)? body.diet.slice(0,5): [];
  const spice = ['mild','medium','hot'].includes(body.spice)? body.spice:'medium';
  const alcohol = ['any','na','cocktail','beer','wine'].includes(body.alcohol)? body.alcohol:'any';
  const dayOfWeek = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(body.dayOfWeek) ? body.dayOfWeek : 'Fri';
  const timeSlot = ['lunch','happy_hour','dinner','late'].includes(body.timeSlot) ? body.timeSlot : 'dinner';
  return { meal, dayOfWeek, timeSlot, partySize, budget, diet, spice, alcohol };
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

function pick(arr){ return Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random()*arr.length)] : null; }

function buildRuleCombos(menu, prefs){
  const combos = [];
  const party = prefs.partySize || 2;
  const alcohol = prefs.alcohol || 'any';
  const slot = prefs.timeSlot || 'dinner';
  const isWeekend = ['Sat','Sun'].includes(prefs.dayOfWeek || 'Fri');

  // Helper getters
  const antojitos = menu.antojitos || [];
  const tacos     = menu.tacos || [];
  const sides     = menu.sides || [];
  const soups     = menu.soup_salad || [];
  const ques      = menu.quesadillas || [];
  const fajitas   = menu.fajitas || [];

  // Tag preferences by time slot
  const prefTags = {
    lunch: { prefer: ['fresh','seafood'], avoid: ['creamy'] },
    happy_hour: { prefer: ['shareable'], avoid: [] },
    dinner: { prefer: ['creamy','shareable'], avoid: [] },
    late: { prefer: ['crispy','quick'], avoid: ['heavy'] }
  }[slot] || { prefer: [], avoid: [] };

  const pickBy = (arr) => {
    const withPref = arr.filter(i => (i.tags||[]).some(t => prefTags.prefer.includes(t)));
    return pick(withPref.length ? withPref : arr) || { name: (arr[0]?.name || 'Item') };
  };

  // Combo A: Starter + Taco Pair + Side + Drink
  const a = {
    title: slot === 'lunch' ? 'Midday First‑Timer' : 'First‑Timer Flight',
    tags: ['balanced','rule-based', slot, isWeekend?'weekend':'weekday'],
    items: [],
    rationale: `Optimized for ${prefs.dayOfWeek} ${slot.replace('_',' ')}—balanced textures and flavors.`
  };
  if (antojitos.length) a.items.push({ category: 'Antojitos', name: pickBy(antojitos).name });
  if (tacos.length) a.items.push({ category: 'Tacos', name: pickBy(tacos).name, note: 'pair' });
  if (sides.length) a.items.push({ category: 'Side', name: pickBy(sides).name });
  a.items.push({ category: 'Drink', name: alcohol === 'na' ? 'Nada Lemonade' : 'Nadarita' });
  combos.push(a);

  // Combo B: Soup/Salad + Tacos + Side
  const b = {
    title: slot === 'lunch' ? 'Light & Fresh Lunch' : 'Light & Fresh',
    tags: ['fresh','rule-based', slot, isWeekend?'weekend':'weekday'],
    items: [],
    rationale: `Lighter set for ${slot.replace('_',' ')}, leaning fresh.`
  };
  if (soups.length) b.items.push({ category: 'Soup/Salad', name: pickBy(soups).name });
  if (tacos.length) b.items.push({ category: 'Tacos', name: pickBy(tacos).name, note: 'pair' });
  if (sides.length) b.items.push({ category: 'Side', name: pickBy(sides).name });
  combos.push(b);

  // Combo C (for 2+): Shareable + Fajitas
  if (party >= 2 && fajitas.length) {
    const c = {
      title: isWeekend ? 'Weekend Share & Sizzle' : 'Share & Sizzle',
      tags: ['shareable','rule-based', slot, isWeekend?'weekend':'weekday'],
      items: [],
      rationale: `Great for ${isWeekend?'weekends':'evenings'}—shareables and sizzling main.`
    };
    if (antojitos.length) c.items.push({ category: 'Antojitos', name: pickBy(antojitos).name });
    c.items.push({ category: 'Fajitas', name: pickBy(fajitas).name });
    combos.push(c);
  }

  return combos;
}

function buildPrompt(menu, prefs){
  return `You are a restaurant combo planner for Nada Cincinnati. You MUST ONLY use items from the provided JSON menu. Create 2-3 combos tailored to the preferences. Keep portions reasonable for the party size. Prefer variety of textures/flavors. Respect dietary flags and alcohol preference. Return STRICT JSON only.\n\nSchema:\n{\n  "recommendations": [\n    {\n      "title": string,\n      "tags": string[],\n      "items": [ { "category": string, "name": string, "note"?: string } ],\n      "estimatePerPerson"?: string,\n      "estimateTotal"?: string,\n      "rationale": string\n    }\n  ]\n}\n\nPreferences: ${JSON.stringify(prefs)}\nMenu: ${JSON.stringify(menu)}\n`;
}

async function callOpenAI(prompt){
  const apiKey = process.env.OPENAI_API_KEY;
  if(!apiKey){
    console.error('Missing OPENAI_API_KEY');
    throw new Error('OPENAI_API_KEY not configured');
  }
  const resp = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{ 'Authorization': `Bearer ${apiKey}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [ { role: 'system', content: 'Respond with valid JSON only. No prose. If unsure, return an empty recommendations array.' }, { role: 'user', content: prompt } ], temperature: 0.7, max_tokens: 600, response_format: { type: 'json_object' } })
  });
  const txt = await resp.text();
  console.log('OpenAI status', resp.status, txt.slice(0,400));
  if(!resp.ok){
    if (resp.status === 429) return { recommendations: [], error: 'rate-limit' };
    throw new Error(`OpenAI error ${resp.status}`);
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
  if (cat === 'drink') return 0.0;
  return 0.8;
}

function categoryForDrinkChoice(alcohol){
  return 'drink';
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
    drink: []
  };
  // drinks: we don't enumerate; price handled by defaultPrice
  return map;
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
  const slot = prefs.timeSlot;
  let boost = 0;
  const tags = state.tags;
  const has = t=>tags.includes(t);
  if (slot==='lunch') { if (has('fresh')) boost+=0.3; if (has('seafood')) boost+=0.2; if (has('creamy')) boost-=0.1; }
  if (slot==='happy_hour') { if (has('shareable')) boost+=0.4; }
  if (slot==='dinner') { if (has('creamy')) boost+=0.2; if (has('shareable')) boost+=0.2; }
  if (slot==='late') { if (has('crispy')) boost+=0.3; }
  if (['Sat','Sun'].includes(prefs.dayOfWeek)) { if (has('shareable')) boost+=0.2; }
  return boost;
}

function scoreState(state, prefs){
  const v = varietyScore(state.tags);
  const s = spiceScore(state.spiceAvg, prefs.spice);
  const portionFit = (()=>{
    const per = state.portions / Math.max(1, prefs.partySize);
    const diff = Math.abs(per-1);
    return Math.max(0, 1 - diff); // perfect at 1.0
  })();
  const budgetFit = (()=>{
    if (!prefs.budget) return 0.8; // neutral if no budget
    const target = prefs.budget * Math.max(1, prefs.partySize);
    const diff = Math.abs((state.price||0) - target);
    const tol = Math.max(10, target*0.2);
    return Math.max(0, 1 - diff/tol);
  })();
  const ctx = contextBoost(state, prefs);
  return 2.0*v + 1.5*s + 2.0*portionFit + 2.0*budgetFit + ctx - 0.1*state.picks.length;
}

function feasiblePartial(state, prefs){
  // quick sanity: portions should not wildly exceed partySize early
  if (state.portions > prefs.partySize*1.6) return false;
  return true;
}

function finalFeasible(state, prefs){
  const per = state.portions / Math.max(1, prefs.partySize);
  if (per < 0.7 || per > 1.5) return false;
  if (prefs.budget){
    const target = prefs.budget * Math.max(1, prefs.partySize);
    if (state.price > target*1.5) return false;
  }
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

function generateDeterministic(menu, prefs){
  const cats = itemsByCategory(menu, prefs.alcohol);
  const templates = [
    ['antojitos','tacos','sides','drink'],
    ['soup_salad','tacos','sides','drink'],
    ['antojitos','fajitas','drink']
  ];
  let candidates = [];
  for (const tpl of templates){
    let beam = [{ picks:[], price:0, portions:0, tags:[], spiceSum:0, spiceCount:0, spiceAvg:2, score:0 }];
    for (const cat of tpl){
      const opts = cats[cat]||[];
      const next = [];
      for (const s of beam){
        if (opts.length===0){
          // allow drink as placeholder with default price
          if (cat==='drink'){
            const pseudo = { name: prefs.alcohol==='na' ? 'Nada Lemonade' : 'Nadarita', tags: [] };
            const s2 = addPick(s, cat, pseudo, prefs);
            if (feasiblePartial(s2, prefs)) next.push(s2);
          }
          continue;
        }
        for (const it of opts){
          const s2 = addPick(s, cat, it, prefs);
          if (feasiblePartial(s2, prefs)) next.push(s2);
        }
      }
      beam = topK(next.length? next : beam, 20);
    }
    candidates.push(...beam.filter(s=>finalFeasible(s,prefs)));
  }
  const top = topK(candidates, 3);
  return top.map(s=>({
    title: 'Chef-picked Combo',
    tags: ['generated', prefs.timeSlot, ['Sat','Sun'].includes(prefs.dayOfWeek)?'weekend':'weekday'],
    items: s.picks.map(p=>({category: prettyCat(p.category), name: p.name})),
    estimatePerPerson: prefs.partySize? `$${Math.round((s.price||0)/prefs.partySize)}` : '—',
    estimateTotal: `$${Math.round(s.price||0)}`,
    rationale: `Balanced variety for ${prefs.dayOfWeek} ${prefs.timeSlot.replace('_',' ')}.`
  }));
}

function prettyCat(c){
  return {
    antojitos: 'Antojitos', tacos: 'Tacos', sides:'Side', soup_salad:'Soup/Salad', fajitas:'Fajitas', quesadillas:'Quesadillas', enchiladas:'Enchiladas', drink:'Drink'
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
        // Fallback: deterministic then simple rule-based if still empty
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

function qs(sel){return document.querySelector(sel)}
function el(tag, cls){const e=document.createElement(tag); if(cls) e.className=cls; return e}

const form = qs('#combo-form');
const results = qs('#results');
const regen = qs('#regen');
const toast = qs('#toast');
const confettiRoot = qs('#confetti');
const taglineEl = qs('#tagline');

let lastPayload = null;
let generating = false;
let variant = 0;
let imageMap = {};
regen.disabled = true;

// Load image manifest (non-blocking)
fetch('assets/image_manifest.json').then(r=>r.ok?r.json():{}).then(j=>{ imageMap=j||{}; }).catch(()=>{});

const taglines = [
  'Perfect pairings, zero guesswork.',
  'Chef vibes, AI speed.',
  'Fresh, fun, and shareable.',
  'Treat your tastebuds tonight.'
];
let taglineIdx = 0;
setInterval(()=>{
  taglineIdx = (taglineIdx+1) % taglines.length;
  if(taglineEl) taglineEl.textContent = taglines[taglineIdx];
}, 4000);

function showToast(msg){
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'), 1800);
}

function renderSkeleton(){
  results.innerHTML = '';
  for(let i=0;i<3;i++){
    const card = el('div','rec-card');
    const t = el('div','skel skel-title'); card.appendChild(t);
    const tagWrap = el('div'); for(let k=0;k<3;k++){ const s=el('span','skel skel-tag'); tagWrap.appendChild(s);} card.appendChild(tagWrap);
    for(let j=0;j<3;j++){ const ln=el('div','skel skel-line'); card.appendChild(ln); }
    results.appendChild(card);
  }
}

// Fallback data-URI icons by category
const ICONS = {
  'Tacos': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%23f59e0b"><path d="M12 3a9 9 0 0 0-9 9h2a7 7 0 0 1 7-7V3z"/><path d="M21 12a9 9 0 0 0-9-9v2a7 7 0 0 1 7 7h2z"/><path d="M4 13h16v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-3z"/></svg>',
  'Antojitos': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%230ea5e9"><path d="M12 3C7 3 3 7 3 12h18c0-5-4-9-9-9z"/><rect x="5" y="12" width="14" height="7" rx="2" fill="%23038bce"/></svg>',
  'Soup/Salad': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%2334d399"><path d="M3 10h18v2a7 7 0 0 1-7 7H10a7 7 0 0 1-7-7v-2z"/><path d="M7 7h10" stroke="%230f766e" stroke-width="2"/></svg>',
  'Side': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%2394a3b8"><circle cx="12" cy="12" r="8"/></svg>',
  'Fajitas': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%23ef4444"><rect x="4" y="9" width="16" height="8" rx="3"/><path d="M6 9V7m12 2V7" stroke="%23b91c1c" stroke-width="2"/></svg>',
  'Quesadillas': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%23f97316"><path d="M4 14a8 8 0 0 1 16 0H4z"/></svg>',
  'Enchiladas': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%238b5cf6"><rect x="5" y="8" width="14" height="8" rx="2"/></svg>',
  'Dessert': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%23e879f9"><path d="M12 3l3 6H9l3-6z"/><rect x="6" y="9" width="12" height="6" rx="3"/></svg>',
  'Entree': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%230ea5e9"><rect x="4" y="8" width="16" height="8" rx="2"/></svg>',
  'Drink': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%2300bcd4"><path d="M5 4h14l-2 5H7L5 4z"/><path d="M8 9h8v7a4 4 0 0 1-4 4 4 4 0 0 1-4-4V9z"/></svg>'
};

function thumbFor(item){
  const name = item.name;
  if (imageMap && imageMap[name]) return imageMap[name];
  const cat = (item.category||'').toString();
  if (ICONS[cat]) return ICONS[cat];
  return ICONS['Side'];
}

function safeURL(p){
  if(!p) return p;
  if (p.startsWith('data:')) return p;
  return p.split('/').map(encodeURIComponent).join('/');
}

function findHero(rec){
  const items = rec.items || [];
  for(const it of items){
    if ((it.category||'').toLowerCase()==='drink') continue;
    const p = imageMap[it.name];
    if (p) return p;
  }
  // fallback: first item icon
  if (items[0]) return thumbFor(items[0]);
  return null;
}

function renderResults(payload, data){
  results.innerHTML = '';
  if(!data || !Array.isArray(data.recommendations) || data.recommendations.length===0){
    const d = el('div','muted small'); d.textContent = 'No combos generated.'; results.appendChild(d); return;
  }
  data.recommendations.forEach((rec, idx)=>{
    const card = el('div','rec-card');

    const hero = findHero(rec);
    if (hero) {
      const img = el('img','rec-img');
      img.src = safeURL(hero); img.alt = rec.title || 'AI Combo';
      card.appendChild(img);
    }

    const title = el('h4'); title.textContent = rec.title || 'AI Combo'; card.appendChild(title);
    if(rec.tags){
      const tags = el('div');
      const engine = rec.tags.includes('generated') ? 'AI' : (rec.tags.includes('rule-based') ? 'Rule' : 'AI');
      const eng = el('span','tag ' + (engine==='AI'?'ai':engine==='Rule'?'rule':'generated')); eng.textContent = engine; tags.appendChild(eng);
      rec.tags.forEach(t=>{ const b=el('span','tag'); b.textContent = t; tags.appendChild(b); });
      card.appendChild(tags);
    }
    const list = el('div');
    (rec.items||[]).forEach(item=>{
      const row = el('div','item-row');
      const img = el('img','item-thumb'); img.src = safeURL(thumbFor(item)); img.alt = `${item.category}: ${item.name}`;
      const text = el('div','item-text');
      const name = el('div','item-name'); name.textContent = `${item.category}: ${item.name}`;
      text.appendChild(name);
      if (item.ingredients){
        const ing = el('div','item-ing'); ing.textContent = item.ingredients; text.appendChild(ing);
      }
      if (item.note){
        const note = el('div','item-note'); note.textContent = item.note; text.appendChild(note);
      }
      row.appendChild(img); row.appendChild(text);
      list.appendChild(row);
    });
    card.appendChild(list);

    const p = el('div','small');
    p.textContent = `Est. per person: ${rec.estimatePerPerson ?? '—'} | Est. total: ${rec.estimateTotal ?? '—'}`;
    card.appendChild(p);
    const r = el('div','muted small'); r.textContent = rec.why || rec.rationale || ''; card.appendChild(r);
    card.style.animationDelay = `${idx*60}ms`;
    results.appendChild(card);
  });
}

function burstConfetti(){
  if(!confettiRoot) return;
  const N=18;
  for(let i=0;i<N;i++){
    const piece = el('div');
    const s = 6 + Math.random()*6;
    const x = 10 + Math.random()*80;
    const dur = 700 + Math.random()*700;
    piece.style.cssText = `position:absolute;top:-10px;left:${x}%;width:${s}px;height:${s}px;border-radius:2px;background:hsl(${Math.random()*360},80%,60%);opacity:.9;transform:translateY(0);`;
    confettiRoot.appendChild(piece);
    piece.animate([{transform:'translateY(0)'},{transform:`translateY(${window.innerHeight+40}px) rotate(${Math.random()*360}deg)`}],{duration:dur,easing:'cubic-bezier(.2,.7,.2,1)'}).finished.then(()=>piece.remove());
  }
}

async function generate(payload){
  if(generating) return;
  generating = true;
  regen.disabled = true;
  renderSkeleton();
  let resp, txt;
  const start = Date.now();
  try{
    resp = await fetch('/.netlify/functions/combo',{
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
  } catch(e){
    results.innerHTML = '<div class="muted small">Network error. Please try again.</div>';
    generating = false; regen.disabled = false; return;
  }
  const min = 400 - (Date.now() - start); if (min > 0) await new Promise(r=>setTimeout(r,min));
  if(!resp.ok){
    txt = await resp.text();
    results.innerHTML = `<div class="muted small">Error: ${resp.status} ${txt}</div>`;
    generating = false; regen.disabled = false; return;
  }
  const data = await resp.json();
  renderResults(payload, data);
  showToast('Fresh combos are ready');
  burstConfetti();
  generating = false;
  regen.disabled = false;
}

const dietSel = form ? form.querySelector('select[name="diet"]') : null;
if(dietSel){ dietSel.title = 'Hold Ctrl/Cmd to select multiple'; }

form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(form);
  const payload = {
    meal: fd.get('meal'),
    portionPref: fd.get('portionPref'),
    partySize: Number(fd.get('partySize'))||1,
    diet: fd.getAll('diet'),
    spice: fd.get('spice'),
    alcohol: fd.get('alcohol'),
    _variant: variant
  };
  variant = (variant + 1) % 100;
  lastPayload = payload;
  generate(payload);
});

regen.addEventListener('click', ()=>{
  if(!lastPayload) return;
  const payload = { ...lastPayload, _variant: variant };
  variant = (variant + 1) % 100;
  generate(payload);
})

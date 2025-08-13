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
regen.disabled = true;

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

function renderResults(payload, data){
  results.innerHTML = '';
  if(!data || !Array.isArray(data.recommendations) || data.recommendations.length===0){
    const d = el('div','muted small'); d.textContent = 'No combos generated.'; results.appendChild(d); return;
  }
  data.recommendations.forEach((rec, idx)=>{
    const card = el('div','rec-card');
    const title = el('h4'); title.textContent = rec.title || 'Chef-picked Combo'; card.appendChild(title);
    if(rec.tags){
      const tags = el('div');
      const engine = rec.tags.includes('generated') ? 'AI' : (rec.tags.includes('rule-based') ? 'Rule' : 'Chef');
      const eng = el('span','tag ' + (engine==='AI'?'ai':engine==='Rule'?'rule':'generated')); eng.textContent = engine; tags.appendChild(eng);
      rec.tags.forEach(t=>{ const b=el('span','tag'); b.textContent = t; tags.appendChild(b); });
      card.appendChild(tags);
    }
    const ul = el('ul');
    (rec.items||[]).forEach(item=>{
      const li = el('li');
      li.textContent = `${item.category}: ${item.name}` + (item.note?` — ${item.note}`:'');
      ul.appendChild(li);
    });
    card.appendChild(ul);
    const p = el('div','small');
    p.textContent = `Est. per person: ${rec.estimatePerPerson ?? '—'} | Est. total: ${rec.estimateTotal ?? '—'}`;
    card.appendChild(p);
    const r = el('div','muted small'); r.textContent = rec.rationale || ''; card.appendChild(r);
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
    dayOfWeek: fd.get('dayOfWeek'),
    timeSlot: fd.get('timeSlot'),
    partySize: Number(fd.get('partySize'))||1,
    budget: fd.get('budget')? Number(fd.get('budget')): null,
    diet: fd.getAll('diet'),
    spice: fd.get('spice'),
    alcohol: fd.get('alcohol')
  };
  lastPayload = payload;
  generate(payload);
});

regen.addEventListener('click', ()=>{ if(lastPayload) generate(lastPayload); })

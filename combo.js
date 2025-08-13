function qs(sel){return document.querySelector(sel)}
function el(tag, cls){const e=document.createElement(tag); if(cls) e.className=cls; return e}

const form = qs('#combo-form');
const results = qs('#results');
const regen = qs('#regen');
let lastPayload = null;
regen.disabled = true;
const dietSel = form ? form.querySelector('select[name="diet"]') : null;
if(dietSel){ dietSel.title = 'Hold Ctrl/Cmd to select multiple'; }

function renderResults(payload, data){
  results.innerHTML = '';
  if(!data || !Array.isArray(data.recommendations) || data.recommendations.length===0){
    const d = el('div','muted small'); d.textContent = 'No combos generated.'; results.appendChild(d); return;
  }
  data.recommendations.forEach(rec=>{
    const card = el('div','rec-card');
    const title = el('h4'); title.textContent = rec.title; card.appendChild(title);
    if(rec.tags){
      const tags = el('div');
      // Engine badge
      const engine = rec.tags.includes('generated') ? 'Chef-gen' : (rec.tags.includes('rule-based') ? 'Rule-based' : 'AI');
      const eng = el('span','tag'); eng.textContent = engine; tags.appendChild(eng);
      rec.tags.forEach(t=>{ const b=el('span','tag'); b.textContent = t; tags.appendChild(b); });
      card.appendChild(tags);
    }
    const ul = el('ul');
    rec.items.forEach(item=>{ const li = el('li'); li.textContent = `${item.category}: ${item.name}` + (item.note?` — ${item.note}`:''); ul.appendChild(li); });
    card.appendChild(ul);
    const p = el('div','small');
    p.textContent = `Est. per person: ${rec.estimatePerPerson ?? '—'} | Est. total: ${rec.estimateTotal ?? '—'}`;
    card.appendChild(p);
    const r = el('div','muted small'); r.textContent = rec.rationale || ''; card.appendChild(r);
    results.appendChild(card);
  })
}

async function generate(payload){
  const start = Date.now();
  regen.disabled = true; // prevent overlap
  results.innerHTML = '<div class="muted small">Generating...</div>';
  let resp;
  try {
  resp = await fetch('/.netlify/functions/combo',{
  method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });
  } catch (e) {
    results.innerHTML = '<div class="muted small">Network error. Please try again.</div>';
  regen.disabled = false;
  return;
  }
const min = 400 - (Date.now() - start);
if (min > 0) await new Promise(r=>setTimeout(r,min));
if(!resp.ok){
const txt = await resp.text();
results.innerHTML = `<div class="muted small">Error: ${resp.status} ${txt}</div>`; 
regen.disabled = false;
return;
}
const data = await resp.json();
renderResults(payload, data);
regen.disabled = false;
}

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
  regen.disabled = false;
  generate(payload);
});

regen.addEventListener('click', ()=>{ if(lastPayload) generate(lastPayload); })

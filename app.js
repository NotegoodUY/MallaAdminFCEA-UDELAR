/* Notegood · Malla Administración (FCEA) – v1
   - Estética y tono como Medicina
   - LocalStorage (sin login)
   - Previas, notas, calificaciones, cursando
   - Filtros por año, semestre, área, tipo, estado, búsqueda
*/

(function () {
  "use strict";

  // ---------- Config ----------
  const DATA_URL = "materias_admin.json"; // en la raíz del repo
  const STATE_KEY = "malla-admin-notegood-v1";
  const NOTES_KEY = "malla-admin-notes-v1";
  const GRADES_KEY = "malla-admin-grades-v1";

  // ---------- Estado ----------
  const state = {
    aprobadas: new Set(),
    cursando: new Set(),
    data: { areas: [], materias: [] },
  };
  const notas  = load(NOTES_KEY, {});
  const grades = load(GRADES_KEY, {});

  loadState();

  // ---------- Utils ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const areaName = (id) => state.data.areas.find(a=>a.id===id)?.nombre || id || "";

  function load(k, fallback){ try{ return JSON.parse(localStorage.getItem(k) || JSON.stringify(fallback)); } catch { return fallback; } }
  function save(k, v){ localStorage.setItem(k, JSON.stringify(v)); }

  function saveState() {
    save(STATE_KEY, {
      aprobadas: [...state.aprobadas],
      cursando:  [...state.cursando],
    });
    save(NOTES_KEY, notas);
    save(GRADES_KEY, grades);
  }

  function loadState() {
    const raw = load(STATE_KEY, null);
    if (!raw) return;
    state.aprobadas = new Set(raw.aprobadas || []);
    state.cursando  = new Set(raw.cursando  || []);
  }

  // Previas: todas deben estar aprobadas
  function canTake(m) {
    const prev = Array.isArray(m.previas) ? m.previas : [];
    return prev.every(code => state.aprobadas.has(String(code).trim()));
  }

  function getEstado(cod) {
    if (state.aprobadas.has(cod)) return "aprobada";
    if (state.cursando.has(cod)) return "cursando";
    return canTake(state.data.materias.find(x=>x.codigo===cod)) ? "disponible" : "bloqueada";
  }

  // ---------- Render principal ----------
  async function boot() {
    try{
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`No se pudo cargar ${DATA_URL}`);
      const data = await res.json();
      state.data = data;

      buildFilters();
      bindTopBar();
      render();
      welcomeOnce();
    }catch(e){
      console.error(e);
      $("#list").innerHTML = `<div style="padding:1rem;background:#fee2e2;border:1px solid #fecaca;border-radius:12px;max-width:960px;margin:1rem auto;font-weight:600;color:#7f1d1d">
        Ups, no pude cargar la malla. Revisá que <code>${DATA_URL}</code> exista en la raíz.
      </div>`;
    }
  }

  function bindTopBar(){
    $("#resetBtn").addEventListener("click", ()=>{
      if (!confirm("¿Borrar todo tu progreso? Esta acción no se puede deshacer.")) return;
      state.aprobadas.clear(); state.cursando.clear();
      Object.keys(notas).forEach(k=>delete notas[k]);
      Object.keys(grades).forEach(k=>delete grades[k]);
      saveState(); render();
    });

    // Filtros
    $("#q").addEventListener("input", debounce(render, 150));
    ["f-estado","f-anio","f-sem","f-area","f-tipo"].forEach(id=>{
      const el = $("#"+id);
      el && el.addEventListener("change", render);
    });
  }

  function buildFilters(){
    // Llenar combos de año/semestre/área una vez
    const años = [...new Set(state.data.materias.map(m=>m.anio))].sort((a,b)=>a-b);
    const sems = [...new Set(state.data.materias.map(m=>m.semestre))].sort((a,b)=>a-b);

    const $anio=$("#f-anio"), $sem=$("#f-sem"), $area=$("#f-area");
    if($anio) años.forEach(v=>$anio.insertAdjacentHTML("beforeend", `<option value="${v}">${v}°</option>`));
    if($sem)  sems.forEach(v=>$sem.insertAdjacentHTML("beforeend", `<option value="${v}">${v}°</option>`));
    if($area) state.data.areas.forEach(a=>$area.insertAdjacentHTML("beforeend", `<option value="${a.id}">${a.nombre}</option>`));
  }

  function matchesFilters(m){
    const q   = ($("#q")?.value || "").trim().toLowerCase();
    const fa  = $("#f-anio")?.value || "";
    const fs  = $("#f-sem")?.value || "";
    const far = $("#f-area")?.value || "";
    const ft  = $("#f-tipo")?.value || "";
    const fe  = $("#f-estado")?.value || "";

    if (q && !(String(m.nombre).toLowerCase().includes(q) || String(m.codigo).toLowerCase().includes(q))) return false;
    if (fa && String(m.anio) !== fa) return false;
    if (fs && String(m.semestre) !== fs) return false;
    if (far && String(m.area) !== far) return false;
    if (ft && String(m.tipo) !== ft) return false;
    if (fe && getEstado(m.codigo) !== fe) return false;
    return true;
  }

  function render(){
    const list = $("#list");
    list.innerHTML = "";

    // orden por año, semestre, código
    const items = state.data.materias
      .slice()
      .sort((a,b)=> a.anio-b.anio || a.semestre-b.semestre || String(a.codigo).localeCompare(b.codigo))
      .filter(matchesFilters);

    // Agrupar por año/semestre
    const key = (m)=> `${m.anio}º año · ${m.semestre}º semestre`;
    const groups = {};
    for (const m of items) {
      const k = key(m);
      (groups[k] ||= []).push(m);
    }

    Object.entries(groups).forEach(([title, arr])=>{
      const card = document.createElement("section");
      card.className = "card";
      card.style.padding = "12px";
      card.style.marginBottom = "12px";
      card.innerHTML = `<h3 style="margin:6px 6px 8px">${title}</h3>`;
      const wrap = document.createElement("div");
      wrap.className = "grid-container";
      wrap.style.gap = "8px";

      arr.forEach(m=>{
        const est = getEstado(m.codigo);
        const isOk = est==="aprobada";
        const isCur= est==="cursando";
        const can  = est==="disponible";

        const el = document.createElement("article");
        el.className = "card";
        el.style.padding = "10px";
        el.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <div>
              <div style="font-weight:700">${m.nombre}</div>
              <div class="muted" style="font-size:.9rem">${m.codigo} · ${m.creditos||0} créditos · ${areaName(m.area)}</div>
              ${m.previas?.length ? `<div class="muted" style="margin-top:6px;font-size:.85rem">Previas: ${m.previas.join(", ")}</div>` : ""}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <button class="btn-chip btn-apr" data-cod="${m.codigo}" ${!can && !isOk ? "disabled" : ""}>${isOk?"✓ Aprobada":"Marcar aprobada"}</button>
              <button class="btn-chip btn-cur" data-cod="${m.codigo}" ${(!can && !isCur && !isOk) ? "disabled" : ""}>${isCur?"⏳ Cursando":"Marcar cursando"}</button>
              <button class="btn-chip btn-notes" data-cod="${m.codigo}" data-name="${m.nombre}">✏️</button>
            </div>
          </div>
          <div class="tag-row" style="margin-top:6px">
            ${badgeFor(est)}
            ${gradeBadge(m.codigo)}
            ${noteBadge(m.codigo)}
          </div>
        `;
        wrap.appendChild(el);
      });

      card.appendChild(wrap);
      list.appendChild(card);
    });

    // KPIs y barra
    updateProgress();

    // Listeners
    $$(".btn-apr").forEach(b=> b.addEventListener("click", onToggleApr));
    $$(".btn-cur").forEach(b=> b.addEventListener("click", onToggleCur));
    $$(".btn-notes").forEach(b=> b.addEventListener("click", onOpenNotes));
  }

  function badgeFor(est){
    const map = {
      aprobada:  '<span class="badge ok">Aprobada</span>',
      disponible:'<span class="badge dis">Disponible</span>',
      bloqueada: '<span class="badge pen">Bloqueada</span>',
      cursando:  '<span class="badge cur">Cursando</span>',
    };
    return map[est] || "";
  }

  function gradeBadge(cod){
    const g = grades[cod];
    return g!=null ? `<span class="badge grade">Nota: ${g}</span>` : "";
  }
  function noteBadge(cod){
    const t = (notas[cod]||"").trim();
    return t ? `<span class="badge note" title="${escapeHtml(t)}">Nota guardada</span>` : "";
  }

  function onToggleApr(e){
    const cod = e.currentTarget.dataset.cod;
    if (state.aprobadas.has(cod)) {
      state.aprobadas.delete(cod);
    } else {
      state.aprobadas.add(cod);
      state.cursando.delete(cod);
      toast(randomPhrase(cod), 1600);
    }
    saveState(); render(); maybeConfetti();
  }

  function onToggleCur(e){
    const cod = e.currentTarget.dataset.cod;
    if (state.cursando.has(cod)) {
      state.cursando.delete(cod);
    } else {
      // Solo si está disponible o aprobada
      const est = getEstado(cod);
      if (est==="disponible" || est==="aprobada") state.cursando.add(cod);
    }
    saveState(); render();
  }

  // Notas & calificaciones
  const dlg = $("#noteModal"), noteTitle=$("#noteTitle"), noteText=$("#noteText"), gradeInput=$("#gradeInput");
  $("#saveNoteBtn").addEventListener("click", (e)=>{
    e.preventDefault();
    const cod = dlg.dataset.cod;
    notas[cod] = noteText.value || "";
    const g = gradeInput.value.trim();
    if (g!=="" && !isNaN(+g)) grades[cod]= +g; else delete grades[cod];
    saveState();
    dlg.close();
    render();
  });

  function onOpenNotes(e){
    const cod = e.currentTarget.dataset.cod;
    const name = e.currentTarget.dataset.name || cod;
    dlg.dataset.cod = cod;
    noteTitle.textContent = `Notas – ${name}`;
    noteText.value = notas[cod] || "";
    gradeInput.value = grades[cod] ?? "";
    dlg.showModal();
  }

  // Progreso
  function updateProgress(){
    const totCred = sumBy(state.data.materias, m=>+m.creditos||0);
    const okCred  = sumBy(state.data.materias.filter(m=>state.aprobadas.has(m.codigo)), m=>+m.creditos||0);
    const pct = totCred ? Math.round((okCred/totCred)*100) : 0;

    $("#progressBar").style.width = pct + "%";
    $("#progressPct").textContent = pct + "%";
    $("#progressMsg").textContent = progressCopy(pct);
    $("#progressText").textContent = `${countOk()} / ${state.data.materias.length} materias aprobadas · ${pct}%`;
  }

  function countOk(){ return state.data.materias.reduce((s,m)=> s + (state.aprobadas.has(m.codigo)?1:0), 0); }
  function sumBy(arr, fn){ return arr.reduce((s,x)=> s + (fn(x)||0), 0); }

  // Frases Notegood
  const FRASES = [
    "¡Bien ahí! {m} aprobada. Tu yo del futuro te aplaude 👏",
    "{m} ✅ — organización + constancia = resultados.",
    "¡Seguimos! {m} fuera de la lista 💪",
    "Check en {m}. Paso a paso se llega lejos 🚶",
    "Tu curva de aprendizaje sube con {m} 📈",
    "Lo lograste: {m} ✔️ — ¡a hidratarse y seguir! 💧",
    "Notegood vibes: {m} superada con éxito ✨"
  ];
  let pool=[...FRASES];
  function randomPhrase(cod){
    const name = state.data.materias.find(x=>x.codigo===cod)?.nombre || cod;
    if (!pool.length) pool=[...FRASES];
    const i = Math.floor(Math.random()*pool.length);
    const f = pool.splice(i,1)[0];
    return f.replace("{m}", name);
  }

  function progressCopy(pct){
    if (pct === 100) return "¡Plan completo! Orgullo total ✨";
    if (pct >= 90)  return "Últimos detalles y a festejar 🎉";
    if (pct >= 75)  return "Último sprint, ya casi 💨";
    if (pct >= 50)  return "Mitad de camino, paso firme 💪";
    if (pct >= 25)  return "Buen envión, seguí así 🚀";
    if (pct > 0)    return "Primeros checks, ¡bien ahí! ✅";
    return "Arranquemos tranqui, paso a paso 👟";
  }

  // Confeti simple al 100%
  let confettiShown=false;
  function maybeConfetti(){
    const txt = $("#progressText").textContent || "";
    if (confettiShown) return;
    if (txt.includes("100%")) {
      confettiShown = true;
      confetti();
    }
  }
  function confetti(){
    // confeti muy simple, liviano
    const n=120;
    for(let i=0;i<n;i++){
      const s=document.createElement('div');
      s.style.position='fixed';
      s.style.left=(Math.random()*100)+'vw';
      s.style.top='-10px';
      s.style.width=s.style.height=(8+Math.random()*6)+'px';
      s.style.background='hsl('+Math.floor(Math.random()*360)+',90%,60%)';
      s.style.opacity='0.9';
      s.style.borderRadius='2px';
      s.style.transform=`rotate(${Math.random()*360}deg)`;
      s.style.zIndex='9999';
      document.body.appendChild(s);
      const dur= 3000 + Math.random()*2500;
      s.animate([{transform:s.style.transform, top:'-10px'},{transform:`rotate(${Math.random()*360}deg)`, top:'110vh'}],{duration:dur, easing:'ease-in'});
      setTimeout(()=>s.remove(), dur);
    }
  }

  // Helpers
  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function toast(msg, ms=1500){
    const el=document.createElement('div');
    el.textContent=msg;
    el.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem .8rem;border-radius:12px;border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:9999;font-weight:600';
    document.body.appendChild(el);
    setTimeout(()=> el.remove(), ms);
  }

  // Bienvenida una sola vez
  function welcomeOnce(){
    const k='welcome-admin-seen';
    if (localStorage.getItem(k)) return;
    toast("Bienvenida/o a tu Malla de Administración ✨ Marca tus materias y mira cómo se desbloquea lo que sigue.", 3200);
    localStorage.setItem(k, '1');
  }

  // Go!
  boot();
})();

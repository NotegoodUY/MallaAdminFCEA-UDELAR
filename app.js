/* Notegood · Malla Administración
   - Filtros: texto, estado, año, semestre, tipo, área
   - Opcionales: solo se muestran OP seleccionadas
   - Config 1º semestre:
       (1) E10 vs E11 exclusivas (Micro vs Interacciones)
       (2) Cálculo I: MC10 o 114A+128A; 114A+128A satisface previa de MC10
   - Persistencia: aprobadas, cursando, opcionalesSel y config en localStorage
*/

(function () {
  "use strict";

  const DATA_URL = "materias_admin.json";
  const LS_STATE  = "malla-admin-state-v3";     // bump versión por nueva config
  const LS_CONFIG = "malla-admin-config-v1";
  const LS_WELCOME = "malla-admin-welcome";

  const state = {
    aprobadas: new Set(),
    cursando: new Set(),
    opcionalesSel: new Set(), // códigos OP visibles
    config: { microChoice: "auto", calculoMode: "auto" }, // "auto"|"E10"|"E11" ; "auto"|"MC10"|"PARTES"
    data: { materias: [] },
    byCodigo: new Map(),
    filters: { text:"", estado:"", year:"", sem:"", tipo:"", area:"" }
  };

  // DOM helpers
  const $ = (s)=>document.querySelector(s);
  const container = $("#malla-container");

  // Toolbar
  const elText=$("#filterText"), elEstado=$("#filterEstado"), elYear=$("#filterYear"),
        elSem=$("#filterSem"), elTipo=$("#filterTipo"), elArea=$("#filterArea");
  const btnClear=$("#btnClearFilters"), btnReset=$("#btnReset"),
        btnOpc=$("#btnOpcionales"), btnConfig=$("#btnConfig");

  // Modal OPCIONALES
  const opModal=$("#opModal"), opClose=$("#opClose"), opSave=$("#opSave"), opClear=$("#opClear"),
        opSearch=$("#opSearch"), opList=$("#opList");

  // Modal CONFIG
  const cfgModal=$("#cfgModal"), cfgClose=$("#cfgClose"), cfgSave=$("#cfgSave"), cfgResetChoice=$("#cfgResetChoice");

  // Toast
  function toast(msg, ms=1700){
    const el=document.createElement("div");
    el.textContent=msg;
    el.style.cssText="position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem .8rem;border-radius:12px;border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:9999;font-weight:600";
    document.body.appendChild(el); setTimeout(()=>el.remove(),ms);
  }

  // Persistencia estado
  function saveState(){
    const payload = {
      aprobadas:[...state.aprobadas],
      cursando:[...state.cursando],
      opcionalesSel:[...state.opcionalesSel]
    };
    localStorage.setItem(LS_STATE, JSON.stringify(payload));
  }
  function loadState(){
    try{
      const raw=localStorage.getItem(LS_STATE);
      if(!raw) return;
      const o=JSON.parse(raw);
      state.aprobadas = new Set(o.aprobadas||[]);
      state.cursando  = new Set(o.cursando ||[]);
      state.opcionalesSel = new Set(o.opcionalesSel ||[]);
    }catch{}
  }

  // Persistencia config
  function saveConfig(){ localStorage.setItem(LS_CONFIG, JSON.stringify(state.config)); }
  function loadConfig(){
    try{
      const raw=localStorage.getItem(LS_CONFIG);
      if(!raw) return;
      const c=JSON.parse(raw);
      state.config = {
        microChoice: ["auto","E10","E11"].includes(c.microChoice)?c.microChoice:"auto",
        calculoMode: ["auto","MC10","PARTES"].includes(c.calculoMode)?c.calculoMode:"auto"
      };
    }catch{}
  }

  function resetProgress(){
    state.aprobadas.clear();
    state.cursando.clear();
    saveState(); render(); updateProgress();
    toast("Se reinició tu progreso.");
  }

  // Normalización JSON
  function normalizeRoot(data){
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.materias)) return data.materias;
    if (Array.isArray(data?.items)) return data.items;
    if (typeof data==="object") return Object.values(data);
    return [];
  }
  function normalizeOne(r){
    const codigo=String(r.codigo ?? r.cod ?? r.id ?? "");
    const nombre=String(r.nombre ?? r.name ?? "");
    const creditos=Number.parseInt(r.creditos ?? r.credits ?? 0,10) || 0;
    const area=String(r.area ?? "").toUpperCase();
    const anio=Number.parseInt(r.anio ?? r.año ?? r.year ?? 0,10) || 0;
    const semestre=Number.parseInt(r.semestre ?? r.sem ?? r.semester ?? 0,10) || 0;
    const tipo=String(r.tipo ?? "").toUpperCase(); // OB/OP
    let prev=r.previas ?? r.correlativas ?? [];
    if (typeof prev==="string") prev=prev.split(",").map(s=>s.trim()).filter(Boolean);
    if (!Array.isArray(prev)) prev=[];
    return { codigo,nombre,creditos,area,anio,semestre,tipo,previas:prev.map(String) };
  }

  // === Reglas especiales 1º semestre ===
  const MICRO_PAIR = ["E10","E11"];
  const CALC_ONE   = "MC10";
  const CALC_PARTS = ["114A","128A"];

  // Satisfacción de previas con equivalencias:
  function isSatisfied(code){
    // si está aprobada directa
    if (state.aprobadas.has(code)) return true;
    // equivalencia: MC10 ≡ (114A + 128A)
    if (code === CALC_ONE){
      const a = state.aprobadas.has(CALC_PARTS[0]);
      const b = state.aprobadas.has(CALC_PARTS[1]);
      return a && b;
    }
    return false;
  }

  function canTake(m){
    const prev=Array.isArray(m.previas)?m.previas:[];
    return prev.every(c => isSatisfied(String(c)));
  }

  // Estados
  function estadoDe(codigo){
    if (state.aprobadas.has(codigo)) return "aprobada";
    if (state.cursando.has(codigo))  return "cursando";
    const m = state.byCodigo.get(codigo);
    return canTake(m) ? "disponible" : "bloqueada";
  }
  const EMOJI = { aprobada:"✅", cursando:"📚", disponible:"🔓", bloqueada:"🔒" };
  function labelEstado(est){
    return `${EMOJI[est]||""} ${ est==="aprobada"?"Aprobada": est==="cursando"?"Cursando": est==="disponible"?"Disponible":"Bloqueada" }`;
  }

  // Visibilidad según configuración + opcionales seleccionadas
  function applyConfigVisibility(m){
    // Micro/Interacciones
    if (MICRO_PAIR.includes(m.codigo)){
      if (state.config.microChoice === "E10") return m.codigo === "E10";
      if (state.config.microChoice === "E11") return m.codigo === "E11";
      // auto: dejar ambas visibles
    }
    // Cálculo I
    if ([CALC_ONE, ...CALC_PARTS].includes(m.codigo)){
      if (state.config.calculoMode === "MC10")   return m.codigo === CALC_ONE;
      if (state.config.calculoMode === "PARTES") return CALC_PARTS.includes(m.codigo);
      // auto: dejar todas visibles
    }
    return true;
  }

  // Filtros (texto/estado/año/sem/tipo/área)
  function passFilters(m){
    const f=state.filters;
    if (!applyConfigVisibility(m)) return false;

    // opcionales: solo mostrar si están seleccionadas
    if (m.tipo === "OP" && !state.opcionalesSel.has(m.codigo)) return false;

    if (f.text){
      const t=f.text.toLowerCase();
      if (!(m.nombre.toLowerCase().includes(t) || String(m.codigo).toLowerCase().includes(t))) return false;
    }
    if (f.estado && estadoDe(m.codigo)!==f.estado) return false;
    if (f.year && String(m.anio)!==String(f.year)) return false;
    if (f.sem && String(m.semestre)!==String(f.sem)) return false;
    if (f.tipo && (m.tipo||"").toUpperCase()!==f.tipo) return false;
    if (f.area && (m.area||"").toUpperCase()!==f.area) return false;
    return true;
  }

  function attachFilters(){
    elText && elText.addEventListener("input", ()=>{ state.filters.text=elText.value.trim(); render(); updateProgress(); });
    elEstado && elEstado.addEventListener("change", ()=>{ state.filters.estado=elEstado.value; render(); updateProgress(); });
    elYear && elYear.addEventListener("change", ()=>{ state.filters.year=elYear.value; render(); updateProgress(); });
    elSem && elSem.addEventListener("change", ()=>{ state.filters.sem=elSem.value; render(); updateProgress(); });
    elTipo && elTipo.addEventListener("change", ()=>{ state.filters.tipo=elTipo.value; render(); updateProgress(); });
    elArea && elArea.addEventListener("change", ()=>{ state.filters.area=elArea.value; render(); updateProgress(); });

    btnClear && btnClear.addEventListener("click", ()=>{
      state.filters={text:"",estado:"",year:"",sem:"",tipo:"",area:""};
      if (elText) elText.value="";
      [elEstado,elYear,elSem,elTipo,elArea].forEach(el=>{ if(el) el.value=""; });
      render(); updateProgress(); toast("Filtros limpiados.");
    });

    btnReset && btnReset.addEventListener("click", ()=>{
      if (confirm("¿Seguro que quieres reiniciar TODO tu progreso?")) resetProgress();
    });
  }

  // Exclusividad en clics (E10/E11 y MC10 vs partes)
  function violatesExclusivity(code){
    // E10 vs E11
    if (code==="E10" && state.aprobadas.has("E11")) return "No puedes aprobar ambas: ya aprobaste E11.";
    if (code==="E11" && state.aprobadas.has("E10")) return "No puedes aprobar ambas: ya aprobaste E10.";

    // MC10 vs partes (según configuración mostramos/ocultamos, pero adicionalmente bloqueamos)
    const hasMC10 = state.aprobadas.has(CALC_ONE);
    const has114A = state.aprobadas.has(CALC_PARTS[0]);
    const has128A = state.aprobadas.has(CALC_PARTS[1]);

    if (code===CALC_ONE && (has114A || has128A)) return "Elegiste cursar Cálculo I en partes. No puedes aprobar MC10 directo.";
    if ((code===CALC_PARTS[0] || code===CALC_PARTS[1]) && hasMC10) return "Ya aprobaste Cálculo I directo (MC10). No puedes cursarlo en partes.";

    return "";
  }

  // OPCIONALES modal
  function openOpcionales(){
    if (!opModal) return;
    opModal.hidden=false; document.body.style.overflow="hidden";
    buildOpcionalesList("");
  }
  function closeOpcionales(){
    opModal.hidden=true; document.body.style.overflow="";
  }
  function buildOpcionalesList(q){
    const allOP = state.data.materias.filter(m=>m.tipo==="OP");
    const term = (q||"").toLowerCase();
    const list = term ? allOP.filter(m => m.nombre.toLowerCase().includes(term)||String(m.codigo).toLowerCase().includes(term)) : allOP;

    opList.innerHTML="";
    if (!list.length){
      const empty=document.createElement("div");
      empty.className="muted"; empty.style.padding="8px";
      empty.textContent="No hay opcionales que coincidan.";
      opList.appendChild(empty); return;
    }
    for (const m of list){
      const row=document.createElement("label");
      row.className="op-row";
      const checked = state.opcionalesSel.has(m.codigo);
      row.innerHTML=`
        <input type="checkbox" data-cod="${m.codigo}" ${checked?"checked":""}/>
        <span class="op-name">${m.nombre}</span>
        <span class="op-meta">${m.codigo} · ${m.creditos||0} cr.</span>
      `;
      opList.appendChild(row);
    }
  }
  function bindOpcionalesModal(){
    btnOpc && btnOpc.addEventListener("click", openOpcionales);
    opClose && opClose.addEventListener("click", closeOpcionales);
    opSearch && opSearch.addEventListener("input", ()=> buildOpcionalesList(opSearch.value));
    opClear && opClear.addEventListener("click", ()=>{
      state.opcionalesSel.clear(); saveState(); buildOpcionalesList(opSearch.value); render(); updateProgress();
    });
    opSave && opSave.addEventListener("click", ()=>{
      const checks = opList.querySelectorAll("input[type=checkbox][data-cod]");
      const next = new Set();
      checks.forEach(ch=>{ if(ch.checked) next.add(ch.getAttribute("data-cod")); });
      state.opcionalesSel = next; saveState(); render(); updateProgress(); closeOpcionales();
      toast("Selección de opcionales guardada.");
    });
    const backdrop = opModal?.querySelector(".op-backdrop");
    backdrop && backdrop.addEventListener("click", closeOpcionales);
  }

  // CONFIG modal
  function openConfig(){
    if (!cfgModal) return;
    cfgModal.hidden=false; document.body.style.overflow="hidden";

    // set radios actuales
    const microRadios = document.querySelectorAll('input[name="microChoice"]');
    microRadios.forEach(r => r.checked = (r.value === state.config.microChoice));

    const calcRadios = document.querySelectorAll('input[name="calculoMode"]');
    calcRadios.forEach(r => r.checked = (r.value === state.config.calculoMode));
  }
  function closeConfig(){ cfgModal.hidden=true; document.body.style.overflow=""; }

  function applyConfigCleanup(){
    // Si fijo E10, desmarcar E11 (y viceversa)
    if (state.config.microChoice === "E10") { state.aprobadas.delete("E11"); state.cursando.delete("E11"); }
    if (state.config.microChoice === "E11") { state.aprobadas.delete("E10"); state.cursando.delete("E10"); }
    // Si fijo MC10, desmarcar 114A/128A; si PARTES, desmarcar MC10
    if (state.config.calculoMode === "MC10") {
      state.aprobadas.delete("114A"); state.cursando.delete("114A");
      state.aprobadas.delete("128A"); state.cursando.delete("128A");
    }
    if (state.config.calculoMode === "PARTES") {
      state.aprobadas.delete("MC10"); state.cursando.delete("MC10");
    }
  }

  function bindConfigModal(){
    btnConfig && btnConfig.addEventListener("click", openConfig);
    cfgClose && cfgClose.addEventListener("click", closeConfig);
    const backdrop = cfgModal?.querySelector(".op-backdrop");
    backdrop && backdrop.addEventListener("click", closeConfig);

    cfgResetChoice && cfgResetChoice.addEventListener("click", ()=>{
      state.config = { microChoice:"auto", calculoMode:"auto" };
      saveConfig(); render(); updateProgress(); toast("Configuración restablecida.");
    });

    cfgSave && cfgSave.addEventListener("click", ()=>{
      const micro = document.querySelector('input[name="microChoice"]:checked')?.value || "auto";
      const calc  = document.querySelector('input[name="calculoMode"]:checked')?.value || "auto";
      state.config = { microChoice: micro, calculoMode: calc };
      applyConfigCleanup();
      saveConfig(); saveState();
      render(); updateProgress(); closeConfig();
      toast("Configuración guardada.");
    });
  }

  // Contadores y progreso (solo sobre visibles)
  function visibleMaterias(){
    const base = state.data.materias.filter(m => {
      if (!applyConfigVisibility(m)) return false;
      if (m.tipo === "OP" && !state.opcionalesSel.has(m.codigo)) return false;
      return true;
    });
    return base;
  }
  function updateCounters(){
    const spanA=$("#countAprobadas"), spanT=$("#countTotales"), spanC=$("#countCreditos");
    const vis = visibleMaterias();
    const aprob = vis.filter(m=>state.aprobadas.has(m.codigo));
    const cred = aprob.reduce((s,m)=>s+(+m.creditos||0),0);
    spanA && (spanA.textContent=String(aprob.length));
    spanT && (spanT.textContent=String(vis.length));
    spanC && (spanC.textContent=String(cred));
  }
  function updateProgress(){
    const bar=$("#bar"), lab=$("#progressLabel");
    const vis = visibleMaterias();
    const aprob = vis.filter(m=>state.aprobadas.has(m.codigo)).length;
    const pct = vis.length ? Math.round(aprob/vis.length*100) : 0;
    if (bar) bar.style.width = `${pct}%`;
    if (lab) lab.textContent = `${pct}%`;
  }

  // Render
  function render(){
    if (!container) return;
    container.innerHTML="";
    const base = visibleMaterias()
      .filter(m => passFilters(m))
      .sort((a,b)=>(a.anio||0)-(b.anio||0)||(a.semestre||0)-(b.semestre||0)||String(a.codigo).localeCompare(String(b.codigo)));

    if (!base.length){
      container.innerHTML='<div class="card" style="padding:1rem;border:1px dashed var(--line);text-align:center;">No hay materias para mostrar. Ajusta los filtros o la configuración.</div>';
      updateCounters(); updateProgress(); return;
    }

    const groups={};
    const key=m=>`${m.anio||0}º año · ${m.semestre||0}º sem`;
    for (const m of base) (groups[key(m)] ||= []).push(m);

    Object.entries(groups).forEach(([titulo,arr])=>{
      const section=document.createElement("section");
      section.style.marginBottom=".8rem";
      const h=document.createElement("h3"); h.textContent=titulo; h.style.margin="0.5rem 0"; section.appendChild(h);
      const grid=document.createElement("div"); grid.className="malla";

      arr.forEach(m=>{
        const est=estadoDe(m.codigo);
        const card=document.createElement("div");
        card.className=`materia ${m.area||""} ${est==="aprobada"?"aprobada":est==="cursando"?"cursando":est==="bloqueada"?"bloqueada":""}`;
        card.dataset.cod=m.codigo;
        // Tooltip con equivalencia si aplica
        const eq = (m.previas||[]).includes("MC10") ? " (requiere Cálculo I)" : "";
        card.title=`${m.nombre} (${m.codigo}) · ${m.creditos||0} créditos · Área ${m.area||"-"} · ${labelEstado(est)}${eq}`;

        const chip = m.tipo==="OB" ? `<span class="chip">OB</span>` : `<span class="chip alt">OP</span>`;
        const prevText = m.previas?.length ? `<div class="m-previas">Previas: ${m.previas.join(" · ")}</div>` : "";

        card.innerHTML=`
          <div class="m-row">
            <div class="m-title">
              <span class="status-emoji">${EMOJI[est]||""}</span>
              <span class="m-nombre">${m.nombre}</span>
              ${chip}
            </div>
          </div>
          <div class="m-meta">${m.codigo} · ${m.creditos||0} créditos</div>
          ${prevText}
          <div class="m-estado">${labelEstado(est)}</div>
        `;

        // Click: aprobar / desaprobar (con exclusividad)
        card.addEventListener("click", ()=>{
          const e=estadoDe(m.codigo);
          if (e==="bloqueada"){
            const faltan=(m.previas||[]).filter(c=>!isSatisfied(String(c)));
            toast(`Bloqueada. Te faltan: ${faltan.join(", ")}`); return;
          }
          // reglas exclusividad
          const msg = violatesExclusivity(m.codigo);
          if (msg){ toast(msg); return; }

          if (state.aprobadas.has(m.codigo)) state.aprobadas.delete(m.codigo);
          else {
            state.aprobadas.add(m.codigo);
            state.cursando.delete(m.codigo);
            // Si se aprobó 128A y ya estaba 114A (o viceversa) informar equivalencia
            if ((m.codigo==="128A" && state.aprobadas.has("114A")) ||
                (m.codigo==="114A" && state.aprobadas.has("128A"))){
              toast("Equivalencia cumplida: Cálculo I (MC10) satisfecho ✅");
            } else {
              toast(`¡Bien ahí! ${m.nombre} ✅`);
            }
          }
          saveState(); render(); updateCounters(); updateProgress(); confettiIf100();
        });

        // Click derecho: cursando (respetando exclusividad)
        card.addEventListener("contextmenu",(ev)=>{
          ev.preventDefault();
          const e=estadoDe(m.codigo);
          if (e==="bloqueada") { toast("Aún no puedes marcarla como cursando."); return; }
          if (state.aprobadas.has(m.codigo)) return;
          // bloqueos cruzados en cursado
          const msg = violatesExclusivity(m.codigo);
          if (msg){ toast(msg); return; }

          if (state.cursando.has(m.codigo)) state.cursando.delete(m.codigo);
          else state.cursando.add(m.codigo);
          saveState(); render(); updateCounters(); updateProgress();
        });

        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);
    });

    updateCounters(); updateProgress();
  }

  // Confeti
  function confettiIf100(){
    const vis=visibleMaterias();
    const tot=vis.length;
    const ok=vis.filter(m=>state.aprobadas.has(m.codigo)).length;
    if (tot>0 && ok>=tot) simpleConfetti();
  }
  function simpleConfetti(){
    const n=100;
    for(let i=0;i<n;i++){
      const s=document.createElement("div");
      s.style.position="fixed"; s.style.left=Math.random()*100+"vw"; s.style.top="-10px";
      s.style.width=s.style.height=8+Math.random()*6+"px";
      s.style.background=`hsl(${Math.floor(Math.random()*360)},90%,60%)`;
      s.style.opacity="0.9"; s.style.borderRadius="2px"; s.style.transform=`rotate(${Math.random()*360}deg)`; s.style.zIndex="9999";
      document.body.appendChild(s);
      const dur=2600+Math.random()*2000;
      s.animate([{transform:s.style.transform,top:"-10px"},{transform:`rotate(${Math.random()*360}deg)`,top:"110vh"}],{duration:dur,easing:"ease-in"});
      setTimeout(()=>s.remove(),dur);
    }
  }

  // Boot
  async function boot(){
    loadConfig(); loadState(); attachFilters(); bindOpcionalesModal(); bindConfigModal();
    try{
      const res=await fetch(DATA_URL,{cache:"no-store"});
      if(!res.ok) throw new Error(`No se pudo cargar ${DATA_URL}`);
      const raw=await res.json();
      const materias=normalizeRoot(raw).map(normalizeOne).filter(m=>m.codigo && m.nombre);
      state.data={materias}; state.byCodigo=new Map(materias.map(m=>[m.codigo,m]));
      render(); updateProgress();
      if(!localStorage.getItem(LS_WELCOME)){ toast("Bienvenida/o ✨ Clic = aprobada, clic derecho = cursando."); localStorage.setItem(LS_WELCOME,"1"); }
    }catch(e){
      console.error(e);
      container.innerHTML='<div style="padding:1rem;background:#fee2e2;border:1px solid #fecaca;border-radius:12px;max-width:960px;margin:1rem auto;font-weight:600;color:#7f1d1d">No pude cargar <code>materias_admin.json</code>. ¿Está en la raíz?</div>';
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

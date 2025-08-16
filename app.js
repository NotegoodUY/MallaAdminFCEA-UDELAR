/* Notegood · Malla Administración — render “Año → Semestres”, colores pastel y estética NG */

(function () {
  "use strict";

  const DATA_URL = "materias_admin.json";
  const LS_STATE = "malla-admin-state-v2";
  const LS_CFG   = "malla-admin-cfg-v1";
  const LS_OPTS  = "malla-admin-opc-v1";

  const $ = (s) => document.querySelector(s);
  const container = $("#malla-container");

  // ====== Estado ======
  const state = {
    data: { areas: [], materias: [] },
    byCodigo: new Map(),
    aprobadas: new Set(),
    cursando: new Set(),
    opcionalesElegidas: new Set(), // para mostrar solo OP elegidas
    cfg: { eco: "", calc: "" },    // configuración 1º semestre
    filtros: { q:"", estado:"", anio:"", sem:"", tipo:"", area:"" }
  };

  // ====== Persistencia ======
  const save = () => {
    localStorage.setItem(LS_STATE, JSON.stringify({
      aprobadas:[...state.aprobadas],
      cursando:[...state.cursando]
    }));
    localStorage.setItem(LS_OPTS, JSON.stringify([...state.opcionalesElegidas]));
    localStorage.setItem(LS_CFG, JSON.stringify(state.cfg));
  };
  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(LS_STATE)||"{}");
      state.aprobadas = new Set(s.aprobadas||[]);
      state.cursando  = new Set(s.cursando||[]);
      const op = JSON.parse(localStorage.getItem(LS_OPTS)||"[]");
      state.opcionalesElegidas = new Set(op);
      state.cfg = Object.assign(state.cfg, JSON.parse(localStorage.getItem(LS_CFG)||"{}"));
    }catch{}
  };

  // ====== Utilidades ======
  const toast = (msg, ms=1600)=>{
    const el=document.createElement("div");
    el.textContent=msg;
    el.style.cssText="position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem .8rem;border-radius:12px;border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:9999;font-weight:700";
    document.body.appendChild(el); setTimeout(()=>el.remove(), ms);
  };

  /** Equivalencia de Cálculo:
   *  - Si cfg.calc === "114A+128A" y está aprobada 128A, se considera equivalente a MC10.
   *  - Si cfg.calc === "MC10" y está aprobada MC10, satisface previas que pidan 114A o 128A.
   */
  function isPrevSatisfied(code){
    // Cálculo I como previa
    if (code === "MC10") {
      if (state.aprobadas.has("MC10")) return true;
      if (state.cfg.calc === "114A+128A" && state.aprobadas.has("128A")) return true;
      return false;
    }
    // Si piden 114A o 128A, pero la config es MC10 y MC10 está aprobada, cuenta como satisfecho
    if (code === "114A" || code === "128A") {
      if (state.aprobadas.has(code)) return true;
      if (state.cfg.calc === "MC10" && state.aprobadas.has("MC10")) return true;
      return false;
    }
    // Cualquier otra previa: normal
    return state.aprobadas.has(String(code));
  }

  const canTake = (m) => (m.previas||[]).every(isPrevSatisfied);

  function hasAprobada(codigo){
    // Para mostrar estado en códigos equivalentes
    if (codigo === "MC10") {
      if (state.aprobadas.has("MC10")) return true;
      if (state.cfg.calc === "114A+128A" && state.aprobadas.has("128A")) return true;
      return false;
    }
    return state.aprobadas.has(codigo);
  }

  const estadoDe = (codigo)=>{
    if(hasAprobada(codigo)) return "aprobada";
    if(state.cursando.has(codigo))  return "cursando";
    const m=state.byCodigo.get(codigo);
    return canTake(m) ? "disponible" : "bloqueada";
  };

  const emEstado = (st)=> st==="aprobada"?"✅":st==="cursando"?"📘":st==="disponible"?"🟢":"🔒";

  // ====== Render principal (Año → Semestres) ======
  function render(){
    if(!container) return;
    container.innerHTML="";

    // Filtros (y aplicar configuración del 1º semestre)
    const q = state.filtros.q.toLowerCase().trim();
    const filtered = state.data.materias.filter(m=>{
      // ocultar OP si no está elegida
      if(m.tipo==="OP" && !state.opcionalesElegidas.has(m.codigo)) return false;

      // APLICAR CONFIG DE 1º SEMESTRE (eco / cálculo)
      if (m.anio === 1 && m.semestre === 1) {
        // Economía: mostrar solo la elegida si hay elección
        if ((m.codigo === "E10" || m.codigo === "E11") && state.cfg.eco) {
          if (m.codigo !== state.cfg.eco) return false;
        }
        // Cálculo:
        if (state.cfg.calc === "MC10") {
          // Si eligió MC10: ocultar 114A y 128A
          if (m.codigo === "114A" || m.codigo === "128A") return false;
        } else if (state.cfg.calc === "114A+128A") {
          // Si eligió 114A+128A: ocultar MC10
          if (m.codigo === "MC10") return false;
        }
        // Si no hay cfg, se muestran todas (comportamiento por defecto)
      }

      // Filtros de cabecera
      if(state.filtros.estado){
        if(estadoDe(m.codigo)!==state.filtros.estado) return false;
      }
      if(state.filtros.anio && String(m.anio)!==state.filtros.anio) return false;
      if(state.filtros.sem  && String(m.semestre)!==state.filtros.sem) return false;
      if(state.filtros.tipo && m.tipo!==state.filtros.tipo) return false;
      if(state.filtros.area && m.area!==state.filtros.area) return false;

      if(q){
        const hay = (m.nombre+" "+m.codigo).toLowerCase().includes(q);
        if(!hay) return false;
      }
      return true;
    });

    // Agrupar por año → semestres
    const map = new Map(); // year -> {1:[],2:[],...}
    for(const m of filtered){
      const y = m.anio||0, s = m.semestre||0;
      if(!map.has(y)) map.set(y, {});
      const obj = map.get(y);
      (obj[s] ||= []).push(m);
    }
    const years = [...map.keys()].sort((a,b)=>a-b);

    // Counters (sobre todo el plan)
    $("#countVisibles").textContent = filtered.length;
    $("#countAprobadas").textContent = state.data.materias.filter(x=>hasAprobada(x.codigo)).length;
    const credTot = state.data.materias.reduce((s,x)=>s+(+x.creditos||0),0);
    const credOk  = state.data.materias
      .filter(x=>hasAprobada(x.codigo))
      .reduce((s,x)=>s+(+x.creditos||0),0);
    $("#countCreditos").textContent = credOk;

    const pct = credTot? Math.round(credOk*100/credTot) : 0;
    $("#progressFill").style.width = pct+"%";
    $("#progressLabel").textContent = pct+"%";

    // Render por año
    for(const year of years){
      const yearCard = document.createElement("section");
      yearCard.className="year-card";
      yearCard.innerHTML = `<h2 class="year-card__title">${year}º año</h2>`;

      const semWrap = document.createElement("div");
      semWrap.className="sem-list";

      const semObj = map.get(year);
      const sems = Object.keys(semObj).map(Number).sort((a,b)=>a-b);

      for(const s of sems){
        const semEl = document.createElement("div");
        semEl.className="sem";
        semEl.innerHTML = `<h3 class="sem__title">${s}º semestre</h3>`;
        const grid = document.createElement("div");
        grid.className="m-grid";

        for(const m of semObj[s].sort((a,b)=> String(a.codigo).localeCompare(String(b.codigo)))){
          const st = estadoDe(m.codigo);
          const el = document.createElement("div");
          el.className = `materia ${m.area||""} ${st}`;
          el.title = `${m.nombre} (${m.codigo}) · ${m.creditos||0} créditos · ${emEstado(st)} ${st}`;

          el.innerHTML = `
            <div class="m-left">
              <div class="m-name">${m.nombre}</div>
              <div class="m-meta">${m.codigo} · ${m.creditos||0} créditos ${m.previas?.length? " · Previas: "+m.previas.join(" · "):""}</div>
            </div>
            <div class="m-right">
              <div class="badge badge--state">${emEstado(st)} ${st}</div>
              <div class="m-tags">
                <span class="t-pill ${m.tipo==="OB"?"tp-ob":"tp-op"}">${m.tipo}</span>
              </div>
            </div>
          `;

          // Click = aprobar/quitar (si no está bloqueada)
          el.addEventListener("click", ()=>{
            const curr = estadoDe(m.codigo);
            if(curr==="bloqueada"){
              const faltan = (m.previas||[]).filter(c=>!isPrevSatisfied(c));
              toast(`🔒 Aún bloqueada. Te falta: ${faltan.join(", ")||"previas"}`);
              return;
            }
            if(state.aprobadas.has(m.codigo)){
              state.aprobadas.delete(m.codigo);
            }else{
              state.aprobadas.add(m.codigo);
              state.cursando.delete(m.codigo);
              toast(`✅ ${m.nombre} aprobada`);
            }
            save(); render();
          });

          // Click derecho = cursando
          el.addEventListener("contextmenu",(ev)=>{
            ev.preventDefault();
            const curr = estadoDe(m.codigo);
            if(curr==="bloqueada"){ toast("🔒 No podés cursarla todavía."); return; }
            if(state.cursando.has(m.codigo)) state.cursando.delete(m.codigo);
            else state.cursando.add(m.codigo);
            save(); render();
          });

          grid.appendChild(el);
        }

        semEl.appendChild(grid);
        semWrap.appendChild(semEl);
      }

      yearCard.appendChild(semWrap);
      container.appendChild(yearCard);
    }

    if(years.length===0){
      container.innerHTML = `<div class="year-card"><p class="muted">No hay materias para los filtros seleccionados.</p></div>`;
    }
  }

  // ====== Opcionales (modal) ======
  function openOpcionales(){
    const dlg = $("#modalOpcionales");
    const list = $("#opList");
    list.innerHTML="";
    const ops = state.data.materias.filter(m=>m.tipo==="OP")
      .sort((a,b)=> String(a.codigo).localeCompare(String(b.codigo)));
    for(const m of ops){
      const item = document.createElement("label");
      item.className="cfg-item";
      const ch = document.createElement("input");
      ch.type="checkbox"; ch.value=m.codigo;
      ch.checked = state.opcionalesElegidas.has(m.codigo);
      item.appendChild(ch);
      item.append(` ${m.codigo} — ${m.nombre} (${m.creditos||0} cr)`);
      list.appendChild(item);
    }
    dlg.showModal();
    $("#opCancel").onclick=()=>dlg.close();
    $("#opSave").onclick=()=>{
      const sel = [...list.querySelectorAll("input[type=checkbox]")].filter(x=>x.checked).map(x=>x.value);
      state.opcionalesElegidas = new Set(sel);
      save(); dlg.close(); render();
    };
  }

  // ====== Config 1º Semestre ======
  function openConfig(){
    const dlg = $("#modalConfig");
    // set radios
    dlg.querySelectorAll('input[name="eco"]').forEach(r=>r.checked = (r.value===state.cfg.eco));
    dlg.querySelectorAll('input[name="calc"]').forEach(r=>r.checked = (r.value===state.cfg.calc));
    dlg.showModal();

    $("#cfgCancel").onclick=()=>dlg.close();
    $("#cfgSave").onclick=()=>{
      const eco = dlg.querySelector('input[name="eco"]:checked')?.value || "";
      const calc= dlg.querySelector('input[name="calc"]:checked')?.value || "";
      state.cfg={eco,calc};

      // Regla 1: Micro vs Interacciones (no ambas)
      if(eco==="E10"){ state.aprobadas.delete("E11"); state.cursando.delete("E11"); }
      else if(eco==="E11"){ state.aprobadas.delete("E10"); state.cursando.delete("E10"); }

      // Regla 2: Cálculo simple vs doble dictado
      if(calc==="MC10"){
        // Si elige MC10, quitar A/B
        state.aprobadas.delete("114A"); state.aprobadas.delete("128A");
        state.cursando.delete("114A");  state.cursando.delete("128A");
      }else if(calc==="114A+128A"){
        // si elige A/B, quitar MC10
        state.aprobadas.delete("MC10"); state.cursando.delete("MC10");
      }

      save(); dlg.close(); render();
    };
  }

  // ====== Filtros / acciones ======
  function bindUI(){
    // selects de año dinámico
    const years = [...new Set(state.data.materias.map(m=>m.anio))].sort((a,b)=>a-b);
    const fAnio = $("#fAnio"); years.forEach(y=>{
      const o=document.createElement("option");o.value=y;o.textContent=`${y}º`; fAnio.appendChild(o);
    });

    $("#q")     .addEventListener("input",(e)=>{state.filtros.q=e.target.value; render();});
    $("#fEstado").addEventListener("change",(e)=>{state.filtros.estado=e.target.value; render();});
    $("#fAnio") .addEventListener("change",(e)=>{state.filtros.anio=e.target.value; render();});
    $("#fSem")  .addEventListener("change",(e)=>{state.filtros.sem=e.target.value; render();});
    $("#fTipo") .addEventListener("change",(e)=>{state.filtros.tipo=e.target.value; render();});
    $("#fArea") .addEventListener("change",(e)=>{state.filtros.area=e.target.value; render();});

    $("#btnLimpiar").onclick=()=>{
      state.filtros={q:"",estado:"",anio:"",sem:"",tipo:"",area:""};
      $("#q").value=""; $("#fEstado").value=""; $("#fAnio").value=""; $("#fSem").value=""; $("#fTipo").value=""; $("#fArea").value="";
      render();
    };
    $("#btnReset").onclick=()=>{
      if(confirm("¿Reiniciar todo el progreso?")){ state.aprobadas.clear(); state.cursando.clear(); save(); render(); }
    };
    $("#btnOpcionales").onclick=openOpcionales;
    $("#btnConfig").onclick=openConfig;
    $("#clearAll").onclick=()=>{ if(confirm("¿Vaciar todo?")){ localStorage.clear(); location.reload(); } };

    // Tema
    const root=document.documentElement, key="theme";
    const apply=(t)=>{root.setAttribute("data-theme",t); $("#themeToggle").textContent = t==="dark"?"☀️":"🌙"; localStorage.setItem(key,t);};
    const saved=localStorage.getItem(key); const prefersDark=window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    apply(saved || (prefersDark?"dark":"light"));
    $("#themeToggle").onclick=()=>{apply(root.getAttribute("data-theme")==="dark"?"light":"dark");};
  }

  // ====== Boot ======
  async function boot(){
    load();
    try{
      const r=await fetch(DATA_URL,{cache:"no-store"}); if(!r.ok) throw 0;
      const data=await r.json();
      state.data=data; state.byCodigo = new Map(data.materias.map(m=>[String(m.codigo), m]));
      bindUI(); render();
    }catch{
      container.innerHTML = `<div class="year-card"><p>No pude cargar <code>${DATA_URL}</code>.</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

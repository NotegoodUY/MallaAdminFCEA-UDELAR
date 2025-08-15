/* Notegood · Malla Administración
   - Lee materias_admin.json en / (raíz)
   - Estados con emojis: ✅ 📚 🔓 🔒
   - Filtros: texto, estado, año, semestre, tipo (OB/OP), área
   - Guarda progreso (aprobadas/cursando) en localStorage
   - Botón para reiniciar progreso
*/

(function () {
  "use strict";

  const DATA_URL = "materias_admin.json";
  const LS_STATE = "malla-admin-state-v1";
  const LS_WELCOME = "malla-admin-welcome";

  const state = {
    aprobadas: new Set(),
    cursando: new Set(),
    data: { materias: [] },
    byCodigo: new Map(),
    filters: {
      text: "",
      estado: "",
      year: "",
      sem: "",
      tipo: "",
      area: ""
    }
  };

  // DOM
  const $ = (s) => document.querySelector(s);
  const container = $("#malla-container");

  const elText = $("#filterText");
  const elEstado = $("#filterEstado");
  const elYear = $("#filterYear");
  const elSem = $("#filterSem");
  const elTipo = $("#filterTipo");
  const elArea = $("#filterArea");
  const btnClear = $("#btnClearFilters");
  const btnReset = $("#btnReset");

  function toast(msg, ms = 1700) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem .8rem;border-radius:12px;border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:9999;font-weight:600";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  // Persistencia
  function save() {
    localStorage.setItem(
      LS_STATE,
      JSON.stringify({ aprobadas: [...state.aprobadas], cursando: [...state.cursando] })
    );
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_STATE);
      if (!raw) return;
      const obj = JSON.parse(raw);
      state.aprobadas = new Set(obj.aprobadas || []);
      state.cursando = new Set(obj.cursando || []);
    } catch {}
  }
  function resetProgress() {
    state.aprobadas.clear();
    state.cursando.clear();
    save();
    render();
    toast("Se reinició tu progreso.");
  }

  // Normalización
  function normalizeRoot(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.materias)) return data.materias;
    if (Array.isArray(data?.items)) return data.items;
    if (typeof data === "object") return Object.values(data);
    return [];
  }
  function normalizeOne(r) {
    const codigo = String(r.codigo ?? r.cod ?? r.id ?? "");
    const nombre = String(r.nombre ?? r.name ?? "");
    const creditos = Number.parseInt(r.creditos ?? r.credits ?? 0, 10) || 0;
    const area = String(r.area ?? "").toUpperCase();
    const anio = Number.parseInt(r.anio ?? r.año ?? r.year ?? 0, 10) || 0;
    const semestre = Number.parseInt(r.semestre ?? r.sem ?? r.semester ?? 0, 10) || 0;
    const tipo = String(r.tipo ?? "").toUpperCase(); // OB / OP

    let prev = r.previas ?? r.correlativas ?? [];
    if (typeof prev === "string") {
      prev = prev.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(prev)) prev = [];
    prev = prev.map(String);

    return { codigo, nombre, creditos, area, anio, semestre, tipo, previas: prev };
  }

  // Estados
  function canTake(m) {
    const prev = Array.isArray(m.previas) ? m.previas : [];
    return prev.every(c => state.aprobadas.has(String(c)));
  }
  function estadoDe(codigo) {
    if (state.aprobadas.has(codigo)) return "aprobada";
    if (state.cursando.has(codigo)) return "cursando";
    const m = state.byCodigo.get(codigo);
    return canTake(m) ? "disponible" : "bloqueada";
  }

  const EMOJI = {
    aprobada: "✅",
    cursando: "📚",
    disponible: "🔓",
    bloqueada: "🔒"
  };
  function labelEstado(est) {
    return `${EMOJI[est] || ""} ${
      est === "aprobada" ? "Aprobada" :
      est === "cursando" ? "Cursando" :
      est === "disponible" ? "Disponible" : "Bloqueada"
    }`;
  }

  // Filtros
  function passFilters(m) {
    const f = state.filters;

    if (f.text) {
      const t = f.text.toLowerCase();
      const hay = m.nombre.toLowerCase().includes(t) || String(m.codigo).toLowerCase().includes(t);
      if (!hay) return false;
    }
    if (f.estado) {
      if (estadoDe(m.codigo) !== f.estado) return false;
    }
    if (f.year && String(m.anio) !== String(f.year)) return false;
    if (f.sem && String(m.semestre) !== String(f.sem)) return false;
    if (f.tipo && (m.tipo || "").toUpperCase() !== f.tipo) return false;
    if (f.area && (m.area || "").toUpperCase() !== f.area) return false;

    return true;
  }

  function attachFilters() {
    if (elText) elText.addEventListener("input", () => { state.filters.text = elText.value.trim(); render(); });
    if (elEstado) elEstado.addEventListener("change", () => { state.filters.estado = elEstado.value; render(); });
    if (elYear) elYear.addEventListener("change", () => { state.filters.year = elYear.value; render(); });
    if (elSem) elSem.addEventListener("change", () => { state.filters.sem = elSem.value; render(); });
    if (elTipo) elTipo.addEventListener("change", () => { state.filters.tipo = elTipo.value; render(); });
    if (elArea) elArea.addEventListener("change", () => { state.filters.area = elArea.value; render(); });

    if (btnClear) btnClear.addEventListener("click", () => {
      state.filters = { text: "", estado: "", year: "", sem: "", tipo: "", area: "" };
      if (elText) elText.value = "";
      if (elEstado) elEstado.value = "";
      if (elYear) elYear.value = "";
      if (elSem) elSem.value = "";
      if (elTipo) elTipo.value = "";
      if (elArea) elArea.value = "";
      render();
      toast("Filtros limpiados.");
    });

    if (btnReset) btnReset.addEventListener("click", () => {
      if (confirm("¿Seguro que quieres reiniciar TODO tu progreso?")) resetProgress();
    });
  }

  // Contadores
  function updateCounters() {
    const spanA = $("#countAprobadas");
    const spanT = $("#countTotales");
    const spanC = $("#countCreditos");

    const all = state.data.materias;
    const aprobadas = all.filter(m => state.aprobadas.has(m.codigo)).length;
    const tot = all.length;
    const cred = all.filter(m => state.aprobadas.has(m.codigo))
                    .reduce((s, x) => s + (+x.creditos || 0), 0);

    if (spanA) spanA.textContent = String(aprobadas);
    if (spanT) spanT.textContent = String(tot);
    if (spanC) spanC.textContent = String(cred);
  }

  // Render
  function render() {
    if (!container) return;
    container.innerHTML = "";

    const items = state.data.materias.slice().sort((a, b) =>
      (a.anio || 0) - (b.anio || 0) ||
      (a.semestre || 0) - (b.semestre || 0) ||
      String(a.codigo).localeCompare(String(b.codigo))
    );

    const filtered = items.filter(passFilters);

    const groups = {};
    const gkey = (m) => `${m.anio || 0}º año · ${m.semestre || 0}º sem`;
    for (const m of filtered) (groups[gkey(m)] ||= []).push(m);

    if (!filtered.length) {
      container.innerHTML =
        '<div class="card" style="padding:1rem;border:1px dashed var(--line);text-align:center;">No hay materias que coincidan con el filtro.</div>';
      updateCounters();
      return;
    }

    Object.entries(groups).forEach(([title, arr]) => {
      const section = document.createElement("section");
      section.style.marginBottom = ".8rem";

      const h = document.createElement("h3");
      h.textContent = title;
      h.style.margin = "0.5rem 0";
      section.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "malla";

      arr.forEach((m) => {
        const est = estadoDe(m.codigo);
        const card = document.createElement("div");
        card.className = `materia ${m.area || ""} ${
          est === "aprobada" ? "aprobada" :
          est === "cursando" ? "cursando" :
          est === "bloqueada" ? "bloqueada" : ""
        }`;
        card.dataset.cod = m.codigo;
        card.title = `${m.nombre} (${m.codigo}) · ${m.creditos || 0} créditos · Área ${m.area || "-"} · ${labelEstado(est)}`;

        const chip = m.tipo === "OB" ? `<span class="chip">OB</span>` :
                     m.tipo === "OP" ? `<span class="chip alt">OP</span>` : "";

        const prevText = m.previas?.length ? `<div class="m-previas">Previas: ${m.previas.join(" · ")}</div>` : "";

        card.innerHTML = `
          <div class="m-row">
            <div class="m-title">
              <span class="status-emoji">${EMOJI[est] || ""}</span>
              <span class="m-nombre">${m.nombre}</span>
              ${chip}
            </div>
          </div>
          <div class="m-meta">${m.codigo} · ${m.creditos || 0} créditos</div>
          ${prevText}
          <div class="m-estado">${labelEstado(est)}</div>
        `;

        card.addEventListener("click", () => {
          const e = estadoDe(m.codigo);
          if (e === "bloqueada") {
            const faltan = (m.previas || []).filter(c => !state.aprobadas.has(String(c)));
            toast(`Bloqueada. Te faltan: ${faltan.join(", ")}`);
            return;
          }
          if (state.aprobadas.has(m.codigo)) {
            state.aprobadas.delete(m.codigo);
          } else {
            state.aprobadas.add(m.codigo);
            state.cursando.delete(m.codigo);
            toast(`¡Bien ahí! ${m.nombre} ✅`);
          }
          save(); render(); confettiIf100();
        });

        card.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          const e = estadoDe(m.codigo);
          if (e === "bloqueada") {
            toast("Aún no puedes marcarla como cursando.");
            return;
          }
          if (state.aprobadas.has(m.codigo)) return; // no marcar cursando si ya está aprobada
          if (state.cursando.has(m.codigo)) state.cursando.delete(m.codigo);
          else state.cursando.add(m.codigo);
          save(); render();
        });

        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);
    });

    updateCounters();
  }

  // Confeti chiquito cuando completas todos los créditos
  function confettiIf100() {
    const tot = state.data.materias.reduce((s, x) => s + (+x.creditos || 0), 0);
    const ok = state.data.materias.filter(x => state.aprobadas.has(x.codigo))
      .reduce((s, x) => s + (+x.creditos || 0), 0);
    if (tot > 0 && ok >= tot) simpleConfetti();
  }
  function simpleConfetti() {
    const n = 100;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("div");
      s.style.position = "fixed";
      s.style.left = Math.random() * 100 + "vw";
      s.style.top = "-10px";
      s.style.width = s.style.height = 8 + Math.random() * 6 + "px";
      s.style.background = `hsl(${Math.floor(Math.random() * 360)},90%,60%)`;
      s.style.opacity = "0.9";
      s.style.borderRadius = "2px";
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      s.style.zIndex = "9999";
      document.body.appendChild(s);
      const dur = 2600 + Math.random() * 2000;
      s.animate(
        [{ transform: s.style.transform, top: "-10px" }, { transform: `rotate(${Math.random() * 360}deg)`, top: "110vh" }],
        { duration: dur, easing: "ease-in" }
      );
      setTimeout(() => s.remove(), dur);
    }
  }

  // Boot
  async function boot() {
    load();
    attachFilters();
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`No se pudo cargar ${DATA_URL}`);
      const raw = await res.json();
      const materias = normalizeRoot(raw).map(normalizeOne).filter(m => m.codigo && m.nombre);
      state.data = { materias };
      state.byCodigo = new Map(materias.map(m => [m.codigo, m]));
      render();
      if (!localStorage.getItem(LS_WELCOME)) {
        toast("Bienvenida/o ✨ Clic = aprobada, clic derecho = cursando.");
        localStorage.setItem(LS_WELCOME, "1");
      }
    } catch (e) {
      console.error(e);
      if (container) {
        container.innerHTML =
          '<div style="padding:1rem;background:#fee2e2;border:1px solid #fecaca;border-radius:12px;max-width:960px;margin:1rem auto;font-weight:600;color:#7f1d1d">No pude cargar <code>materias_admin.json</code>. ¿Está en la raíz?</div>';
      }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

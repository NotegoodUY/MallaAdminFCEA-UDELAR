/* Notegood · Malla Administración (FCEA)
   - Lee materias desde materias_admin.json (raíz del repo)
   - Tolera distintos formatos de JSON (array directo, {materias:[]}, {items:[]}, objeto índice)
   - Acepta previas como `previas` o `correlativas` (array o string "A10, C10")
   - Colores por área: clases A, C, MC, E, I, S, J
   - Guarda/recupera progreso (aprobadas y cursando) en localStorage
   - Renderiza en #malla-container agrupando por Año/Semestre
*/

(function () {
  "use strict";

  // ========= Config =========
  const DATA_URL = "materias_admin.json";       // <-- nombre/ruta del JSON en la raíz
  const LS_STATE = "malla-admin-state-v1";
  const LS_WELCOME = "malla-admin-welcome";

  // ========= Estado =========
  const state = {
    aprobadas: new Set(),
    cursando: new Set(),
    data: { areas: [], materias: [] },
    byCodigo: new Map(),
  };

  // ========= Utils DOM =========
  const $ = (sel) => document.querySelector(sel);
  const container = $("#malla-container");

  function toast(msg, ms = 1700) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem .8rem;border-radius:12px;border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:9999;font-weight:600";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  // ========= Persistencia =========
  function save() {
    const payload = {
      aprobadas: [...state.aprobadas],
      cursando: [...state.cursando],
    };
    localStorage.setItem(LS_STATE, JSON.stringify(payload));
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_STATE);
      if (!raw) return;
      const obj = JSON.parse(raw);
      state.aprobadas = new Set(obj.aprobadas || []);
      state.cursando = new Set(obj.cursando || []);
    } catch { /* noop */ }
  }

  // ========= Normalización de datos =========
  // Acepta claves alternativas y formatea previas/correlativas
  function normalizeOne(r) {
    // código y nombre
    const codigo = String(
      r.codigo ?? r.cod ?? r.code ?? r.id ?? r.ID ?? ""
    );

    const nombre = String(
      r.nombre ?? r.name ?? r.titulo ?? r.título ?? r.Title ?? ""
    );

    // créditos
    const c = r.creditos ?? r.créditos ?? r.credit ?? r.credits ?? 0;
    const creditos = Number.parseInt(String(c), 10) || 0;

    // área / año / semestre / tipo
    const area = String(r.area ?? r.área ?? "").toUpperCase();
    const anio = Number.parseInt(r.anio ?? r.año ?? r.year ?? 0, 10) || 0;
    const semestre = Number.parseInt(r.semestre ?? r.sem ?? r.semester ?? 0, 10) || 0;
    const tipo = String(r.tipo ?? r.type ?? "").toUpperCase();

    // previas / correlativas (array o string)
    let prev = r.previas ?? r.correlativas ?? [];
    if (typeof prev === "string") {
      prev = prev.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(prev)) prev = [];
    prev = prev.map(String);

    return { codigo, nombre, creditos, area, anio, semestre, tipo, previas: prev };
  }

  function normalizeRoot(data) {
    if (Array.isArray(data)) return data;
    const candidates = ["materias", "Materias", "items", "Items", "data", "Data"];
    for (const k of candidates) {
      if (Array.isArray(data?.[k])) return data[k];
      if (data?.[k] && typeof data[k] === "object") return Object.values(data[k]);
    }
    if (typeof data === "object") return Object.values(data);
    return [];
  }

  // ========= Lógica de previas/estados =========
  function canTake(m) {
    if (!m) return true;
    let prev = m.previas ?? [];
    if (typeof prev === "string") {
      prev = prev.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(prev)) prev = [];
    return prev.every((cod) => state.aprobadas.has(String(cod).trim()));
  }

  function estadoDe(codigo) {
    if (state.aprobadas.has(codigo)) return "aprobada";
    if (state.cursando.has(codigo)) return "cursando";
    const m = state.byCodigo.get(codigo);
    return canTake(m) ? "disponible" : "bloqueada";
  }

  // ========= Render =========
  function labelEstado(est) {
    if (est === "aprobada")  return "Estado: aprobada";
    if (est === "cursando")  return "Estado: cursando";
    if (est === "disponible")return "Estado: disponible";
    return "Estado: bloqueada";
  }

  function tooltipMateria(m, est) {
    const prevs = m.previas?.length ? ` · Previas: ${m.previas.join(", ")}` : "";
    return `${m.nombre} (${m.codigo}) · ${m.creditos || 0} créditos · Área: ${m.area || "—"} · ${labelEstado(est)}${prevs}`;
  }

  function render() {
    if (!container) return;
    container.innerHTML = "";

    const materias = (state.data.materias || [])
      .slice()
      .sort((a, b) =>
        (a.anio || 0) - (b.anio || 0) ||
        (a.semestre || 0) - (b.semestre || 0) ||
        String(a.codigo).localeCompare(String(b.codigo))
      );

    if (!materias.length) {
      container.innerHTML =
        '<div style="padding:1rem;background:var(--card);border:1px dashed var(--line);border-radius:12px;color:var(--muted)">No hay materias para mostrar. Revisa <b>materias_admin.json</b>.</div>';
      return;
    }

    const groups = {};
    const groupKey = (m) => `${m.anio || 0}º año · ${m.semestre || 0}º sem`;
    for (const m of materias) (groups[groupKey(m)] ||= []).push(m);

    Object.entries(groups).forEach(([titulo, arr]) => {
      const section = document.createElement("section");
      section.style.marginBottom = "0.8rem";

      const h = document.createElement("h3");
      h.textContent = titulo;
      h.style.margin = "0.5rem 0";
      section.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "malla"; // usa el grid del styles.css

      arr.forEach((m) => {
        const est = estadoDe(m.codigo);
        const card = document.createElement("div");

        // color por área + estado
        card.className = `materia ${m.area || ""} ${
          est === "aprobada" ? "aprobada" : est === "cursando" ? "cursando" : est === "bloqueada" ? "bloqueada" : ""
        }`;

        card.dataset.cod = m.codigo;
        card.title = tooltipMateria(m, est);

        const prevText = m.previas?.length
          ? `<div class="m-previas">Previas: ${m.previas.join(" · ")}</div>`
          : "";

        card.innerHTML = `
          <div class="m-nombre">${m.nombre}</div>
          <div class="m-meta">${m.codigo} · ${m.creditos || 0} créditos</div>
          ${prevText}
          <div class="m-estado">${labelEstado(est)}</div>
        `;

        card.addEventListener("click", () => {
          const e = estadoDe(m.codigo);
          if (e === "bloqueada") {
            const faltan = (m.previas || []).filter((c) => !state.aprobadas.has(String(c)));
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
          save();
          render();
          confettiIf100();
        });

        card.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          const e = estadoDe(m.codigo);
          if (e === "bloqueada") {
            toast("Aún no puedes marcarla como cursando.");
            return;
          }
          if (state.aprobadas.has(m.codigo)) return; // si ya está aprobada, no cursando
          if (state.cursando.has(m.codigo)) state.cursando.delete(m.codigo);
          else state.cursando.add(m.codigo);
          save();
          render();
        });

        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  // ========= Confeti (cuando se aprueban todos los créditos) =========
  function confettiIf100() {
    const tot = state.data.materias.reduce((s, x) => s + (+x.creditos || 0), 0);
    const ok = state.data.materias
      .filter((x) => state.aprobadas.has(x.codigo))
      .reduce((s, x) => s + (+x.creditos || 0), 0);
    if (tot > 0 && ok >= tot) simpleConfetti();
  }
  function simpleConfetti() {
    const n = 120;
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
      const dur = 3000 + Math.random() * 2500;
      s.animate(
        [
          { transform: s.style.transform, top: "-10px" },
          { transform: `rotate(${Math.random() * 360}deg)`, top: "110vh" }
        ],
        { duration: dur, easing: "ease-in" }
      );
      setTimeout(() => s.remove(), dur);
    }
  }

  // ========= Boot =========
  async function boot() {
    load(); // carga progreso local
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`No se pudo cargar ${DATA_URL}`);
      const raw = await res.json();

      // Soportar distintos “roots”
      const root = normalizeRoot(raw);
      const materias = root.map(normalizeOne).filter(m => m.codigo && m.nombre);

      state.data = { areas: [], materias };
      state.byCodigo = new Map(materias.map((m) => [String(m.codigo), m]));

      render();

      if (!localStorage.getItem(LS_WELCOME)) {
        toast("Bienvenida/o a tu malla ✨ Clic = aprobada, clic derecho = cursando.");
        localStorage.setItem(LS_WELCOME, "1");
      }
    } catch (e) {
      console.error(e);
      if (container) {
        container.innerHTML =
          '<div style="padding:1rem;background:#fee2e2;border:1px solid #fecaca;border-radius:12px;max-width:960px;margin:1rem auto;font-weight:600;color:#7f1d1d">No pude cargar <code>materias_admin.json</code>. Verificá que esté en la raíz del repo y tenga un formato válido.</div>';
      }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

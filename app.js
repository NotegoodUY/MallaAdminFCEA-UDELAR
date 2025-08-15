/* Notegood · Malla Administración (FCEA)
   - Carga datos desde materias_admin.json (raíz)
   - Colores por área (clases: A, C, MC, E, I, S, J)
   - Previas (correlativas) con bloqueo/desbloqueo
   - Guarda avance en localStorage (aprobadas y cursando)
   - Render en #malla-container (malla.html)
*/

(function () {
  "use strict";

  // ========= Config =========
  const DATA_URL = "materias_admin.json"; // <- la modificación clave
  const LS_STATE = "malla-admin-state-v1";

  // ========= Estado =========
  const state = {
    aprobadas: new Set(),
    cursando: new Set(),
    data: { areas: [], materias: [] },
    byCodigo: new Map()
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
      cursando: [...state.cursando]
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
    } catch {
      /* noop */
    }
  }

  // ========= Lógica de previas =========
  function canTake(m) {
    const prev = Array.isArray(m.previas) ? m.previas : [];
    return prev.every((cod) => state.aprobadas.has(String(cod).trim()));
  }
  function estadoDe(codigo) {
    if (state.aprobadas.has(codigo)) return "aprobada";
    if (state.cursando.has(codigo)) return "cursando";
    const m = state.byCodigo.get(codigo);
    return canTake(m) ? "disponible" : "bloqueada";
  }

  // ========= Render =========
  function render() {
    if (!container) return;
    container.innerHTML = "";

    // Agrupar por año/semestre
    const items = state.data.materias
      .slice()
      .sort(
        (a, b) =>
          (a.anio || 0) - (b.anio || 0) ||
          (a.semestre || 0) - (b.semestre || 0) ||
          String(a.codigo).localeCompare(b.codigo)
      );

    const key = (m) => `${m.anio || 0}º año · ${m.semestre || 0}º sem`;
    const groups = {};
    for (const m of items) (groups[key(m)] ||= []).push(m);

    Object.entries(groups).forEach(([titulo, arr]) => {
      const section = document.createElement("section");
      section.style.marginBottom = "0.8rem";

      const h = document.createElement("h3");
      h.textContent = titulo;
      h.style.margin = "0.5rem 0";
      section.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "malla"; // usa el grid de styles.css

      arr.forEach((m) => {
        const est = estadoDe(m.codigo);
        const card = document.createElement("div");
        // Colores por área: clases .A .C .MC .E .I .S .J
        card.className = `materia ${m.area || ""} ${est === "aprobada" ? "aprobada" : ""}`;
        card.dataset.cod = m.codigo;
        card.title = tooltipMateria(m, est);

        card.innerHTML = `
          <div style="font-weight:700;line-height:1.2">${m.nombre}</div>
          <div style="font-size:.82rem;opacity:.9;margin-top:4px">
            ${m.codigo} · ${m.creditos || 0} créditos
          </div>
          ${m.previas?.length ? `<div style="font-size:.78rem;opacity:.9;margin-top:6px">Previas: ${m.previas.join(" · ")}</div>` : ""}
          <div style="font-size:.78rem;margin-top:6px;opacity:.95">${labelEstado(est)}</div>
        `;

        // Click: toggle aprobada si está disponible o ya aprobada
        card.addEventListener("click", () => {
          const estActual = estadoDe(m.codigo);
          if (estActual === "bloqueada") {
            const faltan = (m.previas || []).filter((c) => !state.aprobadas.has(c));
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

        // Secundario: toggle "cursando" (click derecho)
        card.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          const estActual = estadoDe(m.codigo);
          if (estActual === "bloqueada") {
            toast("Aún no puedes marcarla como cursando.");
            return;
          }
          if (state.cursando.has(m.codigo)) {
            state.cursando.delete(m.codigo);
          } else {
            state.cursando.add(m.codigo);
          }
          save();
          render();
        });

        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  function labelEstado(est) {
    if (est === "aprobada") return "Estado: aprobada";
    if (est === "cursando") return "Estado: cursando";
    if (est === "disponible") return "Estado: disponible";
    return "Estado: bloqueada";
  }

  function tooltipMateria(m, est) {
    const partes = [
      `${m.nombre} (${m.codigo})`,
      `${m.creditos || 0} créditos`,
      `Área: ${m.area || "—"}`,
      `Estado: ${est}`
    ];
    if (m.previas?.length) partes.push(`Previas: ${m.previas.join(", ")}`);
    return partes.join(" · ");
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
      const data = await res.json();
      state.data = data || { areas: [], materias: [] };
      state.byCodigo = new Map(
        (state.data.materias || []).map((m) => [String(m.codigo), m])
      );
      render();
      if (!localStorage.getItem("malla-admin-welcome")) {
        toast("Bienvenida/o a tu malla ✨ Haz clic para marcar aprobadas. Click derecho: cursando.");
        localStorage.setItem("malla-admin-welcome", "1");
      }
    } catch (e) {
      console.error(e);
      if (container) {
        container.innerHTML =
          '<div style="padding:1rem;background:#fee2e2;border:1px solid #fecaca;border-radius:12px;max-width:960px;margin:1rem auto;font-weight:600;color:#7f1d1d">No pude cargar <code>materias_admin.json</code>. Verificá que esté en la raíz del repo.</div>';
      }
    }
  }

  // Go!
  document.addEventListener("DOMContentLoaded", boot);
})();

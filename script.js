/* =========================================================
   script.js — FASE 2
   Render básico de tarjetas
   ========================================================= */

const REQUIRED_COLUMNS = [
  "origen",
  "unidad",
  "cxc",
  "area",
  "proceso",
  "tarifa",
  "monto",
  "requisitos",
  "correo",
  "celular"
];

const cardsContainer = document.getElementById("cardsContainer");

// Utilidades
function normalizeHeader(text) {
  return text.toString().toLowerCase().trim();
}

function escapeHTML(str) {
  return (str || "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

// Cargar CSV
function loadCSV() {
  if (typeof Papa === "undefined") {
    console.error("❌ PapaParse no está cargado");
    return;
  }

  Papa.parse(SHEET_CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (result) {

      const headers = result.meta.fields.map(normalizeHeader);
      const missing = REQUIRED_COLUMNS.filter(c => !headers.includes(c));

      if (missing.length) {
        console.error("❌ Faltan columnas:", missing);
        return;
      }

      const data = result.data.filter(r => r.proceso || r.tarifa);

      console.log("✅ Registros a renderizar:", data.length);

      renderCards(data);
    },
    error: err => console.error("❌ Error CSV:", err)
  });
}

// Render tarjetas simples
function renderCards(data) {
  cardsContainer.innerHTML = "";

  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="card-title">${escapeHTML(item.proceso || "—")}</div>
      <div><strong>Tarifa:</strong> ${escapeHTML(item.tarifa)}</div>
      <div><strong>Monto:</strong> S/ ${escapeHTML(item.monto)}</div>
      <div><strong>Unidad:</strong> ${escapeHTML(item.unidad)}</div>
      <div><strong>Área:</strong> ${escapeHTML(item.area)}</div>
      <div><strong>CxC:</strong> ${escapeHTML(item.cxc)}</div>
      <div><strong>Origen:</strong> ${escapeHTML(item.origen)}</div>
      <div style="margin-top:8px; font-size:13px;">
        📧 ${escapeHTML(item.correo || "—")} <br>
        📱 ${escapeHTML(item.celular || "—")}
      </div>
    `;

    cardsContainer.appendChild(card);
  });
}

// Ejecutar
loadCSV();

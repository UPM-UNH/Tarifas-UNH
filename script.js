/*************************************************
 * TARIFARIO TUPA / TUSNE – UNH
 * script.js
 * - Carga CSV desde Google Sheets (PapaParse)
 * - Búsqueda (Fuse.js)
 * - Filtro por unidad
 * - Filtro por monto + gratuito
 * - Cards (20 por página)
 * - Modal con requisitos + cálculo de pago
 * - Exportación PDF con filtros + fecha
 *************************************************/

/* ========= CONFIG ========= */
const CSV_URL = typeof SHEET_CSV_URL !== "undefined" ? SHEET_CSV_URL : "";

/* ========= DOM ========= */
const searchInput = document.getElementById("searchInput");
const unidadFilter = document.getElementById("unidadFilter");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const cardsContainer = document.getElementById("cardsContainer");
const statusEl = document.getElementById("status");
const paginationEl = document.getElementById("pagination");

const montoRange = document.getElementById("montoRange");
const montoMin = document.getElementById("montoMin");
const montoMax = document.getElementById("montoMax");
const gratuitoBtn = document.getElementById("gratuitoBtn");

/* Modal */
const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalUnidad = document.getElementById("modalUnidad");
const modalArea = document.getElementById("modalArea");
const modalCorreo = document.getElementById("modalCorreo");
const modalTelefono = document.getElementById("modalTelefono");
const modalCorreoLink = document.getElementById("modalCorreoLink");
const modalTelefonoLink = document.getElementById("modalTelefonoLink");
const modalRequisitos = document.getElementById("modalRequisitos");
const canalSelect = document.getElementById("canalSelect");
const estimationResult = document.getElementById("estimationResult");
const modalClose = document.getElementById("modalClose");

/* ========= DATA ========= */
let rawData = [];
let data = [];
let filteredData = [];
let fuse = null;

let currentPage = 1;
const pageSize = 20;
let soloGratuitos = false;

/* ========= UTIL ========= */
function parseMonto(v) {
  if (!v) return 0;
  return Number(v.toString().replace(/[^\d.]/g, "")) || 0;
}

function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

/* ========= MAPEO ========= */
function mapRow(r) {
  return {
    origen: r.origen || "",
    unidad: r.unidad || "",
    cxc: r.cxc || "",
    area: r.area || "",
    proceso: r.proceso || "",
    tarifa: r.tarifa || "",
    monto: parseMonto(r.monto),
    requisitos: r.requisitos || "",
    correo: r.correo || "",
    celular: (r.celular || "").replace(/\D/g, "")
  };
}

/* ========= CARGA CSV ========= */
function loadCSV() {
  Papa.parse(CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: res => {
      rawData = res.data;
      data = rawData.map(mapRow);
      initFuse();
      initFilters();
      applyFilters();
      statusEl.style.display = "none";
    },
    error: err => {
      statusEl.textContent = "Error cargando datos";
      console.error(err);
    }
  });
}

/* ========= FUSE ========= */
function initFuse() {
  fuse = new Fuse(data, {
    keys: ["proceso", "tarifa", "unidad", "area"],
    threshold: 0.35
  });
}

/* ========= FILTROS ========= */
function initFilters() {
  const unidades = [...new Set(data.map(d => d.unidad).filter(Boolean))].sort();
  unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;
  unidades.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    unidadFilter.appendChild(opt);
  });

  const maxMonto = Math.max(...data.map(d => d.monto));
  montoRange.max = maxMonto;
  montoRange.value = maxMonto;
  montoMax.textContent = maxMonto;
}

/* ========= APLICAR FILTROS ========= */
function applyFilters() {
  let results = [...data];
  const q = searchInput.value.trim();
  const unidad = unidadFilter.value;
  const monto = Number(montoRange.value);

  if (q.length >= 2) {
    results = fuse.search(q).map(r => r.item);
  }

  if (unidad) {
    results = results.filter(r => r.unidad === unidad);
  }

  if (soloGratuitos) {
    results = results.filter(r => r.monto === 0);
  } else {
    results = results.filter(r => r.monto <= monto);
  }

  filteredData = results;
  renderPage(1);
}

/* ========= RENDER ========= */
function renderPage(page) {
  currentPage = page;
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  renderCards(filteredData.slice(start, end));
  renderPagination(totalPages);
}

function renderCards(items) {
  cardsContainer.innerHTML = "";
  if (!items.length) {
    cardsContainer.innerHTML = "<p>No hay resultados</p>";
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <span class="tag">Origen: ${escapeHTML(item.origen)}</span>
      <h3>${escapeHTML(item.proceso)}</h3>
      <p><strong>Tarifa:</strong> ${escapeHTML(item.tarifa)}</p>
      <p><strong>Monto:</strong> S/ ${item.monto.toFixed(2)}</p>
      <p><strong>Unidad:</strong> ${escapeHTML(item.unidad)}</p>
      <p><strong>Área:</strong> ${escapeHTML(item.area)}</p>

      <div class="actions">
        <button class="btn requisitos">Requisitos</button>
        <a class="btn gmail" target="_blank"
           href="https://mail.google.com/mail/?view=cm&fs=1&to=${item.correo}">
           📧 Correo
        </a>
        <a class="btn whatsapp" target="_blank"
           href="https://wa.me/51${item.celular}">
           💬 WhatsApp
        </a>
      </div>
    `;

    card.querySelector(".requisitos").onclick = () => openModal(item);
    cardsContainer.appendChild(card);
  });
}

function renderPagination(total) {
  paginationEl.innerHTML = "";
  if (total <= 1) return;

  for (let i = 1; i <= total; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = i === currentPage ? "active" : "";
    btn.onclick = () => renderPage(i);
    paginationEl.appendChild(btn);
  }
}

/* ========= MODAL ========= */
function openModal(item) {
  modalTitle.textContent = item.proceso;
  modalUnidad.textContent = item.unidad;
  modalArea.textContent = item.area;
  modalCorreo.textContent = item.correo || "—";
  modalTelefono.textContent = item.celular || "—";

  modalCorreoLink.href = item.correo ? `mailto:${item.correo}` : "#";
  modalTelefonoLink.href = item.celular ? `https://wa.me/51${item.celular}` : "#";

  modalRequisitos.innerHTML = `<ul>${item.requisitos
    .split(/\n|;/)
    .map(r => `<li>${r}</li>`)
    .join("")}</ul>`;

  canalSelect.value = "";
  estimationResult.textContent = "";
  modalOverlay.dataset.item = JSON.stringify(item);

  modalOverlay.classList.remove("hidden");
}

modalClose.onclick = () => modalOverlay.classList.add("hidden");

/* ========= CALCULO ========= */
canalSelect.onchange = () => {
  const item = JSON.parse(modalOverlay.dataset.item);
  let comision = 0;

  if (canalSelect.value === "caja_unh" && item.monto >= 20) comision = 1;
  if (canalSelect.value === "bn_fijo" && item.monto <= 144) comision = 1.8;
  if (canalSelect.value === "bn_pct" && item.monto > 144) comision = item.monto * 0.0125;
  if (canalSelect.value === "caja_huancayo") comision = 1;
  if (canalSelect.value === "niubiz") comision = item.monto * 0.058;

  estimationResult.textContent =
    `Monto base: S/ ${item.monto.toFixed(2)} | Comisión: S/ ${comision.toFixed(2)} | Total estimado: S/ ${(item.monto + comision).toFixed(2)}`;
};

/* ========= PDF ========= */
exportPdfBtn.onclick = () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape");

  const now = new Date().toLocaleString("es-PE");
  const filtro = unidadFilter.value || searchInput.value || "General";

  doc.text(`Tarifario UNH – ${filtro}`, 14, 15);
  doc.text(`Exportado: ${now}`, 14, 25);

  doc.autoTable({
    startY: 35,
    head: [["Proceso", "Tarifa", "Monto", "Unidad", "Origen"]],
    body: filteredData.map(r => [
      r.proceso,
      r.tarifa,
      r.monto.toFixed(2),
      r.unidad,
      r.origen
    ])
  });

  doc.save(`Tarifario_${filtro}.pdf`);
};

/* ========= EVENTOS ========= */
searchInput.oninput = applyFilters;
unidadFilter.onchange = applyFilters;
montoRange.oninput = () => montoMax.textContent = montoRange.value;

gratuitoBtn.onclick = () => {
  soloGratuitos = !soloGratuitos;
  gratuitoBtn.classList.toggle("active", soloGratuitos);
  applyFilters();
};

/* ========= INIT ========= */
if (CSV_URL) loadCSV();
else statusEl.textContent = "CSV no configurado";

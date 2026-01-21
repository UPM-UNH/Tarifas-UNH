/* ==========================================================
   TARIFARIO UNH – script.js
   ==========================================================
   Funcionalidades:
   - Lectura CSV desde Google Sheets (PapaParse)
   - Búsqueda difusa (Fuse.js)
   - Filtros por unidad y rango de monto
   - Paginación
   - Modal con requisitos y contactos
   - Calculadora de comisiones
   - Exportación PDF (jsPDF + autoTable)
========================================================== */

/* =======================
   CONFIGURACIÓN
======================= */

const CSV_URL =
  typeof SHEET_CSV_URL !== "undefined" ? SHEET_CSV_URL : "";

/* =======================
   DOM
======================= */

const searchInput = document.getElementById("searchInput");
const unidadFilter = document.getElementById("unidadFilter");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const cardsContainer = document.getElementById("cardsContainer");
const statusEl = document.getElementById("status");
const paginationEl = document.getElementById("pagination");

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
const modalCloseBtn = document.getElementById("modalClose");

const canalSelect = document.getElementById("canalSelect");
const estimationResult = document.getElementById("estimationResult");

/* =======================
   DATA
======================= */

let rawData = [];
let data = [];
let filteredData = [];
let fuse = null;

const pageSize = CONFIG?.PAGE_SIZE || 21;
let currentPage = 1;

/* =======================
   UTILIDADES
======================= */

function normalizeKey(str) {
  return str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseMonto(value) {
  if (!value) return 0;
  return parseFloat(
    value
      .toString()
      .replace(/s\/|soles|sol/gi, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "")
  ) || 0;
}

function escapeHTML(text) {
  return text
    ? text.replace(/[&<>"']/g, m =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
      )
    : "";
}

/* =======================
   MAPEO DE FILA
======================= */

function mapRow(row) {
  const r = {};
  Object.keys(row).forEach(k => (r[normalizeKey(k)] = row[k]));

  return {
    origen: r["origen"] || "",
    unidad: r["unidad"] || "",
    cxc: r["cxc"] || "",
    area: r["area"] || "",
    proceso: r["proceso"] || "",
    tarifa: r["tarifa"] || "",
    monto: parseMonto(r["monto"]),
    montoRaw: r["monto"] || "",
    requisitos: r["requisitos"] || "",
    correo: r["correo"] || "",
    celular: (r["celular"] || "").replace(/\D/g, "")
  };
}

/* =======================
   CARGA CSV
======================= */

function loadCSV() {
  if (!CSV_URL) {
    statusEl.textContent = "❌ No se ha configurado la URL del CSV.";
    return;
  }

  statusEl.textContent = "Cargando datos…";

  Papa.parse(CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: res => {
      rawData = res.data || [];
      data = rawData.map(mapRow).filter(d => d.tarifa || d.proceso);

      if (!data.length) {
        statusEl.textContent = "⚠️ No se encontraron registros.";
        return;
      }

      fuse = new Fuse(data, {
        keys: ["proceso", "tarifa", "unidad", "area"],
        threshold: 0.35
      });

      populateUnidadFilter();
      applyFilters();

      statusEl.textContent = "";
    },
    error: err => {
      console.error(err);
      statusEl.textContent = "❌ Error al cargar el CSV.";
    }
  });
}

/* =======================
   FILTROS
======================= */

function populateUnidadFilter() {
  const unidades = [...new Set(data.map(d => d.unidad).filter(Boolean))].sort();
  unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;
  unidades.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    unidadFilter.appendChild(opt);
  });
}

function applyFilters() {
  const q = searchInput.value.trim();
  const unidad = unidadFilter.value;
  const soloGratis = freeFilter?.checked;

  let results = [...data];

  if (q.length >= 2) {
    results = fuse.search(q).map(r => r.item);
  }

  if (unidad) {
    results = results.filter(d => d.unidad === unidad);
  }

  if (soloGratis) {
    results = results.filter(d => d.monto === 0);
  }

  results.sort((a, b) =>
    a.origen.toLowerCase() === "tupa" ? -1 : 1
  );

  filteredData = results;
  renderPage(1);
}


/* =======================
   RENDER
======================= */

function renderPage(page) {
  currentPage = page;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  renderCards(filteredData.slice(start, end));
  renderPagination(Math.ceil(filteredData.length / pageSize));
}

function renderCards(items) {
  cardsContainer.innerHTML = "";

  if (!items.length) {
    cardsContainer.innerHTML = `<div class="status">No hay resultados.</div>`;
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="tag-origen">Origen: ${escapeHTML(item.origen)}</div>
      <div class="card-title">${escapeHTML(item.proceso)}</div>
      <div class="meta"><strong>Tarifa:</strong> ${escapeHTML(item.tarifa)}</div>
      <div class="meta"><strong>Monto:</strong> S/ ${item.monto.toFixed(2)}</div>
      <div class="meta"><strong>Unidad:</strong> ${escapeHTML(item.unidad)}</div>
      <div class="meta"><strong>Área:</strong> ${escapeHTML(item.area)}</div>

      <div class="actions">
        <button class="btn btn-requisitos">
         <i class="bi bi-list-check"></i> Requisitos
        </button>

        <a class="btn btn-mail" href="mailto:${item.correo}">
        <i class="bi bi-envelope-fill"></i> Correo
        </a>

        <a class="btn btn-ws" target="_blank"
        href="https://wa.me/51${item.celular}">
        <i class="bi bi-whatsapp"></i> WhatsApp
        </a>
      </div>
    `;

    card.querySelector(".btn-requisitos").onclick = () => openModal(item);
    cardsContainer.appendChild(card);
  });
}

function renderPagination(totalPages) {
  paginationEl.innerHTML = "";
  if (totalPages <= 1) return;

  for (let i = 1; i <= totalPages; i++) {
    const b = document.createElement("button");
    b.textContent = i;
    b.className = i === currentPage ? "page-btn active" : "page-btn";
    b.onclick = () => renderPage(i);
    paginationEl.appendChild(b);
  }
}

/* =======================
   MODAL
======================= */

function openModal(item) {
  modalTitle.dataset.monto = item.monto;
  modalTitle.textContent = item.proceso || item.tarifa;
  modalUnidad.textContent = item.unidad;
  modalArea.textContent = item.area;
  modalCorreo.textContent = item.correo || "—";
  modalTelefono.textContent = item.celular || "—";

  modalCorreoLink.href = item.correo ? `mailto:${item.correo}` : "#";
  modalTelefonoLink.href = item.celular ? `https://wa.me/51${item.celular}` : "#";

  modalRequisitos.innerHTML = `<ul>${item.requisitos
    .split(/\n|;|\./)
    .filter(Boolean)
    .map(r => `<li>${escapeHTML(r)}</li>`)
    .join("")}</ul>`;

  modalOverlay.classList.remove("hidden");
}

/* =======================
   EVENTOS
======================= */

searchInput.oninput = applyFilters;
unidadFilter.onchange = applyFilters;
modalCloseBtn.onclick = () => modalOverlay.classList.add("hidden");
if (freeFilter) {
  freeFilter.onchange = applyFilters;
}

/* =======================
   INIT
======================= */

canalSelect.onchange = () => {
  const monto = parseFloat(
    modalTitle.dataset.monto || 0
  );

  let comision = 0;

  switch (canalSelect.value) {
    case "caja_unh":
      comision = monto >= 20 ? 1 : 0;
      break;
    case "bn_fijo":
      comision = monto <= 144 ? 1.8 : 0;
      break;
    case "bn_pct":
      comision = monto > 144 ? monto * 0.0125 : 0;
      break;
    case "caja_huancayo":
      comision = 1;
      break;
    case "niubiz":
      comision = monto * 0.058;
      break;
  }

  estimationResult.innerHTML = `
    <strong>Monto base:</strong> S/ ${monto.toFixed(2)}<br>
    <strong>Comisión:</strong> S/ ${comision.toFixed(2)}<br>
    <strong>Total estimado:</strong> <b>S/ ${(monto + comision).toFixed(2)}</b>
  `;
};

exportPdfBtn.onclick = () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const now = new Date();
  const fecha = now.toLocaleDateString("es-PE");
  const hora = now.toLocaleTimeString("es-PE");

  doc.setFontSize(14);
  doc.text("Tarifario TUPA / TUSNE – UNH", 14, 15);

  doc.setFontSize(9);
  doc.text(`Exportado el: ${fecha} ${hora}`, 14, 22);

  const rows = filteredData.map(d => [
    d.origen,
    d.proceso,
    d.tarifa,
    `S/ ${d.monto.toFixed(2)}`,
    d.unidad
  ]);

  doc.autoTable({
    startY: 28,
    head: [["Origen", "Proceso", "Tarifa", "Monto", "Unidad"]],
    body: rows,
    styles: { fontSize: 8 }
  });

  doc.save("Tarifario_UNH.pdf");
};
/* =======================
   EXPORTACIÓN PDF
======================= */

exportPdfBtn.onclick = () => {
  if (!filteredData.length) {
    alert("No hay datos para exportar.");
    return;
  }

  const { jsPDF } = window.jspdf;

  /* 1️⃣ Documento horizontal */
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  /* 2️⃣ Título dinámico */
  const unidadSeleccionada = unidadFilter.value
    ? `Unidad: ${unidadFilter.value}`
    : "Todas las unidades";

  doc.setFontSize(14);
  doc.text("Tarifario TUPA / TUSNE – UNH", pageWidth / 2, 40, {
    align: "center"
  });

  doc.setFontSize(10);
  doc.text(unidadSeleccionada, pageWidth / 2, 58, {
    align: "center"
  });

  /* 3️⃣ Mensaje previo a la tabla */
  doc.setFontSize(9);
  doc.setTextColor(90);

  const warningText =
    "⚠️ Los montos consignados corresponden a tarifas base y están sujetos " +
    "al cobro de comisiones adicionales según la entidad recaudadora.";

  doc.text(warningText, 40, 80, {
    maxWidth: pageWidth - 80,
    align: "left"
  });

  /* 4️⃣ Construcción de la tabla */
  const tableData = filteredData.map(item => [
    item.tarifa,
    `S/ ${item.monto.toFixed(2)}`,
    item.origen,
    item.unidad,
    item.requisitos
  ]);

  doc.autoTable({
    startY: 110,
    head: [[
      "Tarifa",
      "Monto",
      "Origen",
      "Unidad",
      "Requisitos"
    ]],
    body: tableData,

    /* 5️⃣ Anchos de columna */
    columnStyles: {
      0: { cellWidth: 180 }, // Tarifa
      1: { cellWidth: 70 },  // Monto
      2: { cellWidth: 90 },  // Origen
      3: { cellWidth: 150 }, // Unidad
      4: { cellWidth: "auto" } // Requisitos (más grande)
    },

    styles: {
      fontSize: 8,
      cellPadding: 4,
      valign: "top"
    },

    headStyles: {
      fillColor: [0, 56, 102],
      textColor: 255,
      fontStyle: "bold"
    }
  });

  /* 6️⃣ Fecha y hora de exportación */
  const fecha = new Date().toLocaleString("es-PE");

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Exportado el: ${fecha}`,
    pageWidth - 40,
    doc.internal.pageSize.getHeight() - 20,
    { align: "right" }
  );

  /* 7️⃣ Guardar */
  doc.save("tarifario_unh.pdf");
};

loadCSV();

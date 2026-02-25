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
   CONFIGURACIÓNN
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
const controlsSection = document.getElementById("controlsSection");
const warningSection = document.getElementById("warningSection");
const serviceSelection = document.getElementById("serviceSelection");
const btnPregrado = document.getElementById("btnPregrado");
const btnPosgrado = document.getElementById("btnPosgrado");
const generalFilters = document.getElementById("generalFilters");
const chkPregrado = document.getElementById("chkPregrado");
const chkExterno = document.getElementById("chkExterno");
const chkTrabajador = document.getElementById("chkTrabajador");

btnPregrado.addEventListener("click", activarModoGeneral);
btnPosgrado.addEventListener("click", activarModoPosgrado);

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
let modoActual = null; // "general" | "posgrado"
let facultadSeleccionada = null;
let dataContexto = []; // Data filtrada según modo

const pageSize = CONFIG?.PAGE_SIZE || 21;
let currentPage = 1;

/* =======================
   UTILIDADES
======================= */

function volverInicio() {
  controlsSection.classList.add("hidden");
  warningSection.classList.add("hidden");
  modoActual = null;
  facultadSeleccionada = null;
  dataContexto = [];
  filteredData = [];

  // Limpiar filtros
  searchInput.value = "";
  unidadFilter.value = "";
  if (typeof freeFilter !== "undefined" && freeFilter) {
    freeFilter.checked = false;
  }

  // Limpiar selector unidad
  unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;

  mostrarPantallaInicial();
}

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
function formatRequisitosForPDF(text) {
  if (!text) return "";

  return text
    .split(/\n|;|\./)
    .map(r => r.trim())
    .filter(r => r.length > 0)
    .map(r => "• " + r)
    .join("\n");
}

function updateCanalOptions(item) {
  const monto = item.monto;
  const textoProceso = (item.proceso + " " + item.tarifa).toLowerCase();

  Array.from(canalSelect.options).forEach(opt => {
    opt.disabled = false;
  });

  // Caja UNH: solo si monto >= 20
  canalSelect.querySelector('option[value="caja_unh"]').disabled = monto < 20;

  // Caja UNH gratuito: solo si monto < 20
  canalSelect.querySelector('option[value="caja_unh_gratis"]').disabled = monto >= 20;

  // Banco Nación fijo: solo hasta 144
  canalSelect.querySelector('option[value="bn_fijo"]').disabled = monto > 144;

  // Banco Nación porcentaje: solo mayor a 144
  canalSelect.querySelector('option[value="bn_pct"]').disabled = monto <= 144;

  // Niubiz: solo si contiene "matrícula"
  const esMatricula = textoProceso.includes("matricula") || textoProceso.includes("matrícula");
  canalSelect.querySelector('option[value="niubiz"]').disabled = !esMatricula;

  // Si la opción seleccionada quedó inválida, limpiar
  if (canalSelect.selectedOptions[0]?.disabled) {
    canalSelect.value = "";
    estimationResult.textContent = "";
  }
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
  celular: (r["celular"] || "").replace(/\D/g, ""),
  codigopago: r["codigopago"] || "",
  posgrado: r["posgrado"] || "",
  pregrado: r["pregrado"] || "",
  externo: r["externo"] || "",
  trabajadorunh: r["trabajadorunh"] || ""
};
}
/* =======================
   CARGA CSV
======================= */
function mostrarPantallaInicial() {
  serviceSelection.classList.remove("hidden");
  controlsSection.classList.add("hidden");
  warningSection.classList.add("hidden");
  cardsContainer.innerHTML = "";
  paginationEl.innerHTML = "";
}

function activarModoGeneral() {
  controlsSection.classList.remove("hidden");
  warningSection.classList.remove("hidden");
  generalFilters.classList.remove("hidden");
  serviceSelection.classList.add("hidden");
  modoActual = "general";
  

  dataContexto = data.filter(d =>
    (
      d.pregrado === "X" ||
      d.externo === "X" ||
      d.trabajadorunh === "X"
    ) &&
    !normalizeKey(d.unidad).startsWith("upg")
  );

  filteredData = [...dataContexto];

  populateUnidadFilter();
  applyFilters();
}

function activarModoPosgrado() {

  serviceSelection.classList.add("hidden");
  controlsSection.classList.add("hidden");
  warningSection.classList.add("hidden");

   
  if (generalFilters) {
    generalFilters.classList.add("hidden");
  }

  // 🔥 ASEGURAR QUE EL CONTENEDOR ESTÉ VISIBLE
  cardsContainer.classList.remove("hidden");
  paginationEl.classList.add("hidden");
  statusEl.classList.add("hidden");

  modoActual = "posgrado";

  cardsContainer.innerHTML = "";
  modalOverlay.classList.add("hidden");
  modalOverlay.style.display = "none";
  mostrarSelectorFacultad();
}

function mostrarSelectorFacultad() {
console.log("Facultades encontradas:", facultades.length);
cardsContainer.classList.remove("cards");
cardsContainer.classList.add("facultad-mode");
  const facultades = [...new Set(
    data
      .filter(d =>
        d.posgrado === "X" &&
        normalizeKey(d.area).startsWith("upg")
      )
      .map(d => d.area)
      .filter(Boolean)
  )].sort();

  cardsContainer.innerHTML = `
    <div class="facultad-selector">

      <button class="btn-back" onclick="volverInicio()">
        <i class="bi bi-arrow-left-circle"></i> Volver
      </button>

      <h2 class="facultad-title">
        Seleccione Facultad
      </h2>

      <div class="facultad-cards">

        <div class="facultad-card" onclick="seleccionarFacultad('todas')">
          <i class="bi bi-collection-fill"></i>
          <span>Todas</span>
        </div>

        ${facultades.map(f => `
          <div class="facultad-card"
               onclick="seleccionarFacultad('${f}')">
            <i class="bi bi-building"></i>
            <span>${f}</span>
          </div>
        `).join("")}

      </div>

    </div>
  `;

  paginationEl.innerHTML = "";
}

function seleccionarFacultad(facultad) {

 cardsContainer.classList.remove("cards");
 cardsContainer.classList.add("facultad-mode");

  controlsSection.classList.remove("hidden");
  warningSection.classList.remove("hidden");

  facultadSeleccionada = facultad;

  if (facultad === "todas") {

    dataContexto = data.filter(d =>
      d.posgrado === "X"
    );

  } else {

    dataContexto = data.filter(d => {

      if (d.posgrado !== "X") return false;

      const areaNormalizada = normalizeKey(d.area);

      const esOtraUPG =
        areaNormalizada.startsWith("upg") &&
        d.area !== facultad;

      return (
        d.area === facultad ||  // propia facultad
        !areaNormalizada.startsWith("upg")  // generales
      );
    });

  }

  filteredData = [...dataContexto];

  populateUnidadFilter();
  applyFilters();
}

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

       const requiredCols = [
     "origen",
     "unidad",
     "area",
     "proceso",
     "tarifa",
     "monto",
     "requisitos",
     "correo",
     "celular"
      ];

   const headers = Object.keys(rawData[0] || {}).map(normalizeKey);

   const missing = requiredCols.filter(c => !headers.includes(c));

   if (missing.length) {
     statusEl.textContent =
       "❌ Error en la base de datos. Faltan columnas: " +
       missing.join(", ");
     return;
   }
      data = rawData.map(mapRow).filter(d => d.tarifa || d.proceso);

      if (!data.length) {
        statusEl.textContent = "⚠️ No se encontraron registros.";
        return;
      }

      fuse = new Fuse(data, {
        keys: ["proceso", "tarifa", "unidad", "area"],
        threshold: 0.35
      });

      statusEl.textContent = "";
      mostrarPantallaInicial();
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
  const unidades = [...new Set(
    dataContexto
      .map(d => d.unidad)
      .filter(Boolean)
  )].sort();

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

  let baseData = [...dataContexto];

  if (modoActual === "general") {

    const filtrosActivos = [];

    if (chkPregrado.checked) filtrosActivos.push("pregrado");
    if (chkExterno.checked) filtrosActivos.push("externo");
    if (chkTrabajador.checked) filtrosActivos.push("trabajadorunh");

    if (filtrosActivos.length > 0) {
      baseData = baseData.filter(d =>
        filtrosActivos.some(f => d[f] === "X")
      );
    }
  }

  let results = [...baseData];

  if (q.length >= 2) {
    const fuseLocal = new Fuse(baseData, {
      keys: ["proceso", "tarifa", "unidad", "area"],
      threshold: 0.35
    });
    results = fuseLocal.search(q).map(r => r.item);
  }

  if (unidad) {
    results = results.filter(d =>
      normalizeKey(d.unidad) === normalizeKey(unidad)
    );
  }

  if (soloGratis) {
    results = results.filter(d => d.monto === 0);
  }

  results.sort((a, b) => {

    if (modoActual === "posgrado") {
      const aEsUPG = normalizeKey(a.area).startsWith("upg");
      const bEsUPG = normalizeKey(b.area).startsWith("upg");

      if (aEsUPG && !bEsUPG) return -1;
      if (!aEsUPG && bEsUPG) return 1;
    }

    if (a.origen.toLowerCase() === "tupa" &&
        b.origen.toLowerCase() !== "tupa") return -1;

    if (b.origen.toLowerCase() === "tupa" &&
        a.origen.toLowerCase() !== "tupa") return 1;

    return 0;
  });

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

  if (modoActual) {
    const volverBtn = document.createElement("button");
    volverBtn.className = "btn";
    volverBtn.textContent = "← Volver";
    volverBtn.style.marginBottom = "20px";
    volverBtn.onclick = volverInicio;
    cardsContainer.appendChild(volverBtn);
  }

  if (!items.length) {
    cardsContainer.innerHTML += `<div class="status">No hay resultados.</div>`;
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
  let maxVisible = 5;
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + maxVisible - 1);
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
  modalTitle.dataset.codigopago = item.codigopago || "";
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

   updateCanalOptions(item);
   // 🔒 Si es gratuito, deshabilitar canal
  if (item.monto === 0) {
  canalSelect.value = "";
  canalSelect.disabled = true;

  estimationResult.innerHTML = `
    <strong>Este servicio no requiere pago.</strong>
  `;
} else {
  canalSelect.disabled = false;
  estimationResult.textContent = "";
}
   modalOverlay.classList.remove("hidden");
}

/* =======================
   EVENTOS
======================= */

searchInput.oninput = applyFilters;
chkPregrado.onchange = applyFilters;
chkExterno.onchange = applyFilters;
chkTrabajador.onchange = applyFilters;
unidadFilter.onchange = applyFilters;
modalCloseBtn.onclick = () => modalOverlay.classList.add("hidden");
if (freeFilter) {
  freeFilter.onchange = applyFilters;
}

/* =======================
   INIT
======================= */

canalSelect.onchange = () => {
  const monto = parseFloat(modalTitle.dataset.monto || 0);
  const codigosRaw = modalTitle.dataset.codigopago || "";

  let comision = 0;
  let codigoMostrar = "";
  let mensajeEspecial = "";

  switch (canalSelect.value) {
    case "caja_unh":
      comision = monto >= 20 ? 1 : 0;
      codigoMostrar = codigosRaw.split(/\r?\n/)[0] || "";
      break;

    case "caja_unh_gratis":
      comision = 0;
      codigoMostrar = codigosRaw.split(/\r?\n/)[0] || "";
    break;

    case "bn_fijo":
    case "bn_pct":
      comision = canalSelect.value === "bn_fijo"
        ? (monto <= 144 ? 1.8 : 0)
        : (monto > 144 ? monto * 0.0125 : 0);
      codigoMostrar = codigosRaw.split(/\r?\n/)[1] || "";
      break;

    case "caja_huancayo":
      comision = 1;
      codigoMostrar = codigosRaw.split(/\r?\n/)[2] || "";
      break;

    case "niubiz":
      comision = monto * 0.058;
      mensajeEspecial = "Pago mediante cupón generado en SISADES.";
      break;
  }

  let bloqueCodigo = "";

  if (mensajeEspecial) {
    bloqueCodigo = `<br><strong>${mensajeEspecial}</strong>`;
  } else if (monto === 0) {
    bloqueCodigo = `<br><strong>Este servicio no requiere pago.</strong>`;
  } else if (codigoMostrar) {
    bloqueCodigo = `<br><strong>Código de pago:</strong> ${codigoMostrar}`;
  } else if (!codigoMostrar && monto > 0) {
    bloqueCodigo = `<br><strong>Código de pago en proceso de asignación.</strong>`;
  }

  estimationResult.innerHTML = `
    <strong>Monto base:</strong> S/ ${monto.toFixed(2)}<br>
    <strong>Comisión:</strong> S/ ${comision.toFixed(2)}<br>
    <strong>Total estimado:</strong> <b>S/ ${(monto + comision).toFixed(2)}</b>
    ${bloqueCodigo}
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
  // ===============================
// Nota institucional (PDF)
// ===============================
doc.setFont("helvetica", "normal");
doc.setFontSize(9);
doc.setTextColor(90);

const warningText =
  "Los montos consignados corresponden a tarifas base y están sujetos " +
  "al cobro de comisiones adicionales según la entidad recaudadora.";

// Dimensiones
const noteX = 40;
const noteY = 78;
const noteWidth = pageWidth - 80;
const notePadding = 8;

// Calcular alto del texto
const textLines = doc.splitTextToSize(warningText, noteWidth - notePadding * 2);
const noteHeight = textLines.length * 11 + notePadding * 2;

// Fondo de la nota
doc.setFillColor(245, 245, 245); // gris muy claro
doc.rect(noteX, noteY, noteWidth, noteHeight, "F");

// Borde de la nota
doc.setDrawColor(200);
doc.rect(noteX, noteY, noteWidth, noteHeight);

// Texto
doc.text(
  textLines,
  noteX + noteWidth / 2,
  noteY + notePadding + 9,
  { align: "center" }
);

  /* 4️⃣ Construcción de la tabla */
  const tableData = filteredData.map(item => [
  item.proceso,
  item.tarifa,
  `S/ ${item.monto.toFixed(2)}`,
  item.origen,
  item.unidad,
  formatRequisitosForPDF(item.requisitos)
]);

  doc.autoTable({
    startY: 110,
    head: [[
      "Proceso",
      "Tarifa",
      "Monto",
      "Origen",
      "Unidad",
      "Requisitos"
    ]],
    body: tableData,

    /* 5️⃣ Anchos de columna */
    columnStyles: {
     0: { cellWidth: 160 }, // Proceso
     1: { cellWidth: 160 }, // Tarifa
     2: { cellWidth: 60 },  // Monto (más pequeño)
     3: { cellWidth: 60 },  // Origen (más pequeño)
     4: { cellWidth: 140 }, // Unidad
     5: { cellWidth: "auto" } // Requisitos (la más grande)
   },

    styles: {
      fontSize: 8,
      cellPadding: 4,
      valign: "middle",
      halign: "center"
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

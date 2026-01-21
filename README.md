# Tarifas-UNH
Widget de consulta de tarifas TUPA / TUSNE - UNH

# Widget Tarifario TUPA / TUSNE – UNH

Este widget permite la consulta interactiva de tarifas institucionales
(TUPA / TUSNE) a partir de una base de datos alojada en Google Sheets,
publicada como archivo CSV.

---

## 📊 Base de datos (Google Sheets)

El widget consume datos desde **una hoja específica** de Google Sheets
publicada como CSV.

### ✔ Reglas fundamentales

- El widget **NO depende del orden de filas ni columnas**
- El widget **SÍ depende de los nombres de los encabezados**
- Se pueden insertar, eliminar o modificar filas sin afectar el sistema

---

## 🧾 Encabezados obligatorios

La hoja publicada debe contener, como mínimo, los siguientes encabezados
(escritura exacta, sin renombrar):

- origen
- unidad
- area
- proceso
- tarifa
- monto
- requisitos
- correo
- celular

> ⚠️ No renombrar ni eliminar estos encabezados.

---

## ➕ Columnas adicionales

Se pueden agregar nuevas columnas con otros encabezados
sin afectar el widget.

Ejemplos:
- observaciones
- vigencia
- responsable
- notas internas

Estas columnas serán ignoradas por el sistema mientras no sean utilizadas.

---

## 📄 Hojas adicionales en el libro

Es totalmente válido agregar más hojas al archivo de Google Sheets.

✔ Permitido:
- Hojas de pruebas
- Hojas históricas
- Hojas de respaldo
- Hojas de trabajo interno

⚠️ Importante:
- La hoja publicada como CSV **no debe cambiar**
- No eliminar ni reemplazar la hoja publicada

---

## 🚫 Prácticas NO recomendadas

- No combinar (merge) celdas dentro del rango de datos
- No usar fórmulas que devuelvan errores (`#N/A`, `#ERROR`)
- No reemplazar valores numéricos por texto en la columna `monto`
- No modificar permisos del archivo (debe ser público)

---

## 🔐 Recomendaciones operativas

- Mantener una hoja “TARIFARIO_PUBLICO” exclusiva para el widget
- Duplicar el archivo antes de cambios masivos
- Verificar que el enlace CSV siga activo luego de cualquier ajuste

---

## 📤 Exportación

El widget genera reportes PDF con:
- Orientación horizontal
- Columnas centradas
- Requisitos formateados con viñetas
- Nota institucional sobre tarifas base y comisiones

---

## 🛠️ Soporte técnico

Cualquier modificación estructural del widget
debe considerar compatibilidad con el CSV publicado.

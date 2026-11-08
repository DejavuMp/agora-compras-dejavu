# Fichas de Staff · Dejavú Marketing

**Portal:** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/

**Formulario de pago (URL permanente):** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/formulario/

**Generador publicado:** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/herramienta/

Estos enlaces son diferentes al generador de fichas de eventos en `/fichas/`.

## Cambiar el formulario de cada mes
1. Edita `fichas/staff/config.json` desde GitHub (icono lápiz).
2. Agrega a `forms` un registro con un ID nuevo, mes, título y URL HTTPS.
3. Sustituye `activeFormId` por el ID nuevo.
4. Actualiza `updatedAt` y guarda **Commit changes**.
5. Comprueba la URL permanente `/fichas/staff/formulario/`; no hace falta modificar ni reenviar fichas previas.

Los registros antiguos en `forms` permanecen como historial; no borrar a menos que sea necesario por privacidad. La nueva herramienta de Staff utiliza la URL permanente tanto para el botón como para el QR, las fichas HTML e indicaciones por WhatsApp. Las fichas generadas anteriormente con un enlace absoluto **no cambian retroactivamente**.

## Archivo de fichas públicas aprobadas
- Coloca únicamente documentos anonimizados y autorizados en `fichas/staff/archivo/`. Pueden ser PDF, PNG, JPG, WEBP o HTML.
- Nombre recomendado: `DJV-20261108-001__HOT-CRUJI__2026-11-08__v1.pdf`.
- El buscador intenta detectar folio, campaña, fecha y versión del nombre. Versiones v2, v3 mantienen mismo folio.
- También puedes añadir referencias externas autorizadas en `config.json`, lista `fichas` con campos `folio`, `campana`, `fecha`, `version`, `url`.

## Protección de datos y respaldos
**El repositorio y GitHub Pages son públicos.** No publiques fichas que tengan nombres de staff, teléfonos, datos de pago, fotografías de personas o evidencias confidenciales. Usa Drive privado con permisos de agencia para fichas completas; en el portal público solo publica material depurado. Los vínculos de Drive privados mantienen sus permisos, pero evita revelar datos sensibles en la ficha del catálogo.

La herramienta original almacena fichas en localStorage e imágenes en IndexedDB: las seis fichas de una computadora no se sincronizan al abrir GitHub Pages. En la aplicación local selecciona **Fichas guardadas → Exportar respaldo JSON** para conservarlas; importa ese respaldo en la nueva herramienta con **Importar respaldo JSON**. No subas ese JSON a GitHub.

## Estructura
- `index.html`: sitio de consultas.
- `config.json`: formulario vigente, historial mensual y entradas depuradas.
- `formulario/index.html`: acceso permanente que redirige al enlace mensual.
- `herramienta/index.html`: generador publicado con referencia al enlace permanente.
- `archivo/`: repositorio opcional de documentos depurados.

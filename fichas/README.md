# Fichas de Evento · Portal Dejavú

Este directorio es un **archivo de consulta pública**, servido desde GitHub Pages. Se creó sin modificar los módulos existentes de Ágora Compras.

## Acceso fijo

Dirección esperada si GitHub Pages publica el branch `main` desde raíz: `https://dejavump.github.io/agora-compras-dejavu/fichas/`.

## Agregar una ficha

1. En GitHub, abrir `fichas/archivo/`.
2. Usar **Add file → Upload files** para publicar únicamente fichas **aprobadas y depuradas**.
3. Preferir nombres: `DVM-EVT-2026-0001__PROYECTO__2026-11-08__activacion__v1.pdf`.
4. Confirmar cambios. El portal consulta la carpeta de GitHub dinámicamente; no necesita editar HTML.
5. Para nuevas versiones usar el mismo folio y cambiar `v1` por `v2` (etc.).

## Enlace de una ficha

Usar `?ficha=DVM-EVT-2026-0001` a continuación de la URL del portal. El registro escogerá la versión de número más alto. El portal genera enlaces mediante el botón «Copiar enlace».

## Fichas privadas

**No subir documentos internos con datos personales a un repositorio público.** Para archivo privado guardar el PDF en Drive con permisos adecuados y agregar solo metadatos que sean aptos para divulgación pública en `catalogo.json`. Las URLs privadas no deben aparecer en el catálogo si revelar su existencia también es sensible.

## Archivos auxiliares

- `index.html`: portal web responsive.
- `catalogo.json`: referencias autorizadas externas. Inicia vacío.
- `archivo/`: archivos aprobados y públicos.
- `herramienta/`: aplicación publicable, con `actual.html` como acceso estable y respaldos de las versiones 1.4 y 1.3.

## Limitaciones

El frontend puede listar y descargar pero no escribir archivos directamente al repositorio porque GitHub Pages no tiene backend. Para subida desde el navegador con permisos, requiere autenticación y almacenamiento protegido, por ejemplo Firebase. Para un número muy alto de documentos GitHub API pública tiene límites de consultas y se recomienda un índice generado automáticamente.

## Estado inicial al 8 de noviembre de 2026

- Portal y enlace fijo de la herramienta publicados en GitHub.
- Versiones 1.4 y 1.3 disponibles desde la sección **Versiones**.
- Aún no hay fichas históricas de eventos en el archivo público; no se inventaron expedientes.
- La URL de GitHub Pages depende de que su despliegue continúe habilitado en el repositorio.

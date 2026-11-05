# ÁGORA · Archivos (aplicación independiente)

**Dirección de la aplicación:** https://dejavump.github.io/agora-compras-dejavu/archivos/

**Compras & Producción:** https://dejavump.github.io/agora-compras-dejavu/

Estas dos herramientas comparten, por ahora, el mismo alojamiento GitHub Pages y el proyecto Firebase `agora-dejavu-38b8c`, pero son **aplicaciones con archivos, navegación y almacenamiento funcional separados**. La aplicación de Compras conserva expedientes y muestras; Archivos administra únicamente el envío, recepción y confirmación de artes, documentos e información compartida.

## Qué incluye Archivos

- `archivos/index.html`: aplicación interna de archivos (autenticación Google y roles de `agora_users`).
- `archivos/app.js`: historial, publicaciones, correcciones, evidencias y creación de correos.
- `archivos/recibir.html#t=...`: enlace externo para el proveedor sin necesidad de entrar a la administración.
- `archivos/recibir.js`: abrir Drive, confirmar recibido, aprobar o solicitar cambios y obtener comprobante imprimible/PDF.
- `archivos/style.css`: diseño propio de ÁGORA Archivos, negro, dorado, tipografía Arial.
- `archivos/manifest.webmanifest` y `archivos/sw.js`: instalación móvil/caché propios.
- `firestore.rules` y `storage.rules`: permisos existentes que la aplicación necesita, sin alterar datos de Compras.

Los datos se conservan en `agora_file_deliveries`, `agora_file_responses` y `agora-file-previews/`; la aplicación de Compras usa otras colecciones y almacenamiento local.

## Cómo enviar archivos

1. Abre **ÁGORA Archivos** e inicia sesión como administradora o coordinadora autorizada.
2. Selecciona **Nuevo envío** y registra el proyecto, destinatario, fecha de vigencia, enlaces de Drive e indicaciones.
3. Opcionalmente agrega vistas de los artes y capturas de los archivos compartidos (Firebase Storage o URL de imagen HTTPS).
4. Publica el expediente en Firebase. Obtendrás un enlace de recepción individual; publicarlo no significa que ya se haya enviado el correo.
5. Abre **Gmail** desde el expediente o copia el correo con evidencia visual; revisa y **envía manualmente**.
6. El proveedor abre el enlace, revisa los archivos en Drive, confirma de recibido o indica problemas/cambios.
7. Firestore registra su respuesta; el proveedor puede **imprimir o guardar PDF** del acuse, y el equipo interno lo ve en el historial.

El enlace identifica al invitado pero no autentica necesariamente la cuenta de Google que lo abre; el comprobante es un **acuse electrónico, no una firma digital certificada**.

## Compatibilidad con enlaces anteriores

Los enlaces históricos `/archivos.html` y `/archivo-recibir.html#t=...` redirigen a `/archivos/` y `/archivos/recibir.html#t=...` conservando el token. No se eliminan datos, respuestas ni imágenes guardados en Firebase. Si un vínculo fue revocado o caducó, seguirá sin estar disponible.

## Publicación y permisos

El repositorio de GitHub Pages contiene ambas aplicaciones en subdirectorios distintos. La separación es funcional y de navegación, **no** implica que se hayan creado dos repositorios ni dos proyectos Firebase. GitHub Pages solo publica el sitio; Firestore y Storage deben conservar sus reglas y permisos publicados. Los archivos originales continúan en Drive. Comprueba que el destinatario tenga permiso para abrirlos.

El repositorio es público: nunca subas presupuestos reales, fotos privadas, tokens, contraseñas ni respaldos.

## Fotografías por enlace (noviembre de 2026)

Las vistas de los artes y las evidencias de la carpeta de Drive admiten enlaces individuales a imágenes. Cada URL se analiza antes de publicar, con galería en el formulario, en el expediente y en la vista del destinatario.

- Usa **un enlace individual por imagen** de `drive.google.com/file/d/ID/view` o una URL HTTPS directa a JPG/PNG/WebP. No pegues una carpeta en el campo de imágenes.
- ÁGORA intenta cargar la miniatura de Drive y otras vistas públicas si falla la primera. Mantiene el enlace original sin cambiarlo ni copiar el archivo a otro servidor.
- Si una imagen está restringida o Drive no permite incrustarla, se muestra un aviso visible y **Abrir original**; no se deja una tarjeta vacía. Esto no concede nuevos permisos.
- En Drive, utiliza **Compartir → Acceso general → Cualquier persona con el enlace → Lector** solo si está autorizado compartir ese arte de esa forma. En materiales confidenciales, comparte únicamente con el correo del destinatario; podrá abrir la imagen en Drive, aunque la miniatura pública puede seguir sin mostrarse.
- Las galerías antiguas se visualizan con el mismo mecanismo. Los envíos guardados en Firestore, sus tokens de recepción y sus comprobantes no se modifican.

Se recuperó el logotipo **oficial dorado de Dejavú Marketing**, utilizado previamente en los correos de ÁGORA, en `archivos/brand.js`. El encabezado de ÁGORA conserva marca, iconografía y su paleta de ónix/negro, mármol claro y oro. El icono procede de `icons/icon-192.png` del repositorio original.

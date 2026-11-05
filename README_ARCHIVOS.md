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

## Edición y correo visual · actualización noviembre 2026

- **Editar expediente** aparece para envíos activos y pendientes de acuse. Permite cambiar el proyecto, tipo, nombre del arte, vigencia, enlace de Drive, indicaciones y fotografías **sin cambiar el enlace público ni el número de versión**. El destinatario asociado al token no cambia.
- Si el destinatario ya confirmó o solicitó cambios, conserva su acuse: utiliza **Publicar nueva versión**, que abre un nuevo ciclo de confirmación sin borrar respuestas antiguas.
- **Vista previa del correo** abre un diseño institucional ÁGORA/Dejavú con el proyecto, instrucciones, fotografías y dos botones: **Confirmar de recibido** y **Abrir archivos en Drive**.
- El primer botón redirige al formulario público con la respuesta «Sí, confirmo de recibido» preseleccionada. El proveedor **debe enviar el formulario**: el clic no produce acuse.
- Desde la vista previa utiliza **Copiar correo visual** y después **Abrir Gmail**. Gmail abre un borrador de texto; para conservar la maquetación visual debes pegar el contenido HTML copiado en el cuerpo del mensaje y enviarlo. La aplicación no envía correos en automático.
- Imágenes de Drive: ÁGORA prueba la miniatura, otras rutas y, cuando falla, el visor incrustado de Drive. **Ampliar** abre el visor completo. Los archivos requieren que el destinatario tenga permisos; no existe una solución segura para mostrar miniaturas restringidas en todos los clientes de correo.

### Activar la edición en Firebase

La interfaz y los scripts pueden publicarse en GitHub Pages, pero **editar un expediente pendiente requiere publicar la regla actualizada de Firestore**. La fuente completa está en `firestore.rules` y se incluye el cambio aislado en `firestore.archivos.rules.fragment`.

Desde un equipo con Firebase CLI autorizado, ejecuta en este repositorio:

```bash
firebase deploy --only firestore:rules --project agora-dejavu-38b8c
```

Alternativamente pega el contenido completo de `firestore.rules` en Firebase Console → Firestore Database → Reglas → Publicar. Conserva las reglas existentes de usuarios, compras y proveedores. GitHub Pages por sí solo **no publica estas reglas**.

La regla permite editar solo expedientes pendientes sin ninguna respuesta registrada en la versión actual. Valida que se preserve el folio, propietario, destinatario, número de versión y el resto de los datos inmutables. Para comprobar que funciona, intenta guardar una nota de un expediente pendiente y revisa que conserve la versión y el enlace; después verifica que los ya confirmados solo permitan crear otra versión.

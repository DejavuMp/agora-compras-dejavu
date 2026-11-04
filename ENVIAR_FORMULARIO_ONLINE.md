# ÁGORA · enviar formularios en línea (sin descargar archivos)

Versión preparada en GitHub: 03/11/2026. Proyecto Firebase: **agora-dejavu-38b8c**.

## Qué cambia
1. En Ágora abre **Presupuestos > Nueva solicitud** (o un pedido/muestra) y asigna el proveedor con su correo.
2. Pulsa **Formulario online** o **Enviar enlace**.
3. En el panel **Formulario directo para proveedor** pulsa **Generar enlace de la solicitud abierta**.
4. Elige **Abrir correo en Gmail** para abrir un mensaje con dos enlaces: **Confirmar de recibido** y **Llenar cotización**. Alternativamente, **Copiar correo con botones** y pegar en Gmail para mantener su formato visual. **Revisar destinatario y enviar manualmente**.
5. El proveedor abre su enlace, confirma con su nombre y envía el formulario. Las respuestas se guardan en la colección `provider_invites` de Firestore **sin archivos HTML ni JSON**.
6. Cuando el administrador está conectado a Ágora, el acuse y la respuesta se incorporan al expediente local; si activó sincronización, también se conservan en la nube en `agora_records`.

## Para que funcione la primera vez (dos configuraciones)
**A. Reglas.** En Firebase Console > Firestore Database > **Reglas**, reemplaza todo el contenido por el archivo completo `firestore.rules` de este repositorio, y pulsa **Publicar**. Esto habilita únicamente al personal autorizado y al enlace con token largo; **NO** usar reglas abiertas como `allow read,write: if true`.

**B. Primer administrador.** En Firebase Console > Firestore Database > **Datos** crea la colección `agora_users`. El **ID del documento** debe ser el UID que Ágora mostró cuando entraste con el nuevo Gmail. Campos: `role` (string) = `admin`; `active` (boolean) = `true`. Al volver a entrar a Ágora con Google se reconocerá tu rol.

En Firebase Authentication > Settings > Authorized domains confirma que exista `dejavump.github.io`. No usar `https://` ni una ruta completa.

## Sitios
- Sitio de Ágora: https://dejavump.github.io/agora-compras-dejavu/
- Página del proveedor: `/proveedor-online.html#t=...&view=acuse`. Sólo funciona con token válido generado desde Ágora.
- Reglas: https://github.com/DejavuMp/agora-compras-dejavu/blob/main/firestore.rules

## Seguridad y limitaciones
- Los enlaces son **credenciales de acceso por posesión**. Quien reciba o reenvíe un enlace válido puede abrir y responder esa invitación; **no verifican por sí mismos qué correo abrió el mensaje**. No poner información excesivamente sensible en la solicitud.
- Los enlaces tienen 256 bits de aleatoriedad, caducan a los 14 días y permiten un acuse y una respuesta por invitación. No se pueden enumerar desde Firestore sin sesión del equipo.
- Se requiere iniciar sesión con Google **sólo para el personal Dejavú**. Los proveedores no necesitan cuenta Firebase.
- Si el proveedor responde cuando Ágora no está abierta, Firestore conserva la respuesta; la aplicación la incorpora al expediente cuando vuelve a conectarse un usuario autorizado.
- La versión antigua guarda los expedientes en IndexedDB del navegador. El respaldo sigue siendo necesario y la sincronización general es optativa.
- No se envía el correo desde la aplicación sin intervención: **Abrir correo en Gmail** prepara un borrador; el operador debe pulsar Enviar.
- Antes de enviar a proveedores reales, realizar una prueba con un correo propio. No se ha verificado aquí un despliegue live ni publicado las reglas en la consola de Firebase.

## Correcciones y avisos · 03/11/2026
- Panel de envío: ahora puede cerrarse con el botón **✕ Cerrar** arriba, **Cerrar panel** abajo, tecla Esc o clic fuera. Se eliminó un estilo `display:block` que impedía respetar el estado cerrado.
- Campana **Notificaciones** dentro de Ágora: avisa de acuse y cotización recibida mientras haya sesión de personal autorizada y la página esté abierta. En la campana se puede activar permiso para notificaciones nativas del navegador (no funcionan con la página cerrada).
- El proveedor verá una **constancia digital** tras confirmar el acuse o registrar su cotización. Puede usar **Preparar copia por correo**, que abre un mensaje en Gmail dirigido al correo de contacto, listo para revisar y enviar, o **Copiar constancia**.
- **La copia por correo todavía NO se envía automáticamente.** Envío automático al proveedor y alertas por email a la agencia necesitan un servidor o servicio de correo autorizado, por ejemplo una Cloud Function y SMTP con credenciales guardadas de forma privada. No poner SMTP ni claves privadas en GitHub.
- Para ver los cambios, en GitHub Pages actualizar con `Ctrl + Shift + R`; si el service worker está actualizando, volver a cargar una vez más. No borrar datos locales ni almacenamiento del sitio.

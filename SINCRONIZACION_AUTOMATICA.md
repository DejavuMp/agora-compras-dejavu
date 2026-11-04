# ÁGORA Pedidos · sincronización automática

La aplicación abre desde GitHub Pages. Firebase (`agora-dejavu-38b8c`) es la fuente principal de los expedientes cuando el usuario tiene sesión autorizada y conexión. Los datos también permanecen en IndexedDB del navegador para seguir trabajando al perder internet.

## Flujo normal
- Entrar con Google una vez; Authentication conserva la sesión entre visitas según el navegador.
- Conexión a Firebase automática al abrir la app, sin tener que pulsar “Activar nube” en cada sesión.
- En línea: los cambios se guardan localmente inmediatamente y se sincronizan con Firestore; la barra superior informa el estado real.
- Sin internet: se trabaja con copia local; al recuperar la conexión se intenta conciliar y subir los cambios, validando la revisión de cada expediente para evitar sobrescribir modificaciones de otros equipos.
- Se conservan hasta cinco instantáneas locales de seguridad de cambios de sincronización en el navegador.
- El panel **Nube** se cierra tras sincronización exitosa y también al hacer clic fuera o pulsar Esc.

## Protección para la primera conexión y conflictos
- Si Firestore está vacío, los datos del navegador se respaldan en IndexedDB y se suben automáticamente, siempre que cumplan límites de Firestore.
- Si Firestore ya contiene expedientes distintos y el navegador también tiene datos, **no se sobrescribe ninguna de las dos copias**: se pide una confirmación de qué fuente abrir, guardando una copia local previa.
- Si un mismo registro cambió en dos equipos o la copia local parece haber perdido varios expedientes, se bloquea la reconciliación destructiva y se muestra un estado de revisión.
- Si un expediente incluye imágenes o adjuntos superiores al límite (850 KB por documento en esta implementación), se conserva localmente y se avisa de que no se pudo subir.
- La copia local no equivale a un respaldo externo: seguir exportando JSON regularmente. No borrar cookies, datos de sitio ni almacenamiento del navegador si existen cambios pendientes.

## Proveedores
Los enlaces de proveedor existentes y el almacenamiento de acuses/cotizaciones en `provider_invites` no se alteraron. La web del proveedor sigue aceptando el mismo token y guardando en Firestore. Los acuses recogidos se incorporan al expediente cuando ÁGORA está conectada.

El correo al proveedor sigue requiriendo pulsar Enviar desde Gmail; no se habilitó envío automático de correos. Tampoco hay notificaciones cuando ÁGORA está cerrada.

**Importante:** código actualizado en GitHub; verificar en la página publicada y probar conexión, desconexión, reconexión y un pedido ficticio antes de operar en varios equipos.

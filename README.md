# ÁGORA · Compras y Producción — Sitio web

Proyecto Firebase: **agora-dejavu-38b8c**.

La aplicación original continúa funcionando y guardando en IndexedDB. Se agregó el módulo **ÁGORA · Nube** para iniciar sesión con Google, comprobar permisos por UID, exportar respaldo local y activar voluntariamente la sincronización de pedidos y expedientes por registro en Firestore.

- **No se ha verificado un despliegue de Firebase Hosting** ni una prueba integral con cuentas reales.
- Los cambios solo se sincronizan mientras esté abierta la sesión y el operador haya activado la nube desde el panel. No se sustituyen datos locales de forma silenciosa.
- Los proveedores siguen usando formularios con respuesta JSON; la confirmación automática mediante enlace requiere un backend independiente, validación de invitaciones y pruebas de seguridad.
- Las fotos embebidas grandes pueden sobrepasar el máximo admitido por documento y detener la sincronización; no se borran localmente.
- El repositorio es público. **Jamás subir expedientes, datos de proveedores, llaves privadas, tokens ni respaldos.**

**Guía paso a paso:** [PUESTA_EN_MARCHA_FIREBASE.md](./PUESTA_EN_MARCHA_FIREBASE.md).

# ÁGORA · Aplicaciones independientes

La interfaz se dividió en dos aplicaciones publicadas en GitHub Pages:

- **Compras & Producción:** https://dejavump.github.io/agora-compras-dejavu/ (presupuestos, muestras, pedidos, proveedores y entregas).
- **Envío y Recepción de Archivos:** https://dejavump.github.io/agora-compras-dejavu/archivos/ (Drive, vistas de artes, evidencias, respuestas y comprobantes).

Se publican en subrutas del **mismo repositorio**, pero mantienen pantallas, código y flujos diferenciados. Comparten el proyecto Firebase, utilizando colecciones separadas. Se conservaron los enlaces históricos de recepción mediante redirección.

Véase [README_ARCHIVOS.md](./README_ARCHIVOS.md) para la aplicación de Archivos.

---

# ÁGORA · Compras y Producción — Sitio web

Proyecto Firebase: **agora-dejavu-38b8c**.

La aplicación original continúa funcionando y guardando en IndexedDB. Se agregó el módulo **ÁGORA · Nube** para iniciar sesión con Google, comprobar permisos por UID, exportar respaldo local y activar voluntariamente la sincronización de pedidos y expedientes por registro en Firestore.

- **No se ha verificado un despliegue de Firebase Hosting** ni una prueba integral con cuentas reales.
- Los cambios solo se sincronizan mientras esté abierta la sesión y el operador haya activado la nube desde el panel. No se sustituyen datos locales de forma silenciosa.
- Los proveedores siguen usando formularios con respuesta JSON; la confirmación automática mediante enlace requiere un backend independiente, validación de invitaciones y pruebas de seguridad.
- Las fotos embebidas grandes pueden sobrepasar el máximo admitido por documento y detener la sincronización; no se borran localmente.
- El repositorio es público. **Jamás subir expedientes, datos de proveedores, llaves privadas, tokens ni respaldos.**

**Guía paso a paso:** [PUESTA_EN_MARCHA_FIREBASE.md](./PUESTA_EN_MARCHA_FIREBASE.md).

**Uso automático de Firebase y modo sin conexión:** [SINCRONIZACION_AUTOMATICA.md](./SINCRONIZACION_AUTOMATICA.md).


## Fichas de Staff · Enlace permanente al formulario mensual

- **Portal:** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/
- **Generador:** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/herramienta/
- **Formulario (enlace permanente):** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/formulario/

La configuración mensual se mantiene en `fichas/staff/config.json`. Las fichas privadas y sus respaldos con datos personales no se publican en este repositorio público.

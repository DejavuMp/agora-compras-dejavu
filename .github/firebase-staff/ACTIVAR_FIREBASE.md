# Activación segura de Firebase · Fichas Dejavú

## Estado y alcance

Proyecto Firebase existente: **`agora-dejavu-38b8c`**.

El generador de Fichas Dejavú, la página **Información para formulario de pagos**, los enlaces individuales, la opción **Compartir todas mis fichas ahora**, los respaldos y las fichas de localStorage/IndexedDB **no se modifican durante esta activación**.

El catálogo de fichas permanentes utiliza la colección Firestore **`dejavu_staff_publicadas`** y solo guarda **ID, campaña, solicitado por, fecha, ubicación y metadatos de publicación**. No sube correos de trabajadores, cuentas bancarias ni fotografías.

Los usuarios externos pueden **leer** el catálogo publicado sin iniciar sesión. Solo usuarios con `agora_users/{uid}` `active: true` y `role: "admin"` o `"coordinador"`, con correo verificado, pueden publicar, modificar o borrar.

**IMPORTANTE: el despliegue a la base Firebase REAL aún no está autorizado ni confirmado.** GitHub Pages solo publica el HTML y JS. No activar la sincronización como completa hasta verificar los permisos con una cuenta autorizada.

## Pruebas realizadas

Existe un flujo en GitHub Actions llamado **Dejavú Staff · Firebase (reglas seguras)**:
- Ejecuta 17 pruebas con datos ficticios en Firebase Emulator Suite. No accede a producción durante este paso.
- Comprueba que la lectura de fichas publicadas es pública, que nadie anónimo puede modificarlas y que Compras, cuentas y fichas privadas continúan protegidas.
- El paso de despliegue **solo se puede iniciar manualmente**. Los `push` al repositorio ejecutan pruebas y **nunca publican** reglas a producción.

### Reglas y comprobación de compatibilidad

El archivo `firestore.rules` integra los permisos de Ágora y los bloques Dejavú Staff (privado opcional + catálogo publicado).

El preflight de `.github/firebase-staff/safe-rules-preflight.mjs`:
1. Obtiene mediante API la versión REAL de reglas de Firestore del proyecto autenticado.
2. Guarda una copia del archivo vigente como artefacto de GitHub Actions.
3. Compara la versión real con la base conocida de Ágora y las versiones esperadas de Staff.
4. **Detiene el despliegue si detecta cualquier otra diferencia**, para no reemplazar reglas activas de Compras, Archivos u otros módulos.

Es intencional que el preflight falle si alguien editó las reglas desde Firebase después de la última versión conocida. Primero debe reconciliarse la diferencia.

## Acceso Google Cloud: configuración única

Este flujo usa Workload Identity Federation (sin llaves privadas en GitHub). Requiere una configuración inicial hecha por alguien con permisos administrativos en Google Cloud:

- Un proveedor de Workload Identity restringido al repositorio `DejavuMp/agora-compras-dejavu` y al entorno GitHub Actions autorizado, con acceso delegado a una cuenta de servicio.
- Una cuenta de servicio del proyecto `agora-dejavu-38b8c` con el permiso mínimo para consultar y desplegar **Firebase Security Rules**, sin acceso amplio a Storage o bases privadas.
- Dos **Variables de repositorio** en GitHub Actions:
  - `DEJAVU_FIREBASE_WIF_PROVIDER`: ruta completa del proveedor `projects/<número>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`.
  - `DEJAVU_FIREBASE_SERVICE_ACCOUNT`: correo de la cuenta de servicio.
- Revisar en Firebase Authentication > Settings > Authorized domains que esté habilitado **`dejavump.github.io`**. Esto es necesario para que los coordinadores se autentiquen desde el generador.

**No subir contraseñas, tokens de acceso, claves de cuenta de servicio ni archivos JSON de credenciales al repositorio.** Las variables descritas identifican recursos de IAM y no contienen llaves privadas.

## Despliegue manual (solo después de configurar el acceso)

1. Abrir https://github.com/DejavuMp/agora-compras-dejavu/actions/workflows/dejavu-staff-firebase-rules.yml
2. Seleccionar **Run workflow** y confirmar exactamente `agora-dejavu-38b8c`.
3. Esperar el resultado de las 17 pruebas y del preflight que compara las reglas de producción.
4. El flujo despliega con `firebase deploy --only firestore:rules --project agora-dejavu-38b8c --non-interactive`, sin tocar Hosting, Storage, Functions ni los archivos locales.
5. Si el preflight rechaza las reglas vigentes, no forzar el despliegue. Revisar el respaldo de las reglas actuales y reconciliarlas primero.

## Comprobaciones después de desplegar

1. Abrir https://dejavump.github.io/agora-compras-dejavu/fichas/staff/firebase/ y comprobar conexión, lectura pública, formulario y rol de coordinación. La página es solo de lectura.
2. En el generador https://dejavump.github.io/agora-compras-dejavu/fichas/staff/ abrir **Fichas anteriores → Sincronización automática en la nube**.
3. Entrar con la cuenta Google autorizada y confirmar la publicación de las fichas que se desea compartir con el staff. Las fichas anteriores siguen estando en ese navegador; no pueden transferirse desde un servidor si nunca salieron de localStorage.
4. Verificar desde otro teléfono la página https://dejavump.github.io/agora-compras-dejavu/fichas/staff/formulario/ sin iniciar sesión. Debe verse el catálogo actualizado.
5. Verificar cambio/edición/borrado desde el generador y reapertura de la vista Staff. Guardar respaldo JSON de las fichas originales antes de limpiar el navegador.

## Sincronización y privacidad

El flujo permanente publica automáticamente las fichas **solo después** de autorizar una vez y con la cuenta de coordinación en sesión, y siempre que Firebase esté funcionando. El enlace temporal `#catalog=` sigue siendo una opción independiente que no requiere Firebase pero representa una foto fija de las fichas de ese momento.

El catálogo publicado es técnicamente de lectura pública y los datos de actividad pueden consultarse por quien conozca la aplicación o la API. No publicar en una ficha datos que deban ser privados. El acceso administrativo y los expedientes privados sí se controlan mediante reglas.

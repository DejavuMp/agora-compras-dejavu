# Dejavú Marketing · Fichas de Staff

## Una sola herramienta administrativa
**Generador, archivo e historial:** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/

**Portal del personal, "Información para formulario de pagos":** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/formulario/

El enlace de pago se configura en `fichas/staff/config.json`; no se modifica para los usuarios finales al cambiar cada mes. El formulario vigente se abre desde el portal del personal.

## Archivo de fichas y sincronización
- La herramienta **siempre guarda el original local** en el navegador: metadatos en localStorage y fotografías en IndexedDB.
- Se agregó el campo **Correo del trabajador** para vincular cada ficha a un destinatario verificado. Las fichas sin correo asignado siguen siendo visibles para el equipo autorizado, pero no aparecerán en el historial personal de nadie.
- El administrador autorizado (rol **admin** o **coordinador** en `agora_users`) puede iniciar sesión con Google y sincronizar metadatos de las fichas a la colección `dejavu_staff_fichas`.
- El personal inicia sesión con Google usando exactamente su correo registrado; solo puede consultar los documentos de ese correo.
- En el portal del personal, **Historial** combina los enlaces que la persona abrió en ese navegador y, cuando Firebase esté activo, las fichas que la agencia le asignó en la nube.
- La colección en Firestore tiene reglas preparadas en `firestore.rules`, con lectura exclusiva del destinatario o de administradores autorizados y edición solo para el equipo coordinador.

**Estado técnico al 9 nov 2026:** código de interfaces y reglas en GitHub; GitHub Pages despliega solamente archivos web. **Hace falta desplegar las reglas Firestore con una cuenta autorizada y probar acceso para admin, trabajador asignado y trabajador no asignado.** Hasta concluirlo, la nube NO se considera activa. La aplicación conserva el guardado local y mostrará un aviso si las reglas no están habilitadas.

**Fotografías:** siguen guardándose localmente, no se sincronizan aún con Cloud Storage. Las imágenes de fichas anteriores se conservan en el respaldo JSON y no deben ponerse en un repositorio público.

## Recuperar las fichas anteriores
Las fichas guardadas en un archivo HTML local o en otro navegador no migran por sí mismas. En la herramienta anterior usa **Fichas guardadas → Exportar respaldo JSON**. En la versión web utiliza **Fichas anteriores → Importar fichas anteriores**. No borrar el respaldo original. Al conectar Firebase y activar las reglas, la herramienta podrá sincronizar las fichas locales importadas, incluyendo las que todavía no tienen correo de destinatario.

## Plan de verificación antes de uso real
1. Verificar que GitHub Pages sirve la última versión de ambas páginas.
2. Revisar el despliegue de reglas en Firebase proyecto `agora-dejavu-38b8c` (no sustituir una versión más reciente sin comparar).
3. Verificar que el dominio `dejavump.github.io` está autorizado en Firebase Authentication.
4. Iniciar sesión como coordinador autorizado en la herramienta; comprobar estado de sincronización y crear ficha de prueba con correo del trabajador.
5. Iniciar sesión como el trabajador destinatario y confirmar que ve la ficha asignada desde otro dispositivo.
6. Iniciar sesión como otra cuenta no destinataria y confirmar que no puede consultar aquella ficha.
7. Editar una ficha y usar "Actualizar" en el historial del trabajador para verificar cambios. Probar importación JSON y retorno a guardado local sin conexión.
8. Probar borrado y manejo de versiones conflictivas, y respaldar antes de purgar datos de cualquier dispositivo.

## Política de privacidad
El repositorio y GitHub Pages son públicos. Nunca subir expedientes, respaldos JSON reales, correos personales o fotografías de staff a GitHub. Los enlaces estáticos de fichas `#f=` que ya se enviaron contienen información de actividad codificada, **no cifrada**; cualquiera que reciba el enlace puede leerla. El historial privado en Firebase sí requiere autenticación y reglas de acceso. Para restringir completamente fichas individuales con datos personales, deberá migrarse el intercambio a enlaces autenticados cuando la conexión haya superado las pruebas.

# ÁGORA · Centro de Operaciones V4

**Sitio V4**: https://dejavump.github.io/agora-compras-dejavu/operaciones/  
**Demostración V3, aislada**: https://dejavump.github.io/agora-compras-dejavu/operaciones/demo.html


## Agenda diaria y rutas (actualización)

- Visor de solo lectura: https://dejavump.github.io/agora-compras-dejavu/operaciones/visor.html
- Editor local: https://dejavump.github.io/agora-compras-dejavu/operaciones/demo.html
- Respaldos: demo-v3-original.html y visor-semanal-v1.html.

**Jornadas por fecha:** cada evento puede crearse con 1 a 31 días consecutivos. Cada fecha se guarda como registro independiente, con identificador de campaña, número de jornada y total de días. Una vez creado, se edita un día sin modificar automáticamente los demás.

**Actividades:** volanteo, perifoneo, apertura, reapertura, activación, en vivo, sampling, promotoría, canje y entrega de cupones, photo opportunity, silent party, iluminación, develación, montaje, desmontaje, producción, scouting y otros.

**Turnos:** al seleccionar personal, entrada 30 minutos antes y salida 30 minutos después de la actividad. Los turnos individuales pueden ajustarse. Las horas reales para pagos se capturan y validan por separado.

**Rutas:** se guarda origen, sucursal, paradas, minutos estimados según Google Maps y margen adicional. La salida propuesta se calcula usando el primer turno del personal menos los minutos de recorrido y el margen. La unidad se reserva hasta el retorno estimado. Se alertan traslados insuficientes según minutos capturados manualmente. No hay ETA automático ni consulta de tráfico en tiempo real.

**Datos de ejemplo:** el editor incluye volanteo ficticio de dos jornadas y el visor permite mostrar ejemplos si no hay datos guardados. El visor actualiza su lectura local cada cinco segundos, pero NO sincroniza distintos dispositivos ni consulta información real de Firebase.

**Pruebas automatizadas:** GitHub Actions ejecuta Playwright con registros ficticios para verificar días consecutivos, turnos +/-30, empalmes de personal y camionetas, tiempos de ruta insuficientes y el visor.

## Estado comprobado

- V4 publicada en GitHub Pages: HTML de operaciones y módulo \`cloud-v4.js\`.
- Firebase Web SDK conectado con el proyecto público ya utilizado por ÁGORA: \`agora-dejavu-38b8c\`.
- Reglas específicas añadidas a \`firestore.rules\`, con pruebas de seguridad en emulador.
- **Pendiente activar las reglas en Firebase de producción**. GitHub Pages por sí solo no crea los permisos del backend. Hasta entonces el acceso a datos compartidos permanece cerrado.
- No se sobrescriben las operaciones de Compras, Archivos, Finanzas ni el sitio principal.
- No se ha migrado ningún respaldo local ni datos reales al nuevo módulo.

## Activación segura de Firestore (acción de administrador)

1. Entrar al repositorio \`DejavuMp/agora-compras-dejavu\`, pestaña **Actions**.
2. Elegir el workflow **Dejavú Staff · Firebase (reglas seguras)** y pulsar **Run workflow**.
3. Como confirmación, escribir exactamente \`agora-dejavu-38b8c\` y ejecutar en rama \`main\`.
4. El flujo primero ejecuta pruebas de permisos. Solo después usa la conexión autorizada a Google Cloud para leer las reglas activas, comprobar que corresponden a una base conocida, guardar respaldo descargable y **solo entonces** publica \`firestore.rules\`. No despliega Hosting, Storage, Functions ni modifica el sitio principal.
5. Si falla por variables \`DEJAVU_FIREBASE_WIF_PROVIDER\` o \`DEJAVU_FIREBASE_SERVICE_ACCOUNT\`, un administrador de Google Cloud debe configurar Workload Identity Federation y esas variables del repositorio. No colocar claves privadas en GitHub ni en el chat.
6. Si falla por **reglas distintas en producción**, NO forzar el despliegue: comparar el respaldo de la ejecución con \`firestore.rules\` y reconciliar con Compras, Archivos y Finanzas.
7. En la consola Firebase Authentication, verificar que Google esté habilitado y \`dejavump.github.io\` sea dominio autorizado.

**La ejecución automática de GitHub al subir código solo prueba las reglas; NO las activa.** Se requiere la ejecución manual indicada para proteger sistemas ya publicados.

## Cómo comenzar

1. Iniciar sesión con Google desde V4. La cuenta del coordinador debe estar activa en \`agora_users/{uid}\` y tener rol \`admin\` o \`coordinador\`.
2. Coordinación crea fichas de personal, sucursales, campañas y vehículos en el tablero conectado.
3. El integrante entra desde su teléfono con Google y pulsa **Solicitar acceso**. Se genera una solicitud con su UID y correo verificado.
4. Coordinación abre el botón **Accesos** en la barra superior, revisa el correo, elige el ID de ficha de personal y confirma la vinculación.
5. Al volver a entrar, el staff verá **Mi espacio** con sus turnos, eventos y rutas, podrá registrar horas y reportar incidencias.
6. Coordinación revisa asistencia, retardos y solicitudes, valida horas e importes. **Marcar pagado es un estado interno y no ejecuta transferencias.**

## Seguridad y sincronización

- \`agora_ops_control/schedule\`: documento de agenda compartida que incluye tarifas, reservado a coordinadores/admins. El calendario se actualiza por transacciones con revisión creciente; si otro coordinador cambió el documento, la operación se rechaza para evitar sobrescrituras silenciosas.
- \`agora_ops_members/{uid}\`: vincula cuenta real con ficha individual.
- \`agora_ops_staff/{uid}\`: copia reducida con los eventos del usuario sin tarifas ni datos de otros empleados.
- \`agora_ops_logs/{id}\`: reporte individual de horas, consultable por el propietario o coordinación. Personal no puede validarse ni marcarse como pagado.
- \`agora_ops_incidents/{id}\`: retardos, incidencias y justificaciones.
- \`agora_ops_access_requests/{uid}\`: solicitudes de acceso gestionadas por coordinación.

Los empalmes de recursos y la actualización concurrente de la agenda se comprueban en el cliente y mediante la revisión del documento compartido. Para garantías de negocio contra clientes maliciosos, debe incorporarse una validación de reservas del lado del servidor antes de producción a gran escala. El prototipo centraliza la agenda en un solo documento (límite conservador de ~850 KB), con opción futura de dividir por meses.

## Limitaciones pendientes

- Las notificaciones con pestaña abierta y los archivos de calendario \`.ics\` están disponibles. **Push con la app cerrada NO está activo**: requiere FCM, service worker específico, claves VAPID y un proceso de envío desde el backend.
- No se sincronizan automáticamente los catálogos históricos de otras herramientas.
- Rutas en Google Maps son enlaces orientativos: no hay servicio automático de tráfico o cálculo de ETA.
- El registro de horas es manual, no biométrico ni verificado por GPS.
- No hay un sistema de nómina ni transferencias bancarias.
- Antes de cargar personal real, verificar el despliegue de reglas, la identidad y los permisos con cuentas de prueba.

### Pruebas

Archivo: \`.github/firebase-staff/test-ops-rules.mjs\`. Los casos comprueban acceso anónimo, consulta, solicitudes de ingreso, fichas individuales, lectura y edición de la agenda, horas, solicitud de pago y validación de retardos.

Comando en entorno configurado para emulador:

\`\`\`bash
npx firebase emulators:exec --only firestore --project demo-agora-ops --non-interactive \
  'node .github/firebase-staff/test-ops-rules.mjs'
\`\`\`

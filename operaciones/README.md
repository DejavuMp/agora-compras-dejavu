
## Inicio simplificado (noviembre 2026)

El portal **Mi jornada** del staff se abre en la misma URL protegida del visor. Su pantalla principal agrupa actividad, sede, horario, botón de entrada/salida (incluyendo consentimiento GPS), y **Mi pago pendiente de recibir**, sin obligar a cambiar de apartado. Solo aparecen tres secciones principales: Mi día, Mi calendario y Mis pagos. Traslados y asistencia detallada siguen accesibles en Más opciones. Coordinación muestra cuatro apartados principales: Hoy, Calendario, Personal y Pagos; los módulos anteriores están conservados bajo Más opciones.

**Pago propio:** al publicar/proyectar una jornada, el documento privado `agora_ops_staff/{uid}` incluye exclusivamente la previsión de ese integrante. Se calcula con su tarifa horaria o de jornada y horas programadas, según modalidad. No se transmite su tarifa al staff, las tarifas ajenas ni la nómina general. En pantalla se distinguen estimado, autorizado, programado y pagado. El saldo pendiente excluye los registros marcados como pagados. Si no hay tarifa cargada se muestra «Por definir», nunca se inventa un importe. Los importes autorizados proceden de registros privados `agora_ops_logs` y tienen prioridad sobre estimaciones.

Al iniciar sesión en coordinación, el programa puede refrescar las fichas privadas de quienes ya están vinculados, revisando la revisión de la agenda dentro de una transacción y escribiendo solo si el estimado individual cambió. No altera horas, acuerdos ni estados de pago. La sincronización real requiere roles y reglas Firestore de producción correctas; la publicación de la interfaz no confirma por sí sola el funcionamiento de cuentas reales.


## Ficha de Jornada y reutilización de personal

En `operaciones/index.html` y en la demostración local `operaciones/demo.html`, el panel **Por día** incluye el botón **Vista de jornada**. El cronograma también abre esta ficha para consulta. La pantalla privada de coordinación ofrece:

- **Evento completo o esta jornada**: si varias fechas comparten el mismo `seriesId`, la vista agrupa únicamente esas jornadas; no mezcla actividades que casualmente tengan el mismo nombre.
- **Calendario y personal asignado**: carga turnos y nombres desde `events[].staff[]`; cada persona aparece una vez en el total de integrantes y tantas veces como jornadas distintas le correspondan, sin duplicar registros.
- **Asistencia**: muestra horarios programados, marcajes reales y el estado de validación manual. No convierte tardanzas en faltas automáticas.
- **Nómina prevista por evento**: obtiene las tarifas e importes de los módulos actuales de pagos; distingue previsto, autorizado, programado y pagado. El Excel `.xlsx` contiene solamente las jornadas de la ficha.
- **PDF real descargable** (creado sin API ni servicio de pago), opción nativa **Compartir archivo PDF**, botones **WhatsApp**, **Correo** y **Copiar texto**. En móvil compatible, compartir permite elegir una aplicación y enviar el archivo. En un navegador que no permite compartir adjuntos, WhatsApp/correo abren un mensaje prellenado y descargan el PDF, que el usuario **debe adjuntar manualmente**. No se envía correo ni dinero automáticamente.
- El PDF compartido incluye **solo datos operativos por defecto**. Para añadir la nómina y los importes, coordinación debe activar expresamente «Incluir nómina e importes». Nunca se genera un enlace público a los sueldos.

**Selección automática de staff:** en el formulario de actividad, al escoger un nombre existente se despliegan automáticamente todas sus otras asignaciones registradas, con fecha, actividad y horario. Cuando se registra una nueva actividad para una campaña ya conocida y aún no se ha capturado personal en la nueva ficha, se recupera el equipo de las jornadas coincidentes (sin crear duplicados ni cambiar horarios anteriores). La operación sigue impidiendo empalmes al guardar. Si se requiere otro equipo, se puede reemplazar o editar la sugerencia.

Archivos: `ops-jornada-sheet.mjs` (modelo y PDF), `ops-jornada-sheet-ui.mjs` (interfaz/compartir), `tests/qa-jornada-sheet.mjs` y `tests/qa-jornada-sheet-browser.mjs` (verificaciones).


## Actualización · activación horaria, validación manual y prenómina

- **Permisos automáticos por agenda:** al guardar un cronograma con integrantes vinculados a sus cuentas, se provisionan en Firestore los accesos de marcaje correspondientes. Si ya existen permisos, las horas se sincronizan; cualquier suspensión manual permanece suspendida. El reloj permite entrada 60 minutos antes del turno y un cierre tardío protegido, pero el inicio y fin reales **solo** se capturan cuando el staff confirma sus marcajes.
- **Estados derivados:** «Programada», «En curso» y «Horario concluido» se calculan con el horario asignado, sin alterar manualmente la aprobación de asistencia. No es un proceso de Cloud Functions ni una nómina automática.
- **Salida cuando el GPS falla:** el staff puede registrar una salida con hora de Firestore sin coordenadas de salida, tras confirmar la advertencia. El registro conservará la hora oficial y quedará sujeto a revisión; requiere desplegar la versión actualizada de `firestore.rules` para funcionar en producción.
- **Avisos dentro de ÁGORA:** cuando la sesión de coordinación está abierta, los nuevos marcajes muestran una notificación breve con nombre, actividad y hora oficial de entrada o salida. No es una notificación push cuando el navegador está cerrado; la revisión histórica permanece en Asistencia.
- **Asistencia manual:** coordinación ve las horas oficiales de entrada/salida en la sección Asistencia y decide «Correcta», «Retardo», «Falta», «Justificada», «Pendiente» o «Requiere aclaración», con observaciones. Ningún registro tardío se califica por sí solo. El staff no tiene permiso de crear ni editar las decisiones de coordinación.
- **Previsión de pago:** en el módulo Pagos, botón «Descargar prenómina Excel / PDF». Calcula estimados a partir de turnos, tarifas y registros (con importes aprobados si existen); permite guardar fecha prevista de pago, descargar un verdadero XLSX, abrir una página imprimible/guardar como PDF y preparar un correo sin envío automático. **No es un CFDI de nómina ni ejecuta transferencias.**
- Los archivos Excel y PDF pueden contener importes nominales: no compartir públicamente. No se incluyen datos bancarios ni geolocalización en el reporte de prenómina.
- **Despliegue de seguridad:** las reglas de Firebase se prueban en emulador al subir el código, pero **no se despliegan automáticamente a producción**. El workflow de reglas requiere ejecución manual con la identidad Google Cloud/WIF autorizada y respaldo previo. No dar por activada la salida sin GPS en producción hasta confirmarlo.

Las pruebas automatizadas incluyen `operaciones/tests/qa-payroll-preview.mjs`, `operaciones/tests/qa-attendance-payroll-browser.mjs` y las suites de permisos de Firestore. Los datos de QA son ficticios.

# ÁGORA · Centro de Operaciones V4

**Sitio V4**: https://dejavump.github.io/agora-compras-dejavu/operaciones/  
**Demostración V3, aislada**: https://dejavump.github.io/agora-compras-dejavu/operaciones/demo.html


## Agenda diaria y rutas (actualización)

- Visor conectado (solo admin y coordinador con Google): https://dejavump.github.io/agora-compras-dejavu/operaciones/visor.html
- Editor conectado: https://dejavump.github.io/agora-compras-dejavu/operaciones/
- Demostración aislada, solo almacenamiento local: https://dejavump.github.io/agora-compras-dejavu/operaciones/demo.html
- Visor local heredado para QA: operaciones/visor-demo.html. Respaldos previos: demo-v3-original.html y visor-semanal-v1.html.

**Jornadas por fecha:** cada evento puede crearse con 1 a 31 días consecutivos. Cada fecha se guarda como registro independiente, con identificador de campaña, número de jornada y total de días. Una vez creado, se edita un día sin modificar automáticamente los demás.

**Actividades:** volanteo, perifoneo, apertura, reapertura, activación, en vivo, sampling, promotoría, canje y entrega de cupones, photo opportunity, silent party, iluminación, develación, montaje, desmontaje, producción, scouting y otros.

**Turnos:** al seleccionar personal, entrada 30 minutos antes y salida 30 minutos después de la actividad. Los turnos individuales pueden ajustarse. Las horas reales para pagos se capturan y validan por separado.

**Rutas:** se guarda origen, sucursal, paradas, minutos estimados según Google Maps y margen adicional. La salida propuesta se calcula usando el primer turno del personal menos los minutos de recorrido y el margen. La unidad se reserva hasta el retorno estimado. Se alertan traslados insuficientes según minutos capturados manualmente. No hay ETA automático ni consulta de tráfico en tiempo real.

**Datos de ejemplo:** el editor incluye volanteo ficticio de dos jornadas y el visor permite mostrar ejemplos si no hay datos guardados. El visor de producción usa `onSnapshot` para consultar la misma agenda de Firebase, exclusivamente después de autenticar y comprobar que la cuenta tiene rol admin o coordinador. Los nombres del personal, salarios y registros de pago se excluyen de la visualización. La demostración local y `visor-demo.html` permanecen aislados.

**Pruebas automatizadas:** GitHub Actions ejecuta Playwright con registros ficticios para verificar días consecutivos, turnos +/-30, empalmes de personal y camionetas, tiempos de ruta insuficientes y el visor.

## Estado comprobado

- V4 publicada en GitHub Pages: HTML de operaciones y módulo \`cloud-v4.js\`.
- Firebase Web SDK conectado con el proyecto público ya utilizado por ÁGORA: \`agora-dejavu-38b8c\`.
- Reglas específicas añadidas a \`firestore.rules\`, con pruebas de seguridad en emulador.
- **Reglas base de Operaciones desplegadas** en Firebase con respaldo verificado: GitHub Actions #44211385303. La ampliación de marcaje individual exige una NUEVA ejecución manual con respaldo. Un PR o GitHub Pages exitoso NO demuestra sincronización entre dos usuarios reales.
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

## Cambios preparados el 17 de noviembre de 2026 (rama aislada, sin activación)

- `visor.html` ahora exige Google Auth y valida `agora_users/{uid}` desde el servidor antes de escuchar `agora_ops_control/schedule` mediante `onSnapshot`. La lectura de la agenda administrativa continúa restringida por las reglas de Firestore a admin y coordinador. No hay acceso público al documento.
- `ops-safe-view.mjs` genera una copia minimizada de cada evento para el visor y una ficha personal con lista blanca de campos para staff. No muestra nombres individuales en el visor global; solo cantidades y alertas sin identidad.
- `visor-demo.html` conserva la versión local anterior para las pruebas históricas; `demo.html` se conserva como simulador no colaborativo. No confundirlas con el editor y visor reales.
- El archivo de pruebas `operaciones/tests/qa-safe-view.mjs` comprueba que no salen campos de salarios, cuentas bancarias, placas, datos de colegas ni aprobaciones.
- **No se han comprobado todavía los datos de reglas vigentes en Firebase ni una sincronización real de dos usuarios**. No se debe fusionar o publicar la rama hasta resolver la federación WIF, obtener respaldo real y comprobar compatibilidad.


## Jornadas del personal, marcaje GPS y traslados (ampliación)

**Vista individual (dentro del visor):** https://dejavump.github.io/agora-compras-dejavu/operaciones/visor.html  
**Control coordinadores:** https://dejavump.github.io/agora-compras-dejavu/operaciones/control-jornadas.html  
**Visor protegido (entrada única):** https://dejavump.github.io/agora-compras-dejavu/operaciones/visor.html

- **Acceso individual:** Google o Firebase Authentication con correo verificado y contraseña. El usuario de acceso es actualmente el correo; alias sin correo necesitan identidad segura de backend y no una búsqueda pública de usuarios.
- **Alta de cuentas:** habilitar proveedor Correo electrónico/Contraseña en Firebase Authentication y crear/invitar cuentas autorizadas. La interfaz no registra contraseñas de terceros. El coordinador vincula el UID con personal desde Accesos del editor.
- **Habilitar jornada:** con un UID vinculado a la persona asignada, desde Control de jornadas seleccionar Horario fijo o Número de horas, configurar inicio/final, cupo y Guardar. Sin política, la jornada está bloqueada.
- **Entrada:** permiso GPS, descripción y hora registrada con serverTimestamp de Firebase; no se acepta una hora enviada por el teléfono.
- **Salida:** descripción breve, ubicación actual y hora de servidor. La salida se permite incluso si el acceso se bloqueó o expiró, para cerrar correctamente.
- **Ubicación durante turno:** opción separada y visible, únicamente la última coordenada actualizada, sin historial de ruta; requiere navegador abierto. watchPosition puede suspenderse en segundo plano y el GPS puede ser impreciso o manipulado.
- **Traslados:** origen, minutos manuales, margen, hora de salida confirmada, ETA calculada y llegada real certificada por servidor. Google Maps abre indicaciones pero no hay información automática de tráfico.
- **Bloqueo:** las reglas del servidor impiden entradas fuera de ventana, después de bloqueo o sin política. El modo Número de horas limita el seguimiento tras agotar el cupo. El cierre automático con la página cerrada necesita backend programado y NO está implementado.
- **Privacidad:** staff solo consulta sus jornadas y registros; coordinación puede ver registros y últimos puntos GPS. Sin consultas públicas ni tarifas en visor.
- **Pruebas:** emulador con identidades ficticias en test-clock-rules.mjs y preflight de reglas actuales; no se usa nómina o GPS de personas reales.
- **Activación Firestore:** revisar GitHub Actions «Dejavú Staff · Firebase (reglas seguras)» y ejecutar un NUEVO workflow_dispatch desde main confirmando agora-dejavu-38b8c. No re-ejecutar runs antiguos. Las reglas anteriores se comparan y respaldan antes de publicar.

**Pendientes reales:** habilitar Email/Password si falta; provisionar/verificar cuentas reales; despliegue manual de las reglas de marcaje; pruebas de GPS en dispositivos reales y dos cuentas; definir aviso de privacidad y retención de datos de ubicación.


## Flujo único de acceso al visor (corrección de UX)
1. El usuario abre **operaciones/visor.html**. Puede entrar mediante Google o una cuenta de Firebase Authentication con correo y contraseña. La contraseña nunca se almacena en Firestore.
2. Si el correo no está verificado, el visor ofrece el envío de verificación. Un correo verificado **no concede permisos operativos automáticamente**.
3. Si la cuenta aún no tiene rol, aparece **Solicitar autorización de acceso**, sin agenda, nombres de personal, tarifas ni marcajes. La solicitud se escribe en `agora_ops_access_requests/{uid}` con estado `pendiente`; no existe escritura pública.
4. Coordinación abre **Accesos** desde el editor, revisa la solicitud y vincula el UID a la ficha de personal correspondiente; se crean sus datos individuales y permisos de lectura de jornadas.
5. Tras la aprobación, el visor muestra **Mis jornadas dentro de la misma URL** (entrada, salida, ubicación puntual y traslados). El usuario no se redirige a otro portal.
6. Administradores y coordinadores siguen viendo únicamente el visor general; pueden regresar al editor y al control de jornadas.
7. `jornadas.html` se mantiene solo como redirección compatible al visor para enlaces antiguos.

**Nota:** el acceso mediante un alias distinto del correo requiere un servicio de autenticación adicional. El formulario actual usa el correo asignado y la contraseña, o Google. El proveedor Email/Password debe estar habilitado en Firebase Authentication y las cuentas deben provisionarse por el equipo autorizado.


## Mis jornadas · experiencia unificada (cronograma, registro y pagos)

El personal usa **una sola dirección:** https://dejavump.github.io/agora-compras-dejavu/operaciones/visor.html, con acceso aprobado por coordinación. La vista individual incluye:

- **Inicio:** próxima jornada, sede, transporte, estado de asistencia y botones directos.
- **Cronograma:** alternar Por día / Cronograma, fecha de inicio editable y periodos de 7, 14 o 30 días; muestra turno asignado, jornada n/N, proyecto, sucursal, vehículo y acceso rápido al marcaje.
- **Asistencia:** seleccionar actividad, ver condiciones de habilitación y registrar entrada/salida con timestamp de Firebase y ubicación puntual del dispositivo.
- **Traslados:** origen, minutos manuales, margen, ETA estimada, salida y llegada reales y enlace de Google Maps.
- **Mis pagos:** se leen solamente documentos propios de `agora_ops_logs` filtrados por `ownerUid`. La jornada terminada permite crear un reporte a partir de los marcajes certificados; luego se puede enviar **Solicitar pago** a coordinación. No existe pago automático ni transferencia financiera desde esta vista.
- **Estados:** Horas capturadas → En revisión → Validado → Pago programado → Marcado como pagado. Una solicitud devuelta se presenta como **Corrección solicitada**, con comentario si está disponible.
- **Importes:** antes de validación no se estiman ni muestran salarios. Solo se muestra un `approvedAmount` individual después de la validación por coordinación. «Marcado como pagado» es un estado operativo, no una constancia bancaria.

La vista del staff no consulta la agenda administrativa completa, ni tarifas de otras personas. La creación de reportes exige jornada finalizada y horas positivas, se limita a un reporte por evento desde la interfaz y requiere validación de Firestore. No reconstruye las herramientas antiguas de pagos de ÁGORA.

**Pruebas:** `qa-staff-dashboard.mjs` comprueba cronograma diario y 7/14/30 días, múltiples jornadas y borrador sin importes; `qa-jornadas-live-mock.mjs` recorre cronograma, entrada/salida, traslado, reporte y envío en un navegador simulado. Se mantiene pendiente una validación de pago real con dos cuentas autorizadas.

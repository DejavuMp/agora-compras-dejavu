# ÁGORA Dejavú · Portal de identidad

## Alcance vigente (23 de noviembre de 2026)

Se trabaja sobre el **mismo repositorio** `DejavuMp/agora-compras-dejavu`, subcarpeta `portal-agora/`, conectado al **Firebase existente** `agora-dejavu-38b8c`.

La pantalla inicial después de entrar con Google es **Mi perfil**: nombre, ID Dejavú, puesto, correo, acreditación y los espacios disponibles para esa cuenta. Es una interfaz sobria en carbón y grises, con el color oro restringido al logotipo original.

### Rutas reales, intencionalmente vacías

- `/portal-agora/staff/`: Staff, icono HQ, «Espacio en preparación» y regreso a Mi perfil.
- `/portal-agora/agencia/`: Agencia, icono HQ, «Espacio en preparación» y regreso a Mi perfil.
- `/portal-agora/administrador/`: Administrador, icono HQ, «Espacio en preparación» y regreso a Mi perfil.

Cada ruta utiliza el **mismo Firebase Auth** y consulta la identidad actual por UID. No se garantiza autorización por ocultar botones: la página se comprueba antes de renderizar y muestra «Acceso restringido» al usuario que carece de permiso. El backend mantiene sus propias reglas de Firestore.

### Permisos

- Staff: identidad acreditada y credencial activa (`agora_identity_links` y `agora_identity_registry`).
- Agencia: Staff acreditado, correo verificado y rol activo `admin`, `coordinador` o `consulta` en `agora_users/{uid}`.
- Administrador: Staff acreditado, rol activo `admin`, correo verificado y cuenta principal `admi.agora@gmail.com`.

Nunca crear nuevos documentos `agora_users` ni elevar roles en función de escribir una dirección de correo en el navegador.

### Credencial digital

No se presenta al iniciar sesión. Solo aparece al pulsar «Ver credencial digital», mediante un modal con los datos actuales de Firebase y QR opaco hacia `/portal-agora/verificar.html?id=...`. El verificador consulta la proyección pública `agora_identity_credentials`, nunca el expediente completo. Se puede cerrar, comprobar vigencia y compartir la URL individual.

### No implementado por decisión expresa

**NO** se muestran ni se vinculan: Compras, Operaciones, Archivos, Recursos, Fichas, pagos, actividades, proveedores, directorios ni ninguna otra herramienta. Se preservan las aplicaciones existentes; simplemente no se exponen desde este portal.

**ID + contraseña** aparece en la pantalla de acceso como una funcionalidad futura y permanece desactivado mientras no exista un backend de autenticación que conserve el UID original. **Google** continúa como acceso real. No se almacenan contraseñas.

### Pruebas

El workflow `.github/workflows/portal-agora-identidad.yml` ejecuta:

```sh
node --check portal-agora/app.js
node --check portal-agora/firebase.js
node --check portal-agora/verify.js
node --test portal-agora/tests/*.test.mjs
```

Las pruebas de estructura cubren las tres rutas, el comportamiento de la credencial, los permisos y la exclusión de enlaces operativos. Las pruebas automatizadas no equivalen a una validación interactiva con usuarios reales en Firebase; realizar esa validación antes de afirmar que el acceso está probado en producción.

No modificar datos ni reglas de Firebase para este rediseño de interfaz.


## Mejoras visuales de Mi perfil (23 nov 2026)

Se aplica el diseño guiado por la captura compartida por Dejavú Marketing:

- **Foto personal de la cuenta real:** se intenta usar `Firebase Auth.currentUser.photoURL` y, como alternativa, la fotografía del proveedor de acceso Google vinculado. Solo se aceptan URLs HTTPS. Si no hay foto disponible o falla su carga, aparece un círculo con las iniciales del nombre, sin inventar una fotografía ni publicar material privado.
- **Encabezado limpio:** se retira el texto «PORTAL ÁGORA» junto al logotipo porque ya figura en el recurso oficial. El enlace del logotipo conserva nombre accesible y navegación a Mi perfil.
- **Navegación por iconografía aprobada:** Staff y Agencia presentan sus iconos con el nombre ya impreso dentro de la imagen y un gesto discreto «Entrar»; no se duplica el rótulo. Administrador mantiene el texto «Administrador» porque su símbolo de ÁGORA no lo identifica por sí solo. Cada enlace incorpora su nombre completo accesible mediante `aria-label`.
- **Legibilidad:** los textos son más grandes, aumenta el área táctil de botones, el foco de teclado es visible, existen diseños adaptables y se respeta la preferencia por movimiento reducido.
- **Credencial digital:** la foto verificada también aparece en la vista privada de credencial cuando está disponible, junto con el QR de verificación ya existente; el QR sigue oculto en Mi perfil.

**La foto no se sube todavía a un almacén propio de ÁGORA.** El archivo `storage.rules` actual no concede escritura de fotografías de perfil; modificarlo o publicar reglas nuevas sin un flujo probado de subida y permisos no sería seguro. El usuario podrá configurar su fotografía en la cuenta Google asociada y actualizar su sesión para verla en ÁGORA. No se crean ni se modifican documentos de Firestore.

El resto permanece sin cambios: tres espacios iniciales vacíos, sin herramientas ni módulos añadidos.


## Mi perfil con entorno ambiental Dejavú — 23 NOV 2026

La vista autenticada (`Mi perfil` y las tres páginas de espacios vacíos) ahora utiliza:

- **Imagen ambiental original del proyecto** `assets/escena-login-agora.webp`, usada anteriormente en la portada aprobada, como fondo exterior. No se genera ni incorpora otra imagen.
- **Oscurecimiento y desenfoque con CSS** para mantener la legibilidad y evitar competir con el contenido.
- **Panel principal negro/carbón** centrado, con borde sutil, ligera profundidad y una única línea de acento discreta.
- **Tarjetas interiores menos contrastadas**, sin botones o cajas adicionales.
- **Versión móvil adaptada**: panel de casi todo el ancho, manteniendo una franja exterior de fondo ambiental.
- La página de inicio de sesión **no se modifica**: las nuevas reglas actúan únicamente bajo `body:not(.login-mode)`.

El cambio modifica solo `portal-agora/perfil.css`, tests y esta documentación. **No añade módulos ni accesos**, no altera la credencial digital, roles, usuarios, rutas, Firebase ni Firestore.


## Consolidación de Identidad y RH — Mi operación y Expediente privado

El portal ÁGORA reutiliza las **colecciones originales** del sitio `/identidad/`. No se migran ni copian registros:

- `/portal-agora/mi-operacion/` consulta el documento individual `agora_ops_staff/{uid}` y **reutiliza** `projectTodayAssignments` de `identidad/domain.mjs`. Se muestran únicamente las actividades de hoy que corresponden a la cuenta, con proyecto, sede, horario, cargo, responsable e indicaciones. **No se muestran tarifas, nóminas, coordenadas ni información de terceras personas.**
- `/portal-agora/expediente/` lee `agora_identity_profiles/{uid}` y `agora_identity_financial/{uid}` **solo al entrar en la página**. Los formularios mantienen los campos y validaciones del sitio Identidad Única y RH; al guardar usan las funciones `saveProfile` y `saveFinancial` de `identidad/firebase-identity.js`, y por tanto aplican el bloqueo `lockedByRH` y las reglas Firestore existentes.
- Ambos accesos aparecen en **Mi perfil → Mi información**. El resto de los espacios Staff, Agencia y Administrador permanecen sin herramientas operativas.
- Requieren sesión Firebase e ID Dejavú verificado y vigente; una URL escrita manualmente no omite estos controles. La seguridad real de lectura/escritura se aplica mediante reglas Firestore por UID.
- La bóveda documental mantiene su carga **deshabilitada**: no se crean falsas subidas ni almacenamiento de documentos privado sin infraestructura y reglas verificadas.

### Retirada del sitio anterior

**No eliminar `/identidad/` todavía.** Además de estos dos módulos, mantiene flujos de solicitud/aprobación de IDs, directorio RH, asignación de coordinación y revocación de credenciales que no han sido trasladados a este portal. La eliminación o redirección anticipada rompería esas funciones. Solo retirar sus pantallas antiguas tras probar la equivalencia con usuarios de prueba, validar las operaciones de RH pendientes y confirmar respaldo. Esto no significa duplicar datos: ambos consultan los mismos documentos.

### Validaciones antes de cerrar la migración

- Un usuario con credencial activa puede ver y editar **únicamente su expediente**, con consentimiento/seguridad aplicable en Firebase.
- La sección financiera respeta `lockedByRH`.
- Un usuario sin ID activo no puede abrir por URL las dos páginas.
- Si Firestore niega la lectura, aparece un error sin exponer información de terceras personas.
- Los turnos provienen de `agora_ops_staff/{uid}` y se proyectan con la lógica existente.
- La gestión centralizada de RH queda pendiente en la implementación original.


## Primer enlace funcional por roles: Staff / Coordinación / Administración (23 nov 2026)

Esta etapa conecta las rutas existentes a las **colecciones reales**, con un solo UID e ID Dejavú. No sustituye todavía los marcajes oficiales ni habilita nuevas escrituras fuera de las reglas actuales.

### Staff — `/portal-agora/staff/`
- Consulta `agora_ops_staff/{uid}` solamente para el titular acreditado. Si no existe su vínculo `agora_ops_members/{uid}` o no hay permiso, muestra diagnóstico sin revelar datos ajenos.
- Muestra jornadas propias y **varias actividades dentro de una misma jornada** si esas actividades ya están presentes en la ficha. No calcula tiempos de traslado ni muestra datos de nómina, GPS o pagos ajenos.
- Permite **preparar una propuesta de actividad adicional**, sin límite predeterminado y sin bloquear por hora de inicio. El botón **no guarda en Firebase** hasta habilitar una colección de actividades propia con reglas verificadas; genera un texto que puede copiarse para solicitar su incorporación.
- Mientras no se porte el sistema de marcajes, mantiene un enlace directo y explícito al **Jornadas / Visor original** para registrar entrada/salida con la autenticación vigente. No crea relojes o marcajes falsos.

### Coordinación — `/portal-agora/agencia/`
- Solo roles `coordinador` y `admin` activos pueden leer `agora_ops_control/schedule` y ver la agenda administrativa. Cuentas `consulta` conservan un acceso de solo consulta sin solicitar documentos para los que carecen de permisos.
- Muestra resúmenes y fechas, sin copiar tarifas, nóminas, cuentas bancarias, datos médicos ni GPS.
- **Asignaciones de jornada:** formulario con solicitante, medio, contacto, fecha de solicitud, proyecto, sede, fecha y horario laboral, personal requerido, descripción, nota de evidencia y **múltiples actividades abiertas** (agregar/eliminar filas sin límite arbitrario).
- Botón **Preparar borrador** valida y crea un texto exportable para compartir con coordinación. Indica explícitamente **NO GUARDADO / NO AUTORIZADO**. No carga archivos por ahora porque `storage.rules` no incluye ruta privada de evidencia de solicitudes. La carga aparece deshabilitada y explicada.
- Conserva accesos transitorios al editor original y al control oficial de asistencia; estos continúan protegidos por Firestore.

### Administrador — `/portal-agora/administrador/`
- Solo cuenta principal con correo verificado e ID activo **y** `agora_users/{uid}.role === "admin"`.
- Lee el cronograma como administrador y muestra supervisión de jornadas, turnos asignados y solicitudes en borrador, sin sustituir los permisos del editor.
- No concede roles, aprueba solicitudes, realiza pagos ni modifica la agenda automáticamente.

### Próxima etapa segura: persistencia y evidencias
Las reglas actuales **no** disponen de una colección para actividades dinámicas por jornada ni de un almacenamiento privado para evidencias (capturas, audio, correos). Implementar ambas con validación de UID, rol, autoría, folio y bloqueo de escalamiento de privilegios; pruebas en emulador Firebase; después verificar el estado de las reglas efectivas en producción y **no sobrescribirlas si difieren de la línea base**. Hasta esa publicación comprobada, mantener los borradores solo para copiar. No eliminar las herramientas antiguas mientras se sigan usando para marcar horarios o publicar asignaciones.

Todo lo anterior es un primer paso real de integración **de lectura** y de navegación por rol; no debe describirse como publicación completa del sistema de solicitudes ni de tareas persistentes.


## Credencial digital operativa: identificación y pase de lista (25 NOV 2026)

La credencial existente de ÁGORA **no se sustituye por un QR de asistencia nuevo**. Sigue usando el ID único `DJV-AAAA-NNN`, nombre, puesto y foto real de la cuenta Google, además del QR hacia `/portal-agora/verificar.html?id=<credentialId>`. El QR permite que un tercero compruebe **vigencia, nombre, ID y puesto** mediante la proyección pública mínima `agora_identity_credentials/{credentialId}`; no habilita acciones privadas ni publica teléfono, banco, datos fiscales o de salud.

### Marcaje del titular (desde Mi perfil → Ver mi credencial)

Se añadió **Mi pase de lista · Entrada y salida** dentro de la credencial. Solo funciona después de iniciar sesión con la cuenta del titular, comprobar su UID, su ID acreditado y activo, la vinculación `agora_ops_members/{uid}` (`role=staff`, `active=true`), la ficha propia `agora_ops_staff/{uid}` y el permiso `agora_ops_shift_access/{uid}_{eventId}`.

- **Registrar mi entrada:** solo cuando coordinación habilitó el período y se confirmó consentimiento de GPS puntual. Escribe el documento **oficial original** `agora_ops_clock/{uid}_{eventId}` con `startedAt`, `lastGeoAt` y `updatedAt` como horas de servidor; conserva los campos esperados por las reglas existentes.
- **Registrar mi salida:** solo para reloj propio `en_curso`; conserva el inicio y actualiza `status=finalizada`, `endedAt`, `endNote` y `updatedAt` con hora de servidor. La ubicación de salida es completamente opcional y se solicita **solo si el titular marca expresamente la casilla de consentimiento**; si falla, puede continuar sin GPS tras confirmarlo. No se bloquea por la caducidad posterior del permiso.
- Si ya existe un reloj `finalizada`, no vuelve a presentar botón de entrada/salida: no hay doble marcaje ni duplicación.
- El QR **nunca realiza el marcaje por sí mismo**. La página pública muestra `Registrar mi propia entrada o salida`, que abre el portal con `?asistencia=1` y exige al usuario autenticado su propio UID y jornada autorizada. Compartir una imagen o un QR de otra persona no basta para registrar asistencia.
- Se conserva la opción de abrir el visor antiguo de Jornadas para revisar descansos, correcciones o historia.

### Lista oficial para Coordinación y Administración

Se añadió **Pase de lista · Entradas y salidas** a los espacios Agencia y Administrador, solo con `agora_users/{uid}` activo y rol `coordinador`/`admin`, más el control propio de acceso del portal. Consulta **el cronograma autorizado** y, por jornada seleccionada, lee `agora_ops_clock` filtrado por `eventId` para mostrar integrantes, horas de entrada y salida y estado. No muestra coordenadas, pagos, tarifas, contactos privados ni datos médicos.

El lector público del QR sirve para **comprobar la identidad**; la lista de coordinación sirve para **ver los marcajes** y no escribe sobre el reloj de otra persona. Para un flujo futuro de **escaneo por supervisor que registre asistencia por tercero** hacen falta nuevas garantías del servidor: asociación del token con el UID, autorización explícita del supervisor, prevención de repetidos, vigencia de jornada, auditoría, protección frente a fotos de QR y pruebas de reglas. No se simula un marcaje de supervisor mientras no estén esos controles.

### Implementación segura

- Módulos nuevos: `attendance-policy.mjs`, `attendance-live.js`, `attendance-roster.js`.
- **No se modifican `firestore.rules` ni `storage.rules`** y tampoco registros, horarios históricos ni ID existente.
- El registro real requiere la configuración ya vigente de Operaciones: miembro de Staff vinculado, ficha publicada y horario habilitado. Si faltan permisos muestra error sin atribuir éxito.
- Pruebas automatizadas cubren propiedad de la jornada, prevención de duplicado, entrada/salida con timestamp de servidor, QR sin autorización y consulta por coordinador. Estas pruebas no demuestran todavía una sesión real con dispositivos o permisos del proyecto de producción; debe comprobarse con un usuario de prueba antes de usarlo como control único de asistencia.


## NUEVO FLUJO ACTUAL — QR de identidad separado de QR de jornada (25 NOV 2026)

Este apartado **sustituye** las referencias anteriores del README que incluían «Mi pase de lista» dentro de la credencial de identificación.

### 1. Credencial digital = solo identificación
- Mi perfil → **Ver mi credencial** conserva fotografía real de la cuenta, nombre, puesto, ID Dejavú y QR público de verificación hacia `verificar.html?id=...`.
- **No contiene controles de entrada/salida**. Su QR de identificación **no registra asistencia** y el verificador ya no ofrece enlace a marcaje.
- Los módulos anteriores `attendance-live.js` y `attendance-policy.mjs` quedan conservados por compatibilidad con el sistema de relojes, pero **no se importan ni se ejecutan** desde la credencial. Las pantallas originales de Jornadas siguen siendo la referencia del reloj oficial.

### 2. QR separado por jornada o actividad en Staff
- Staff → Mis jornadas → **Mostrar QR de jornada / actividad** genera desde la sesión del titular un URL QR específico para `uid + personId + eventId`; opcionalmente incluye una actividad identificada por `activityKey`.
- Un mismo período laboral puede contener **varias actividades**. Escanear una actividad no crea otra jornada, ni separa los marcajes oficiales.
- El QR cambia al **renovarlo**, incluye momento de emisión y se presenta por 90 segundos. Su caducidad de interfaz es una medida auxiliar: **no es un token firmado ni una prueba criptográfica de presencia**, por lo que debe comprobarse presencialmente al portador.
- El QR de jornada **nunca contiene la credencial pública**, correo, datos fiscales, información bancaria, salarios, contraseñas ni tokens de acceso.
- Generación: `qr-jornada.mjs` y `staff-shift-qr.js`. El QR se presenta como imagen o enlace sin necesidad de escritura privada en Storage.

### 3. Escaneo por Coordinación o supervisor autorizado
- Agencia / Administrador → **Escanear QR de jornada** → `/portal-agora/escanear/`.
- Se exige inicio de sesión con Google y un usuario activo de `agora_users` con rol `coordinador` o `admin`, como exige la regla vigente `canEdit()`. El título laboral **Supervisor** por sí mismo **no otorga** permisos de lectura del cronograma ni de escritura de validaciones: Administración debe asignar de forma autorizada un rol que cumpla las reglas del servidor. **No se elevan roles desde el navegador**.
- Lector de cámara con `BarcodeDetector` cuando está disponible y pegado manual del enlace como alternativa. Se rechazan códigos de identidad o de otros sitios.
- El scanner consulta `agora_ops_control/schedule` y coteja `eventId`, `personId`, `people[].authUid` y las actividades publicadas. También comprueba `agora_ops_shift_access/{uid}_{eventId}` y su horario. **La identidad y la presencia deben confirmarse presencialmente** antes de pulsar el botón de validación.
- La acción del coordinador crea un registro real, único y no sobrescrito en `agora_ops_incidents/{qr_sha256}`:
  - `type=validacion_asistencia` y `status=entrada|salida`, o `type=validacion_actividad` y `status=actividad_verificada`.
  - `ownerUid`, `personId`, `eventId`, `revision=1`, `updatedAt=serverTimestamp()`; en la nota se conserva el UID/identidad del operador que confirmó presencialmente.
  - Se usan **exclusivamente las reglas existentes** para `agora_ops_incidents` (escritura `canEdit()`). El ID determinista evita crear una segunda entrada o salida QR por jornada.
- **Importante:** este registro es una **validación presencial por QR**, NO un nuevo `agora_ops_clock`. El scanner **no puede alterar ni simular los marcajes personales oficiales**, porque las reglas vigentes limitan esos documentos al propio titular. El marcaje oficial personal puede continuar en Jornadas.

### 4. Pase de lista con dos fuentes separadas
- Agencia/Admin → Pase de lista muestra **Reloj entrada**, **Reloj salida**, **QR presencial** y **Estado**.
- El reloj lee `agora_ops_clock` y el QR lee `agora_ops_incidents` del evento seleccionado; no se usan coordenadas ni pagos.
- Una validación QR se ve claramente como **«QR verificado · Sin marcaje oficial»** si todavía no existe una entrada del reloj personal. La ausencia de reloj nunca se maquilla como marcaje oficial.

### 5. Límite de seguridad y próxima mejora
No confundir un QR breve generado en navegador con un token firmado por servidor ni con presencia biométrica. Para convertir el **escaneo del supervisor en marcaje oficial del reloj** se necesita una nueva autorización de servidor, vinculaciones por jornada, tokens antirreutilización, acceso restringido al supervisor por actividad y reglas/emulador. Esos cambios **no se desplegaron** porque el proyecto tiene reglas de producción con controles de respaldo y no se deben sobrescribir sin conciliación.

**No se modifican Firestore Rules, Storage Rules, datos anteriores, usuarios ni permisos.** Verificar lectura y creación de un incidente QR mediante cuentas reales antes de utilizarlo como control laboral definitivo.


## PASE DE LISTA INTEGRADO — QR / Manual / Provisional / Pagos (25 NOV 2026)

### Implementación de cierre sobre el sistema ÁGORA ya existente
- **Credencial de identidad y QR de jornada son independientes.** El QR de identidad sólo verifica ID, nombre, puesto y vigencia; no registra asistencia.
- **Tres métodos de pase de lista:** escaneo del QR efímero de jornada/actividad (90 s), selección manual de personal previamente asignado (con y sin cuenta/QR) y alta de asistente provisional con motivo, persona y medio de solicitud registrados.
- **Supervisor**: únicamente puede consultar y capturar asistencia de jornadas cuyo UID haya delegado Coordinación en el documento mínimo `agora_ops_attendance_sheets/{eventId}`. No recibe el cronograma global con tarifas, finanzas, datos bancarios, expediente ni autorización de pagos. La delegación exige sesión Firebase verificada e identidad Dejavú activa.
- **Coordinación/Administración**: prepara la jornada desde el cronograma original, elige UID(s) supervisores, puede cerrar/reabrir lista, valida/rechaza registros y aprueba minutos netos tras confirmar entrada y salida (QR/manual/provisional validados o reloj original finalizado). **No realiza transferencias**. Puede copiar el resumen para el módulo de Solicitud de Recursos/Pagos, que conserva su propio control.
- **Jornada única con actividades múltiples:** la colección `activities` guarda cualquier cantidad de tareas por UID/jornada; Staff puede agregar actividades y marcar pendiente, en curso, terminada o no realizada sin crear otra jornada ni horas adicionales. Los QR de actividad se integran a la misma jornada.
- **Registros preservados:** `agora_ops_clock`, `agora_ops_logs` y todos los datos del personal y pagos previos permanecen intactos. Las nuevas capturas se guardan en `entries` con sello de tiempo del servidor, autor UID, modalidad y estado pendiente; el coordinador valida en campos inmutables y aprobaciones independientes.
- **Sin tiempos de traslado** en la nueva interfaz. No se accede a GPS, importes ni bancos desde el pase de lista.
- **Seguridad:** ruleset aditivo que no modifica ninguna regla existente; tests de emulador Firestore comprueban denegación de autoasistencia, aislamiento del Supervisor, duplicados, horas validadas y actividades.
- **Producción protegida:** GitHub Pages publica la interfaz al fusionar el PR. Las nuevas escrituras de Firestore sólo quedan activas si el proceso `ÁGORA · Asistencia con respaldo y publicación segura` se completa. Este proceso primero respalda las reglas reales, compara SHA exacto con la base anterior, prueba el ruleset con emulador, revalida el ruleset real y sólo entonces publica Firestore. Si hay diferencias, **no sobrescribe producción** y el módulo muestra un error real de permisos.

### Requisitos de salida
1. Workflow `Dejavú Staff · Firebase (reglas seguras)` completo en verde (incluidos `test-attendance-rules.mjs`).
2. Publicación GitHub Pages de main completada.
3. Publicación protegida de Firestore confirmada mediante comparación del ruleset activo y respaldo almacenado en el workflow.
4. Prueba funcional de extremo a extremo con dos cuentas reales: un Staff asignado, Supervisor delegado y Coordinación validando horas. Hasta que se verifique el paso 3 no se debe indicar que el guardado productivo está funcionando; hasta que se verifique el 4 no se debe utilizar como único control laboral.

La sección `Asignaciones de jornada` en Agencia ahora guarda una **solicitud persistente y privada**, con folio UUID, quién solicita, canal (WhatsApp, llamada, correo, presencial, otro), proyecto, sede, horario, personal requerido, descripción y actividades. La imagen de evidencia opcional se convierte a **JPEG comprimido (máximo 170 KB)** y se guarda como cadena privada en el documento Firestore de la solicitud, sólo legible para `canEdit()` (coordinadores/administradores); no se crea ningún enlace de descarga público ni se toca Storage. El historial permite consultar y vincular la solicitud a una jornada **ya publicada** en Operaciones; no crea una nueva agenda paralela ni autoriza automáticamente personal. **No se aceptan audio ni PDF en este formulario**: documentar la llamada con texto y, para documentos más grandes, utilizar el proceso de Archivos privado cuando esté verificado. El registro provisional conserva solicitante, medio y motivo en su nota de asistencia.


## Activación de reglas de asistencia — sólo manual, con identidad federada (25 NOV 2026)

El frontend del módulo se publicó desde PR #57. Los escenarios de Firestore pasaron en emulador, pero **Google Cloud rechazó el intento de autenticación federada iniciado automáticamente por `push`** con `unauthorized_client: The given credential is rejected by the attribute condition`. Este error ocurrió antes de leer o modificar las reglas reales. Por eso el nuevo workflow se restringe ahora a **`workflow_dispatch` manual desde `main`**, respetando la política OIDC existente que permitió despliegues manuales de Firestore en el repositorio anteriormente.

Instrucción al administrador con acceso de GitHub:
1. Abrir `https://github.com/DejavuMp/agora-compras-dejavu/actions/workflows/asistencia-produccion-segura.yml`.
2. Seleccionar **Run workflow** → rama **main**.
3. Escribir exactamente `agora-dejavu-38b8c` en `project_confirmation`.
4. Revisar resultado y descargar `respaldo-obligatorio-asistencia-firestore`. **No desplegar manualmente el archivo completo** si el preflight detecta deriva entre producción y la línea base; primero conciliar las diferencias con respaldo.

El preflight compara el nuevo ruleset con el ruleset que había antes de la integración (commit fijo `8960ea9e75899fd9a61499be894979a2beb5125a`), nunca con el padre más reciente de `main`. Reconsulta las reglas reales después del backup y antes de publicar, y verifica la versión resultante. Si la condición OIDC de Google también rechaza el workflow manual por su ruta, un administrador de IAM debe autorizar **explícitamente** ese workflow; **no se debe suplantar ni bypassar el proveedor WIF**. Mientras no exista despliegue confirmado, el frontend mostrará permiso denegado para las nuevas colecciones; no se debe presentar como funcional el guardado productivo.


## Conciliación segura de reglas reales (25 NOV 2026)

La ejecución manual de GitHub Actions `45588886202` ya autenticó correctamente con Google Cloud y guardó el ruleset real `15d41d21-5847-438f-8084-4c931694f68c`, pero lo encontró diferente a la línea base histórica; el despliegue se detuvo sin sobrescribir producción.

La revisión del respaldo confirmó que las rutas nuevas `agora_ops_attendance_sheets` y `agora_ops_assignment_requests` no estaban presentes. Por eso el activador manual fue corregido con una **conciliación estrictamente aditiva sobre las reglas reales**:

1. Autenticación WIF manual desde `main` y descarga del ruleset vivo.
2. Respaldo del contenido y nombre exacto del ruleset antes de cambios.
3. Validación de que el archivo del repositorio sólo añade el módulo aprobado respecto al commit original `8960ea9e75899fd9a61499be894979a2beb5125a`.
4. Verificación de cierre `deny-all` idéntico y ausencia de colisiones de colecciones o funciones. Construcción de un archivo reconciliado con **inserción literal** del bloque de asistencia, manteniendo todos los bytes anteriores.
5. Pruebas del emulador **sobre el archivo reconciliado**, incluyendo asistencia, Operaciones e Identidad.
6. Comparación del hash y nombre del ruleset vivo nuevamente antes del despliegue. Si cambió, se detiene.
7. Publicación de **solo reglas Firestore** y verificación de hash exacto del ruleset resultante. El proceso queda restringido al `workflow_dispatch` autorizado y no modifica Storage ni datos históricos.

**No se debe pulsar «Re-run jobs» de la ejecución anterior:** debe utilizarse un nuevo `Run workflow` desde `main` para que GitHub utilice la versión corregida del script.

El éxito del workflow confirma publicación de reglas, pero todavía corresponde ejecutar una prueba de registro en Firebase con cuentas reales de Supervisor, Staff y Coordinación antes de tratar el módulo como control de nómina definitivo.

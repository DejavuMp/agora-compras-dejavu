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

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

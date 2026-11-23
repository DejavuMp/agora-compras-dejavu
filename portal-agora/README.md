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

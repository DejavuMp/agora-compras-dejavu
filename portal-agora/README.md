# ÁGORA Dejavú · Portal único (solo Identidad)

**Estado:** nuevo sitio estático independiente preparado para llevarse a su propio repositorio y dominio. Se encuentra en la carpeta `portal-agora/` del repositorio existente únicamente mientras se revisa y valida; **no se ha creado todavía un nuevo repositorio ni se ha publicado un dominio**.

## Alcance aprobado (único)

Tres espacios, todos relacionados **exclusivamente con el ID Dejavú**:

| Espacio | Vista inicial |
|---|---|
| **Agencia** | Identidad del colaborador autorizado, credencial, ID y QR |
| **Staff** | Identidad personal, credencial, ID y QR |
| **Administrador** | Identidad del administrador principal, credencial, ID y QR |

No se incorporan proyectos, actividades, pagos, proveedores, solicitudes externas, invitaciones, compras, inventario ni módulos de otros sistemas. Se dejan para una etapa posterior.

## Acceso

- Celular + SMS verificado con reCAPTCHA (Firebase Phone Auth).
- Correo + enlace verificado (Firebase Email Link).
- Google (para cuentas existentes y administrativas).
- Quienes ya tienen ID conservan `agora_identity_links/{uid}`, `agora_identity_registry/{agoraId}` y su token de credencial.
- Quien todavía no tiene ID puede enviar **solicitud de acreditación** a `agora_identity_registrations/{uid}`, sin emitir ninguna credencial automáticamente.
- Quien ya tiene una cuenta vinculada puede añadir otro contacto verificándolo **desde su sesión original** para no cambiar su UID ni crear otra identidad. Nunca se fusionan cuentas automáticamente.
- La administración principal indicada es `admi.agora@gmail.com`. Mostrar el espacio Administrador exige **correo verificado + rol `admin` activo en `agora_users/{uid}` + credencial ID vigente**. La coincidencia de correo por sí sola no otorga permisos.

## Código independiente

Todo lo que necesita la vista está dentro de esta carpeta:
`index.html`, `style.css`, `app.js`, `firebase.js`, `verificar.html`, `verify.js`.

No se importan componentes, rutas ni estilos de los módulos actuales. Solo se reutiliza **la base Firebase de Identidad** y los datos originales por UID. Puede copiarse el contenido de esta carpeta a la raíz de un nuevo repositorio sin reescribir enlaces internos.

## Antes de publicar en un dominio propio

1. Crear nuevo repositorio, sugerido **`DejavuMp/agora-portal-dejavu`**, y copiar los archivos de esta carpeta a su raíz. No copiar la aplicación de Compras ni repositorios anteriores.
2. Configurar Hosting independiente o un nuevo *Firebase Hosting site* asociado al proyecto existente sin sobrescribir el que ya opera. Configurar el dominio personalizado cuando se decida.
3. Activar en Firebase Authentication Phone, Email/Password + Email Link y Google; agregar dominio a Authorized Domains y configurar el mecanismo antispam para SMS.
4. Probar con números de test y correos reales que el UID ya emitido mantiene el ID tras vincular otro método.
5. Validar las reglas con el emulador; **respaldar y comparar las reglas de Firebase de producción** antes de implementar las modificaciones para SMS. No cambiar reglas de forma manual sin comprobación.
6. Comprobar que `admi.agora@gmail.com` esté verificada y asociada a un UID autorizado como `admin`. La cuenta debe acreditar también su ID Dejavú.
7. Probar alta de ID, estado pendiente, bloqueo, QR, acceso Staff por SMS y correo, restricciones de Agencia y Administrador, y la consulta de un QR desde otro dispositivo.

## Pruebas

```sh
node --check portal-agora/app.js
node --check portal-agora/firebase.js
node --check portal-agora/verify.js
node --test portal-agora/tests/*.test.mjs
```

La CI de reglas Firebase existente prueba también Finanzas y Operaciones para prevenir regresiones, aunque **ningún módulo de ellos se incorpora al portal**.

**No publicar ni redirigir la portada antigua** hasta realizar pruebas reales de Firebase y crear el repositorio y dominio aprobados.


## Identidad visual del archivo «Portal Dejavú press.pdf»

Los siguientes recursos visuales se extrajeron del documento de referencia aportado por Dejavú Marketing, conservando su composición original y adaptando sus dimensiones a la web:

- `assets/pdf-hero.webp` — imagen «ÁGORA / Ecosistema Central» de la página **18**, fondo del acceso.
- `assets/pdf-zeus.webp` — imagen clásica oscura con órbitas doradas de la página **4**, utilizada en la credencial.
- `assets/pdf-agora-icon.webp` y `assets/pdf-agora-wordmark.webp` — identidad del portal completo, página **13**.
- `assets/pdf-staff-icon.webp` — icono de Staff, página **14**.
- `assets/pdf-agency-icon.webp` — icono Operaciones Agencia, página **16**.

La página **17** sirvió como referencia del sistema visual y la separación de pantallas. Por decisión de alcance, los espacios siguen mostrando **únicamente ID, credencial, QR y datos básicos de la propia sesión**, sin añadir módulos de trabajo, actividades, pagos ni cotizaciones.

Los archivos WebP son recursos locales de la carpeta, no direcciones de terceros. También se conserva el logotipo original Dejavú de la versión anterior. No se han modificado los usuarios ni las reglas de Firebase como parte de este rediseño visual.


## Portada cinematográfica de acceso (aprobada 23 nov 2026)

La portada utiliza `assets/escena-login-agora.webp`, derivada de la imagen original de acceso elegida por Dejavú Marketing. Para que **no se duplique la interfaz que estaba dentro de la imagen**, las zonas centrales con textos y botones se cubrieron al preparar el fondo optimizado. El formulario es HTML real y sigue usando los mismos métodos Firebase (SMS, correo con enlace y Google), la solicitud de ID y la credencial existente.

Se ocultan en portada los cuadros de Agencia, Staff y Administrador; los espacios se muestran solamente después de verificar el ID. La animación CSS es lenta, discreta y respeta `prefers-reduced-motion`. En celulares la composición se adapta a una tarjeta vertical. No se añadió información sobre actividades, pagos ni proveedores.

**Importante:** desplegar HTML/CSS no activa automáticamente los proveedores de Firebase Auth; Phone Auth y Email Link requieren su configuración en la consola y pruebas con cuentas reales.


## Simplificación de acceso: ID Dejavú y Google (23 NOV 2026)

La portada ya no ofrece inicio de sesión por SMS ni enlace de correo.
Se ven únicamente **Usuario (prefijo visible y fijo `DJV-`) + contraseña** y **Continuar con Google**.

**Por qué se muestra `DJV-` en lugar de `DVM_`:** los IDs permanentes emitidos por Identidad Única están definidos en `identidad/domain.mjs` con formato `DJV-AAAA-NNN`. Cambiar el prefijo crearía cuentas inconsistentes o impediría localizar credenciales anteriores; no se modificaron IDs, UIDs, roles ni datos personales.

### Estado técnico real

- **Google:** sigue conectado al mismo proyecto Firebase Auth `agora-dejavu-38b8c`. Es la única opción de acceso activo de esta portada.
- **ID + contraseña:** campo visible como diseño definitivo, pero botón de ingreso deshabilitado y mensaje claro hasta que exista un servicio de autenticación real. **No se recoge, envía ni almacena ninguna contraseña** desde esta pantalla.
- **Solicitar ID:** quien todavía no tiene identidad debe verificar su cuenta con Google antes de enviar la solicitud existente.
- **No** se habilitarán sign-in mediante credenciales simuladas, contraseñas guardadas en Firestore, lecturas públicas del directorio para transformar ID en correo ni creación silenciosa de un UID nuevo.

### Qué falta para activar ID + contraseña de forma segura

1. Implantar un flujo de **establecimiento de contraseña** vinculado al UID existente tras autenticación acreditada (sin crear otra cuenta).
2. Crear un **endpoint de autenticación en backend** que resuelva `DJV-AAAA-NNN` de manera privada, valide la contraseña usando Firebase Authentication y emita acceso únicamente al mismo UID; usar App Check, límites de intentos y errores sin enumeración de cuentas.
3. Probar estados de ID suspendido, sin contraseña, incorrecto y bloqueado, además de los roles Agencia/Staff/Administrador.
4. Revisar el plan de facturación y configuración de Firebase para el backend; mientras no esté habilitado, mantener el botón desactivado.
5. Solo tras pruebas reales y despliegue controlado, activar el botón. Google debe seguir funcionando como alternativa.

Esta etapa es **un cambio de interfaz sin migración de credenciales**.


## Reparación visual y operativa del espacio autenticado (23 NOV 2026)

Este ajuste responde a la revisión real del usuario de `/portal-agora/`:

- **Credencial real:** nombres, ID, cargo y vigencia consultados de `agora_identity_registry`; token opaco `credentialId` para URL `verificar.html?id=...`; código QR generado en tiempo de ejecución, botón para abrir una credencial ampliada y enlace individual para compartir/verificar. No es una fotografía estática de una credencial ni se generan IDs artificiales.
- **Herramientas existentes:** se incorporan accesos directos a `Operaciones`, `Compras`, `Recursos`, `Archivos`, `Fichas`, `Identidad` y el `Visor de jornadas` del repositorio actual. Se muestran por espacio acreditado; no se importan ni duplican módulos, ni se sustituyen las reglas de cada herramienta.
- **Cuenta administradora:** si `admi.agora@gmail.com` ve únicamente Staff, el portal explica que requiere `agora_users/{uid}.role == 'admin'` y `active == true`, además de la cuenta verificada y credencial vigente. Se facilita copiar el UID de la sesión para comprobarlo en Firebase Console. **No se autoconceden permisos por correo ni se modifica Firestore desde el portal.**
- **Identidad visual HQ:** se sustituyen en la zona autenticada los recursos PNG/WebP extraídos en baja resolución por recursos oficiales originales con transparencia: logo del usuario `1772×660`, icono Staff `886×886`, icono Operaciones Agencia `886×886`, icono ÁGORA `1772×1772`. Todo queda empaquetado en `portal-agora/assets/`.
- **Acceso previo al portal:** sin cambios. Google permanece como el método operativo; ID/contraseña continúa pendiente de su backend seguro.

Antes de asumir que la cuenta administradora puede acceder, **verificar el UID y el rol de esa cuenta en Firestore**. No se ha realizado una actualización del registro de producción desde este cambio.

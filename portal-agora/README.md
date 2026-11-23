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

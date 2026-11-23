# ÁGORA · Portal único de entrada (Agencia · Staff · Administrador)

Esta carpeta no crea una nueva base de usuarios ni duplica los módulos. Es el portal de acceso dentro del **repositorio existente** y utiliza Firebase **agora-dejavu-38b8c** y las colecciones de `identidad/`.

## Ruta y pantallas

- `/inicio/`: acceso y selección automática de espacio.
- Staff: credencial verificada, tareas del día desde `agora_ops_staff/{uid}`, acceso a Mis jornadas y Mi expediente.
- Agencia: Operaciones, Compras, Archivos, Recursos, Fichas e Identidad.
- Administración: enlaces de RH y control general, sujeto a `agora_users/{uid}.role == 'admin'`.
- Formulario de solicitud de ID: escribe en `agora_identity_registrations/{uid}`. No crea ni modifica el ID del usuario.
- Credencial: usa el token de QR opaco y la ruta ya existente `identidad/verificar.html`.

## Autenticación y conservación del ID

- **Celular:** Firebase Phone Auth con SMS y reCAPTCHA (requiere proveedor habilitado en el proyecto real).
- **Correo:** enlace de acceso verificado de Firebase Auth (requiere habilitar Email/Password y Email link).
- **Google:** mecanismo usado por las herramientas anteriores.
- El ID Dejavú **no es una contraseña**. Autenticación y autorización requieren una sesión de Firebase real.
- Los métodos de acceso se deben **vincular desde una sesión existente** usando `linkWithCredential`. Así un usuario conserva el mismo UID y, por lo tanto, el mismo ID. Si el celular/correo ya pertenece a otro UID, NO se fusiona automáticamente: administración debe revisar el conflicto.
- No se almacenan contraseñas, OTP, plantillas faciales ni imágenes sensibles en este repositorio.

## Administrador principal

Correo solicitado: **admi.agora@gmail.com**. **No se eleva a administrador por coincidencia de email.**
Un responsable debe entrar a Firebase Authentication, verificar el UID de esa cuenta y revisar/crear `agora_users/{uid}` con `active:true`, `role:'admin'` y correo verificado. El campo `agora_users` usa las reglas ya existentes. No colocar claves aquí.

## Puesta en marcha, sin interrumpir producción

1. Revisar que las direcciones de Operaciones y módulos sigan siendo las últimas versiones que se utilizan.
2. Ejecutar en rama: `node --check inicio/app.js`, `node --check functions/index.js`, `node --test inicio/tests/*.test.mjs`, además de las pruebas de Identidad.
3. Ejecutar pruebas de reglas Firestore en **emulador** con cuatro perfiles: administración, coordinación, staff con email y staff con teléfono. Verificar que teléfono no lee Finanzas, usuarios ajenos ni directorios.
4. Respaldar reglas vigentes, usuarios y registros de identidad antes de cualquier despliegue. Comparar reglas remotas con base esperada; nunca sustituirlas a ciegas.
5. En **Firebase Authentication** habilitar Phone/SMS (números de prueba primero), Email/Password + Email link y Google; autorizar el dominio real de publicación en Authorized domains.
6. Configurar controles antiabuso de SMS y restricciones de envío; **no** publicar hasta verificar el número de pruebas.
7. Probar creación y consulta de solicitud por teléfono sin correo; aprobación por administrador; lectura de credencial y vista de staff; bloqueo posterior de credencial; enlace de correo; vincular teléfono a un UID con ID existente.
8. Enviar aviso por correo a administración cuando ingresa solicitud y al solicitante cuando se aprueba, mediante las **nuevas funciones** que reutilizan Resend (`RESEND_API_KEY`, `AGORA_MAIL_FROM`, `AGORA_PUBLIC_BASE_URL` configurados). El envío no está activo hasta desplegar Functions y configurar su secreto.
9. Para usuarios únicamente con teléfono, la aprobación se ve al iniciar sesión y el portal ofrece compartir un mensaje por WhatsApp. **No hay SMS ni WhatsApp automáticos**, pues requieren proveedor habilitado, consentimiento y tarifa.
10. Publicar `/inicio/` solo tras las verificaciones. No reemplazar aún el `/index.html` de Compras ni borrar rutas antiguas, ni cambiar el dominio de Sites existente. Una transición posterior puede hacer de este portal la portada sin romper enlaces anteriores.

## Seguridad y límites actuales

- Los accesos a Agencia/Administrador se derivan de `agora_users`, no del texto de la página ni de la coincidencia con el correo administrador.
- Para Staff es obligatorio que `agora_identity_links/{uid}` esté activo y la credencial en `agora_identity_registry/{id}` esté verificada y vigente.
- La interfaz oculta los accesos no autorizados; **cada módulo conserva sus reglas de seguridad propias**, por lo que esta pantalla no sustituye los controles del backend ni constituye todavía SSO completo entre todos los repositorios.
- La sesión telefónica accede solo a su identidad y proyección de operaciones por UID. Los privilegios administrativos continúan exigiendo correo verificado.
- Solo cambiar reglas de producción por la vía de preflight y respaldo ya definida en `.github/workflows/dejavu-staff-firebase-rules.yml`.
- No se ha activado reconocimiento facial. Más adelante puede usarse passkey del dispositivo con biometría local.

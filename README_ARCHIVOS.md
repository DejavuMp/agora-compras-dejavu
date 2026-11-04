# ÁGORA · Envío, recepción y cambios de archivos

Herramienta web real para el proyecto **Firebase `agora-dejavu-38b8c`**, diseñada para instalarse en el mismo repositorio de **ÁGORA Compras y Pedidos** (`DejavuMp/agora-compras-dejavu`). No contiene datos reales ni tokens de envío. Interfaz negro/dorado, Arial, adaptable a teléfono y computadora.

## Incluye

- `archivos.html`: consola para empleados con autenticación Google y permisos `agora_users` del ÁGORA existente.
- `archivo-recibir.html#t=...`: vista externa sin iniciar sesión; acceso por enlace aleatorio de 256 bits.
- `archivos.css`, `archivos.js`, `archivo-recibir.js` y `agora-archivos-bridge.js`: funcionamiento real conectado a Firebase Firestore.
- Enlace a Drive, hasta 8 muestras de archivo y 6 imágenes de carpeta por versión, cargadas a Storage o por URL HTTPS.
- Recepción en línea: **recibido, aprobado, solicitar cambios, no recibido**; comentarios y constancia imprimible.
- Historial de versiones y respuestas, filtro por estados, vigencia, revocación y enlaces recuperables.
- `firestore.archivos.rules.fragment`: reglas con lectura externa limitada por token, vigencia y revocación; respuestas inmutables, una por versión.
- `storage.rules`: permite subir capturas solo a personal autorizado.
- `functions/`: funciones de correo opcionales con Resend, para envío inicial, nueva versión y copia de la respuesta al emisor y destinatario.

## 1 · Instalación en el mismo ÁGORA

**Si estás revisando la rama propuesta en GitHub, los archivos y cambios de reglas ya están integrados en ella; no vuelvas a ejecutar el instalador sobre esa rama. Tras revisar y fusionar, despliega Firebase por separado.**


1. Guarda una copia del repositorio y **respalda** `firestore.rules` y `firebase.json`.
2. Copia TODOS los archivos de este paquete en la raíz del repositorio (incluyendo `functions/`). **No reemplaces** `index.html`, `agora-app.js`, `agora-cloud.js` ni `agora-invites.js`.
3. Desde la raíz del repositorio, corre `node integrar-en-agora.mjs`. El script agrega las reglas al final del bloque Firestore existente, preservando las reglas de pedidos y `provider_invites`; agrega configuración de Storage y Functions y el acceso al centro de archivos en el menú lateral de Pedidos. Crea respaldos de los archivos editados.
4. Revisa el diff de `firestore.rules`, `firebase.json` y `storage.rules` antes de publicar. No modifiques la colección `agora_users` ni las contraseñas.
5. Asegúrate de que Firebase Auth tenga habilitado Google y de que el dominio público de la aplicación figure en **Authentication > Settings > Authorized domains**. Los roles permitidos para editar son `admin` y `coordinador`; `consulta` solo puede ver historial.
6. Implementa Firestore Rules y Storage Rules (requiere CLI Firebase y derechos del proyecto):
   ```bash
   firebase login
   firebase use agora-dejavu-38b8c
   firebase deploy --only firestore:rules,storage --project agora-dejavu-38b8c
   ```
7. Publica las páginas de la herramienta junto al mismo ÁGORA en Firebase Hosting o GitHub Pages. Para Firebase Hosting:
   ```bash
   firebase deploy --only hosting --project agora-dejavu-38b8c
   ```
8. Abre `.../archivos.html`, entra como usuario autorizado, crea un envío de prueba, comprueba en otro navegador el enlace público y responde una vez. Recarga la consola interna y verifica la respuesta y su fecha.

**Importante:** Subir imágenes a Firebase Storage requiere que ese producto esté habilitado en el proyecto (puede requerir el plan Blaze). Si no está habilitado, utiliza URLs HTTPS de imágenes o solo Drive; la creación de envíos y las respuestas de Firestore siguen siendo viables.

## 2 · Correos automáticos (requiere configuración adicional)

La consola siempre tiene **Preparar correo** para abrir el cliente de correo con el enlace. Eso **no envía automáticamente**. Para enviar notificaciones reales del servidor:

1. Verifica un dominio remitente en [Resend](https://resend.com/) y obtén una API key. **No la pongas en GitHub ni en los archivos de la web.**
2. En la raíz del proyecto ejecuta `firebase functions:secrets:set RESEND_API_KEY --project agora-dejavu-38b8c`.
3. En el primer despliegue de Functions configura `AGORA_MAIL_FROM` (por ejemplo `ÁGORA <notificaciones@tudominio.com>`) y `AGORA_PUBLIC_BASE_URL` (la URL raíz con barra final, por ejemplo `https://tu-dominio.com/` o `https://dejavump.github.io/agora-compras-dejavu/`). Son parámetros de configuración requeridos por Functions.
4. Ejecuta `cd functions && npm install && cd ..` y después `firebase deploy --only functions --project agora-dejavu-38b8c`.
5. Verifica envíos reales, límites de correo y logs. Functions/Storage posiblemente requieren facturación Blaze.

Con Functions configurado, el destinatario recibirá un correo con el enlace. Al responder, el destinatario original recibe una copia y el remitente interno una notificación. **El correo declarado por quien responde no está verificado**: nunca se usa como destino del correo automático.

## 3 · Flujo

**ÁGORA → Nuevo envío → Adjuntar muestras/Drive → Publicar → Compartir enlace → Destinatario revisa → Confirma / No recibió / Cambios / Aprueba → Se guarda respuesta → Nueva versión → Mismo enlace.**

La app no descarga contenidos de Drive ni cambia sus permisos. Comparte en Drive los archivos con los permisos correctos para el destinatario. Una captura guardada en Storage puede quedar accesible para quien conserve el enlace de descarga aunque se revoque el enlace de ÁGORA. No adjuntes información sensible a las previsualizaciones si no quieres que pueda conservarse o compartirse. Para acceso fuerte por identidad verificable se necesitaría autenticación o una función de invitaciones con validación de email.

## 4 · Diseño de datos

- `agora_file_deliveries/{token}`: registro y versiones, enlace, datos públicos para el destinatario, vencimiento.
- `agora_file_responses/{token}/agora_file_reply_versions/{n}`: respuesta única inmutable por versión, fecha generada en servidor.
- Storage: `agora-file-previews/{token}/v{n}/{archivo}.jpg`.

No se usan `agora_records`, `provider_invites` ni las colecciones existentes: **Pedidos no se modifica**.

## 5 · Estado del entregable

**Código preparado y validado sintácticamente; NO desplegado ni probado con cuentas reales de Firebase en este entorno.** Para quedar realmente en línea es indispensable publicar reglas, configurar alojamiento y probar permisos de Drive/Storage; no debe asumirse que la sola presencia en un ZIP o GitHub habilita el servicio.

# ÁGORA Pedidos · puesta en marcha (03/11/2026)

**Firebase:** `agora-dejavu-38b8c` · **GitHub:** `DejavuMp/agora-compras-dejavu`.

## Estado real
- El código está actualizado en GitHub; eso **NO** significa que Firebase Hosting esté desplegado.
- `firebase-init.js` inicializa Firebase. `agora-cloud.js` agrega acceso con Google, roles, respaldo local y guardado optativo por expediente con comprobación de revisiones.
- Mientras no se active la nube desde el panel, la aplicación usa su IndexedDB local como antes.
- Los enlaces externos de proveedores **aún usan archivos JSON**. Falta implementar invitación, verificación y acuse automático por backend.
- No se ejecutó un deploy ni una prueba de extremo a extremo con un usuario real. No borrar respaldos hasta validar.

## A. Publicación temporal desde GitHub Pages (sin CLI)
1. En `https://github.com/DejavuMp/agora-compras-dejavu/settings/pages`, configurar **Deploy from a branch**, `main`, `/(root)`; guardar.
2. GitHub Pages normalmente asigna `https://dejavump.github.io/agora-compras-dejavu/`. Verifica que esa URL efectivamente cargue; **no damos por publicada la página sin comprobarla**.
3. En Firebase Console > Authentication > Settings > Authorized domains, añade solo `dejavump.github.io` (el nombre de dominio, sin http ni ruta). No hace falta autorizar `github.com`.
4. Abrir la web y probar “Iniciar con Google” desde el panel ÁGORA · Nube.

## B. Primera cuenta administradora
1. Abre la aplicación web y entra con el nuevo correo de Ágora mediante Google.
2. Si el panel indica *Cuenta sin permiso*, presiona **Copiar UID**.
3. Firebase Console > Firestore Database > Datos > Iniciar colección: `agora_users`.
4. ID del primer documento: pega **exactamente el UID** de la sesión Google (NO el email). Campos:
   - `role`: `admin` (string/texto)
   - `active`: `true` (booleano)
   - `email`: correo institucional (string/texto, informativo)
5. Abre Firebase Console > Firestore Database > **Reglas**. Copia el contenido íntegro del archivo `firestore.rules` del repositorio y **Publicar**. Las reglas restringen datos por UID/rol; no cambies a `allow read,write: if true`.
6. Recarga la web, cierra sesión y entra de nuevo. Debe aparecer `admin`. Para dar acceso a personal que ya inició sesión con Google, usa “Autorizar usuario” e ingresa su UID y rol.

## C. Sincronización de pedidos
1. En la web, pulsa **Descargar respaldo**. Conserva el archivo JSON en un lugar seguro fuera de GitHub.
2. Pulsa **Activar / cargar nube**. Si Firestore está vacío, autoriza subir tus registros locales. Si la nube tiene datos, pide confirmación para cargarlos y sustituir los datos locales visibles tras el respaldo.
3. Revisa Firestore > Datos > colección `agora_records` y comprueba los documentos de `settings`, `orders`, `suppliers`, `rfqs`, `samples`.
4. Crea un pedido de prueba y verifica su guardado en la nube. Comprueba también que no puedas usar Firestore con una cuenta no autorizada.
5. La sincronización de cambios se realiza mientras la sesión web esté abierta y la nube esté activada. Al volver a abrir la app, usa otra vez **Descargar respaldo** y **Activar / cargar nube** para recuperar la versión actual: no se activa silenciosamente con datos locales sin revisar.

### Limitaciones importantes
- Firestore limita el tamaño por documento. La aplicación detecta expedientes de más de 850 KB, típicamente con imágenes embebidas, y detiene la sincronización sin borrar el original. Para fotografías grandes se requiere integración posterior con Cloud Storage.
- Si hay ediciones incompatibles desde dos equipos, el programa pausa la sincronización; no sobrescribe automáticamente el registro remoto.
- Todavía no existe una función pública segura para que los proveedores respondan directamente desde correos sin cuenta.
- Los roles de Firestore autorizan acceso a la nube. La aplicación local antigua no es un sistema de control de acceso completo; no compartas el equipo/sesión con personas no autorizadas.

## D. Firebase Hosting definitivo (alternativa a Pages)
Cuando dispongas de Node.js y Firebase CLI, dentro de una copia local del repositorio:
```bash
npm install -g firebase-tools
firebase login
git clone https://github.com/DejavuMp/agora-compras-dejavu.git
cd agora-compras-dejavu
firebase deploy --only hosting,firestore:rules --project agora-dejavu-38b8c
```
Los archivos `firebase.json`, `.firebaserc` y `firestore.rules` ya están preparados. El despliegue requiere autorización desde la cuenta que administra Firebase.

Para automatizar deploys futuros desde GitHub, después de un primer despliegue manual se puede usar `firebase init hosting:github` para instalar la acción oficial, otorgando permisos a Firebase y guardando su secreto cifrado en GitHub. **No pegar claves privadas ni JSON de cuentas de servicio en chats o archivos públicos.**

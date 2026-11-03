# ÁGORA · Activación de Firebase con cuenta institucional

## Estado actual (03/11/2026)
Código de Ágora Compras en GitHub. Proyecto registrado como **agora-dejavu-38b8c**. El archivo `firebase-init.js` contiene la configuración pública del SDK para preparar Authentication y Firestore, y `.firebaserc` fija el proyecto de Hosting. El SDK inicializado **no guarda pedidos en la nube** por sí mismo. El frontend actual es v9 (local-first), guarda expedientes en IndexedDB; **aún no guarda en Firebase ni registra automáticamente respuestas de proveedores**. El formulario de proveedor usa archivos ACUSE_/RESPUESTA_ JSON. Los archivos firebase.json y firestore.rules únicamente preparan despliegue seguro. Las reglas están cerradas expresamente mientras se implementa autenticación, invitaciones y permisos.

## 1. Dar acceso al nuevo Gmail de Ágora
1. En https://console.firebase.google.com/ inicia sesión con el propietario del proyecto Firebase existente, si lo hay.
2. Configuración del proyecto (engrane) > Usuarios y permisos > Agregar miembro.
3. Escribe la cuenta nueva de Ágora y dale el rol apropiado (Owner solo a la cuenta institucional administradora; evitar roles amplios a proveedores).
4. Acepta la invitación desde el nuevo Gmail. **No elimina ni traspasa por sí mismo la propiedad anterior.**
5. Si no existe proyecto previo, con el nuevo Gmail crea un proyecto Firebase nuevo, nombre sugerido 'agora-dejavu'. Apunta el project ID exacto (puede ser distinto).

## 2. Crear los servicios
En el proyecto Firebase: agregar aplicación Web (</>), copiar las opciones públicas de configuración al frontend solo durante la integración (apiKey, authDomain, projectId, appId; la API key web no es una contraseña, pero debe restringirse según convenga). Configurar Authentication (método de acceso del equipo; ejemplo Google) y Firestore. Configurar dominios autorizados (incluido el dominio publicado). Mantener reglas de Firestore cerradas hasta que estén implementadas y probadas las reglas por rol. No activar acceso público de lectura/escritura.

## 3. Publicación (requiere cuenta autorizada con Firebase CLI)
El repositorio ya tiene firebase.json. Al instalar Node.js y Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
git clone https://github.com/DejavuMp/agora-compras-dejavu.git
cd agora-compras-dejavu
firebase use --add
firebase deploy --only hosting
```
Selecciona el project ID correcto al ejecutar 'firebase use --add'. El host publicará los archivos de la raíz; no significa que los datos ya estén sincronizados.

## 4. Trabajo pendiente antes de operar proveedores
- Implementar módulo Firebase Auth para personal Dejavú; asignación de roles con reglas servidor/claims.
- Migrar pedidos/expedientes desde IndexedDB a Firestore preservando IDs y versiones, con exportación de respaldo previa y sin perder datos.
- Implementar invitaciones por pedido con token aleatorio, caducidad, un solo proveedor y validación servidor (Cloud Functions o backend), sin exigir cuenta Google a proveedores.
- Persistir el acuse de recibido y cotizaciones de manera transaccional; mostrar estado automático de pedido y registro de eventos/auditoría.
- Enviar correos a proveedores desde backend autorizado (no exponer credenciales SMTP ni de servicio al cliente).
- Publicar y probar desde móvil y escritorio: abrir correo, confirmar recepción, completar cotización, regreso a Ágora y permisos.

## Seguridad
El repositorio actualmente es público; nunca subir contraseñas, claves privadas, tokens, archivos de proveedores, datos personales, respaldos ni expedientes. Las reglas actuales de Firestore niegan todo por defecto. **No desplegar dichas reglas como definitivas** después de implementar los flujos, hasta crear políticas específicas y probarlas en emulador.

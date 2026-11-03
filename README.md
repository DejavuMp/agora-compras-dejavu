# ÁGORA · Compras y Producción — Sitio web

Proyecto Firebase Web: **agora-dejavu-38b8c**.

- Este repositorio contiene el frontend estático existente de ÁGORA, además de la configuración pública para inicializar el SDK Firebase Web (`firebase-init.js`).
- El SDK se inicializa con Firebase Auth y Cloud Firestore, **pero esto no habilita sincronización**: por ahora los expedientes, fotografías y presupuestos **siguen guardándose en IndexedDB del navegador**, no en Firebase ni GitHub.
- Conserva respaldos locales en JSON hasta concluir migración verificada.
- El formulario de proveedor todavía descarga acuses y respuestas JSON; falta el backend de invitaciones, acuses y cotizaciones en línea.
- `firestore.rules` niega toda lectura/escritura hasta desarrollar permisos por usuario y proveedor. No abrir permisos generales.
- El código fuente es público. No subir claves privadas, tokens, expedientes, respaldos ni archivos sensibles.

## Próximos pasos

1. En Firebase Console > Build > Firestore Database, crear base en modo producción.
2. En Authentication > Sign-in method, habilitar proveedor Google para el personal interno y revisar dominios autorizados.
3. Diseñar permisos y roles en Firestore + flujo de invitación segura a proveedor con backend.
4. Integrar la persistencia con pruebas y un respaldo completo, **antes** de migrar cualquier pedido real.
5. Publicar en Firebase Hosting tras iniciar sesión con el nuevo Gmail en Firebase CLI (proyecto preconfigurado en `.firebaserc`).

Ver [FIREBASE_ACTIVACION.md](./FIREBASE_ACTIVACION.md) para instrucciones detalladas.

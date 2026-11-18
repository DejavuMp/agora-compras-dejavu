# ÁGORA — Identidad Única y RH Digital

Implementación aislada del portal de identidad sobre el proyecto Firebase existente
`agora-dejavu-38b8c`. No crea servicios de pago ni almacena documentos en un hosting público.

## Rutas

- `identidad/`: alta, expediente privado, credencial, RH y asignaciones del día.
- `identidad/verificar.html?id=<token>`: verificación pública limitada de la credencial (estado genérico, sin motivo interno del bloqueo).

## Colecciones

- `agora_identity_registrations`: solicitudes de alta.
- `agora_identity_counters`: secuencia anual transaccional.
- `agora_identity_links`: vínculo inmutable UID → ID ÁGORA.
- `agora_identity_registry`: identidad y estado operativo.
- `agora_identity_profiles`: contacto, uniforme, emergencia y datos médicos limitados.
- `agora_identity_financial`: datos fiscales y bancarios privados.
- `agora_identity_credentials`: proyección pública mínima por token opaco.
- `agora_identity_audit`: auditoría append-only.

Los permisos técnicos siguen en `agora_users`; el cargo operativo no concede privilegios.
RH puede asignar un coordinador activo al emitir un ID o desde el directorio. El personal
administrativo también puede solicitar su propio ID sin perder acceso a la administración.
Las actividades del día se proyectan exclusivamente desde `agora_ops_staff/{uid}`, usando
la vista segura de Operaciones (sede, cargo y horario), sin salarios ni información de terceros.

## Pruebas locales sin dependencias

```powershell
node identidad/tests/domain.test.mjs
node identidad/tests/app-structure.test.mjs
node identidad/tests/rules-structure.test.mjs
node --check identidad/app.js
node --check identidad/firebase-identity.js
node --check identidad/verify.js
```

Antes de desplegar, las reglas deben superar el emulador de Firebase y el flujo completo debe
probarse con cuentas de admin, coordinador, colaborador y usuario no autorizado. La bóveda
documental permanece deshabilitada hasta contar con almacenamiento privado y reglas verificadas.

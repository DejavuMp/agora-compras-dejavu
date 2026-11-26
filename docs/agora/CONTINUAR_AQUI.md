# Continuar aquí

## Prioridad actual

Cerrar el circuito de asignación → jornada → asistencia → validación → recibo de horas → obligación económica. Coordinación valida horas. Finanzas autoriza importes y registra pagos.

## Estado al 26 de noviembre de 2026

- [Portal](https://dejavump.github.io/agora-compras-dejavu/portal-agora/) y [pase de lista](https://dejavump.github.io/agora-compras-dejavu/portal-agora/escanear/) accesibles. El ingreso general por ID aparece deshabilitado. Las cuentas QA conservan una opción de acceso separada.
- Los [PR 77](https://github.com/DejavuMp/agora-compras-dejavu/pull/77) y [78](https://github.com/DejavuMp/agora-compras-dejavu/pull/78) conectan el pase remoto con GPS de un solo uso y la revisión del responsable. La [ejecución 184](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45773355967) aprobó el emulador, comparó y respaldó las reglas anteriores, desplegó Firestore y comprobó la versión activa. El respaldo quedó como artefacto de la ejecución.
- El [PR 79](https://github.com/DejavuMp/agora-compras-dejavu/pull/79) añade el recibo individual imprimible a las horas validadas en el pase de lista. Pasaron las seis pruebas locales de asistencia, la suite del portal y [GitHub Pages](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45773607104). La pantalla pública carga la versión nueva. Generar un recibo con datos QA en una sesión de Coordinación sigue pendiente.
- Cambios principales en `portal-agora/index.html`, `portal-agora/app.js`, `portal-agora/escanear/index.html`, `portal-agora/scan-jornada.js`, `portal-agora/asistencia-policy.mjs` y el preflight de Firestore en `.github/firebase-staff/`.
- Operaciones tiene cronograma, reportes de horas y previsión de nómina. Recursos y Finanzas ya tiene solicitudes, autorización administrativa, registro de pagos parciales y saldo. Los reportes legados de Operaciones todavía usan estados de pago propios y requieren reconciliación con el circuito autorizado.
- El repositorio complementario de Operaciones sigue compartiendo Firebase y mantiene sus rutas. La centralización de nuevas funciones continúa en este repositorio.

## Continuación

1. Reutilizar Staff QA y Supervisor QA en la jornada ficticia existente. Verificar acceso, GPS, revisión delegada, asistencia guardada y restricciones con sesiones autenticadas. Usar una sesión de Coordinación autorizada para validar horas y generar el recibo individual.
2. Vincular cada validación de horas a una obligación única en Finanzas. Reutilizar el catálogo de proyectos y el tabulador autorizado. Verificar permisos, bloqueo de duplicados, pagos parciales con datos ficticios y conservación del historial.
3. Seguir con los circuitos de proveedores y recursos. Mantener ÁGORA Campo en el mismo proyecto e infraestructura, después de los flujos prioritarios.

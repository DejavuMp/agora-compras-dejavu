# Continuar aquí

## Prioridad actual

Cerrar el circuito de asignación → jornada → asistencia → validación → recibo de horas → obligación económica. Coordinación valida horas. Finanzas autoriza importes y registra pagos.

## Estado al 26 de noviembre de 2026

- [Portal](https://dejavump.github.io/agora-compras-dejavu/portal-agora/) y [pase de lista](https://dejavump.github.io/agora-compras-dejavu/portal-agora/escanear/) accesibles. El ingreso general por ID aparece deshabilitado. Las cuentas QA conservan una opción de acceso separada.
- Los [PR 77](https://github.com/DejavuMp/agora-compras-dejavu/pull/77) y [78](https://github.com/DejavuMp/agora-compras-dejavu/pull/78) conectan el pase remoto con GPS de un solo uso y la revisión del responsable. La [ejecución 184](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45773355967) aprobó el emulador, comparó y respaldó las reglas anteriores, desplegó Firestore y comprobó la versión activa. El respaldo quedó como artefacto de la ejecución.
- El [PR 79](https://github.com/DejavuMp/agora-compras-dejavu/pull/79) añade el recibo individual imprimible a las horas validadas en el pase de lista. Pasaron las seis pruebas locales de asistencia, la suite del portal y [GitHub Pages](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45773607104). La pantalla pública carga la versión nueva. Generar un recibo con datos QA en una sesión de Coordinación sigue pendiente.
- El [PR 80](https://github.com/DejavuMp/agora-compras-dejavu/pull/80) añade **Abrir en Finanzas** junto al recibo de horas. Administración recupera los minutos validados y puede revisar el importe sugerido por el tabulador de Operaciones. Sin tarifa registrada, debe indicar el importe autorizado. Cada jornada y asignación admite una obligación, creada como pendiente. Los pagos parciales requieren una referencia única y conservan el historial.
- La [ejecución 188](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45776078979) aprobó el emulador, respaldó las reglas anteriores y verificó las activas tras el despliegue. Pasaron 33 controles de Finanzas con datos ficticios. La interfaz se publicó en [GitHub Pages](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45776038498).
- Prueba en producción con Staff QA (`DJV-2026-005`): acceso, jornada ficticia visible y generación del QR confirmados. El pase de lista mostró que no hay jornadas de supervisión delegadas y Finanzas quedó en modo local con esa cuenta. La jornada visible era del 25 de noviembre y su ventana remota había vencido.
- El historial remoto daba un error de precondición. Se habilitó en Firestore el índice ascendente de grupo de colecciones en `remote_requests.ownerUid`. Tras quedar listo, el historial consultó correctamente en la sesión de Staff QA.
- El [PR 81](https://github.com/DejavuMp/agora-compras-dejavu/pull/81) corrige el envío de solicitudes remotas desde Staff. Se comprobó en el navegador que carga la [versión publicada](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45778003611). El envío durante una ventana activa y la revisión de Supervisor QA siguen pendientes.
- Cambios principales en `portal-agora/index.html`, `portal-agora/app.js`, `portal-agora/escanear/index.html`, `portal-agora/scan-jornada.js`, `portal-agora/asistencia-policy.mjs` y el preflight de Firestore en `.github/firebase-staff/`.
- Operaciones tiene cronograma, reportes de horas y previsión de nómina. Recursos y Finanzas ya tiene solicitudes, autorización administrativa, registro de pagos parciales y saldo. Los reportes legados de Operaciones todavía usan estados de pago propios y requieren reconciliación con el circuito autorizado.
- El repositorio complementario de Operaciones sigue compartiendo Firebase y mantiene sus rutas. La centralización de nuevas funciones continúa en este repositorio.

## Continuación

1. Verificar la delegación con Supervisor QA. Preparar una ventana activa de prueba con Coordinación y comprobar envío GPS, revisión delegada y asistencia guardada. Con Coordinación, validar horas y generar el recibo individual. La verificación de acceso de Staff, jornada, QR e historial ya pasó.
2. Confirmar desde una sesión autorizada que la validación QA abre el expediente de Finanzas correspondiente. Mantener las escrituras de obligaciones y pagos ficticios en el emulador. Revisar la reconciliación de los estados de pago legados de Operaciones.
3. Seguir con los circuitos de proveedores y recursos. Mantener ÁGORA Campo en el mismo proyecto e infraestructura, después de los flujos prioritarios.

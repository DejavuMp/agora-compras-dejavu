# Continuar aquí

## Prioridad actual

Cerrar el circuito de asignación → jornada → asistencia → validación → recibo de horas → obligación económica. La revisión laboral corresponde a coordinación autorizada. Finanzas autoriza importes y registra pagos por separado.

## Base verificada

- [Portal público](https://dejavump.github.io/agora-compras-dejavu/portal-agora/) accesible. El ingreso general por ID está deshabilitado y tiene un flujo QA separado.
- [PR 77](https://github.com/DejavuMp/agora-compras-dejavu/pull/77) integra solicitud remota con GPS de un solo uso y revisión por el responsable autorizado. [GitHub Pages](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45721154965) publicó la interfaz. [El emulador aprobó la suite](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45721155664), con la publicación de reglas omitida en ese evento de push.
- [Activación anterior](https://github.com/DejavuMp/agora-compras-dejavu/actions/runs/45709572614) publicó el pase de lista supervisado. Esa versión exacta se incorpora a la comparación previa; cualquier diferencia ajena detiene el despliegue tras guardar un respaldo.
- Operaciones ya tiene cronograma, registros de horas y previsión de nómina. El portal ya cuenta con solicitudes de jornada y revisión de trabajos declarados. La validación del trabajo declarado conserva estados separados del pago.

## Próxima acción

Ejecutar el workflow manual de reglas en main y verificar su lectura posterior. Probar el pase presencial y remoto con las identidades QA existentes en la jornada de prueba. Después vincular la validación operativa a un recibo de horas y a una obligación con origen único, usando el área financiera existente. Verificar pagos parciales, duplicados y restricciones con datos ficticios. Mantener la ruta de Campo pendiente hasta cerrar ese circuito.

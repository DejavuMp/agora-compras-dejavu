# ÁGORA · Centro de Operaciones V3 — DEMOSTRACIÓN

**Vista pública:** https://dejavump.github.io/agora-compras-dejavu/operaciones/

## Estado de la herramienta

Prototipo funcional de interfaz para pruebas, alojado en el repositorio existente de ÁGORA sin modificar la aplicación principal (`index.html`) ni otros módulos.

**No es una plataforma multiusuario todavía.** Los datos se guardan exclusivamente en el almacenamiento local de cada navegador; el cambio de rol a coordinador o personal es una simulación, no un inicio de sesión con autenticación. GitHub Pages sirve archivos estáticos y no comparte cambios entre dispositivos.

**No ingresar datos personales reales, tarifas, información de nómina o pagos** en esta demostración pública.

## Funciones incluidas en la versión de pruebas

- Dashboard con eventos, campañas y sedes.
- Cronograma día/semana/mes con fichas y cambios de horario.
- Catálogos de personas, vehículos, sucursales y campañas.
- Detección de empalmes por persona y vehículo.
- Registro de horas, asistencia, retardos y justificaciones.
- Solicitudes y validación simulada de pagos.
- Planeación orientativa de rutas y apertura en Google Maps.
- Exportaciones de respaldo JSON, reportes CSV y calendario .ics.
- Avisos del navegador mientras la página permanece abierta.

## Para probar

1. Abrir la URL pública.
2. Usar la opción **Cargar datos de demostración** o capturar únicamente datos ficticios.
3. Probar los conflictos de horarios y la revisión de solicitudes de pago.
4. Exportar el JSON de prueba si se requiere conservar una copia.

Los cambios de cada persona **no** aparecerán automáticamente en los otros navegadores.

## Para uso operativo real

Se necesita conexión a un backend con autenticación y control de permisos (por ejemplo Firebase, reutilizando infraestructura y catálogos de ÁGORA cuando se verifique la integración), sincronización de eventos y asignaciones, permisos de visibilidad de sueldos, auditoría de aprobaciones y notificaciones push mediante servicio worker y mensajería.

No publicar información financiera o datos personales hasta implementar permisos y validaciones del lado del servidor.

Repositorio: `DejavuMp/agora-compras-dejavu`, ruta `operaciones/`.

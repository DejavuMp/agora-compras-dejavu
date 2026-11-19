# ÁGORA | Recursos y Finanzas

Módulo independiente del mismo repositorio de ÁGORA Compras, Archivos y Fichas.

## Objetivo

Solicitudes de recursos para materiales, insumos, productos para clientes/reventa, pagos a proveedores, nómina/staff y pagos operativos. Varios conceptos, totales, beneficiario, fechas, datos de transferencia, motivo, soporte por URLs HTTPS, folio y estados.

**No sustituye Comprobación de Gastos:** incluye acceso a https://gastosdvm.netlify.app/, pero no importa ni modifica registros de esa aplicación.

## Ya implementado

- Formulario responsive con varios conceptos, subtotales y total automático.
- Folio, prioridades, modalidades de pago, datos bancarios opcionales, documentos de soporte por URL.
- Historial con búsqueda, filtros, totales y detalle.
- Registro manual local de decisiones (aprobar total/parcial, rechazar, cambios) y pagos parciales con historial.
- Inicio de sesión Google Firebase y roles existentes (admin, coordinador, consulta).
- En Firebase, solo admin registra decisiones y pagos. Coordinador crea y lee sus propias solicitudes. Consulta únicamente sus solicitudes si existieran. No existe aprobación pública.
- PDF, PNG, impresión y referencia para enviar manualmente por WhatsApp o correo.
- En Firebase, QR y enlace privado a solicitud (requiere login y permiso). En modo local no muestra enlaces falsamente funcionales.
- Respaldo JSON local e importación sin sobrescribir registros existentes.

## Integración con ID Dejavú (rama en revisión)

- El ID permanente se obtiene de la colección real agora_identity_links/{uid}, no se inventa ni se captura manualmente.
- Cada solicitud conserva un folio RF independiente y una referencia opcional al ID de proyecto.
- Los usuarios con ID vinculado pueden solicitar y leer sus expedientes; administración es quien autoriza y registra pagos. Los usuarios del rol consulta no pueden crear.
- El PDF y el PNG incluyen folio, ID, proyecto, beneficiario y datos bancarios. Solo el enlace/QR del modo nube abre el expediente privado previa autenticación.
- Botones: PDF, PNG, imprimir, copiar mensaje, WhatsApp y correo. WhatsApp/correo no incluyen cuentas ni adjuntan automáticamente archivos.
- Sin ID, se permite trabajar localmente sin afirmar que la solicitud está sincronizada.
- PENDIENTE: pasar las pruebas de reglas en emulador, revisar diferencias contra reglas activas, respaldar reglas y desplegarlas de forma controlada antes de activar la nueva versión.

## URL cuando se integre a main

https://dejavump.github.io/agora-compras-dejavu/recursos/

## Almacenamiento

- **Sin sesión:** IndexedDB local en el navegador (base AGORA_RECURSOS_LOCAL_V1). Respaldar con frecuencia; no borrar los datos del sitio. Los terceros no pueden autorizar remotamente; las decisiones locales son registros manuales.
- **Firebase:** documento activo de usuario en agora_users por UID; colección separada agora_finance_requests. No se migran automáticamente registros locales para evitar duplicaciones y pérdidas. Primero realizar respaldo.
- Google Drive y Sheets se evaluarán después, como ya se acordó. No se suben secretos ni datos reales al repositorio.

## Activar Firebase de forma segura

1. Comparar las reglas del repositorio con las actualmente desplegadas en la consola y respaldar estas últimas (pueden existir cambios más recientes).
2. Confirmar que la cuenta administradora en agora_users tenga active=true y role=admin.
3. Validar las reglas en el emulador/Rules Playground: coordinador solo sus registros, admin puede aprobar y pagar, anónimo sin lectura, bloqueo de modificación de montos no autorizada.
4. Una vez validadas, desplegar reglas al proyecto agora-dejavu-38b8c, por ejemplo: firebase deploy --only firestore:rules --project agora-dejavu-38b8c. **Este despliegue NO se ha realizado aquí.**
5. Verificar que la URL de GitHub Pages esté autorizada para autenticación en Firebase.
6. Probar con cuentas reales los estados, pago, PDF/PNG y QR.
7. Diseñar migración explícita de registros locales luego de aprobar respaldo.

## Seguridad y límites

- PDF/PNG pueden incluir datos bancarios: compartir solo con destinatarios autorizados.
- Los enlaces de finanzas requieren autenticación, no se usan tokens públicos anónimos por tratarse de cuentas y nóminas.
- Adjuntos son enlaces HTTPS. No se suben imágenes/archivos directamente a Firebase Storage ni Drive.
- PDF/PNG y QR dependen de las bibliotecas CDN jspdf, html2canvas y qrcodejs. Si fallan, usar Imprimir para guardar como PDF.
- La herramienta de Comprobación de Gastos existente permanece intacta, pendiente de una migración futura verificada.

## Siguientes pasos

- Validar los formatos existentes de catálogos privados de proyectos/staff.
- Conectar comprobaciones reales sin copiar documentos ni datos.
- Revisar la experiencia en móvil y navegador con datos de prueba.
- Elegir si conectar Google Drive/Sheets más adelante.

**Importante:** publicar el sitio en GitHub Pages NO despliega las reglas de Firestore. Hasta que sean desplegadas y probadas, se trabaja en modo local.
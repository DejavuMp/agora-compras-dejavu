# ÁGORA · Solicitud de muestras desde una cotización recibida

Actualización aplicada al repositorio: 4 de noviembre de 2026.

## Flujo operativo

1. Entra a ÁGORA desde https://dejavump.github.io/agora-compras-dejavu/ usando **el mismo navegador y cuenta** donde trabajaste la cotización. Si la app conserva una versión anterior, recarga con Ctrl + Shift + R.
2. Abre **Presupuestos** y el folio **PRE-...** al que el proveedor ya respondió. Comprueba que los costos de muestras estén capturados y el estado sea **Cotizada**. Si no ves los precios, abre **Envíos** y revisa la respuesta en Firebase; se incorpora al expediente con la sesión autorizada.
3. Pulsa **Solicitar muestras**. Se genera **MUE-...** vinculado a la cotización y se copian las fotografías, descripción y costo de muestra de cada artículo.
4. En **Muestras**, conserva solamente los productos que deseas solicitar; ajusta las cantidades, fecha y lugar de entrega.
5. Pulsa **Correo con fotos y botones**. En **Envíos**, selecciona **Generar enlace de la solicitud abierta** (o recupera el enlace existente para el mismo folio).
6. Pulsa **Crear borrador Gmail con fotos y botones**. Gmail guardará un borrador con la marca Dejavú, imágenes incrustadas, cantidades, costos cotizados y dos botones: **Firmar de recibido** y **Responder solicitud de muestras**.
7. En **Gmail → Borradores**, revisa que todas las fotos se vean y que ambos enlaces apunten a `proveedor-online.html`; **envía el correo manualmente**.
8. El proveedor confirma recepción, responde disponibilidad, cantidades a preparar, costo definitivo, días de producción, fecha y método de entrega, lugar, guía y observaciones. Firestore almacena el acuse y la respuesta.
9. En ÁGORA, la respuesta del proveedor aparece en **Envíos** y se incorpora al mismo folio de muestras al tener sesión y conexión. El acuse **no** cambia el estado de recepción física. Tras la entrega real, la agencia registra la recepción y aprueba o rechaza la muestra.

## Requisitos

- El navegador debe abrir la app bajo HTTPS, con el personal autorizado mediante Google/Firebase.
- Gmail necesita un ID OAuth de Google Cloud que permita el origen JavaScript `https://dejavump.github.io`; el permiso solicitado es `gmail.compose`.
- Los enlaces del proveedor tienen token aleatorio y caducan. Cualquier persona que tenga el enlace puede operar sobre **esa solicitud**, sin acceder a otros expedientes: trata el enlace como confidencial.
- Firestore necesita tener publicadas las reglas que permiten `provider_invites` del repositorio. El código actualizado no modifica automáticamente las reglas del proyecto Firebase.
- Si las fotos exceden el límite de tamaño de la invitación, la aplicación pedirá reducirlas **en lugar de enviar una solicitud sin imágenes**.
- Los presupuestos existentes no se migran ni se borran por esta actualización. Sigue respaldando los datos desde la app.

## Estado de entrega

- Cambios confirmados en la rama `main` del repositorio.
- Código JavaScript revisado en sintaxis y presencia de los elementos del flujo.
- No se ha comprobado un correo real enviado desde el Gmail del usuario ni el clic de un proveedor real en Firebase.
- La publicación final por GitHub Pages se realiza si el repositorio ya tiene Pages activo para esa rama; verificar en el enlace público.

## Material de referencia incorporado (04/11/2026)

Al final de **Muestras → Solicitud de muestras** encontrarás un único bloque de referencias:

- **Link de Drive:** pega la URL de la carpeta o archivo de referencia y ábrela desde la propia solicitud.
- **Indicaciones:** detalla materiales, medidas, colores, acabados o instrucciones para fabricar la muestra.
- **Imágenes de muestra:** hasta 6 fotos (JPG, PNG o WebP) desde computadora o celular, optimizadas para el expediente.
- **Imágenes de Drive:** hasta 12 enlaces individuales de fotos de Google Drive, con miniaturas cuando Drive autorice su visualización.

La información aparecerá al final del correo con fotos, en la vista PDF y en el formulario web del proveedor. Los enlaces externos de Drive **requieren permisos de visualización para el destinatario**. La aplicación no puede importar automáticamente el contenido completo de una carpeta de Drive.

**Antes de compartir:** completa las referencias y luego genera el enlace del proveedor. Si modificas las referencias de una invitación pendiente, ÁGORA pedirá confirmación para cancelar el enlace anterior y crear uno nuevo. Si el proveedor ya acusó o contestó, conserva ese expediente y genera otra solicitud de muestras.

### Herramienta independiente de envío de archivos

Se retiró de la navegación principal de ÁGORA. No se han borrado expedientes ni registros históricos de Firebase y los flujos de presupuestos, solicitudes de muestras y pedidos siguen activos.

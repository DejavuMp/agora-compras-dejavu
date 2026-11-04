# ÁGORA · Solicitud de muestras desde una cotización recibida

Actualización aplicada al repositorio: 4 de noviembre de 2026.

## Flujo operativo

1. Entra a ÁGORA desde https://dejavump.github.io/agora-compras-dejavu/ usando **el mismo navegador y cuenta** donde trabajaste la cotización. Si la app conserva una versión anterior, recarga con Ctrl + Shift + R.
2. Abre **Presupuestos** y el folio **PRE-...** al que el proveedor ya respondió. Comprueba que los costos de muestras estén capturados y el estado sea **Cotizada**. Si no ves los precios, abre **Respuestas** y revisa la respuesta en Firebase; se incorpora al expediente con la sesión autorizada.
3. Pulsa **Solicitar muestras**. Se genera **MUE-...** vinculado a la cotización y se copian las fotografías, descripción y costo de muestra de cada artículo.
4. En **Muestras**, conserva solamente los productos que deseas solicitar; ajusta las cantidades, fecha y lugar de entrega.
5. Pulsa **Correo con fotos y botones**. En **Respuestas**, selecciona **Generar enlace de la solicitud abierta** (o recupera el enlace existente para el mismo folio).
6. Pulsa **Crear borrador Gmail con fotos y botones**. Gmail guardará un borrador con la marca Dejavú, imágenes incrustadas, cantidades, costos cotizados y dos botones: **Firmar de recibido** y **Responder solicitud de muestras**.
7. En **Gmail → Borradores**, revisa que todas las fotos se vean y que ambos enlaces apunten a `proveedor-online.html`; **envía el correo manualmente**.
8. El proveedor confirma recepción, responde disponibilidad, cantidades a preparar, costo definitivo, días de producción, fecha y método de entrega, lugar, guía y observaciones. Firestore almacena el acuse y la respuesta.
9. En ÁGORA, la respuesta del proveedor aparece en **Respuestas** y se incorpora al mismo folio de muestras al tener sesión y conexión. El acuse **no** cambia el estado de recepción física. Tras la entrega real, la agencia registra la recepción y aprueba o rechaza la muestra.

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

## Separación de Archivos (04/11/2026)

Las fotografías de producto, cantidades, costos de muestra y respuestas siguen dentro de **Compras & Producción**.

Los artes finales, logotipos y archivos que se deben aplicar durante la fabricación se envían únicamente desde la aplicación independiente **[ÁGORA Archivos](https://dejavump.github.io/agora-compras-dejavu/archivos/)**. Allí se registra el Drive, las capturas de evidencia y el acuse electrónico del proveedor; no forman parte de la recepción física de muestras.

Los enlaces anteriores de Archivos se redirigen a la nueva aplicación sin cambiar su identificador. No se han migrado ni borrado datos de Firebase.

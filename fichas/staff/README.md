# Fichas de Staff · Dejavú Marketing

## Una sola herramienta

**Enlace para trabajar**: https://dejavump.github.io/agora-compras-dejavu/fichas/staff/

En esta dirección se puede crear una ficha, buscar fichas guardadas, editarlas, compartirlas y consultar el formulario mensual y los enlaces anteriores. El enlace anterior `/fichas/staff/herramienta/` ahora redirige a la dirección única, preservando enlaces compartidos con un fragmento `#f=`.

## Formulario de pago

El enlace permanente que recibe el personal es https://dejavump.github.io/agora-compras-dejavu/fichas/staff/formulario/

Cada mes el enlace real del formulario se actualiza en `fichas/staff/config.json`, que sigue siendo gestionado por Dejavú. **El usuario final no necesita abrir GitHub**: puede mandar la nueva URL a quien administre el repositorio para efectuar la actualización. La interfaz muestra el formulario vigente y el historial pero **no publica cambios de configuración desde el navegador**.

## Archivo de fichas y respaldos

Las fichas se guardan **automáticamente en el mismo navegador** (metadatos en localStorage y fotos en IndexedDB), sin subirlas a GitHub. El archivo incluye búsqueda y filtro por mes. Para cambiar de computadora o recuperar registros guardados en una versión de archivo local, usar **Archivo de fichas → Respaldar mis fichas**, seguido de **Recuperar respaldo** en el nuevo sitio. Este respaldo JSON contiene datos personales y debe guardarse de forma privada.

La herramienta **no proporciona todavía archivo compartido en la nube**, sincronización entre dispositivos, ni permisos de acceso para expedientes personales. Para esos fines hará falta integrar almacenamiento privado con autenticación y políticas adecuadas. Los archivos en `fichas/staff/archivo/` sólo son aptos para documentos depurados y públicos; no deben usarse con fichas reales de personal.

## Compatibilidad

Las fichas compartidas en enlaces de la versión anterior siguen abriendo gracias a la redirección, y apuntan al mismo enlace permanente del formulario de pago. Las seis fichas de una instalación local no se copian a la página web hasta que se importe el respaldo.

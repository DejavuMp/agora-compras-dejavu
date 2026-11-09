# Fichas Dejavú Marketing · Operación y Staff

## Dos vistas, un solo archivo compartido

**Generador para el equipo Dejavú:** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/

**Página para el personal:** https://dejavump.github.io/agora-compras-dejavu/fichas/staff/formulario/

La página del personal se titula **Información para formulario de pagos** y tiene **Fichas e historial** y **Formulario de pagos**. No pide iniciar sesión al personal. Todos pueden consultar **todas las fichas expresamente publicadas por Dejavú**, buscar campaña, fecha o ubicación, abrirlas y descargarlas como imagen o imprimirlas/guardarlas como PDF. El formulario de pago conserva un enlace permanente aunque cambie de mes.

## Trabajo del coordinador

1. Abrir el generador desde el mismo navegador donde están las fichas guardadas. Crear/editar fichas como siempre; guardado original local en localStorage y evidencia en IndexedDB.
2. Abrir **Fichas anteriores → Publicar fichas para todo el staff**. Conectar con Google utilizando una cuenta activa **admin** o **coordinador** del proyecto Firebase de Ágora (tabla `agora_users`).
3. Pulsar **Publicar mis fichas** y confirmar que los detalles de actividad quedarán visibles para cualquier persona con el enlace del Staff. Una vez autorizado, los cambios y nuevas fichas se publican automáticamente al guardar mientras la sesión y Firebase estén disponibles.
4. Usar **Ver página del staff** para consultar el mismo archivo compartido. La edición permanece en el generador Dejavú.
5. Conservar siempre el respaldo JSON. Los registros antiguos guardados en otro navegador o archivo HTML deben recuperarse una sola vez con **Importar fichas anteriores**. La importación añade el contenido local y luego intenta publicarlo cuando se ha autorizado la publicación.

La colección `dejavu_staff_publicadas` de Firestore solo contiene: `id`, `campaign`, `responsible`, `activityDate`, `location`, `publishedBy`, `publishedAt`, `updatedAt`.

**Nunca se publican correos de los trabajadores, datos bancarios ni evidencias fotográficas.** No se suben fichas privadas ni respaldos JSON al repositorio público GitHub. La colección es un catálogo de datos de actividad público: cualquiera con acceso a la aplicación puede leerlo; no es un sistema de acceso individual.

## Despliegue pendiente de Firebase

GitHub Pages solo publica HTML, CSS y JS. Las reglas de Firestore en `firestore.rules` se editaron y están versionadas en GitHub, pero **no se activan automáticamente al publicar el repositorio**.

Para activar de forma segura el catálogo es necesario que una cuenta autorizada despliegue las reglas actualizadas en el proyecto `agora-dejavu-38b8c`, preservando las reglas ya operativas de Compras y Archivos. Verificar además el dominio autorizado de Firebase Authentication para `dejavump.github.io`, permisos de `agora_users` y acceso de los roles. El usuario no debe subir contraseñas ni secretos a GitHub.

Pruebas antes de declarar la nube activa:
- Un coordinador inicia sesión y publica una ficha de prueba con datos ficticios; confirma estado publicado y edición posterior.
- El personal abre la misma página **sin iniciar sesión**, ve esa ficha y descarga PNG/PDF.
- Un usuario no autenticado no puede crear, modificar ni borrar documentos en Firestore.
- La búsqueda funciona por campaña, mes y ubicación. El botón del formulario abre la versión vigente.
- La importación JSON conserva fichas previas y fotos locales, y el respaldo original no se elimina.
- Sin internet o sin permiso, el generador sigue guardando localmente y muestra que publicar está pendiente.

## Compatibilidad

Los enlaces anteriores con `#f=` continúan mostrando su contenido estático, sin depender de Firebase; los nuevos enlaces con `#ficha=DJV-...` abren la versión actualizada de una ficha publicada. Enlaces de versiones antiguas del generador redirigen a la página del personal. Los enlaces estáticos `#f=` contienen datos codificados, no cifrados, y deben compartirse solo si se desea dar acceso a esa información.

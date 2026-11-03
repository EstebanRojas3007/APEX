# Integraciones vigentes — Supabase

**11/10/2026:** [worker, contrato JSON y adaptador autenticado n8n/Gemini](APRENDIZAJE_MVP.md) preparados localmente con cola, leases, validación e idempotencia. Faltan URL/credenciales reales, modelo, servidor consumidor y fragmentos educativos revisados. La IA no se declara conectada. Los párrafos siguientes conservan el estado de la entrega anterior.

El 06/10/2026 se preparó el [contrato de rutas individuales](RUTAS_IA.md): contexto académico sin claves/PII, catálogo aprobado, validación y versiones conservadas. Solo el backend futuro puede emitir contexto y guardar propuestas mediante `service_role`; Expo consulta únicamente el estado pendiente. No hay conexión n8n/Gemini, reglas de avance ni lecciones predeterminadas. El [banco APEX](APEX_BANCO_105.md) se importa por separado y su PDF con soluciones nunca entra al tutor.

La arquitectura actual y los pasos de conexión se documentan en [SUPABASE.md](SUPABASE.md). El cliente utiliza `@supabase/supabase-js`; ninguna ruta normal llama al servidor SQLite anterior. Firebase queda fuera.

Auth gestiona las credenciales. Las RPC PostgreSQL implementan identidad/permisos, perfil, intentos y corrección. Storage gestiona PDF privados con políticas por rol y programa. No hay credenciales reales configuradas ni cambios remotos.

Los detalles de bloqueo por hook, límites de complejidad de contraseña, correo/redirects, bootstrap de administrador y permisos están en la guía; no se consideran verificados contra un proyecto real.

Gemini/n8n siguen pendientes. [CONTENIDO_DOCUMENTAL.md](CONTENIDO_DOCUMENTAL.md) define extracción, revisión, procedencia y contrato de contexto con PDF/página. El tutor muestra su estado pendiente sin generar respuestas ficticias. Una función en la nube no puede conectar automáticamente con n8n en localhost; habrá que acordar una URL autenticada. Secretos solo en servidor.

La entrega SQLite anterior permanece en `server/` para consulta y pruebas históricas. No constituye una alternativa de producción ni migra automáticamente usuarios o contraseñas.

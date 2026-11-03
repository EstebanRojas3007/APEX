# Acciones docentes y actualización sin saltos

Ajuste de frontend del 25/10/2026. Conserva el alcance y los avances del panel administrador. No añade dependencias ni modifica servidor, contratos, RPC, SQL, migraciones, permisos o reglas académicas. No requiere cambios adicionales en Supabase para este ajuste; siguen vigentes las dependencias de las funcionalidades anteriores.

## Pantalla y datos disponibles

El seguimiento individual muestra **Acciones del profesor** debajo del diagnóstico. Abre `#profesor/grupos/:grupo/estudiantes/:estudiante/acciones`, con el nombre autorizado y retorno al mismo seguimiento. Reutiliza `TeacherStudentActions`: diagnóstico, requisitos e impedimentos del servidor, motivo y confirmación. Las operaciones no se duplican en el seguimiento.

**Acciones realizadas** comienza cerrado. Su contenido se desmonta al cerrarlo; la cabecera funciona con teclado e informa `aria-expanded`. El contrato `TrackingStudent` no contiene una lista de auditoría de acciones ni permite consultar el actor, el motivo histórico o las asignaciones anteriores. Por eso muestra siempre **Historial de acciones no disponible en esta versión**.

Solo cuando `attempts[].suspendedAt` está presente muestra evidencia parcial: fecha de suspensión, título, ID original y `replacementId` si existe. Estos campos ya proceden de la proyección autorizada del registro de intervención. No deduce una acción del estado `suspendido`, no atribuye autor o motivo y no guarda un historial alternativo. Un historial completo dependerá de una futura consulta autorizada de auditoría, fuera de este ajuste; no se ha ampliado el contrato para implementarla.

## Causa reproducida y corrección

Antes de modificar la pantalla, `tests/teacher-refresh.spec.ts` reprodujo el fallo reteniendo una respuesta del sondeo automático mientras se escribía un motivo. La pantalla borraba sus datos al iniciar la petición y renderizaba exclusivamente la tarjeta de carga. El contenedor principal seguía existiendo, pero su contenido encogía: el navegador limitaba el desplazamiento y desmontaba el formulario. La reproducción registró desplazamiento previo de 616 px, **0 campos de motivo montados** durante la petición y **ningún foco**. Al responder aparecía un campo nuevo. La restauración anterior del salón mediante `onLayout` no resolvía el seguimiento ni el formulario.

Ahora se distinguen carga inicial y actualización: la misma vista y el mismo contenedor permanecen montados durante las lecturas en segundo plano, con un aviso discreto. Se conservan los 30 segundos de sondeo y las revalidaciones al volver a primer plano/foco. Las claves dependen de IDs, nunca de la revisión o la hora. Los datos nuevos actualizan la elegibilidad sin reconstruir los campos; una confirmación abierta vuelve a comprobar la elegibilidad más reciente antes de enviar.

Cada vista guarda su desplazamiento al navegar. El retorno restaura una vez la posición del salón, seguimiento o acciones. Para cambios de altura se mide un elemento visible justo antes de aplicar los datos y se compensa su cambio de posición una vez después del renderizado. Si ya cambió el desplazamiento por una interacción, el navegador o el ajuste natural del contenedor, se omite esa corrección. No se repite una posición antigua en cada renderizado.

La búsqueda, fila desplegada, acordeón de evidencia y borradores sobreviven a las lecturas y al regreso entre esas vistas para el mismo estudiante. Cambiar de grupo limpia su estado; cambiar de estudiante limpia el formulario de ese estudiante; cambiar de usuario o cerrar sesión desmonta y limpia el panel. Una denegación detectada retira los datos y borradores inmediatamente. Un fallo transitorio conserva el contenido y muestra un aviso. El adaptador cliente `src/api.ts` conserva ahora el estado HTTP de la respuesta RPC para distinguir un 503 de una denegación; no cambia las llamadas ni sus payloads.

## Verificación enfocada

```powershell
npm run typecheck
npx playwright test tests/teacher-accordion.spec.ts tests/teacher-groups.spec.ts tests/teacher-summary.spec.ts tests/teacher-interventions.spec.ts tests/teacher-refresh.spec.ts tests/teacher-views.spec.ts tests/admin-panel.spec.ts --reporter=line
```

Resultado final: TypeScript de cliente y servidor correcto; **19/19 pruebas web correctas** en Edge sin interfaz (15 docentes y 4 de regresión administrativa). La reproducción corregida conserva **1 campo montado**, su identidad de nodo y el foco durante la respuesta retenida. Se revisaron también las capturas de acciones a 1280 y 390 px.

Las pruebas nuevas comprueban el mismo nodo de entrada, foco, selección y borrador durante peticiones retenidas y varios sondeos; desplazamiento del usuario mientras espera; cambios de altura sobre el elemento visible; elegibilidad y confirmación actualizadas; fallo transitorio y recuperación; revocación; evidencia parcial sin inferencias; teclado; navegación normal y atrás/adelante; regreso al salón con búsqueda/fila/posición, y limpieza al cerrar sesión. Las operaciones docentes existentes también se verifican mediante el fixture local autorizado. Los escenarios de altura y bloqueo usan datos sintéticos en respuestas de lectura, sin crear operaciones académicas ficticias en el servidor.

Se comprueba web de escritorio a 1280 px y web en ancho móvil a 390 px; la suite del salón añade 320 px y nombres largos. Estas comprobaciones **no equivalen a ejecutar Android nativo**. No se ejecuta una prueba de dispositivo/emulador Android en esta entrega. No se repiten las pruebas SQL por este cambio visual; el fixture web utiliza la implementación existente para las lecturas, acciones y denegaciones de integración.

Archivos de implementación: `App.tsx`, `src/api.ts`, `src/TeacherPanel.tsx`, `src/TeacherStudentActions.tsx`, `src/TeacherActionsScreen.tsx` y `src/useTeacherViewport.tsx`. Pruebas: `tests/teacher-refresh.spec.ts`, `tests/teacher-views.spec.ts`, `tests/teacher-interventions.spec.ts` y `tests/teacher-summary.spec.ts`. Documentación: este archivo y el enlace desde `INTERVENCIONES_PROFESOR.md`.

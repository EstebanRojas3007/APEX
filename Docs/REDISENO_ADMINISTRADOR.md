# Rediseño del frontend administrador

**Corrección posterior del catálogo:** [diagnóstico y corrección de creación/retirada de asociaciones](CATALOGO_ADMINISTRADOR.md), frontend del 01/11/2026. Avisos locales, motivo de asociación explícito, estados de comprobación/regla/error y refresco verificado; sin modificar backend ni sus restricciones. Los resultados siguientes conservan la entrega inicial del rediseño.

Entrega local del **01/11/2026**, America/Bogota, sobre APEX existente y los cinco bocetos del responsable. Menú lateral APEX con cinco vistas, sección activa y opciones comunes; en móvil se abre mediante **Abrir menú**. Se reutilizan `StaffPanel`, `AdminForms`, los componentes visuales y las operaciones autorizadas existentes.

El alcance es exclusivamente frontend, pruebas locales y documentación. Backend, SQL, migraciones, tablas, RPC, permisos, políticas, contratos, Edge Functions, secretos y SMTP permanecen intactos. La comparación SHA-256 de **123 archivos** de backend, contratos y configuración no encontró modificaciones ni archivos añadidos en ese conjunto. No hubo operaciones remotas ni envíos reales. Las pruebas solo alteraron fixtures locales desechables.

## Correspondencia de navegación

| Navegación anterior | Ubicación actual | Funciones conservadas |
| --- | --- | --- |
| Inicio | Inicio | Conteos globales por rol/estado y salones, con bienvenida, explicación y barras de activos/inactivos. |
| Usuarios | Consultar | Pestañas Estudiantes y Profesores, Todas las cuentas, filtros de rol/estado, búsqueda, paginación, detalles y editor de cuenta. Incluye administradores y cuentas inactivas. |
| Profesores | Asignación y transición → Profesores e invitaciones | Lista desplegable, búsqueda/paginación, modalidades existente/nueva, motivo, confirmación, envío, estado, reintento, reenvío y cancelación. |
| Gestión de rol/estado de cuentas | Consultar → Gestionar; acceso también desde Asignación y transición → Transición de cuentas | Mismo editor y restricciones. Estudiante → Profesor sigue requiriendo invitación y aceptación explícita. |
| Salones | Asignación y transición → Salones | Crear, editar, archivar/reactivar, detalle, profesores responsables e integrantes actuales/retirados, asignar/retirar y motivos. |
| Programas y componentes | Programas y componentes | Introducción, catálogo, edición con IDs estables, asociaciones, impacto y restricciones. |
| Auditoría | Auditoría | Búsqueda, entidades/acciones, fechas, registros antes/después, motivos y paginación. |
| Editar perfil, Ayuda y Cerrar sesión | Menú lateral o menú desplegable móvil | Mismos recorridos y confirmación de cierre. |

Se mantienen los enlaces `#administracion/inicio`, `usuarios`, `profesores`, `salones`, `catalogo`, `auditoria` y el detalle `#administracion/salones/<ID>`. `#administracion/usuarios/todos` abre Todas las cuentas. Atrás en web y regreso físico Android conservan navegación administrativa; el regreso físico requiere validación en dispositivo. Los paneles propios de profesor y estudiante siguen separados.

## Datos y límites de la interfaz

- **Inicio:** utiliza exclusivamente `admin_overview`. Las barras representan activos respecto del total activo/inactivo de cada categoría. Activo significa cuenta o salón habilitado, sin indicar presencia en línea. No utiliza el conteo de una página de usuarios como total.
- **Consultar:** `admin_users` conserva búsqueda global del filtro por nombre, correo o ID APEX, páginas de 20 y total devuelto por servidor. Se añade copia del ID con confirmación visual y mensaje de fallo. El UUID Auth continúa en el editor y no se confunde con el ID APEX.
- **Resultados:** lectura bajo demanda por cuenta mediante la operación administrativa ya autorizada `student_results`, con historial, aciertos, porcentaje y desgloses disponibles. No se llama a `students` para descargar todo el directorio ni a operaciones `teacher_*`; no se agregan permisos ni intervenciones académicas.
- **Salones por profesor:** `admin_users` no devuelve sus asignaciones. La ficha dirige a la gestión de Salones, donde el detalle existente muestra los responsables. No se inventa una lista por profesor ni se recorren indiscriminadamente todos los salones para construirla. Mostrar esa columna con todas las asignaciones requiere una proyección administrativa adicional fuera del alcance.
- **Auditoría por tipo de usuario:** `admin_audit` no admite filtrar por rol del actor/destinatario. Se ofrece el filtro soportado de entidad, con Cuentas para todos los roles; no se simula un filtro Profesor/Estudiante ni se infiere el rol actual de eventos históricos.
- **Auditoría por acción:** opciones con etiquetas comprensibles para los códigos existentes y opción Todas las acciones. Entidades y acciones se envían al servidor sin cambiar su significado; los registros desconocidos siguen accesibles mediante Todos y conservan su valor original visible.
- **Fechas:** calendario web nativo `input type=date` y calendario Android de la dependencia ya instalada. Desde/Hasta viajan como fechas civiles `AAAA-MM-DD`, inclusivas en `America/Bogota`, sin convertirlas a instantes UTC. La presentación de los eventos también explicita Bogotá. Un rango invertido muestra error y no consulta la API; Limpiar filtros restablece búsqueda, entidades, acciones, fechas y página.

Los formularios y selectores conservan su montaje durante el refresco de la misma vista cada 30 segundos o al recuperar foco/primer plano. Los datos anteriores de esa misma consulta permanecen visibles mientras llega la actualización. Cambiar de vista o filtro invalida respuestas anteriores; cerrar sesión o perder autorización retira datos y acciones. Se mantiene la protección contra operaciones simultáneas y no se inicia un envío preparado para otra vista/sesión. Navegar a otra sección reinicia sus filtros y borradores, como antes; un refresco automático no los borra.

## Invitaciones y servicios remotos

Se conservan los formularios, preparación y dispatch actuales, confirmación previa, motivo obligatorio y aceptación explícita del destinatario. No se cambió el receptor de enlaces ni se creó una transición directa alternativa.

Las dos pruebas reales de cuenta existente (Gmail API) y nueva (Supabase Auth con SMTP Gmail), el despliegue de `admin-invitations` y los secretos configurados son **confirmaciones manuales del responsable**, registradas en INVITACIONES_PROFESORES.md (`Docs/INVITACIONES_PROFESORES.md`, solo local; v?ase la gu?a de reproducibilidad). No se atribuyen al asistente. En esta entrega se probaron ambos recorridos mediante simulaciones locales.

El frontend y retorno siguen locales en `http://localhost:8081/auth/invite`. OAuth External/Testing, caducidad/reautorización, localhost, validaciones remotas adicionales y Android nativo conservan las limitaciones de esa guía. No se publicaron sitio, APK o AAB ni se cambiaron los servicios remotos.

## Verificación ejecutada

| Comprobación | Resultado y alcance |
| --- | --- |
| TypeScript | `npm run typecheck`: correcto, cliente y servidor. |
| Integridad de migraciones | `npm run check:migrations`: correcta; archivos aplicados preservados. |
| Integridad de backend/configuración | Comparación SHA-256 al inicio/final: 123 archivos sin cambios ni adiciones. Incluye `supabase/`, `server/`, `shared/`, adaptadores API/Auth, manifiestos de dependencias y configuración local. |
| Pruebas administrativas dirigidas | **10/10 aprobadas** en `admin-panel`, `teacher-invitation-modes` y `admin-redesign`, a 1280/390 px. |
| Revisión visual final | **4/4 aprobadas** al repetir `admin-redesign` tras el último ajuste de tipografía; catorce capturas actualizadas y enlaces comprobados. |
| Regresión web completa | `npx playwright test`: **44/45 aprobadas**. Estudiante, reloj, rutas, registro, grupos, resumen, intervenciones, invitaciones y protección de sesiones incluidos. La suite no se declara íntegramente aprobada. |
| Exportación web | `npm run export:web -- --clear`: correcta en `dist/`, repetida tras el ajuste final de tipografía web. |
| Exportación Android | `npm run export:android -- --clear`: bundle Hermes correcto en `dist-android/`. No acredita APK/AAB, instalación, ejecución del calendario, portapapeles ni regreso físico en un dispositivo. |
| Paquetes cliente | `npm run check:client-bank`: cinco archivos web/Android revisados, sin banco privado, marcadores de credenciales de servidor ni configuración de fixtures. |

Las pruebas dirigidas comprueban navegación y menú móvil, regreso web, perfil/ayuda/logout, búsqueda por ID y correo, otros roles, copia y contenido del portapapeles, resultados vacíos autorizados, páginas/total globales simulados, descarte de búsqueda tardía, fechas y parámetros exactos, rechazo de rango invertido, limpieza, carga/vacío/error, conservación de campo/foco/desplazamiento y selectores durante refrescos. Las suites anteriores comprueban edición de cuenta, salones/responsables, catálogo, revocación y respuestas después del logout. Ambos recorridos de invitación se completan con Auth/correo simulados, incluida aceptación explícita, fallo parcial y reenvío; la prueba existente comprueba una sola preparación/envío tras confirmar.

Los calendarios web se verifican como controles nativos de fecha y por sus valores/parámetros enviados. El foco y la identidad DOM del desplegable web se conservan durante refrescos; esto no equivale a verificar visualmente todos los menús del sistema operativo o su interacción en Android. La paginación y los errores controlados nuevos usan respuestas sintéticas acotadas; el resto reutiliza HTTP/Auth/correo simulados y RPC SQL en PGlite local, sin servicios reales.

**Fallo docente pendiente reproducido:** `tests/teacher-views.spec.ts:96`, caso «Acciones, evidencia parcial y regreso conservan cada vista» a 390 px. Al alargar el nombre del programa, el ancla se desplazó **572 px**, frente a una tolerancia inferior a 5 px. Este problema de desplazamiento ya figuraba pendiente en la guía de invitaciones; no se modificó `TeacherPanel` ni se declara corregido. Los demás casos de docente, incluido foco durante refresco, pasaron.

El primer inicio de Playwright y la primera generación Hermes fueron bloqueados por `spawn EPERM` dentro del sandbox; se repitieron con autorización local. Se corrigieron dos problemas de los tests nuevos: esperar el montaje del menú móvil y comprobar la habilitación del botón sin exigir un atributo ARIA que React Native Web omite. Se revisaron capturas y se ajustaron el ancho del título móvil y la tipografía de los controles HTML.

## Capturas

Datos exclusivamente sintéticos, Edge en escritorio y web móvil. No son imágenes de Android nativo. Las capturas muestran el área visible; el contenido inferior se recorre mediante desplazamiento.

| Vista | Escritorio 1280 px | Móvil web 390 px |
| --- | --- | --- |
| Inicio | Captura (`Docs/evidence/admin-redesign-inicio-1280.png`, solo local; v?ase la gu?a de reproducibilidad) | Captura (`Docs/evidence/admin-redesign-inicio-390.png`, solo local; v?ase la gu?a de reproducibilidad) |
| Consultar | Captura (`Docs/evidence/admin-redesign-consultar-1280.png`, solo local; v?ase la gu?a de reproducibilidad) | Captura (`Docs/evidence/admin-redesign-consultar-390.png`, solo local; v?ase la gu?a de reproducibilidad) |
| ID y confirmación de copia | Captura (`Docs/evidence/admin-redesign-consultar-detalle-1280.png`, solo local; v?ase la gu?a de reproducibilidad) | Captura (`Docs/evidence/admin-redesign-consultar-detalle-390.png`, solo local; v?ase la gu?a de reproducibilidad) |
| Asignación y transición | Captura (`Docs/evidence/admin-redesign-asignacion-1280.png`, solo local; v?ase la gu?a de reproducibilidad) | Captura (`Docs/evidence/admin-redesign-asignacion-390.png`, solo local; v?ase la gu?a de reproducibilidad) |
| Salones | Captura (`Docs/evidence/admin-redesign-salones-1280.png`, solo local; v?ase la gu?a de reproducibilidad) | Captura (`Docs/evidence/admin-redesign-salones-390.png`, solo local; v?ase la gu?a de reproducibilidad) |
| Programas y componentes | Captura (`Docs/evidence/admin-redesign-catalogo-1280.png`, solo local; v?ase la gu?a de reproducibilidad) | Captura (`Docs/evidence/admin-redesign-catalogo-390.png`, solo local; v?ase la gu?a de reproducibilidad) |
| Auditoría | Captura (`Docs/evidence/admin-redesign-auditoria-1280.png`, solo local; v?ase la gu?a de reproducibilidad) | Captura (`Docs/evidence/admin-redesign-auditoria-390.png`, solo local; v?ase la gu?a de reproducibilidad) |

## Archivos de la entrega

- Integración y panel: `App.tsx`, `src/StaffPanel.tsx`; `src/AdminForms.tsx` solo ajusta los textos de ubicación de funciones.
- Componentes nuevos de presentación/navegación: `src/AdminNavigation.tsx`, `src/AdminPresentation.tsx`.
- Controles por plataforma: `src/AdminSelect.tsx`, `AdminSelect.web.tsx`, `AdminDateField.tsx`, `AdminDateField.web.tsx`, `copyAdminId.ts`, `copyAdminId.web.ts`.
- Pruebas: `tests/admin-navigation.ts`, `tests/admin-redesign.spec.ts`; adaptación de navegación en `tests/admin-panel.spec.ts` y `tests/teacher-invitation-modes.spec.ts`.
- Documentación/evidencia: esta guía, `Docs/PANEL_ADMINISTRADOR.md`, `Docs/PROGRESO.md` y las capturas enlazadas.

No se añadieron dependencias ni se modificaron los contratos compartidos, `src/api.ts`, `src/supabase.ts` o los paneles/componentes del docente y estudiante. Los artefactos de compilación son locales y no constituyen un despliegue.

# Regularización y recuperación por el profesor

Ajuste posterior exclusivamente de frontend: [pantalla de acciones, actualización sin saltos y límites del historial](PROFESOR_ACCIONES_VISTA.md). No requiere cambios adicionales en Supabase ni altera las dependencias de la implementación descrita aquí.

Entrega administrativa posterior del 25/10/2026: PANEL_ADMINISTRADOR.md (`Docs/PANEL_ADMINISTRADOR.md`, solo local; v?ase la gu?a de reproducibilidad). No incorpora estas acciones al administrador. Documenta expresamente las RPC administrativas académicas anteriores que se conservan por compatibilidad y las protecciones nuevas ante exámenes activos; no cambia el contrato de intervención docente.

Preparación local del 25/10/2026 (America/Bogota). No se consultó ni modificó Supabase remoto, ni se cambió el rol o asignación de una persona real. No se implementó el panel administrador ni se conectaron n8n/Gemini. Se conservan el acordeón del salón, navegación, búsqueda, desplazamiento, seguimiento individual, resumen y exclusión técnica.

## Operaciones y autorización

La fachada existente `public.apex_api(operation,payload)` incorpora exclusivamente:

| Operación | Payload | Resultado |
| --- | --- | --- |
| `teacher_assign_diagnostic` | `{groupId,studentId}` | `assigned:1` si faltaba; `assigned:0` si ya hay diagnóstico o historial protegido. No inicia un intento. |
| `teacher_suspend_attempt` | `{groupId,studentId,attemptId,reason,confirmed:true}` | Suspensión y autorización única. Repetir devuelve `already_suspended` con la misma autorización/reemplazo. |

Ambas exigen sesión vigente mediante `actor()`, docente activo, grupo activo actualmente asignado, miembro estudiante activo y componente autorizado por su programa. No aceptan rol, actor ni tiempos del cliente. Los IDs se vuelven a comprobar bajo bloqueos. Las acciones no conceden notas, progreso, roles, borrados ni facultades globales. Las RPC administrativas anteriores conservan su propia restricción de administrador; el docente no las invoca con privilegios prestados.

La regularización usa `ingles_con_historial`, `estado_diagnostico` y el mismo `INSERT ... ON CONFLICT` de la transición existente. Conserva cualquier diagnóstico convocado/asignado y cualquier intento académico de Inglés, aunque sea de control/final o histórico. Requiere perfil válido/completo, configuración de diagnóstico y plantilla de siete preguntas habilitada con banco cargado. No cambia programa, autorización, consentimiento, plantilla ni historial para hacer elegible a alguien.

`teacher_student` añade `teacherActions`: diagnóstico `not_assigned`, `assigned`, `in_progress` o `completed`, posibilidad/impedimento de asignar y estados de recuperación de sus intentos abiertos/suspendidos. Es una lista permitida de metadatos: no incluye respuestas, preguntas ni claves. El resto del seguimiento y del contrato anterior se conserva. El salón/resumen siguen usando sus lecturas existentes.

## Suspensión y reemplazo

| Instrumento | Umbral inclusivo desde `intento.iniciado_en` | Condición adicional |
| --- | --- | --- |
| Diagnóstico | 30 minutos | Activo sin resultado; sigue sin vencimiento automático. |
| Control | 45 minutos | Activo, sin resultado y con vencimiento persistido ya alcanzado. |
| Final | 60 minutos | Misma excepción por cierre automático atascado. |

La hora sale de `epoch_ms()` después de esperar los bloqueos. Un control/final que continúa activo y vencido al llegar al umbral acredita que el cierre no se completó, incluso si el programador se detuvo y no escribió un error. No se exige `fallos>0`, lo que excluiría ese caso. Los instrumentos anteriores sin plazo continúan sin plazo y no reciben uno retroactivo. Una forma de banco histórica sin convocatoria recuperable se muestra impedida y requiere conciliación antes de suspender.

Se agrega `intento.estado='suspendido'`, independiente de `finalizado`. No se escribe `finalizado_en`, resultado, decisión de avance ni repaso por el incidente. Respuestas, selección/versiones, exposición, inicio y snapshot del reloj del original permanecen iguales e inmutables. Los guardados tardíos son rechazados. El calificador existente ya devuelve sin calificar cualquier estado distinto de activo; el procesador filtra activos y nunca procesa suspensiones. También se impide insertar resultados/decisiones sobre un suspendido mediante trigger.

La nueva tabla privada `intervencion_docente` tiene dos propósitos relacionados: auditoría del acto académico y autorización consumible del reemplazo. Las auditorías existentes describen cambios de roles/grupos y no tienen el propósito ni las referencias adecuadas. Se registra actor de dominio y Auth, estudiante, grupo, acción, motivo, hora, convocatoria si se regularizó, intento original y reemplazo cuando realmente se crea. Tiene RLS y carece de acceso directo para `anon`, `authenticated` y `service_role`. No se permite borrar o modificar el evento; únicamente puede completarse una vez la referencia al reemplazo del mismo estudiante. `id_original` e `id_reemplazo` son únicos.

Suspender no crea el reemplazo, selección ni reloj. El estudiante ve **Preparar reinicio autorizado**, confirma las condiciones y usa el `start` existente. La autorización se consume junto con la creación completa del intento en una transacción. La selección emplea `seleccionar_forma`, la misma plantilla y la política vigente de la cadena: bloques íntegros, exposición conservada y agotamiento auditado; no se reinicia el registro de preguntas vistas. Si falla la selección, no se consume la autorización ni queda un intento parcial. Las formas publicadas anteriores al banco, con selección fija y sin plantilla, se copian conservando su versión/preguntas; no se sustituyen por otro diagnóstico actual.

Las cadenas de banco conservan `intento_ruta` y su número servidor, sin inventar un repaso para la suspensión. Después de calificar un reemplazo, un control/final reprobado sí conserva su regla ordinaria de repaso vinculado. También se soporta una suspensión posterior de un reintento ordinario. Las formas históricas conservan un único reemplazo por autorización; no se agrega repetición académica ordinaria a un instrumento que no la tenía.

Las solicitudes del estudiante a un intento suspendido devuelven `ATTEMPT_SUSPENDED`. La app retira la evaluación, actualiza sus datos y permite preparar el reemplazo desde Mis evaluaciones. El sondeo del reloj observa también la suspensión de diagnósticos sin crearles un plazo, renovar actividad o entregarlos automáticamente.

## Transacciones y carreras

Orden académico compartido: **estudiante → intento**. Calificador, guardado, procesador, suspensión y creación de reemplazo se serializan sobre el estudiante. La acción además bloquea las filas del actor/destinatario y del ámbito: vínculos de grupo antes de grupo, y autorización del programa. Este orden respeta el trigger de membresías. Una revocación que ya ganó el bloqueo hace fallar la acción; si la acción ganó antes, termina y la revocación impide las siguientes.

Después de esperar se vuelven a comprobar estado, resultado, ámbito y tiempo. Si calificar gana, la suspensión falla; si suspender gana, guardado/entrega no cambian el original y el procesador lo omite. No se usa `finalizado` como representación de suspensión. Dos profesores o dos sesiones del estudiante no obtienen dos autorizaciones/reemplazos. La unicidad y la actualización consumible están en la misma transacción, además del bloqueo y de la prevención del doble clic en la interfaz. Los errores de serialización/deadlock requieren reintentar la transacción completa; no ignorarlos.

## Matriz de permisos actualizada

| Capacidad | Profesor | Administrador |
| --- | --- | --- |
| Seguimiento individual/resumen | Solo grupos y miembros autorizados actuales | Consultas administrativas existentes; sin nuevo panel docente por suplantación. |
| Regularizar diagnóstico faltante | Solo un miembro autorizado; sin historial de Inglés, perfil/plantilla válidos. | Mecanismos administrativos existentes, con sus validaciones; sin permisos delegados al profesor. |
| Suspender y autorizar reinicio | Solo miembro autorizado y condiciones de la tabla temporal, motivo/confirmación obligatorios. | No se agrega esta operación al rol administrador. |
| Crear/editar grupos, gestionar integrantes y docentes | No | Sí, mecanismos existentes. |
| Gestionar plataforma, cuentas, roles, programas/componentes | No | Responsabilidad administrativa; panel fuera de esta tarea. |
| Cambiar notas, completar secciones ajenas, borrar historial o leer claves/conversaciones privadas | No | No se añade ninguna facultad de este tipo. |

El estudiante solo puede abrir/recuperar sus propios intentos, consumir su autorización y seguir las reglas académicas vigentes. No puede invocar las acciones docentes ni sus ayudantes privados. La revocación de rol, grupo o membresía impide las siguientes acciones/lecturas y la interfaz limpia los datos en su revalidación existente, también después de una acción denegada.

## Orden exacto de despliegue futuro

Ningún paso se ejecutó en remoto. No utilizar fixtures, usuarios sintéticos ni claims inventados en el proyecto real.

1. Confirmar proyecto y respaldo. Comparar las definiciones y el registro real de migraciones con el código local; un registro CLI vacío no demuestra que no exista SQL aplicado manualmente. Ejecutar como propietario [preflight-teacher-interventions.sql](../supabase/preflight-teacher-interventions.sql), de solo lectura, y guardar conteos/definiciones/activos. Si ya existen la fachada `apex_api_pre_intervencion` y esta función de intervención, detener la reaplicación y comparar definiciones.
2. Confirmar todas las dependencias realmente aplicadas hasta `202610230001_teacher_group_summary.sql`, incluidas las protecciones de diagnóstico, relojes y exclusión técnica. Resolver faltantes mediante sus procedimientos; **no repetir** cargas, semilla, configuración MVP, activación de relojes o migraciones aplicadas.
3. Aplicar **solo** [202610250001_teacher_interventions.sql](../supabase/migrations/202610250001_teacher_interventions.sql), completa y transaccional. Añade estado, auditoría, ayudantes y fachada. No asigna nada ni cambia datos históricos, roles, programas, flags o cron.
4. Ejecutar [verify-teacher-interventions.sql](../supabase/verify-teacher-interventions.sql), de solo lectura. Los contadores de anomalías deben ser cero. Solo `authenticated` debe ejecutar la fachada actual; ninguna función previa/ayudante nueva ni tabla de auditoría debe quedar accesible directamente. Comparar conteos históricos con el preflight inmediatamente después de migrar.
5. Desplegar el frontend web/Android actualizado. Con sesiones autorizadas y datos de staging, verificar regularización elegible, impedimentos, cancelación/confirmación, suspensión, reemplazo diferido, calificación concurrente, navegación/regreso y revocación. No asignar pruebas ni cambiar roles de estudiantes reales como verificación automática.
6. En PostgreSQL de staging, probar dos conexiones independientes: dos profesores regularizando/suspendiendo, dos sesiones consumiendo la misma autorización, suspensión frente a guardado/entrega/procesador, ambos órdenes de ganadores y esperas hasta el umbral. Revisar un solo evento/reemplazo y ausencia de nota/repaso del original. El ejecutor anterior de concurrencia de cupos no prueba estas carreras.
7. Repetir la verificación de solo lectura y revisar auditoría con el operador autorizado. Si se retira la interfaz, conservar migración/auditoría y el soporte del estado suspendido en el cliente estudiantil; no degradar a un cliente que lo trate como un examen activo ni borrar eventos para revertir.

## Verificación local y límites

Las pruebas nuevas `supabase/tests/teacher-interventions.test.ts` usan PostgreSQL PGlite aislado, hora controlada y Auth simulado. Cubren permisos y revocaciones; cuatro estados de diagnóstico; historial de Inglés y plantilla no disponible; 30/45/60 minutos exactos y un milisegundo antes; conservación del original; reemplazo único y diferido; repaso ordinario posterior; respuestas tardías; ganador calificación/suspensión; fallo atómico del calificador; formas históricas sin plazo y diagnóstico de selección fija. Ejecutan también los SQL de preflight/verificación sobre datos sintéticos. Los reintentos de solicitudes se ejecutan en una conexión serializada: **no acreditan contención entre conexiones independientes**.

Las pruebas web `tests/teacher-interventions.spec.ts` usan Edge, Auth HTTP simulado y RPC PostgreSQL locales. Comprueban procesamiento/doble clic, estados/actualización, motivo, confirmación/cancelación, error/reintento, reinicio del estudiante y retirada de acceso. Se conservan las suites de acordeón, grupos, resumen, relojes y recorrido del estudiante. Las capturas a 390 px son **web en tamaño móvil**, no Android nativo.

Comandos reproducibles:

```powershell
npm run typecheck
npm run check:migrations
npm test
npx tsx --test src/assessmentTime.test.ts
npx playwright test
npm run export:web
npm run export:android
npm run check:client-bank
```

Resultados ejecutados en esta entrega:

| Verificación | Resultado |
| --- | --- |
| `npm test` | 68/68 correctas en PostgreSQL PGlite aislado. |
| Repetición final de intervenciones y contador | 10/10 correctas, incluidos los SQL de preflight/verificación. |
| `npx playwright test` | 30/30 correctas, Edge invisible; incluye todos los recorridos estudiantiles y docentes. |
| TypeScript cliente/servidor | Correcto. |
| `check:migrations` | Correcto; las migraciones y semilla protegidas se conservan. Las veinte migraciones anteriores no se editaron. |
| Exportaciones web y Android/Hermes | Correctas. |
| `check:client-bank` | Correcto, cinco archivos exportados comprobados; sin banco/claves en los bundles. |
| Visual y teclado web | Pruebas a 1280/390 px para las acciones, capturas en `test-results/teacher-interventions*-web.png`; acordeón también a 320 px. |
| Multiconexión PostgreSQL, Android nativo, Auth/cron/Supabase remotos | **No ejecutados**. |

La exportación Hermes no equivale a APK/AAB ni prueba de dispositivo. No hay PostgreSQL nativo/psql configurado ni dispositivo Android conectado en esta entrega (`adb devices -l` sin dispositivos). No declarar concurrencia independiente, Android nativo, pg_cron real, Auth remoto o despliegue de Supabase como comprobados sin ejecutarlos. Las pruebas existentes también regeneran sus capturas en `Docs/evidence/`; bundles, trazas y capturas nuevas quedan en directorios ignorados de salida.

## Archivos de esta entrega

- Nueva migración `supabase/migrations/202610250001_teacher_interventions.sql`; anteriores intactas.
- Operación: `supabase/preflight-teacher-interventions.sql`, `supabase/verify-teacher-interventions.sql`.
- Cliente: `src/TeacherStudentActions.tsx`, `src/TeacherPanel.tsx`, `src/api.ts`, `src/useAssessmentClock.ts`, `App.tsx`.
- Tipos: `shared/teacher.ts`, `shared/contracts.ts`.
- Pruebas: `supabase/tests/teacher-interventions.test.ts`, `supabase/tests/http-fixture.ts`, `tests/teacher-interventions.spec.ts`; datos sintéticos solo en procesos locales.
- Documentación: esta guía, `PROFESOR_GRUPOS.md`, `RESUMEN_SALON.md`, `RELOJES_EVALUACIONES.md` y README.

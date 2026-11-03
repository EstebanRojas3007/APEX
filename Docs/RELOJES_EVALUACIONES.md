# Relojes y entrega de evaluaciones · 12/10/2026

Actualización local del 25/10/2026: [intervenciones del profesor](INTERVENCIONES_PROFESOR.md) implementa la recuperación limitada a sus grupos autorizados mediante nueva migración `202610250001`. Sustituye la propuesta de recuperación administrativa futura de esta guía; el profesor no recibe privilegios globales y el administrador no incorpora un panel nuevo. Se conservan plazos académicos, diagnóstico sin vencimiento y el calificador/procesador existentes.

Preparación posterior: prueba técnica aislada, 10 preguntas/15 minutos (`Docs/PRUEBA_TECNICA_RELOJ.md`, solo local; v?ase la gu?a de reproducibilidad), migración aditiva `202610120002` y SQL separados. Reutiliza este calificador y procesador para una identidad, excluyendo efectos académicos/IA; no activa el flag global ni altera el diagnóstico. No se habilitó remoto ni se acreditó un cierre real.

Implementación local preparada. **No se consultó ni modificó Supabase remoto, ni se activó un cron remoto.** La migración prepara el mecanismo con la política nueva desactivada. La configuración del programador y la activación son pasos operativos separados. Se conserva el acordeón de Mi ruta, sus pantallas y las reglas de aprendizaje existentes.

## Comportamiento

| Instrumento | Preguntas | Tiempo total | Entrega |
|---|---:|---:|---|
| Diagnóstico | 7 | Sin límite | Manual; nunca se procesa por vencimiento |
| Control, niveles 1, 2 y 3 | 10 | 900 segundos, 15 minutos | Manual o automática al vencer |
| Final | 25 | 2250 segundos, 37 minutos y 30 segundos | Manual o automática al vencer |

El servidor fija el inicio al insertar efectivamente el intento, después de seleccionar las preguntas y esperar los bloqueos necesarios. La asignación y las instrucciones no crean un reloj. `reloj_intento` conserva tipo, política, inicio, duración y vencimiento como un snapshot inmutable. Las respuestas llevan la hora efectiva del guardado. Reanudar no cambia ID, selección, respuestas, inicio ni vencimiento; cerrar sesión, app, cambiar pantalla o perder internet tampoco pausa el plazo.

`attempt_clock` devuelve tiempo restante y hora del servidor, sin claves de corrección ni reemplazar las respuestas/drafts del cliente. La interfaz descuenta el tiempo con `performance.now()`, sincroniza cada 15 segundos, al regresar al primer plano/foco y al reconectar. Vencida la cuenta, consulta cada 2 segundos y deshabilita acciones de respuesta/entrega. No usa `Date.now()` para decidir el vencimiento. Un error o falta de política no inventa un plazo. En diagnóstico muestra “Sin límite de tiempo” sin el contador visible “Tiempo transcurrido”. El inicio y la actividad permanecen registrados en servidor para la futura intervención administrativa a partir de los 30 minutos; ocultar el contador no cambia recuperación ni inactividad.

La muestra del dispositivo solo presenta el reloj. El servidor vuelve a comprobar el vencimiento después de adquirir los bloqueos, incluso en INSERT/UPDATE de un UPSERT. Desde el instante exacto `hora >= vencimiento` rechaza guardados. Una demora del cron no da tiempo adicional. Solo se califican respuestas confirmadas antes del vencimiento; una selección pendiente en pantalla no cuenta y las omisiones suman cero. Si la calificación falla, se revierte íntegramente, queda el intento vencido sin resultado y la app muestra **“Tiempo agotado, procesando resultado”**. Nunca se calcula ni publica una nota en el cliente.

El reloj tiene etiqueta accesible y región no anunciada cada segundo. Avisos separados y moderados comunican cinco minutos, un minuto y vencimiento. Se usan los mismos componentes, colores, tipografía y áreas táctiles; no se añadieron dependencias.

## Cierre del servidor, permisos y carreras

`calificar_intento` es el cierre común manual/automático. Bloquea **estudiante → intento**, registra el único resultado (PK por intento), finaliza, aplica el avance existente y guarda el resultado en una misma transacción. Un intento finalizado devuelve su resultado sin recalcularlo. Los guardados adquieren los mismos bloqueos. Las RPC anteriores y funciones internas siguen sin acceso directo de `anon`, `authenticated` o `service_role`; solo la RPC autorizada expone datos propios. El programador solo es ejecutable por su propietario de base de datos.

`cerrar_intentos_vencidos(100)` procesa únicamente controles/finales activos con política `total-apex-v1` y vencimiento alcanzado. No llama a Auth, n8n, Gemini ni al worker IA. Usa `FOR UPDATE SKIP LOCKED` para repartir lotes; cada fallo se registra privadamente y se reintenta en ejecuciones posteriores. Las RPC del estudiante también reconocen vencimientos, pero el cron funciona aunque no exista ningún cliente ni sesión conectados. La calificación usa las reglas ya existentes; estas pueden encolar aprendizaje, sin necesitar una respuesta IA para producir la nota.

Controles mantienen 7/10 y final 22/25, con repaso vinculado obligatorio antes de repetir un reprobado. Diagnóstico no tiene umbral ni repetición ordinaria. No se modifica SQL pedagógico anterior ni selección/versionado. La recuperación explícita usa `resumeAttemptId` para devolver el mismo resultado si el cron terminó el intento entre la lectura del menú y la reanudación, sin autorizar una repetición.

Inactividad permanece separada: 90 segundos fuera de evaluaciones; aviso a los 5 minutos, cuenta atrás a los 7 y bloqueo a los 8 en evaluación. Las consultas de reloj no renuevan actividad. El cron no modifica ni bloquea sesiones Auth; un bloqueo de sesión no cancela la entrega automática. Después de un bloqueo se requiere login y recuperación. En diagnóstico ese bloqueo nunca crea vencimiento ni entrega automática.

## Transición e intentos anteriores

Se preparó `preflight-assessment-clocks.sql` para inspeccionar los intentos activos reales antes de desplegar. **Aquí no se ejecutó sobre producción**. La prueba de actualización local incluye un control activo con respuestas y un diagnóstico finalizado.

La migración añade snapshots a todos los intentos existentes: diagnóstico → `diagnostico-sin-limite-v1`; cualquier otro anterior → `anterior-sin-limite-v1`, sin vencimiento. Conserva todos los inicios, respuestas, selección, estado y resultados originales. No recalifica finalizados ni impone plazos retroactivos. También son anteriores los intentos creados entre la preparación y la activación. Un intento anterior reanudado continúa con su política anterior, aunque la política nueva ya esté activa. Solo los intentos creados después de activar reciben 900/2250 segundos.

Las 16 migraciones existentes se conservaron byte por byte. La nueva migración es **`202610120001_assessment_clocks.sql`**. No se reescribieron migraciones aplicadas ni la semilla.

## Despliegue y activación, en este orden

Estos pasos son instrucciones para un despliegue posterior autorizado; no se ejecutaron remotamente.

1. Como propietario de la base correcta, ejecutar los preflight de solo lectura: `supabase/preflight.sql` y `supabase/preflight-assessment-clocks.sql`. Guardar el inventario de activos y los totales del historial. Comparar el historial de migraciones con el esquema real; SQL Editor manual puede no haber registrado versiones.
2. Aplicar únicamente las dependencias realmente pendientes en orden. Según el último estado informado, aprendizaje `202610110001`–`004` ya está aplicado; las adiciones `202610110005_diagnostic_guard.sql` y `202610110006_mvp_component_summary.sql` preceden a esta entrega. No repetir las anteriores, cargas, seed, autorización de programas ni transición de aprendizaje ya realizadas. Si falta la configuración MVP previa, completar su procedimiento independiente y verificarla antes de activar relojes.
3. Aplicar **`supabase/migrations/202610120001_assessment_clocks.sql`** completa. Inicialmente `configuracion_reloj.activa=false`. Ejecutar `supabase/verify-assessment-clocks.sql`; los contadores de anomalías deben ser cero y los intentos anteriores no deben tener vencimiento. Contrastar inventario y resultados con el preflight.
4. Habilitar la integración **Supabase Cron / pg_cron** en el proyecto si falta, sin eliminar extensiones ni otros jobs. Comprobar versión compatible con intervalos de segundos (pg_cron ≥1.5 y la compatibilidad de la versión PostgreSQL del proyecto). Ejecutar **`supabase/configure-assessment-scheduler.sql`** como propietario del procesador. Crea/actualiza exclusivamente el job propio `apex-assessment-expiry-v1`, comando `SELECT apex_private.cerrar_intentos_vencidos(100);`, **cada 30 segundos**. Verifica nombre, comando y base si ya existe. No modifica settings globales ni otros jobs.
5. Ejecutar **`supabase/verify-assessment-scheduler.sql`** y comprobar ejecuciones reales con estado `succeeded`, dueño/base/comando correctos y ausencia de errores/vencidos atascados. Una fila exitosa solo prueba la ejecución del job; inspeccionar también `fallos` y `ultimo_error`, pues el procesador captura fallos por intento. En staging probar un vencimiento con la app cerrada y sesiones bloqueadas. Las pruebas locales no sustituyen esto.
6. Desplegar el frontend actualizado en web y Android antes de imponer plazos. Verificar diagnóstico, política anterior, recuperación, accesibilidad y sincronización. Este paso tampoco se realizó aquí.
7. Después de verificar el cron y el frontend, ejecutar **`supabase/activate-assessment-clocks.sql`** como propietario. Se niega si falta la configuración de aprendizaje, el job activo exacto, una ejecución exitosa en los últimos 5 minutos o un snapshot temporal. Activa solo los intentos nuevos. Ejecutar de nuevo las dos verificaciones de solo lectura.
8. Verificar un control/final nuevo: duración exacta, no renovación al reanudar, rechazo tardío, un solo resultado, umbral y repaso. Verificar un intento anterior reanudado y un diagnóstico sin plazo. Monitorizar retrasos, fallos y backlog; 100 intentos cada 30 segundos es el lote inicial, no una garantía de latencia bajo carga.

El plazo de respuesta termina exactamente en el vencimiento, aunque la nota aparezca unos segundos después. El intervalo de 30 segundos equilibra detección y carga; no ofrece precisión de ejecución instantánea. Ante problemas, desactivar `configuracion_reloj.activa` solo evita temporizar futuros intentos: **no borrar snapshots, extender vencimientos ni detener el procesador de los ya temporizados**. Corregir el fallo y permitir el reintento idempotente.

Supabase documenta [Cron en PostgreSQL](https://supabase.com/docs/guides/cron) y [programación con intervalos de segundos](https://supabase.com/docs/guides/cron/quickstart). La extensión documenta [intervalos y ejecuciones de un mismo job](https://github.com/citusdata/pg_cron). No se presupone su disponibilidad o activación en este proyecto.

## Verificación de solo lectura

| Archivo | Cuándo | Inspección |
|---|---|---|
| `supabase/preflight-assessment-clocks.sql` | Antes de migrar | Esquema, extensión, activos, inicio real, tiempo transcurrido y respuestas; totales históricos |
| `supabase/verify-assessment-clocks.sql` | Después de migrar/activar | Configuración, políticas, anomalías, vencidos pendientes/fallos, histórico y privilegios |
| `supabase/verify-assessment-scheduler.sql` | Con pg_cron instalado | Versión, job propio y últimas 20 ejecuciones, retrasos/fallos por intento |

Todos usan `BEGIN READ ONLY`. No llaman al procesador ni activan nada. Registrar las salidas en el entorno autorizado; no publicar identificadores personales. La ausencia de errores en `cron.job_run_details` no garantiza que cada intento se calificó: revisar los pendientes y errores del reloj.

## Propuesta histórica de recuperación (sustituida el 25/10/2026)

Este apartado conserva el contexto de diseño anterior. La implementación y los permisos vigentes son los de [INTERVENCIONES_PROFESOR.md](INTERVENCIONES_PROFESOR.md); no aplicar la propuesta administrativa de este apartado como si fuera el contrato actual.

| Instrumento | Suspensión manual disponible desde el inicio | Condición adicional |
|---|---:|---|
| Diagnóstico | 30 minutos | Sigue sin entregar; no requiere fallo técnico |
| Control | 45 minutos | Sigue abierto por fallo del cierre automático |
| Final | 60 minutos | Sigue abierto por fallo del cierre automático |

Estos umbrales no son cierres automáticos ni amplían los tiempos de 15/37:30. El servidor deberá comprobar rol administrativo, estado aún abierto, ausencia de resultado, inicio persistido y hora del servidor. Para control/final deberá acreditar el fallo del cierre, incluida la posibilidad de un programador detenido; superar el umbral por sí solo no basta.

Requerirá confirmación explícita y motivo, auditoría de administrador/instante/causa/intentó suspendido, conservación íntegra de respuestas e historial y autorización consumible atómicamente de **un único intento nuevo desde el comienzo, sin repaso**. El suspendido no produce una calificación reprobada. Un resultado existente nunca se suspende ni recalifica. Una implementación posterior deberá añadir el estado y la autorización mediante otra migración y coordinar las excepciones de repetición; nada de esto se habilita ahora.

El futuro suspensor debe adquirir **estudiante → intento**, volver a comprobar condiciones bajo esos bloqueos y cambiar el estado antes de liberarlos. El cierre actual solo procesa `activo` y no califica otro estado; el primero que finalice o suspenda excluye al otro. Si la calificación gana, la suspensión debe rechazarse. No implementar una ventana donde haya suspensión y resultado simultáneos.

## Archivos y pruebas

Frontend: `App.tsx`, `shared/contracts.ts`, `src/api.ts`, nuevos `src/assessmentTime.ts`, `src/useAssessmentClock.ts` y `src/assessmentTime.test.ts`. No se modificó `LearningRoute.tsx` en esta tarea; se conserva la implementación anterior del acordeón.

Servidor: nueva migración, cinco SQL operativos/verificaciones mencionados; `supabase/tests/assessment-clocks.test.ts`, `harness.ts`, `http-fixture.ts` y ajuste de `diagnostic.test.ts` para separar muestras de reloj de snapshots persistidos. Web: nuevo `tests/assessment-clocks.spec.ts`; `bank-journey.spec.ts`, `journey.spec.ts`, `profile.spec.ts` ajustan la confirmación de salida (ya no afirma una pausa), y `learning.spec.ts` espera a que termine la navegación. El selector equivalente se actualiza en `scripts/verify-profile-android.mjs`, sin ejecutar la prueba nativa. Documentación: este archivo, README, CONTEXTO_APEX, SUPABASE. Comandos: `package.json`, `scripts/check-migrations.mjs`. Capturas en `Docs/evidence`, bundles locales en `dist` y `dist-android`. No se añadieron dependencias.

Comprobaciones locales realizadas:

- **43/43** pruebas SQL y contador: `npx tsx --test supabase/tests/*.test.ts src/assessmentTime.test.ts`. Incluyen las duraciones de los tres controles/final, diagnóstico >30 minutos, inicio al crear, selección/respuestas recuperadas, logout, sesión bloqueada, cierre sin JWT/cliente, guardado en el instante exacto, UPSERT tardío, omisiones, entrega manual, fallo/reintento atómico, privilegios, snapshot inmutable e historial. La hora se controla en schemas/funciones exclusivos de prueba; no se esperan minutos reales.
- **19/19 casos web** (`npx playwright test`) en Edge headless contra Auth HTTP simulado y RPC PostgreSQL PGlite: controles a 1280/390 px, final manual, rechazo de confirmación tardía con contador cliente aún positivo y diagnóstico/inactividad con tiempo simulado; regresiones de acordeón a 1280/390/320 px, aprendizaje/repaso a 1280/390 px, banco, registro/recuperación, perfil e historial MVP. Capturas `Docs/evidence/apex-clock-*-web.png`. No son pantallas Android.
- `npm run typecheck`, `npm run export:web`, `npm run export:android`: compilación TypeScript y bundles web/Hermes. `npm run check:client-bank` confirma que los bundles no incluyen banco ni claves. No equivalen a construir/instalar un APK ni ejecutar Android nativo.
- `npm run check:migrations` y comparación SHA-256 de las 16 migraciones anteriores: preservadas.

PGlite ejecuta SQL PostgreSQL real, pero serializa las llamadas. Las carreras probadas incluyen solicitudes en cola y cruces exactos de tiempo INSERT/UPDATE; **no prueban contención de locks entre conexiones PostgreSQL independientes**. Pendiente en staging: dos conexiones para guardado/entrega manual frente al procesador, esperas de locks hasta después del vencimiento, lotes simultáneos `SKIP LOCKED` y, cuando se implemente, suspensión vs calificación. Comprobar que nunca se guarda tarde ni se duplican resultados/avance.

Pendientes reales: ejecución/configuración de `pg_cron` y flujo Auth en Supabase remoto, carga y latencia reales, concurrencia entre conexiones, Android nativo/primer plano/fondo/cierre de app y lector de pantalla. No hay teléfono/emulador conectado en la verificación local. El panel/suspensión administrativa quedan deliberadamente para una tarea futura.

# Asignación del diagnóstico y pantallas de Mi ruta — 11/10/2026

> Edición para el repositorio: la identidad del caso histórico se sustituyó por `REEMPLAZAR_ID_ESTUDIANTE`. No es un ID real ni un ejemplo ejecutable; los originales operativos permanecen fuera de Git. Consulta [reproducibilidad y material autorizado](REPRODUCIBILIDAD.md).

**Causa comprobada con las consultas proporcionadas por el propietario:** `demo` («Programa de demostración») solo tiene asociado `rc` («Razonamiento Cuantitativo»); no tiene `ingles` («Inglés»). `configuracion_mvp.diagnostico` ya es `apex-ingles-diagnostico-v2`, las cinco plantillas están habilitadas y la cuenta tiene cero diagnósticos. La asignación inicial exige Inglés autorizado para el programa: el resultado vacío corresponde a esa regla. No se modifica la regla ni se cambia la carrera del estudiante. Esta entrega no realizó consultas ni cambios remotos en Supabase/Storage.

El propietario aprobó que `demo` incluya Inglés como componente predeterminado del MVP. Los IDs reales confirmados son `demo`, `ingles` y `rc`. La cuenta afectada tiene tanto ID de estudiante APEX como UUID de Auth `REEMPLAZAR_ID_ESTUDIANTE`. El SQL aprobado añade exclusivamente `demo/ingles`, conserva sus componentes actuales y no asigna masivamente cuentas antiguas. Los escenarios alternativos de la tabla siguiente son reproducciones locales para comprobar las reglas; no sustituyen esta causa remota confirmada.

## Flujo comprobado y reproducción

`src/api.ts` registra mediante `auth.signUp` con nombre, fecha de nacimiento, carrera, semestre y consentimiento en metadata. El trigger `apex_alta_auth` ejecuta `alta_auth → guardar_perfil_registro → completar_perfil_guardado` en el INSERT de Auth. Guarda estudiante/consentimiento y marca el perfil completo **antes de confirmar el correo**. Iniciar sesión consulta `apex_api('me')`; no crea el perfil ni reasigna el diagnóstico. Editar un perfil ya completo tampoco vuelve a ejecutar la asignación inicial.

| Estado reproducido | Asignación/listado observado | Resolución correspondiente |
| --- | --- | --- |
| Cinco plantillas habilitadas, `configuracion_mvp.diagnostico IS NULL`, programa autorizado solo para Inglés | Perfil completo y cero evaluaciones: se usa la rama histórica de diagnósticos publicados sin plantilla; esta no selecciona la plantilla v2 | Comprobar/activar el corte explícito; transición administrativa para cuentas ya creadas |
| Configuración apunta a v2, programa sin `programa_componente = ingles` | Perfil completo y cero convocatorias v2 | Revisar autorización real del programa; después, transición para las cuentas afectadas |
| Cuenta creada antes del corte/autorización, luego configuración corregida | Editar nombre/carrera/semestre mantiene cero asignaciones | Usar la transición administrativa existente, con IDs revisados |
| Perfil pendiente o sin consentimiento guardado | No se asigna el diagnóstico al editar sin consentimiento | Completar los datos válidos guardados y aceptar el aviso; no inventar fecha ni consentimiento |
| Configuración, plantilla/banco y programa correctos al completar el perfil | Una convocatoria v2 visible en `me`, todavía sin evaluación/intento concreto | Iniciar el diagnóstico selecciona siete preguntas del banco en bloques 2+2+3; no necesita IA |
| Sesión revocada, inactiva o RPC sin permiso | Error de autorización, no una respuesta correcta con `assignments: []` | Revisar sesión/ACL; no crear asignaciones para ocultar el error |

La RPC `me` reúne asignaciones concretas del propietario y convocatorias pendientes del propietario con `id_evaluacion IS NULL`. No filtra estas últimas por programa ni por `habilitada`. Una convocatoria correctamente creada se lista antes de empezar. Se conservan las asignaciones históricas incluso después de editar el programa. Las asignaciones técnicas de repeticiones se agrupan en la convocatoria original. Inicio/recuperación comprueban propietario, perfil, sesión y prerrequisitos; no se cambiaron esas reglas.

El texto genérico anterior ocultaba estas diferencias. La migración nueva agrega `diagnosticAvailability` al resumen: `not_activated`, `program_not_authorized`, `profile_pending`, `template_unavailable`, `needs_transition`, `english_history` o `assigned`. El cliente lo muestra sin exponer configuración privada. Con las cuatro migraciones anteriores, el cliente sigue funcionando y muestra una indicación general de revisión hasta aplicar 005.

**Defecto adicional reproducido antes de corregir:** la transición original omitía diagnósticos, pero asignaba dos nuevos diagnósticos a dos cuentas con controles de Inglés existentes, uno activo con respuesta guardada y otro finalizado. Contradice la protección solicitada de todo historial de Inglés. Después de 005, esas mismas cuentas reciben cero diagnósticos; preguntas, respuestas, intentos y resultados permanecen iguales.

## Corrección adicional, pendiente de aplicación

`supabase/migrations/202610110005_diagnostic_guard.sql` es una migración nueva. No modifica las catorce anteriores, activa configuración, habilita plantillas ni rellena cuentas. Agrega:

- Protección común: diagnóstico previo asignado/convocado o cualquier intento de Inglés impide otro diagnóstico. Se usa en asignación inicial, transición administrativa y asignación administrativa directa del banco.
- Asignación inicial v2 solo con programa autorizado y diagnóstico configurado/habilitado, de siete preguntas y banco cargado. Mantiene la asignación histórica antes del corte y el comportamiento de edición sin nuevas asignaciones.
- Estado explicativo del diagnóstico en `me`, calculado solo para el propietario autenticado. Conserva el listado/RPC anterior, permisos y control de sesión. Las funciones auxiliares y la RPC antigua renombrada no se conceden a clientes.
- Bloqueo por estudiante y `ON CONFLICT`: repetir destinatarios/transición no crea otra convocatoria. No actualiza ni borra progreso, respuestas, snapshots, intentos o resultados.

No hay llamada al worker, n8n o Gemini en el registro, transición, inicio, respuesta o calificación del diagnóstico. Al finalizar puede encolarse la generación futura; eso no condiciona la conservación del resultado. Las pruebas completan el diagnóstico sin consumir ni aprobar ningún trabajo IA.

`supabase/migrations/202610110006_mvp_component_summary.sql` añade únicamente metadata de presentación: `primaryComponent` y `componentIds`. Solo considera principal Inglés si el programa ya lo autoriza y existe diagnóstico configurado. No concede autorizaciones ni crea asignaciones. La app usa ese componente para elegir el diagnóstico pendiente y el último resultado de Inicio/Mi progreso; conserva las evaluaciones de `rc`, sus botones de recuperación y todos los resultados en Historial. La prueba termina un intento histórico de `rc` después del diagnóstico de Inglés: el resultado principal sigue siendo el de Inglés y el resultado de `rc` permanece accesible. La metadata se calcula al leer; no modifica el JSON histórico de `resultado`, sus preguntas ni las selecciones.

## Mi ruta

Cada nivel presenta siete botones identificados por nivel y orden, también cuando no hay contenido. Un botón abre la página `section` de la app (`LearningSection`), separada del listado y de los materiales. La pantalla consulta de nuevo las reglas persistidas. Seleccionar una entrada bloqueada solo muestra su estado; no abre contenido ni registra inicio.

Una sección disponible muestra objetivo, explicación, ejemplos originales, práctica con orientación opcional, referencias reales, Refuerzo contextualizado y finalización explícita. Abrir registra inicio, nunca finalización. Solo el botón de finalización llama a la RPC correspondiente. Regresar, visitar Refuerzo, recargar o repetir una finalización conserva IDs, versión y progreso. La app mantiene el acceso a Refuerzo después de terminar una sección.

Si falta sección o su objetivo/explicación/ejemplos/práctica/referencias, muestra contenido pendiente y no ofrece finalizar ni Refuerzo. No inventa títulos de lecciones: usa «Contenido pendiente» y un encabezado de nivel/orden. Se conservan prerrequisitos por sección, diagnóstico antes de Básico, siete finalizaciones antes del control y aprobación del control antes del siguiente nivel. Básico ahora dice «Completa el diagnóstico para habilitar Básico».

El botón «Volver a Mi ruta» y el botón físico de Android regresan al listado. Refuerzo tiene regreso a la sección; el botón físico también vuelve a ella. En web, las secciones tienen `#mi-ruta/<nivel>/<orden>`, con atrás/adelante del navegador y recuperación tras autenticarse al recargar. Se usan componentes React Native comunes; la exportación Hermes comprueba compilación, no ejecución física de Android.

## SQL preparado y orden de ejecución pendiente

No se ejecutó ninguno de estos pasos contra el proyecto remoto. El corte v2 ya está confirmado: no repetir `transition-learning-v2.sql`, el seed, las cargas ni las migraciones aplicadas.

1. Contrastar el historial remoto y aplicar **solo si faltan**, en orden, `supabase/migrations/202610110005_diagnostic_guard.sql` y `supabase/migrations/202610110006_mvp_component_summary.sql`. Son adiciones independientes de las migraciones de aprendizaje 001–004 informadas como aplicadas. 005 protege cualquier historial de Inglés; 006 presenta Inglés como flujo principal conservando `rc`. No modificar ni volver a aplicar archivos ya desplegados.
2. Ejecutar `supabase/verify-demo-english-mvp.sql` en SQL Editor como propietario: transacción `READ ONLY` dirigida a los IDs reales. Muestra componentes de `demo`, configuración/banco, perfil/consentimiento, programa de la cuenta, historial protegido, convocatorias, intentos, resultados y ACL. Depende del helper de 005. No llama a `me` ni a ninguna RPC que registre actividad. Para inspeccionar antes de 005, usar el script anterior `inspect-diagnostic-assignment.sql` reemplazando el UUID cero por el UUID confirmado.
3. Ejecutar `supabase/authorize-demo-english-mvp.sql` como propietario. Comprueba los IDs/nombres confirmados, que `demo/rc` siga presente y que el diagnóstico v2 configurado esté habilitado con banco cargado. Inserta exclusivamente `('demo','ingles')` con `ON CONFLICT DO NOTHING`, bajo transacción y bloqueo. Se puede repetir sin duplicar la relación. No cambia configuración, carrera, componentes de otros programas, asignaciones ni historial. Si falla una comprobación, revisar el proyecto; no sustituir los IDs ni omitir la comprobación.
4. Repetir la consulta de lectura para comprobar `demo/rc` y `demo/ingles`, que la cuenta real continúa en `demo` con perfil válido y revisar `protected_english_history`. La función administrativa vuelve a comprobar estas condiciones al actuar. Una relación añadida no rellena retroactivamente perfiles completos.
5. Regularizar **solo la cuenta confirmada** con el mecanismo administrativo existente. `supabase/regularize-demo-diagnostic.sql` contiene la llamada preparada:

   ```sql
   SELECT public.apex_transition_diagnostic(
     ARRAY['REEMPLAZAR_ID_ESTUDIANTE']::text[]
   );
   ```

   Requiere un administrador APEX activo autenticado, con sesión real vigente. Un SQL Editor de propietario no tiene esa sesión por defecto y no debe ejecutar esta llamada inventando JWT/claims o saltando `actor()`. Usar la pantalla existente «Transición al diagnóstico APEX» e introducir ese único ID; alternativamente, invocar `/rest/v1/rpc/apex_transition_diagnostic` con la sesión administrativa real y cuerpo `{"student_ids":["REEMPLAZAR_ID_ESTUDIANTE"]}`. La pantalla confirma los destinatarios antes de ejecutar. La RPC devuelve `assigned: 1` si es elegible y `assigned: 0` al repetir o si ya tiene diagnóstico/historial de Inglés; tampoco asigna si el perfil/autorización no son válidos. No altera intentos de `rc` ni de Inglés.
6. Ejecutar de nuevo `verify-demo-english-mvp.sql`. Si la cuenta no tiene historial previo, comprobar una única convocatoria `apex-ingles-diagnostico-v2`. Una cuenta con historial protegido debe conservarlo sin otro diagnóstico. Verificar después en la app registro nuevo en `demo` → perfil completo → listado de Inglés → siete preguntas 2+2+3 → resultado, sin worker n8n/Gemini. Mantener también visible y recuperable el historial de `rc` y comprobar regreso físico en Android/development build.

Las secciones/tutor requieren posteriormente material educativo revisado y conexión IA real, según `APRENDIZAJE_MVP.md`. Su ausencia deja la pantalla pendiente y no impide el diagnóstico.

## Pruebas y limpieza

Las pruebas enfocadas están en `supabase/tests/diagnostic.test.ts`, `supabase/tests/demo-english.test.ts`, `tests/diagnostic.spec.ts`, `tests/mvp-demo.spec.ts` y `tests/learning.spec.ts`. Resultados concretos y límites: `VERIFICACION_APRENDIZAJE.md`. Inventario de archivos eliminados y candidatos conservados: `LIMPIEZA_APRENDIZAJE.md`.

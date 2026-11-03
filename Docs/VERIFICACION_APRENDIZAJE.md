# Verificación local — 11/10/2026

> Edición para el repositorio: la identidad del caso histórico se sustituyó por `REEMPLAZAR_ID_ESTUDIANTE`. No es un ID real ni un ejemplo ejecutable; los originales operativos permanecen fuera de Git. Consulta [reproducibilidad y material autorizado](REPRODUCIBILIDAD.md).

## Decisión aprobada para demo: Inglés principal y rc conservado

La evidencia remota fue proporcionada por el propietario: IDs `demo`, `ingles`, `rc`, configuración diagnóstica v2 y cuenta `REEMPLAZAR_ID_ESTUDIANTE` sin diagnósticos. Esta entrega no abrió una conexión remota ni ejecutó asignaciones reales. Los SQL dirigidos y el orden pendiente están en `DIAGNOSTICO_RUTA_CORRECCION.md`.

- `npm test`: **32/32** aprobadas. Los tres casos de `demo-english.test.ts` ejecutan el SQL nuevo en PGlite aislado: repetir `demo/ingles` conserva `rc`, componentes de otros programas y perfiles; la regularización actúa solo sobre el UUID confirmado, rechaza un estudiante como operador y devuelve cero al repetirse. Una identidad sintética local usa ese UUID únicamente para comprobar el SQL exacto; no es una conexión a la cuenta real. Nuevos registros reciben una convocatoria v2 y completan 2+2+3 sin respuestas del worker IA. La consulta `verify-demo-english-mvp.sql` también se ejecuta correctamente como lectura local. La autorización rechaza configuración/IDs incorrectos sin cambios parciales. Los casos de 005 siguen protegiendo diagnósticos y cualquier intento de Inglés activo/finalizado.
- El caso SQL de convivencia con `rc` recupera el intento anterior y conserva sus filas de resultado. Finalizar `rc` después de Inglés no reemplaza el resultado principal: el resumen mantiene ambos y el cliente prioriza por `componentIds`, sin inferir componentes a partir de títulos.
- Playwright: **cuatro casos enfocados aprobados**. `tests/learning.spec.ts` pasa en 1280 y 390 px: 21 botones, siete por nivel, páginas independientes, objetivo/explicación/ejemplos/práctica/referencias, Refuerzo y regreso, bloqueos, contenido ausente/incompleto pendiente, finalización explícita y conservación de las siete finalizaciones al recargar y autenticarse de nuevo en la sección. `tests/diagnostic.spec.ts` conserva el caso de configuración nula sin evaluación inventada. `tests/mvp-demo.spec.ts` registra un estudiante en `demo`, recibe Inglés automáticamente, completa siete preguntas 2+2+3, recupera la respuesta guardada de un intento histórico de `rc`, lo termina y comprueba el resultado principal de Inglés junto a ambos historiales. Sin IA, Mi ruta permanece pendiente y no permite finalizar.
- La primera ejecución conjunta aprobó tres casos y falló solo en una aserción del título del registro histórico: se esperaba «Diagnóstico de demostración» pero el seed conserva «Diagnóstico inicial». Se corrigió la aserción y se repitió únicamente `tests/mvp-demo.spec.ts`: **1/1** aprobada. No fue necesario modificar el registro histórico ni la app por ese fallo.
- `npm run typecheck`, `npm run check:migrations` y `npm run check:client-bank`: correctos. Los **15 archivos de migración existentes al iniciar esta actualización conservan exactamente sus SHA256**, incluida 005. Solo se añadió 006; no se regeneró ninguna migración aplicada ni se cambió el seed protegido.
- `npm run export:web`: **272 módulos**, versión final `index-b1c0e0c33afd89f8addc876c6ffa0304.js`. `npm run export:android`: **665 módulos**, versión final Hermes `index-b08c05c6268f8344e61586967a3dc9be.hbc`. Ambas exportaciones correctas. Las versiones intermedias `index-499bac6673cbdf91f57a08ac6915ca02.js` y `index-f4ca02ebe3646afe805b9f97ea6fc563.hbc` se sustituyeron al retirar imports sin uso.
- La comprobación adicional `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` detectó ocho imports de React sin uso y una variable de fixture no leída. Se retiraron los imports y únicamente el binding de esa variable, manteniendo la creación de identidad necesaria para la prueba. Esa comprobación ahora pasa. `npx tsx --test supabase/tests/english.test.ts`: **3/3** aprobadas después de la limpieza. `npx playwright test tests/learning.spec.ts tests/mvp-demo.spec.ts`: **3/3** aprobadas nuevamente por los cambios de imports. TypeScript y la inspección de los cinco archivos exportados también pasan sobre las versiones finales.

Capturas nuevas preservadas en `Docs/evidence/`: `demo-mvp-english-rc-history-390.png`, `diagnostic-not-activated-demo-mvp-390.png`, `route-pending-demo-mvp-1280.png`, `route-pending-demo-mvp-390.png`, `route-section-demo-mvp-1280.png` y `route-section-demo-mvp-390.png`. Los contenidos educativos visibles en las capturas son sintéticos de pruebas, no lecciones publicadas ni respuestas reales de Gemini.

Pendiente: ejecutar el SQL aprobado en Supabase con los contextos documentados, revisar el resultado de la cuenta real y probar un registro real después de la asociación. Las secciones y el tutor necesitan materiales autorizados y servicio IA real; su ausencia no impide el diagnóstico. Android compila, pero regreso físico y ejecución en dispositivo siguen pendientes. Los registros anteriores de verificación se conservan a continuación como evidencia de las etapas previas.

## Revisión posterior: asignación y pantallas independientes

Estado remoto informado por el propietario: aprendizaje 001–004 y cinco plantillas aplicadas/habilitadas. Sin consultas ni cambios remotos durante esta revisión. Resultados sobre el código final:

- `npm test`: **29/29** aprobadas. Tres casos nuevos de asignación reproducen configuración nula con plantillas habilitadas, falta de autorización, perfil/consentimiento y creación antes de confirmar el correo. Verifican transición explícita/idempotente, 2+2+3 sin IA, propietario/permisos, respuestas recuperadas e historial. La protección nueva omite controles de Inglés activos/finalizados y también la asignación administrativa directa y recuperación de perfil antiguo.
- `supabase/inspect-diagnostic-assignment.sql`: ejecutado en la prueba local con UUID existente, transacción `READ ONLY`, sin llamar a RPC que registre actividad. Sus resultados remotos siguen pendientes.
- `npx playwright test tests/learning.spec.ts tests/profile.spec.ts`: **4/4** aprobadas en 1280/390 px. Registro/edición conservan asignación/progreso. Mi ruta presenta 21 entradas, siete por nivel; pantalla independiente, bloqueos, regreso propio/atrás/adelante del navegador, Refuerzo y retorno, abrir sin completar, finalización explícita y conservación del progreso al reabrir.
- `npx playwright test tests/learning.spec.ts`: **2/2** aprobadas después de añadir el caso de una respuesta `ready` con explicación ausente. La pantalla permanece pendiente y no permite finalizar. También verifica secciones sin contenido, restricciones por sección y niveles, y conservación de los intentos tras salir/reautenticarse.
- `npx playwright test tests/diagnostic.spec.ts`: **1/1** aprobada. Registro mediante la UI con Inglés autorizado, cinco plantillas habilitadas y configuración nula: muestra «El diagnóstico de Inglés aún no está activado» y no ofrece iniciar una evaluación inexistente.
- `npm run typecheck`, `npm run check:migrations`, `node --check scripts/prepare-learning-transition.mjs`: correctos. El generador comprueba la migración de publicación existente y ya no la sobrescribe. No se ejecutó el generador para regenerar SQL aplicado.
- Exportación web: **270 módulos**, `index-4184c4254262b8499c99731682eac8b5.js`. Exportación Android/Hermes: **664 módulos**, `index-e994f6646b156481b57d5915d5553fd4.hbc`. Ambas compilaciones correctas. `npm run check:client-bank`: cinco archivos exportados comprobados, sin contenido privado del banco.

Las pruebas de Node y la primera compilación Hermes fueron bloqueadas por el sandbox con `spawn EPERM`; se repitieron autorizando los procesos locales y pasaron. Durante la reproducción inicial se corrigió una aserción que comparaba también el tiempo de actividad, que cambia legítimamente al retomar. El otro fallo previo confirmó que la transición antigua asignaba dos diagnósticos a dos cuentas con controles de Inglés; pasó tras la corrección adicional 005.

Se mantuvieron los hashes SHA256 de las cuatro migraciones de aprendizaje al inicio/final de la revisión:

| Migración | SHA256 local conservado |
| --- | --- |
| `202610110001_learning_schema.sql` | `9e1430a2ca68246c9d18eb9953318839f06d091673ab65890ad012065d59c35f` |
| `202610110002_learning_assessments.sql` | `f378bb1db9b88d1af645d46cb95ad2e192e4e94d4c9aaf5315b924d951c8d77a` |
| `202610110003_learning_publication.sql` | `bc5b775980903020c4ed23325a981a1e5a62e22f85a8d70a185d662656cf0a48` |
| `202610110004_learning_ai.sql` | `c485e590f8aac1ef0b9d261e6eded42a617fb18c17f1e326ecf38695d1481536` |

Capturas nuevas de esta revisión: `route-pending-fix-1280.png`, `route-pending-fix-390.png`, `route-section-fix-1280.png`, `route-section-fix-390.png` y `diagnostic-not-activated-fix-390.png`, todas en `Docs/evidence/`. Las evidencias editoriales y aprobaciones se conservan. Las pruebas existentes de perfil actualizan sus capturas rutinarias según su comportamiento anterior.

Límites: PostgreSQL/Auth/Storage reales, configuración y cuenta remotas, ejecución física/atrás de Android y n8n/Gemini no se verificaron. PGlite y Playwright son pruebas locales aisladas; Hermes confirma compilación. El detalle de la causa comprobada localmente y los pasos condicionados a evidencia remota están en `DIAGNOSTICO_RUTA_CORRECCION.md`.

## Registro de la entrega inicial

No hubo conexión ni modificaciones remotas. PGlite ejecuta PostgreSQL en bases temporales; Auth/Storage son esquemas o servicios simulados en pruebas. El transporte IA y las secciones sintéticas solo existen en fixtures aisladas.

Comprobaciones ejecutadas hasta la preparación de exportaciones:

- `npm run check:migrations`: hashes preservados de las migraciones anteriores y seed protegido. Cuatro migraciones aditivas nuevas.
- `npm run typecheck`: TypeScript del cliente, contratos, pruebas SQL y servidor correcto.
- `npm test`: 25 pruebas aprobadas antes de agregar el caso de actualización sobre banco ya cargado. Incluye seguridad, perfiles, historial, banco, contratos y flujo nuevo.
- `npm run test:learning`: 8 pruebas aprobadas después del ajuste de transición histórica: diagnóstico 2+2+3/bloques, recuperación y permisos, siete secciones explícitas, 6/7 y 21/22, errores/omisiones, dos chats, repaso indispensable/idempotente, nuevo intento único, LRU de todos los miembros, agotamiento auditado, referencias falsas/secretas/desactualizadas, práctica separada, leases y actualización de controles v1 sin sobrescribir resultados.
- `npx playwright test tests/learning.spec.ts tests/journey.spec.ts tests/bank-journey.spec.ts tests/profile.spec.ts`: **7 pruebas aprobadas**, web desktop/móvil, nuevo recorrido, desconexión/reautenticación, registro/confirmación/edición, control/final anteriores. Capturas nuevas: `Docs/evidence/learning-route-1280.png`, `learning-route-390.png`, `learning-review-unavailable-1280.png`, `learning-review-unavailable-390.png`.

El primer intento de `npx tsx --test supabase/tests/routes.test.ts` fue bloqueado por el sandbox con `spawn EPERM`, antes de ejecutar pruebas. Se repitió con la autorización de ejecución de procesos y pasó. Durante el desarrollo se corrigieron dos errores SQL y dos aserciones nuevas; se verificaron nuevamente los casos afectados. No hubo bloqueo pendiente de ese comando.

Resultados finales después de la transición de controles históricos:

- `npm test`: **26/26** aprobadas, incluyendo actualización sobre el banco ya cargado y conservación de resultados v1.
- `npm run test:learning`: **8/8** aprobadas, incluyendo la prueba del adaptador servidor; siete corresponden a PostgreSQL y una al transporte/validación IA.
- `npx playwright test tests/learning.spec.ts tests/bank-journey.spec.ts`: **3/3** aprobadas tras ajustar la metadata de repetición. Se repitieron esos recorridos por ese cambio concreto; registro/edición y recorridos restantes ya habían pasado en la ejecución de siete pruebas.
- `npm run export:web`: compilación local correcta, 269 módulos. Bundle `index-b28a970199d8c07a24a6daf943c030f4.js`.
- `npm run export:android`: compilación local Hermes correcta, 662 módulos. Bundle `index-332b8c62e46e8a5925b8d9ba07fc893c.hbc`.
- `npm run typecheck`, `npm run check:migrations` y `npm run check:client-bank`: correctos con el código final; cinco archivos exportados inspeccionados, sin enunciados, lecturas, IDs del banco, claves o artefactos editoriales incluidos.
- `supabase/verify-learning-v2.sql`: ejecutado correctamente en PGlite dentro de la prueba de corte explícito. Se repitió únicamente ese caso para incorporar y comprobar el SQL de lectura recién preparado.

No se volvió a ejecutar el test de Android anterior: requiere emulador/Expo Go y su alcance es registro/perfil. El flujo nuevo necesita una prueba nativa específica. La interfaz móvil comprobada con Playwright es web, no un dispositivo Android.

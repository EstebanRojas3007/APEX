# Registro y edición del perfil · 06/10/2026

El recorrido vigente es registro → confirmación de correo, si está habilitada → inicio de sesión → diagnóstico asignado. «Editar perfil» es una opción de navegación; no se abre automáticamente al autenticar ni al consultar el perfil. La fecha de nacimiento se solicita durante el registro con calendario web/Android y se muestra como solo lectura al editar.

## Persistencia y servidor

Antes, `alta_auth` creaba un usuario vacío. El cliente llamaba después a `profile` únicamente si `signUp` devolvía una sesión; con confirmación pendiente perdía ese segundo guardado. Además, el calendario de la pantalla de perfil usaba el estado del registro en lugar del perfil guardado, y el servidor prohibía cambiar carrera.

La nueva migración `supabase/migrations/202610060004_registration_profile.sql` sustituye el cuerpo del trigger existente de alta. Guarda nombre, fecha de nacimiento, carrera, semestre y consentimiento en la **misma transacción** que `auth.users`, antes de recibir una sesión y sin depender del dispositivo ni del enlace de confirmación. Valida nombre de 2–100 caracteres, fecha civil real entre 1900-01-01 y el día actual, carrera del catálogo, semestre entero de 1–20 y aceptación booleana explícita. Un error revierte el alta y sus escrituras; no hay un perfil completo parcial.

`perfil_completo` solo pasa a verdadero al comprobar los datos **ya guardados** y un consentimiento vigente. El cliente no puede escribir esa bandera. Las asignaciones iniciales se generan al completar por primera vez el registro; se conserva la unicidad por estudiante/evaluación. Se asignan los diagnósticos publicados compatibles con los componentes de la carrera, como en el flujo anterior, sin crear convocatorias del banco por editar.

La RPC pública intercepta `profile` y rechaza cualquier clave distinta de `name`, `semester` y `program`, incluida `birthDate` aunque tenga el mismo valor guardado. El propietario se obtiene de `actor()`; no admite ID de otro usuario, correo, rol, estado, consentimiento o bandera de completitud. Para docentes y administradores se conserva la edición de nombre sin modificar matrícula ni privilegios. La aceptación necesaria para cuentas antiguas usa una operación separada, `profile_consent`, que solo admite `{ "consent": true }` y valida el perfil persistido antes de completar.

Las RPC anteriores quedan privadas y sin permiso de ejecución para `anon`/`authenticated`. Las operaciones restantes delegan al API vigente para conservar roles, permisos, RLS, sesiones, evaluaciones y rutas. `start` comprueba además que existan datos válidos guardados. Cambiar nombre, semestre o carrera de un perfil completo no crea asignaciones ni modifica IDs, intentos, respuestas, resultados, snapshots, exposición de preguntas o progreso. El perfil PostgreSQL es la fuente para precargar la edición; cambios posteriores de metadata de Auth no reproducen el registro.

## Aplicación manual de la migración

No se consultó ni modificó Supabase remoto. Las nueve migraciones previas y la semilla aplicada se conservan intactas.

1. Desde `APEX`, ejecuta `npm run check:migrations` y revisa el historial/esquema con el preflight de solo lectura de [SUPABASE.md](SUPABASE.md). No repitas migraciones ya aplicadas ni uses `db reset`.
2. Si faltan dependencias, aplica **solo las pendientes**, en el orden 1–9 documentado en esa guía. Esta migración requiere el API del banco y las columnas agregadas por esas versiones. No necesita cargar ni publicar el banco de 105 preguntas.
3. Aplica el archivo completo `202610060004_registration_profile.sql` como migración **10**, una sola vez, mediante tu procedimiento habitual de Supabase/SQL Editor. Incluye `BEGIN`/`COMMIT`. Si utilizas SQL Editor, registra la nueva versión en tu historial según el procedimiento existente; no marques versiones sin ejecutar/reconciliar.
4. Revisa los avisos `Perfil … pendiente` y las cuentas que continúen incompletas. Después actualiza el cliente web/Android: la nueva interfaz requiere esta RPC restringida y el alta transaccional.
5. Con cuentas de prueba, verifica registro con y sin confirmación, nuevo login tras cerrar/reiniciar, diagnóstico asignado y edición; comprueba que fecha, permisos e historial se conserven. La confirmación real requiere SMTP/redirect de tu proyecto.

La migración recupera **una sola vez** datos válidos de metadata para identidades incompletas vinculadas explícitamente por UUID. Los valores ya persistidos tienen prioridad. No vincula por correo, no sobrescribe perfiles completos y no inventa fecha ni consentimiento. Registros del cliente anterior normalmente no incluyeron `consent` en metadata: se precargan sus datos válidos y quedan pendientes hasta que el usuario acepte el aviso en la opción «Editar perfil». No necesita volver a introducir los datos. Si falta una fecha válida o hay datos incompatibles, se mantiene pendiente y requiere revisión administrativa de identidad/datos; la edición no puede proporcionar ni corregir fecha de nacimiento.

## Verificación reproducible sin Supabase remoto

**Resultado de la entrega, 07/10/2026:** pasan 19 pruebas PostgreSQL, 6 E2E web y TypeScript. El registro y la persistencia nativos Android pasaron, incluido el calendario. La prueba Android completa está pendiente: la última ejecución encontró `UiAutomator.StaleObjectException` al navegar al diagnóstico. No se afirma haber verificado edición, reinicio, diagnóstico ni confirmación nativa. Auth/correo son simulados y PostgreSQL es local; SMTP y el build Android propio requieren comprobación posterior.

```powershell
npm run check:migrations
npm run typecheck
npm test
npm run test:e2e
npm run export:web
npm run export:android
npm run check:client-bank
```

Las pruebas de PostgreSQL cubren alta sin sesión/correo pendiente, validación y reversión atómica, rechazo de fecha/identidad/privilegios en servidor, no reproducción de metadata, conservación de intentos/respuestas/historial y recuperación conservadora de perfiles antiguos. Playwright cubre registro, confirmación simulada con enlace, recarga/nuevo login, diagnóstico y edición opcional en escritorio y pantalla móvil; verifica el payload limitado a tres campos y la ausencia de calendario en la edición.

Para la prueba **nativa pendiente**, instala el controlador con `npx playwright install android`, inicia un emulador con Expo Go compatible con SDK 57 y ejecuta `npm run test:android`. Cierra el menú inicial de desarrollo de Expo Go si aparece. Requiere puertos 54329/8092 libres y ADB en `%LOCALAPPDATA%/Android/Sdk/platform-tools/adb.exe` (o `APEX_ADB`). `APEX_ANDROID_SERIAL` selecciona el emulador, por defecto `emulator-5554`. El script inicia solo Auth simulado/PGlite y Metro con variables de prueba, usa `adb reverse`, automatiza la interfaz nativa y cierra sus servidores. Si el recorrido llega a completarse, guarda evidencia en `Docs/evidence/profile-*-android.png` y el resultado en `test-results/android-profile-result.json`; los logs/fallos se guardan en `test-results/android-*`. No prueba SMTP real ni el scheme `apex` en un development build propio; la prueba de enlace preparada usa el scheme de Expo Go.

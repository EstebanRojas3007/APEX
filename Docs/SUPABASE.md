# Conectar APEX a Supabase

**Prueba técnica aislada del reloj, preparación local del 12/10/2026:** SQL y orden exacto (`Docs/PRUEBA_TECNICA_RELOJ.md`, solo local; v?ase la gu?a de reproducibilidad). La nueva adición `202610120002` requiere los relojes anteriores; no habilita acceso. Habilitación/retirada separadas, un destinatario en servidor y preflight del diagnóstico activo. Reutiliza el cron compartido sin activar plazos académicos globales. No ejecutar asignaciones ordinarias ni modificaciones de progreso para habilitarla. Sin cambios remotos.

**12/10/2026, relojes preparados localmente:** [orden de despliegue y activación](RELOJES_EVALUACIONES.md). Aplicar únicamente `202610120001_assessment_clocks.sql` pendiente después de verificar las dependencias 005/006; no repetir aprendizaje aplicado. La migración no activa plazos. Configurar/verificar Cron cada 30 segundos, desplegar el cliente y activar mediante SQL separado. Diagnóstico sin límite; intentos anteriores no adquieren vencimientos retroactivos. Se entregan tres verificaciones de solo lectura. No se ejecutó ningún paso remoto.

**11/10/2026, actualización confirmada:** el propietario informa banco cargado, aprendizaje 001–004 aplicado, cinco plantillas habilitadas y diagnóstico v2 configurado. `demo` solo tiene `rc`; se aprobó añadir `ingles` exclusivamente a ese programa. Seguir el [SQL nuevo y su orden de ejecución](DIAGNOSTICO_RUTA_CORRECCION.md): aplicar solo adiciones 005/006 pendientes, comprobar como lectura, asociar `demo/ingles` y regularizar únicamente la cuenta confirmada con una sesión administrativa real. No repetir corte, seed, migraciones ni cargas aplicadas. No se ejecutaron cambios remotos; n8n/Gemini siguen sin conexión real verificada y no son requisito del diagnóstico. Los estados siguientes son históricos.

Actualización de registro y perfil del 06/10/2026: se entrega la migración aditiva **10**, `202610060004_registration_profile.sql`. Guarda y valida el perfil durante el alta Auth, incluso con confirmación pendiente; «Editar perfil» es opcional y limita los campos en servidor. [Instrucciones, recuperación de cuentas anteriores y pruebas](REGISTRO_PERFIL.md). Aplicar solo pendientes antes de actualizar el cliente. No se ejecutaron cambios remotos.

Actualización del 06/10/2026: además de la sexta migración preservada, se prepararon `202610060001_apex_english_bank.sql`, `202610060002_bank_assessment_api.sql` y `202610060003_individual_route_contract.sql`. Aplicar solo pendientes, después cargar `supabase/content/apex-ingles-105-v0.2.sql`; [orden, verificaciones y límites](APEX_BANCO_105.md). La carga es idempotente y no publica ni asigna; el PDF nuevo contiene soluciones y nunca se sirve a estudiantes ni al tutor. Supabase remoto/Storage no se consultaron. Los estados anteriores de esta guía se conservan como antecedentes.

Actualización: 03/10/2026. Arquitectura definitiva: Expo → Supabase Auth / RPC PostgreSQL / Storage privado. Firebase no participa. `server/` y su SQLite se conservan como referencia histórica y pruebas antiguas, sin uso por el cliente actual. No se trasladaron ni borraron sus datos.

## Estado actual comunicado por el propietario

Las cinco migraciones originales y `seed-demo.sql` ya se ejecutaron manualmente; registro, diagnóstico y resultados funcionan con Supabase real. No volver a ejecutarlas. Se conserva su hash en `supabase/applied-baseline.json`. La fuente `icfes-ingles-2018-v1` y su PDF privado ya existen. La sexta migración `202610040001_english_question_blocks.sql` está verificada localmente y pendiente en remoto según el último estado informado. Después debe aplicarse la carga separada `supabase/content/icfes-ingles-2018-draft.sql`, ya generada con las 25 preguntas transcritas y cotejadas del PDF local. Todo permanece en borrador y sin aprobación humana. Consultar [Inglés 2018](INGLES_2018.md) para orden exacto, revisión y asignación separadas. No se hicieron cambios remotos en esta entrega.

## Estado histórico de la primera entrega

- La carpeta contenía únicamente `202609280001_initial_private.sql`: 20 tablas y 3 vistas privadas. La documentación anterior la describía como preparada, no aplicada.
- No había `.env`, enlace `supabase/.temp/project-ref`, CLI Supabase, Docker ni `psql` disponibles. No se hizo ninguna conexión a tu Supabase. **El estado remoto de aplicación es desconocido**; esos indicios no prueban que no se ejecutara SQL manualmente.
- La migración original permanece byte por byte igual. SHA-256: `9874990a15c0b0a42f4c7bb9d9f7c9150aa48407fb3842944288d66154825214`. `npm run check:migrations` lo comprueba sin red. El generador antiguo ahora se niega a sobrescribirla.
- Las nuevas migraciones se ejecutaron exclusivamente en PostgreSQL local PGlite, con esquemas Auth/Storage de prueba. Ningún comando `db push`, `db reset`, despliegue o modificación remota se ejecutó.

## Antes de aplicar en tu proyecto

1. Identifica el proyecto correcto y conserva una copia de seguridad según tu procedimiento. Ejecuta **solo** `supabase/preflight.sql` en su SQL Editor: lista versiones aplicadas, tablas, columnas, políticas y bucket. También puedes usar `supabase migration list --linked` cuando hayas vinculado explícitamente el proyecto con la CLI.
2. Si `202609280001` figura aplicada, **no vuelvas a ejecutarla**. Compara el esquema existente con su contenido. Si las tablas existen sin historial porque se usó SQL Editor, confirma equivalencia y registra la línea base mediante `supabase migration repair 202609280001 --status applied` únicamente después de esa revisión. Ese comando modifica historial; no se ejecutó aquí.
3. Si falta una tabla, hay datos incompatibles, políticas ajenas o versiones parciales, detente para reconciliar mediante otra migración aditiva. No borres tablas, no resetees la base y no marques versiones arbitrariamente como aplicadas.
4. Revisa perfiles previos: `auth_user_id` es nullable para no perder usuarios históricos. No se vinculan por coincidencia de correo, ni se convierte automáticamente `uid_auth`. Un responsable debe comprobar la identidad y guardar la correspondencia UUID explícita. Una colisión de correo con un perfil antiguo requiere esa reconciliación antes del registro; no se fusionan cuentas.

Después de vincular la identidad comprobada, un intento anterior ya iniciado puede recuperarse con su mismo ID y respuestas aunque su instrumento aún no tenga el nuevo indicador de publicación. Eso no publica el banco ni crea asignaciones nuevas. Instrumentos antiguos asignados quedan congelados; para nuevos participantes se prepara una versión revisada nueva. Los resultados anteriores reciben una copia del desglose observable al migrar; no se inventa una reconstrucción de ediciones históricas anteriores a ese momento.

## Orden de ejecución

Aplicar cada archivo completo, en orden, **solo si está pendiente**. Cada migración tiene transacción: un error aborta esa migración. Usar una sola herramienta para aplicar y llevar el historial; preferir CLI una vez reconciliada la línea base.

| Orden | Archivo | Efecto |
| --- | --- | --- |
| 1 | `202609280001_initial_private.sql` | Línea base; solo en una base sin esa migración ni esquema equivalente. |
| 2 | `202610030001_identity_permissions.sql` | FK UUID a `auth.users`, perfiles pendientes, roles protegidos, asignación docente, auditoría, control de sesiones y hook de bloqueo. |
| 3 | `202610030002_versioned_content.sql` | Procedencia/documentos, revisión, tipos de pregunta, publicación validada, integridad de respuestas e instrumentos inmutables. Detecta respuestas antiguas incompatibles y aborta sin corregirlas silenciosamente. |
| 4 | `202610030003_assessment_api.sql` | RPC autorizadas, perfil recuperable, diagnóstico, guardado, calificación y resultados históricos con snapshot. |
| 5 | `202610030004_document_storage.sql` | Bucket privado, permisos restrictivos y contexto documental por página. |
| 6 | `202610040001_english_question_blocks.sql` | Nueva, pendiente: bloques originales, numeración/opciones, clasificación propuesta, asignación explícita de Inglés y exclusión de páginas de claves. No carga ni publica contenido. |
| 7 | `202610060001_apex_english_bank.sql` | Banco interno APEX, plantillas, convocatorias, versiones/snapshots, exposición y agotamiento; restricción permanente del PDF con soluciones. |
| 8 | `202610060002_bank_assessment_api.sql` | Controles 10 y final 25, selección servidor con bloques completos no vistos y recuperación del mismo intento. |
| 9 | `202610060003_individual_route_contract.sql` | Catálogo propio, contexto/contrato IA, validación y versionado de rutas; sin lecciones, reglas o conexión IA predeterminadas. |
| 10 | `202610060004_registration_profile.sql` | Alta transaccional del perfil y consentimiento, recuperación validada de cuentas pendientes y edición opcional limitada a nombre, semestre y carrera; conserva asignaciones e historial. |

Resultado físico tras la sexta migración: **26 tablas de aplicación y las 3 vistas originales** en `apex_private`; tras la novena: **38 tablas y las mismas 3 vistas**, más las tablas internas administradas por Supabase. No equivale al modelo completo. No exponer `apex_private` en Data API ni conceder SELECT sobre preguntas/opciones/vistas. Solo `public.apex_*` y Auth/Storage son interfaces del cliente.

La semilla `supabase/seed-demo.sql` es **opcional y separada**; usa las siete preguntas propias que ya existían, con `procedencia='propia_demo'`. Aplicarla una sola vez en un proyecto de desarrollo después de todas las migraciones permite el recorrido completo sin PDF. No contiene fuentes ICFES ni páginas inventadas. No se carga automáticamente ni se mezcla con contenido real. Sin catálogo/contenido publicado, la app muestra programas o diagnósticos vacíos.

## Variables y Auth

Desde `APEX`, copia `.env.example` a `.env`. Rellena desde el panel Connect del proyecto:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
EXPO_PUBLIC_AUTH_REDIRECT_URL=http://localhost:8081
```

La clave publicable es para el cliente. **No usar `service_role`, secret key ni contraseña PostgreSQL en Expo.** Habilita correo/contraseña, confirmación de correo y SMTP del proyecto. Deshabilita usuarios anónimos. Configura Site URL y allowlist de redirect: `http://localhost:8081` para web local; `apex://auth/recovery` para un development build Android con el scheme configurado. Reinicia Expo al cambiar variables. Para Android cambia el redirect en `.env`; Expo Go no sustituye la prueba del scheme en un build propio.

Ejecuta `npm run web` o `npm run android`. Registro → confirmar correo si aplica → login → diagnóstico → resultado → historial. Con la migración 10, Auth y el perfil validado se guardan en la misma transacción; no se repite el formulario. «Editar perfil» es opcional. Las cuentas antiguas sin consentimiento registrado requieren aceptarlo sobre sus datos precargados; las que carecen de datos válidos requieren revisión, como se explica en [REGISTRO_PERFIL.md](REGISTRO_PERFIL.md). Las contraseñas solo se envían a Auth. No hay tokens persistidos por la app: al recargar se inicia sesión de nuevo y se recupera el intento guardado.

Recuperación usa `resetPasswordForEmail`, enlace validado y `updateUser`; el mensaje no revela si existe el correo. El cambio desde perfil verifica primero la contraseña actual y cierra sesiones después. Probar SMTP, enlaces usados/expirados y Android en el proyecto elegido; la prueba E2E local **simula Auth y no envía correo**.

## Roles y sesiones

- Registro público: estudiante, ignorando cualquier rol enviado en metadata. No se otorgan roles mediante edición de perfil. Un único rol activo por cuenta es la decisión provisional de esta entrega; multirrol sigue pendiente.
- Docente: panel de estudiantes y resultados **solo asignados**. Sin acceso a claves ni edición de resultados. Invitación inicial mediante Auth del panel Supabase, con enlace para que establezca su contraseña; luego un administrador habilita el rol. El flujo propio de invitaciones con caducidad, reenvío, código de empleado/especialidad y auditoría completa sigue pendiente.
- Administrador: RPC `set_role` con auditoría y `assign_teacher`, lectura de resultados y carga PDF. El primer administrador requiere una actualización explícita desde SQL Editor por un desarrollador, usando el UUID verificado. No existe contraseña, cuenta predeterminada ni operación pública de autoascenso. No puede cambiar su propio rol mediante la RPC.
- Las tablas mantienen RLS y no tienen permisos DML directos del cliente. Las RPC `SECURITY DEFINER` tienen search path restringido, privilegios explícitos y autorización por `auth.uid()`; el cliente nunca elige su propietario. Las tres vistas siguen `security_invoker` y privadas.
- `sesion_actividad` valida `session_id` y existencia en `auth.sessions`. 90 s sin actividad en menú; 8 min en examen. Refrescar el JWT, leer salud o llamar `me` no renueva actividad ni levanta un bloqueo. Login nuevo genera una sesión nueva. El diagnóstico se conserva, sin calificar por desconexión. La UI avisa a los 5 min y hace cuenta atrás desde los 7.

Para habilitar el primer administrador, una vez creada y verificada su cuenta, usar una transacción revisada (sustituir el marcador por UUID real):

```sql
BEGIN;
INSERT INTO apex_private.auditoria_rol(actor,destinatario,rol_anterior,rol_nuevo)
SELECT NULL,auth_user_id,rol,'administrador'
FROM apex_private.usuario WHERE auth_user_id='UUID_VERIFICADO'::uuid;
UPDATE apex_private.usuario SET rol='administrador'
WHERE auth_user_id='UUID_VERIFICADO'::uuid;
COMMIT;
```

## Bloqueo de acceso y contraseña: límites explícitos

El hook `apex_private.password_verification_hook(jsonb)` cuenta cinco verificaciones fallidas por usuario conocido en una ventana provisional de 15 min y rechaza incluso una contraseña correcta durante los 4 min siguientes. Solo `supabase_auth_admin` lo ejecuta. Debes habilitar **Password verification attempt** en Auth Hooks, si el proyecto/plan lo admite, apuntando a esa función. `supabase/config.toml` lo deja deshabilitado hasta que existan las migraciones. Probar su comportamiento real y las rutas directas de Auth antes de uso con estudiantes. Para correos inexistentes se mantienen límites del proveedor; este hook no cuenta identidades desconocidas. La retención y prevención de abuso por IP siguen pendientes.

Configura longitud mínima 8 y categorías de caracteres en Auth. La UI comprueba mayúscula, tres dígitos y símbolo `* + - /` en alta/cambio/recuperación, pero **la configuración estándar de Supabase no impone exactamente tres dígitos ni ese subconjunto de símbolos**. El hook de verificación tampoco recibe la contraseña en claro. No se afirma cumplimiento completo en servidor de esa regla: requiere acordar una política compatible o un flujo de servidor que cierre todas las rutas alternativas de Auth. No introducir validación de contraseñas en triggers sobre hashes.

## Archivos y contenido

Bucket `materiales-estudio`: privado, 50 MiB, MIME PDF. Solo administrador activo carga; estudiantes leen únicamente fuentes asociadas a material publicado de su programa; docentes, de estudiantes asignados. Restricciones adicionales impiden que políticas permisivas previas abran este bucket. Sin sobrescritura ni eliminación por el cliente, incluso administrador: cada versión usa una ruta nueva. La API Storage y sus límites MIME/tamaño necesitan comprobación con el servicio real; la prueba PostgreSQL valida sus políticas.

Ver `CONTENIDO_DOCUMENTAL.md` e `INGLES_2018.md`: el PDF de Inglés suministrado por el propietario está en `Docs/materiales`; extracción con PyMuPDF y cotejo visual realizados, revisión humana pendiente. No se publican preguntas al subir archivos ni al cargar el SQL en borrador. No se conecta Gemini ni n8n todavía.

## Verificación local y prueba posterior de integración

```powershell
npm ci
npm run check:migrations
npm run typecheck
npm test
npm run test:e2e
npm run export:web
npm run export:android
```

`npm test` aplica todas las migraciones en PGlite (motor PostgreSQL), con fixtures mínimas de `auth`/`storage`; no usa SQLite para el nuevo dominio. `npm run test:e2e` arranca fixture Auth/REST + PostgreSQL y Expo y usa Edge invisible. El fixture nunca se usa en la app normal. No sustituye comprobar GoTrue, PostgREST, SMTP, Storage real, hooks, permisos del propietario `postgres` y concurrencia de varias conexiones en una instancia local Supabase completa o un proyecto de pruebas autorizado. `supabase/config.toml` permite preparar esa instancia cuando se instalen CLI y Docker; no ejecutar `db reset` sobre datos que se deban conservar.

Referencias oficiales consultadas: [perfiles y Auth](https://supabase.com/docs/guides/auth/managing-user-data), [React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native), [contraseñas](https://supabase.com/docs/guides/auth/passwords), [complejidad](https://supabase.com/docs/guides/auth/password-security), [hook de verificación](https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage](https://supabase.com/docs/guides/storage/security/access-control).

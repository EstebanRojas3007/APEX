# Reproducibilidad y material autorizado

Estado documental: 02/11/2026, America/Bogota. La instalación del código no autoriza operaciones sobre Supabase, Gmail, n8n ni cuentas reales. [README](../README.md) contiene instalación, arranque y variables sin secretos; [preparación de GitHub](PREPARACION_GITHUB_PRIVADO.md) contiene selección, resultados y comandos de envío.

## Funcionamiento actual e historial

El cliente Expo Android/web usa Supabase Auth, RPC PostgreSQL y Storage privado. Registro, perfil, diagnóstico, evaluaciones, rutas, seguimiento docente y administración están implementados. El código de invitaciones utiliza Auth y Gmail API según el tipo de cuenta. Las pruebas de correo son simuladas. El propietario informó anteriormente funcionamiento real y despliegue de invitaciones; esta revisión no vuelve a acreditar esos servicios ni el estado de la base. El worker IA reclama trabajos y escribe resultados; depende de configuración privada y de n8n/Gemini, cuya conexión no se certifica aquí.

`server/` y sus migraciones SQLite conservan la implementación histórica: no son el backend usado por el cliente actual. Los siete ejercicios matemáticos propios de `server/seed.ts` y `supabase/seed-demo.sql` son demostraciones históricas explícitas, no el banco reservado de Inglés. Permanecen para reproducir las pruebas y la semilla protegida. Los diagramas y documentos con fechas describen etapas del diseño; no prueban el estado remoto actual. El mockup HTML histórico permanece solo local, por falta de confirmación de sus identidades de demostración y procedencia. `Docs/CONTEXTO_APEX.md` conserva el historial y las actualizaciones fechadas.

Las 23 migraciones Supabase se conservan byte por byte, incluidas restricciones de una identidad histórica en la migración técnica del reloj. `applied-baseline.json` conserva sus declaraciones y hashes; no constituye un inventario remoto completo ni autorización para reaplicar migraciones. Los comentarios antiguos de los generadores/comprobadores pueden remitir a guías operativas locales. No ejecutar generadores sobre migraciones aplicadas.

## Instalación, configuración y compilación

Requiere Node.js >=24, npm y las dependencias exactas del lockfile:

```powershell
npm ci
```

Crea `.env` desde `.env.example` únicamente si no existe. Completa por un canal privado la URL Supabase y clave publicable del proyecto autorizado; configura el retorno Auth permitido según plataforma. Consulta las tablas de variables del [README](../README.md). Los ejemplos de IA e invitaciones tienen secretos vacíos. El remitente incorporado al código es una identidad operativa residual, no una contraseña; no se cambia en esta preparación.

```powershell
npm run web
npm run android
npm run export:web
npm run export:android
```

Ejecuta solo el comando que necesites. Android necesita dispositivo/emulador y entorno compatible; recuperación nativa requiere development build con scheme `apex`. Las exportaciones Metro no requieren bancos ni PDF locales; `app.json` no referencia iconos, fuentes o imágenes locales excluidos. El cliente obtiene el contenido de RPC, sin banco local de respaldo. Sin un backend autorizado no se reproduce una experiencia completa con datos. No hace falta arrancar SQLite, aplicar SQL ni desplegar funciones para compilar. Los compilados incorporan configuración `EXPO_PUBLIC_*` y siguen ignorados.

## Pruebas con solo el repositorio

Con `npm ci` completado, estos comandos usan código y fixtures incluidos. No requieren `.env`, material editorial privado ni acceso a servicios remotos:

```powershell
npm run check:migrations
npm run typecheck
npm run test:admin:service
node --import tsx --test server/ai/adapter.test.ts src/assessmentTime.test.ts
npm run test:legacy
node --import tsx --test supabase/tests/security.test.ts supabase/tests/profile.test.ts supabase/tests/routes.test.ts supabase/tests/admin-invitations.test.ts supabase/tests/invitation-upgrade.test.ts supabase/tests/teacher-invitation-modes.test.ts
node scripts/check-github-selection.mjs
node scripts/audit-repository.mjs --selection
```

PGlite crea PostgreSQL aislado en memoria y aplica las migraciones solo allí, usando esquemas Auth/Storage simulados. SQLite usa bases temporales; nunca abre `server/data/` en las pruebas. Los fixtures sintéticos emplean dominios de ejemplo y perfiles inventados. Las coincidencias de credenciales ficticias del auditor requieren clasificación; su salida no muestra valores. El comprobador de selección revisa imports estáticos y enlaces Markdown contra el manifiesto. Las comprobaciones de `.gitignore` se hacen aparte con Git.

`npm run typecheck:edge` necesita Deno instalado por separado. Los comandos de concurrencia requieren `psql` y bases PostgreSQL locales vacías y desechables; sus variables son `APEX_ADMIN_TEST_PG_DATABASE`, `APEX_ADMIN_TEST_PG_PORT`, `APEX_TEST_PG_DATABASE` y `APEX_TEST_PG_PORT` (estas dos últimas para docentes), más autenticación PostgreSQL local cuando corresponda. Los nombres de base deben satisfacer las restricciones del script. No usar bases de trabajo ni Supabase. La comprobación Android requiere dispositivo/emulador, ADB y preparación adicional. Estas herramientas no se instalan con `npm ci`.

## Pruebas con material privado adicional

La suite completa no es autocontenida. No sustituir los originales operativos por los ejemplos con marcadores: los tests históricos cotejan identidades y comportamientos concretos.

| Comando o pruebas | Insumo adicional |
| --- | --- |
| `npm test` | Ambos conjuntos editoriales y el paquete operativo descritos abajo |
| `apex-bank.test.ts` | Banco APEX: JSON de revisión, claves, PDF, extracción de texto y carga SQL |
| `english.test.ts` | ICFES 2018: revisión, claves, extracción y SQL; PDF para regenerar/verificar procedencia |
| `learning`, `diagnostic`, `assessment-clocks`, `teacher-interventions` | Carga SQL del banco APEX; `learning` también lee `revision.json` |
| `demo-english.test.ts` | Banco APEX y `regularize-demo-diagnostic.sql` |
| `admin-panel.test.ts` | `assign-first-admin.sql`; el resto de su fixture es sintético |
| `teacher-groups.test.ts` | Banco APEX, `assign-first-teacher.sql`, `enable-technical-clock-test.sql` |
| `technical-clock.test.ts` | Banco APEX, `enable-technical-clock-test.sql`, `withdraw-technical-clock-test.sql` |
| `teacher-summary.test.ts` | Banco APEX y `enable-technical-clock-test.sql` |
| `npm run test:e2e` | Banco APEX y habilitación técnica; Microsoft Edge y puertos libres |
| `prepare:bank`, `prepare:learning`, transcriptores y renderizadores | Material editorial de su fuente; generan archivos locales, no forman parte de la instalación |
| `check:client-bank` | `content/apex-ingles-v0.2/revision.json` y ambas exportaciones locales |

Playwright inicia el simulador Auth/RPC en `127.0.0.1:54329` y Expo web en `localhost:8091` (configurable mediante `APEX_E2E_PORT`), con variables de prueba explícitas. No apunta a Supabase real. La suite completa se conserva con sus dependencias privadas declaradas; no se han eliminado ni alterado tests para aparentar una ejecución autosuficiente.

## Incorporación del material reservado

Solicita al responsable un paquete autorizado por un canal privado separado. La autorización de uso interno del banco no implica derechos de redistribución. No descargar o reconstruir claves a partir de esta documentación; no usar datos reales de estudiantes para nuevos ejemplos.

1. Verifica con el responsable la procedencia, permisos, destinatarios y SHA-256 del paquete. Haz una copia privada de cualquier archivo local existente antes de conciliar versiones; no lo sobrescribas automáticamente. No copies `.git`, credenciales, exportaciones de usuarios ni SQLite.
2. Desde la raíz de APEX, incorpora únicamente los insumos aprobados en estas rutas ignoradas:

| Conjunto | Rutas locales |
| --- | --- |
| Banco APEX | `Docs/Materiales/APEX_Banco_Ingles_105_Preguntas_Revision_v0_2.pdf`; `content/apex-ingles-v0.2/revision.json`; `content/apex-ingles-v0.2/claves.servidor.json`; `content/apex-ingles-v0.2/evidence/automatic-text.json`; `supabase/content/apex-ingles-105-v0.2.sql` |
| ICFES 2018 histórico | `Docs/materiales/05_02_Cuadernillo_de_preguntas_ingles_Saber_Pro.pdf`; `content/ingles-2018/revision.json`; `content/ingles-2018/claves.servidor.json`; `content/ingles-2018/evidence/automatic-text.json`; `supabase/content/icfes-ingles-2018-draft.sql` |
| Revisión editorial opcional | PNG de `content/*/evidence/`, `content/ingles-2018/REVISION.md` y demás derivados aprobados, siempre dentro de las rutas ignoradas |
| Paquete operativo histórico | Los once SQL excluidos enumerados en [el informe](PREPARACION_GITHUB_PRIVADO.md), conservando sus nombres directamente en `supabase/`; para las suites bastan los cinco que leen las pruebas, pero no se ejecutan contra servicios reales |
| Guías/capturas operativas opcionales | `Docs/INVITACIONES_PROFESORES.md`, `Docs/PANEL_ADMINISTRADOR.md`, `Docs/PROFESOR_GRUPOS.md`, `Docs/PRUEBA_TECNICA_RELOJ.md`, `Docs/evidence/`; documentación local, no dependencias de compilación |

Windows trata `Materiales` y `materiales` como la misma carpeta; en sistemas sensibles a mayúsculas deben respetarse ambas rutas tal como las leen los scripts. Las extracciones Python requieren PyMuPDF externo; `prepare-pdf.mjs --extract` requiere Poppler (`pdfinfo`, `pdftotext`). No regenerar por rutina material cotejado ni la semilla/migraciones protegidas. Los generadores contienen transformaciones y metadatos, sin una copia incrustada del instrumento reservado.

3. Comprueba localmente, sin mostrar archivos, que los hashes del PDF coincidan con `source.sha256` del JSON y con el manifiesto privado entregado. Comprueba las exclusiones y repite el análisis:

```powershell
git check-ignore .env content/apex-ingles-v0.2/revision.json content/ingles-2018/claves.servidor.json supabase/assign-first-admin.sql
node scripts/check-github-selection.mjs --private-material
node scripts/audit-repository.mjs --selection
```

4. Ejecuta solo las pruebas autorizadas en entornos locales desechables. Incorporar archivos no autoriza ejecutar su SQL en Supabase ni arrancar el worker IA. Mantén el material fuera del manifiesto y nunca uses `git add -f`.

## Ejemplos operativos separados

`supabase/examples/initialize-admin.example.sql` y `initialize-teacher.example.sql` conservan verificaciones de propietario e identidad. `REEMPLAZAR_UUID_AUTH` no puede convertirse en UUID: ambos fallan antes de escribir; el ejemplo administrativo comprueba también el marcador de correo. `transition-diagnostic.example.sql` valida el ID antes de invocar la RPC y requiere una sesión administrativa real. Se comprobaron sin marcadores sustituidos en PGlite local, sin persistencia de cambios.

Son referencias para una revisión autorizada posterior; no reemplazan los archivos privados que leen las pruebas. No se ofrece una habilitación técnica genérica: la migración histórica fija una identidad, por lo que cambiar un UUID en una plantilla no basta ni justifica reescribir esa migración.

Los enlaces a guías operativas y capturas excluidas se muestran como rutas de texto marcadas «solo local». Sus originales pueden consultarse tras recibir el paquete aprobado; no se consideran enlaces disponibles en una copia del repositorio.

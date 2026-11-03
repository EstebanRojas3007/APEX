# Preparación definitiva de APEX para GitHub privado

Fecha: 02/11/2026, America/Bogota. Selección local definitiva para revisión del propietario. No se hizo staging, commit, push, creación de repositorios, invitaciones ni cambios de configuración remota. No se ejecutó SQL contra Supabase ni se enviaron correos. No se alteró lógica del cliente/backend, pruebas existentes, migraciones aplicadas, semilla protegida, `.env`, datos ni archivos operativos originales.

## Remoto comprobado en lectura

| Elemento | Resultado |
| --- | --- |
| Repositorio existente | `EstebanRojas3007/APEX`, confirmado por el propietario y mediante GET autenticado a la API de GitHub |
| Visibilidad | `private`, `private: true` |
| Rama predeterminada | `main` |
| Contenido | Vacío: API de ramas sin elementos, commits HTTP 409 y `git ls-remote origin` sin ninguna referencia, incluidas etiquetas; tamaño reportado 0 |
| Acceso utilizado | El conector GitHub devolvió 404; Git Credential Manager local permitió las consultas GET y Git de lectura. No se imprimieron ni guardaron sus credenciales |
| Configuración | `origin` ya apunta a `https://github.com/EstebanRojas3007/APEX.git`; no se cambió |
| Compatibilidad de historial | No hay historial remoto que integrar. Si aparecen referencias antes del envío, detenerse y revisar ese historial; nunca forzar |

La CLI `gh` no está instalada. No se propone instalarla ni crear otro repositorio. El 404 del conector indicaba falta de acceso de ese canal; no se interpretó como inexistencia. Las consultas de lectura no autorizan subir contenido; esta entrega solo prepara comandos.

## Selección definitiva

`Docs/GITHUB_ARCHIVOS_REVISAR.txt` es la lista explícita de **227 archivos**, en UTF-8 sin BOM, una ruta literal por línea. Incluye cliente, contratos, servidores y funciones, configuraciones, lockfile, generadores, todas las pruebas existentes, 23 migraciones Supabase y tres SQLite, semilla histórica protegida, plantillas técnicas de aprendizaje, documentación revisada y tres ejemplos SQL separados.

Se excluyen bancos, claves y material editorial, tanto originales como derivados; entornos reales, SQLite y exportaciones con perfiles/autenticación, herramientas/dependencias, compilados, logs, capturas, mockup HTML histórico y documentación operativa con identidades. Las exclusiones conservan los archivos en sus rutas originales. El mockup queda fuera porque no se certificaron sus identidades de demostración y procedencia. No es una dependencia de la aplicación.

Estos **once SQL independientes** quedan ignorados y fuera del primer commit:

- `supabase/assign-first-admin.sql`
- `supabase/verify-first-admin.sql`
- `supabase/assign-first-teacher.sql`
- `supabase/revert-first-teacher.sql`
- `supabase/verify-first-teacher.sql`
- `supabase/regularize-demo-diagnostic.sql`
- `supabase/verify-demo-english-mvp.sql`
- `supabase/enable-technical-clock-test.sql`
- `supabase/preflight-technical-clock-test.sql`
- `supabase/verify-technical-clock-test.sql`
- `supabase/withdraw-technical-clock-test.sql`

También quedan fuera `content/`, los PDF de `Docs/Materiales/` (y su variante de mayúsculas), `Docs/evidence/`, `Docs/mockups/`, `supabase/content/apex-ingles-105-v0.2.sql` e `icfes-ingles-2018-draft.sql`; las guías locales `INVITACIONES_PROFESORES.md`, `PANEL_ADMINISTRADOR.md`, `PROFESOR_GRUPOS.md` y `PRUEBA_TECNICA_RELOJ.md`; `.env*` salvo los tres ejemplos revisados; `server/data/`, bases y volcados; dependencias, salidas de Expo/Playwright y `documentos-locales/`, `.tools/`. `.git` y los puntos de control se conservan: no se copian ni se empujan sus referencias.

Los generadores incluidos leen esos insumos en tiempo de ejecución. No son una forma alternativa de distribuir el banco. Los siete ejercicios matemáticos propios de la semilla histórica se conservan como demostración explícita: son independientes del banco reservado de Inglés y necesarios para pruebas/baseline. No se creó ningún ejemplo con datos reales de estudiantes. No se añadió licencia de código abierto.

## Datos identificativos residuales

| Ubicación | Decisión y motivo |
| --- | --- |
| `supabase/functions/_shared/mail.ts:3`, `_shared/invitations.ts:50` | Remitente operativo actual intacto para conservar el comportamiento de invitaciones. No es una credencial |
| `server/admin/edge.test.ts`, `supabase/tests/admin-panel.test.ts` | Referencias al mismo remitente en pruebas de configuración/comportamiento y promoción histórica. Se conservan las pruebas sin editar |
| `supabase/migrations/202610120002_technical_clock_test.sql` | UUID histórico fijado por una restricción. Se mantiene íntegra la migración; anonimizarla rompería integridad y hashes |
| `supabase/tests/technical-clock-fixture.ts`, `teacher-groups.test.ts`, `admin-panel.test.ts`, `demo-english.test.ts` | Cuatro UUID operativos históricos reproducidos por fixtures/regresiones; no se presentan como identidades ficticias. No dan acceso por sí solos. Las pruebas usan bases locales aisladas |
| Remoto, diagramas y metadatos técnicos | Nombre del propietario/proyecto, paquete Android, fechas, IDs de fuentes, rutas Storage y hashes de documentos. No son secretos ni contienen el instrumento editorial |

La identidad del caso histórico de regularización se sustituyó por el marcador `REEMPLAZAR_ID_ESTUDIANTE` en tres documentos candidatos: `APRENDIZAJE_MVP.md`, `DIAGNOSTICO_RUTA_CORRECCION.md` y `VERIFICACION_APRENDIZAJE.md`. Las copias previas quedan solo locales. El remitente y las identidades históricas que permanecen son una decisión explícita de esta selección privada, no un pendiente ni una recomendación de rotar secretos.

`supabase/examples/initialize-admin.example.sql`, `initialize-teacher.example.sql` y `transition-diagnostic.example.sql` son referencias separadas con marcadores obligatorios. Los dos primeros fallan al convertir el marcador a UUID y el administrativo comprueba además su correo; el tercero valida el ID antes de llamar a la RPC. Los tres se probaron en PGlite con todos los marcadores originales: rechazaron la ejecución y ninguna fila de dominio cambió. No sustituyen a los originales privados leídos por tests. No se creó una habilitación técnica genérica: la migración fija una identidad histórica y no se reescribe para generalizarla.

## Reproducibilidad y referencias

[README](../README.md) documenta instalación con `npm ci`, arranque Expo, requisitos Android y todas las variables, con ejemplos sin secretos. [REPRODUCIBILIDAD](REPRODUCIBILIDAD.md) separa las suites autocontenidas de las que necesitan material editorial u operativo privado; indica rutas exactas, herramientas adicionales, hashes/procedencia y procedimiento de incorporación autorizada. Aclara SQLite histórico, Supabase actual, pruebas simuladas y límites de lo informado anteriormente por el propietario.

Se corrigieron 28 enlaces a material excluido: ahora son rutas de texto expresamente «solo local», con referencia al procedimiento autorizado. Se revisaron también imports estáticos y enlaces de archivo contra la selección final. Los comentarios de algunos scripts históricos todavía nombran documentos operativos locales; esas rutas están declaradas en la guía, no se promete que estén incluidas. Las guías antiguas conservan estados fechados: no son una orden de reaplicar SQL ni certifican el estado actual de Supabase.

`core.autocrlf` está activo localmente. Se añadió `.gitattributes` con `-text` para todas las migraciones y `supabase/seed-demo.sql`: evita conversiones de fin de línea al añadir/clonar y conserva sus bytes/SHA-256, sin cambiar los originales. El resto de la configuración de Git permanece intacta.

## Comprobaciones de esta continuación

- Copia aislada de los archivos candidatos en `.tools/github-selection-20261102/`, sin `.env`, bancos/PDF ni SQL operativos. Se usaron las dependencias ya instaladas, resueltas desde el directorio superior; no se descargaron ni reinstalaron paquetes. Es una verificación de selección sin material privado, no una certificación de instalación desde cero o de disponibilidad del registro npm.
- TypeScript de cliente/servidor correcto en la copia aislada. **50 pruebas autocontenidas correctas**: 14 de servicio de invitaciones y 36 de IA, reloj, SQLite histórico, seguridad, perfil, rutas y flujos de invitaciones PGlite. No enviaron correos ni contactaron Supabase. Los intentos bloqueados por `spawn EPERM` se repitieron con autorización fuera del sandbox.
- Exportación web correcta: 287 módulos. Exportación Android/Hermes correcta: 680 módulos; Hermes necesitó repetición autorizada por `spawn EPERM`. Se exportó sin material privado ni configuración real. Esto comprueba recursos/imports de compilación, no instalación de APK, funcionamiento en dispositivo ni conectividad real.
- Tres ejemplos SQL: fallo con marcadores y comparación de todas las filas de las tablas de dominio antes/después sin diferencias.
- `npm run check:migrations`: 23 migraciones y baseline/semilla protegidos correctos. Comparación SHA-256 adicional con el inventario inicial de esta sesión: `.env`, lógica de cliente/backend, pruebas existentes, migraciones, semilla y once originales operativos sin cambios; ningún original desaparecido.
- Selección final cotejada con `git ls-files --others --exclude-standard`: sin archivos elegibles fuera del manifiesto ni seleccionados ignorados. Las rutas esenciales de compilación están incluidas. Índice vacío y `main` sin commits.
- `node scripts/check-github-selection.mjs --private-material`: imports, enlaces y migraciones correctos; comparación con 39 archivos privados locales y 426 fragmentos de preguntas/opciones/lecturas/justificaciones, sin copias detectadas entre los candidatos. También se compararon hashes de archivos privados completos para detectar copias renombradas. Los generadores, pruebas y documentación forman parte de este cotejo.
- `node scripts/audit-repository.mjs --selection`: sin claves privadas, tokens de proveedor/GitHub, JWT completos, referencias/valores locales de entorno copiados ni credenciales reales detectadas. Las coincidencias genéricas se clasificaron como fixtures de pruebas negativas, contraseñas sintéticas de pruebas, atributo de autocompletado y remitente operativo residual. La URL con usuario/contraseña es una entrada ficticia de una prueba negativa en `server/admin/edge.test.ts`, no un servicio real.

El análisis previo de todos los objetos Git locales y PDF/OCR se conserva como antecedente en `documentos-locales/auditoria-github/`; no se borraron `.git` ni referencias Codex. No se repitió OCR de material que sigue excluido. El barrido exigido en esta continuación es sobre la selección final, que no contiene binarios. El original del informe previo, snapshots de hashes y salidas de revisión están en `documentos-locales/auditoria-github/cierre-20261102/`, ignorado y sin distribuir.

Limitaciones: los patrones y fragmentos comparados no sustituyen un detector completo por entropía; pueden escapar secretos desconocidos, codificados/fragmentados, paráfrasis o secuencias cortas de claves. Los imports dinámicos/rutas construidas necesitan revisión manual; las exportaciones complementan los imports estáticos para el cliente. No se certifican derechos sobre materiales de terceros. No se ejecutaron la suite completa/E2E con insumos privados, concurrencia PostgreSQL, Deno, dispositivo Android ni servicios reales. No se encontró un secreto privilegiado que requiera revocación; si aparece después, informar solo ubicación/categoría, excluirlo y rotarlo/revocar acceso si se expuso, antes de continuar.

Repetición local sin modificar Git:

```powershell
node scripts/check-github-selection.mjs
node scripts/check-github-selection.mjs --private-material
node scripts/audit-repository.mjs --selection
npm run check:migrations
npm run typecheck
```

El segundo comando requiere material privado local y no es obligatorio en un clon nuevo. Las suites autocontenidas y sus comandos exactos están en la guía de reproducibilidad.

## Comandos exactos del primer commit y envío: NO ejecutados

Aplican al estado comprobado: remoto existente **privado y vacío**, rama predeterminada `main`, rama local `main` sin commits, índice vacío y `origin` correcto. No crear otro repositorio ni añadir otro `origin`. Ejecutar desde `C:\Users\LEste\ProyectoReactNative\APEX`, después de revisar esta selección. Si cambia el estado, no seguir estos pasos automáticamente.

1. Revalidar en la página autenticada de `EstebanRojas3007/APEX` que siga privado. El estado de visibilidad comprobado corresponde a esta revisión. Comprobar identidad de autor localmente (no compartir su salida) y que no hayan aparecido referencias remotas:

```powershell
git status --short --branch
git config --get user.name
git config --get user.email
git remote get-url origin
$remoteRefs = @(git ls-remote origin)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo comprobar el remoto; detenerse.' }
if ($remoteRefs.Count -ne 0) { throw 'El remoto ya contiene referencias; revisar historial antes de integrar.' }
node scripts/check-github-selection.mjs
node scripts/audit-repository.mjs --selection
npm run check:migrations
npm run typecheck
```

Revisar la identidad de autor sin cambiarla automáticamente; el propietario puede elegir su correo de privacidad de GitHub. Si el remoto fuera público, detener la subida. Si tiene historial nuevo, examinarlo sin sobreescribir ni usar force push. Los comandos siguientes no se ejecutan si alguna verificación falla.

2. Añadir únicamente el manifiesto revisado y revisar el índice localmente. El primer comando sí hace staging y se deja exclusivamente al propietario:

```powershell
git --literal-pathspecs add --pathspec-from-file=Docs/GITHUB_ARCHIVOS_REVISAR.txt
if ($LASTEXITCODE -ne 0) { throw 'Staging incompleto; revisar antes de continuar.' }
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git ls-files --cached --ignored --exclude-standard
```

La última salida debe estar vacía y las rutas deben coincidir exactamente con el manifiesto. Revisar el contenido staged solo localmente, incluyendo el remitente y fixtures históricos declarados. Repetir un análisis del índice con una herramienta que oculte valores si la selección cambió. No usar `git add .`, `-A`, `-f`, copias de `.git` ni material privado. El auditor `--selection` lee archivos de trabajo, no garantiza por sí solo el contenido del índice.

3. Tras aprobar el índice, crear y verificar el primer commit:

```powershell
git commit -m "Preparar APEX para repositorio privado"
if ($LASTEXITCODE -ne 0) { throw 'No se creó el commit; no continuar al envío.' }
git show --format=fuller --stat HEAD
git ls-tree -r --name-only HEAD
```

4. Confirmar otra vez en GitHub que el repositorio siga privado y que las referencias continúen vacías; solo entonces enviar explícitamente `main`:

```powershell
$remoteRefs = @(git ls-remote origin)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo comprobar el remoto; detenerse.' }
if ($remoteRefs.Count -ne 0) { throw 'El remoto cambió; revisar historial. No forzar.' }
git push -u origin main:main
```

El push normal rechazará una actualización incompatible; no reintentarlo con `--force`, `--force-with-lease`, `--mirror`, `--all` ni refspecs amplios. Un push explícito de `main` transfiere solo sus objetos alcanzables, no los árboles históricos de `refs/codex/turn-diffs/`. Comprobar después que solo figure la selección aprobada y que la visibilidad siga privada. No invitar colaboradores ni cambiar configuraciones como parte de estos comandos.

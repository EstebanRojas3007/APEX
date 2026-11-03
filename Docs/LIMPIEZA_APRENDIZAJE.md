# Limpieza acotada — 11/10/2026

## Actualización aprobada de demo/ingles

No se eliminaron archivos fuente, migraciones aplicadas, cargas, materiales, registros de aprobación, dependencias/lockfiles ni datos de Supabase/Storage. Se conservan los archivos existentes con propósito o cambios del usuario no confirmados. `src/mvp.ts` reúne la selección principal de asignaciones/resultados usada por Inicio y Mi progreso; reemplaza la selección global anterior que podía destacar `rc` después de Inglés. Las evaluaciones y resultados históricos siguen en el listado y en Historial.

La comprobación de imports/variables sin uso retiró únicamente los imports por defecto de React en `BirthDateField.tsx`, `BirthDateField.web.tsx`, `ContextChat.tsx`, `EnglishAssignment.tsx`, `LearningRoute.tsx`, `LearningSection.tsx`, `QuestionDocument.tsx` y `StaffPanel.tsx`: JSX usa la transformación automática y se conservan los hooks importados. En `supabase/tests/english.test.ts` se retiró el binding `fresh` no utilizado, manteniendo `await identity(db,42)` y su efecto de registro. `tsc --noUnusedLocals --noUnusedParameters`, las pruebas afectadas y las exportaciones verifican esa limpieza. No se eliminó ningún archivo de esos componentes/pruebas.

Archivos eliminados automáticamente al reconstruir las exportaciones locales:

- `dist/_expo/static/js/web/index-4184c4254262b8499c99731682eac8b5.js`: bundle compilado anterior, sustituido durante la actualización de las pantallas.
- `dist-android/_expo/static/js/android/index-e994f6646b156481b57d5915d5553fd4.hbc`: bytecode compilado anterior, sustituido durante la actualización de las pantallas.
- `dist/_expo/static/js/web/index-499bac6673cbdf91f57a08ac6915ca02.js`: exportación intermedia de esta actualización, sustituida después de limpiar imports por `index-b1c0e0c33afd89f8addc876c6ffa0304.js` y su entrada actualizada en `dist/index.html`.
- `dist-android/_expo/static/js/android/index-f4ca02ebe3646afe805b9f97ea6fc563.hbc`: exportación intermedia de esta actualización, sustituida después de limpiar imports por `index-b08c05c6268f8344e61586967a3dc9be.hbc` y su entrada actualizada en `dist-android/metadata.json`.

Antes de cada exportación se comprobaron las entradas de los manifiestos y se buscaron los nombres sustituidos desde código, scripts, configuración, pruebas y documentación, incluidos archivos ocultos. Fuera de las exportaciones, solo figuraban en los registros de verificación/limpieza; esos registros se conservan como evidencia y no cargan los bundles. Los manifiestos nuevos apuntan a los reemplazos. No se efectuó borrado manual recursivo. Verificación: 32 pruebas SQL, cuatro casos de navegador, TypeScript, hashes de las 15 migraciones preexistentes, exportaciones web/Hermes e inspección de los cinco archivos exportados correctos.

Los candidatos dudosos enumerados abajo permanecen fuera de la limpieza: materiales/evidencias, cachés instaladas, herramientas de reconstrucción, servidor histórico y artefactos de verificación nativa cuando estén presentes. Las capturas nuevas de esta actualización tienen nombres propios; no sustituyen capturas de diagnóstico/Mi ruta de etapas anteriores. No se cambió el lockfile.

## Revisión posterior de diagnóstico/Mi ruta

No se eliminaron fuentes, migraciones aplicadas, SQL de carga/reconstrucción, pruebas vigentes, dependencias/lockfiles, materiales, aprobaciones ni datos de Supabase/Storage. Se conserva todo archivo cuyo estado del usuario o propósito no pueda confirmarse; no hay Git para contrastar cambios previos.

Se retiraron de `LearningRoute.tsx` el renderizado interno de la sección, los estados/imports que solo lo atendían y la apertura directa de Refuerzo. Ahora la página independiente `LearningSection.tsx` contiene esa implementación una sola vez. `src/learning.ts` reúne los nombres/estados/mensajes compartidos y la comprobación de contenido completo. El generador de aprendizaje conserva la reconstrucción y dejó de sobrescribir la migración de publicación ya aplicada.

Archivos eliminados automáticamente al reconstruir Expo:

- `dist/_expo/static/js/web/index-b28a970199d8c07a24a6daf943c030f4.js`: bundle anterior, sustituido por `index-4184c4254262b8499c99731682eac8b5.js` y el nuevo `index.html`.
- `dist-android/_expo/static/js/android/index-332b8c62e46e8a5925b8d9ba07fc893c.hbc`: bytecode anterior, sustituido por `index-e994f6646b156481b57d5915d5553fd4.hbc` y su metadata.

Antes de exportar se buscaron ambos nombres en código, scripts, configuración, pruebas y documentación, incluidos archivos ocultos. Fuera de sus exportaciones solo aparecían en los registros históricos de verificación/limpieza, que se conservan y no cargan los bundles. Los manifiestos nuevos apuntan a los reemplazos; ninguna entrada vigente requiere los anteriores. No se hizo borrado manual recursivo. Compilaciones, TypeScript, pruebas SQL/navegación y verificación del contenido exportado correctos.

Los candidatos de la entrega inicial enumerados abajo se conservan: cachés PDF con referencias en `RECORD`, logs/APK/evidencia Android, herramientas de reconstrucción y servidor histórico. Tampoco se eliminan capturas anteriores de aprendizaje, materiales ni evidencia editorial. Las pruebas existentes de perfil siguen actualizando sus capturas rutinarias; las nuevas evidencias de esta corrección usan nombres separados.

## Registro de la entrega inicial

Se revisaron referencias desde cliente, servidor, scripts, configuración, pruebas y documentación, incluyendo archivos ocultos. No se asumió que un archivo sin imports pudiera eliminarse. APEX no tiene Git conectado, por lo que se conservan los archivos previos cuyo estado o propósito no pueda confirmarse.

No se eliminó ningún archivo fuente, migración, carga, lockfile, PDF, evidencia, registro de aprobación ni base local. No se eliminaron datos Supabase ni objetos Storage.

Limpieza de código:

- `App.tsx`: eliminados el import `Profile` sin uso y los estados obsoletos `message`, `reply`, `aiConsent` y `routeStatus` con sus setters/resets. Las nuevas pantallas usan estado persistido en Supabase.
- `src/api.ts` y `src/EnglishAssignment.tsx`: retirada la llamada cliente obsoleta `assignEnglishPrograms`, reemplazada por la transición explícita APEX. Retirados el selector de programas y los imports de su implementación anterior. El componente sigue referenciado por `StaffPanel` y se conserva.
- Fixtures nuevas: se consolidaron la fuente educativa y el contenido sintético en `supabase/tests/learning-fixture.ts`, evitando duplicación entre pruebas SQL y navegador. Nunca se importan desde el cliente o worker.
- `.gitignore`: el patrón existente `.env.*` ya protege `.env.ai`; se retiró su línea duplicada y se agregó la excepción de `.env.ai.example` para conservar la plantilla sin secretos.

Candidatos conservados:

| Archivos | Motivo para conservar |
| --- | --- |
| `.tools/pdf/**/__pycache__/*.pyc` | Son cachés reconstruibles, pero existen referencias explícitas en el `RECORD` del paquete instalado. Se conserva la instalación requerida por los scripts de extracción. |
| `.expo/dev/logs/start.log`, `export.log` | Referenciados por la documentación de Expo; pueden contener diagnóstico de la sesión. |
| `test-results/android-*.log`, APK y captura de fallo | Los scripts/documentación usan estos archivos y registran verificación nativa pendiente. |
| `scripts/prepare-postgres.mjs`, transcripción/renderizado y `server/` | Sirven para reconstrucción o referencia histórica. No se eliminan por carecer de imports del cliente. |
| `Docs/diagramas-extraidos.json`, mockups, diagramas, PDFs y `content/**/evidence/` | Son materiales fuente y evidencia de revisión. |

Archivos compilados eliminados al reconstruir las exportaciones locales de Expo y reemplazar sus manifiestos:

- `dist/_expo/static/js/web/index-6d949ad1eb3a98819a2148413f1fb996.js`: bundle web de la entrega anterior, sustituido por `index-b28a970199d8c07a24a6daf943c030f4.js`.
- `dist-android/_expo/static/js/android/index-fef85dc5168034c18aea61496627cc8a.hbc`: bytecode Android anterior, sustituido por `index-332b8c62e46e8a5925b8d9ba07fc893c.hbc`.

Los dos artefactos estaban generados y referenciados únicamente por las exportaciones anteriores. Se comprobaron los manifiestos nuevos, la compilación y la ausencia de referencias a los nombres anteriores desde código, scripts, configuración, pruebas y documentación previa. Se listan aquí como registro de la eliminación. No se borraron manualmente carpetas de fuentes o datos.

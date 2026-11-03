# Banco APEX de Inglés v0.2 — entrega local, 06/10/2026

**Actualización 11/10/2026:** [diagnóstico APEX 2+2+3 y política de reutilización v2](APRENDIZAJE_MVP.md). Se preparan cinco plantillas nuevas deshabilitadas y un corte explícito; la composición final 8+7+10 se mantiene. Selecciones/resultados anteriores no se sobrescriben. La política conservadora v1 descrita abajo queda registrada como historial y se distingue de las selecciones nuevas. El propietario informa el banco cargado/verificado; no se repitió la carga en servicios reales.

Se integraron localmente **105 preguntas, 35 por nivel, 40 bloques y 475 opciones**. El cliente continúa obteniendo preguntas exclusivamente de las RPC de Supabase. El banco, sus claves, el PDF y los JSON de importación no se distribuyen dentro de los paquetes web/Android. No se ejecutó ninguna conexión o modificación remota, publicación, carga Storage ni asignación a estudiantes reales.

La instrucción del responsable aprueba este **banco interno**. Se registra esa procedencia de aprobación, sin inventar un UUID de revisor, revisión docente o aval del ICFES. La etiqueta es **«Práctica APEX alineada con Saber Pro»**. Los niveles son pedagógicos y la dificultad prevista es una hipótesis de nivel 1/2/3; no representa dificultad medida, equivalencia estadística o certificación MCER. Las 21 identidades iniciales de dos dígitos y las 84 identidades nuevas de tres dígitos se conservan literalmente. La versión del banco es `0.2`; la columna entera de versión de preguntas/bloques es `2`, como edición local v0.2, sin afirmar qué versiones de esos ítems estaban aplicadas anteriormente.

## Fuente y cotejo

- PDF localizado: `Docs/Materiales/APEX_Banco_Ingles_105_Preguntas_Revision_v0_2.pdf`.
- SHA-256: `64029a13ab63243bee806368f53c4e93af52ea129146a180240d497f4bc129ae`.
- 65 páginas físicas. El PDF imprime 07/10/2026; la preparación local se realizó el 06/10/2026. Ambas fechas se conservan diferenciadas.
- Preguntas/contextos: pp. 4–43. Claves, habilidades, justificaciones y referencias: pp. 44–58. Tablas independientes de IDs/bloques/claves: pp. 59–64. Bibliografía y enlaces: p. 65.
- Extracción PyMuPDF 1.28.2, cotejada por el asistente con las 65 páginas renderizadas; las claves también coinciden con las tablas independientes. No hubo contenido ilegible que se supliera mediante invención.
- `content/apex-ingles-v0.2/revision.json`: enunciados, opciones, niveles, habilidades, versiones, bloques completos, instrucciones, ejemplo real, lecturas, referencias y metadata documental. Los párrafos y la numeración de los espacios se conservan.
- `content/apex-ingles-v0.2/claves.servidor.json`: claves y justificaciones, **solo importación/pruebas**.
- `content/apex-ingles-v0.2/evidence/`: capa textual original y 17 láminas de revisión. Estas evidencias también contienen soluciones; acceso editorial privado.

Bucket previsto: `materiales-estudio`. Ruta del objeto:

```text
Ingles/apex/banco-preguntas/v0.2/APEX_Banco_Ingles_105_Preguntas_Revision_v0_2.pdf
```

No se comprobó que el archivo exista en Storage. Registrar una fuente no equivale a subir su objeto. El bucket permanece privado, la ruta queda restringida a administrador incluso antes de registrar la fuente y el PDF con soluciones nunca está autorizado para estudiantes o docentes. `apex_document_context` excluye toda la fuente para cualquier rol, aunque alguien marque accidentalmente fragmentos como revisados. No se crea material de estudio ni contexto del tutor desde este banco.

## Composición y capacidad

| Instrumento | Bloques completos | Preguntas |
| --- | --- | ---: |
| Diagnóstico anterior | Se conserva su selección, publicación, asignación e historial | 7 |
| Control nivel 1 | 1 vocabulario de 5 + 5 avisos de 1 | 10 |
| Control nivel 2 | 1 conversación de 2 + 2 gramática de 3 + 1 lectura literal de 2 | 10 |
| Control nivel 3 | 1 inferencial de 4 + 2 uso integrado de 3 | 10 |
| Examen final | Nivel 1: vocabulario 5 + avisos 3; nivel 2: conversación 2 + gramática 3 + lectura 2; nivel 3: inferencial 4 + uso integrado 6 | **25 (8 + 7 + 10)** |

Las cantidades sustituyen las propuestas del PDF. El diagnóstico ICFES 2018 de siete ítems y la demo histórica quedan intactos: no se sustituyen por una selección nueva ni se fragmentan más sus bloques históricos. La restricción de bloques completos se aplica a los nuevos instrumentos del banco APEX.

Las plantillas fijan cobertura por familia de habilidades, nivel y dificultad prevista. Los ítems mantienen además su habilidad específica como competencia, para desgloses y futura personalización. El servidor elige aleatoriamente bloques completos compatibles; conserva las etiquetas y el orden original dentro de cada bloque, sin barajar las opciones. No se adapta la pregunta siguiente durante el intento.

Política conservadora explícita: `solo_no_vistas-v1`. Se excluye un bloque si **cualquiera** de sus preguntas fue seleccionada antes para ese estudiante, incluso en un intento pausado o sin respuesta. La exposición usa el ID original para evitar reutilización entre versiones. No se reutilizan preguntas vistas: no existe una política de reutilización aprobada. Con el banco inicial se pueden formar como máximo dos controles completos de cada nivel por estudiante antes de que se agote alguna familia; controles y finales comparten exposición y consumen la misma capacidad. Esto no autoriza dos intentos de una evaluación ni promete variación ilimitada.

`BANK_EXHAUSTED` identifica la familia, nivel, bloques requeridos/disponibles y política. Se devuelve como error de dominio dentro de una RPC exitosa para que la auditoría en `agotamiento_banco` se confirme; el adaptador cliente muestra un error 409 comprensible. No se crea un intento, no se consume la selección parcial y no se sustituye contenido. Resolverlo requiere ampliar el banco con una versión aprobada o acordar una política nueva explícita.

La fila del estudiante y la convocatoria se bloquean durante la selección, serializando solicitudes de distintas sesiones. Cada convocatoria admite una sola evaluación concreta y un único intento. Al iniciar se guardan selección, orden, versiones y DTO sin claves en `seleccion_intento`, y exposición en `exposicion_pregunta`. Al retomar se devuelve la selección guardada. Las respuestas y la calificación siguen usando las tablas/RPC históricas, con pertenencia, opción, estado, tiempos, idempotencia y resultado persistido. No se inventaron límites totales, umbrales de avance o completados.

## Archivos y ejecución en Supabase

Inventario de implementación y revisión:

- Cliente compartido: `App.tsx`, `src/api.ts`, `src/QuestionDocument.tsx`, `shared/contracts.ts`; cantidades/títulos por asignación, recuperación, errores de agotamiento y estado de ruta pendiente. `src/supabase.ts` mantiene la conexión existente, sin cambios.
- Importación/evidencia: `scripts/extract-apex-bank.py`, `scripts/transcribe-apex-bank.mjs`, `scripts/build-apex-bank-load.mjs`, `content/apex-ingles-v0.2/`; `package.json` agrega `prepare:bank` y `check:client-bank`, sin dependencias nuevas.
- Seguridad de paquetes: `scripts/check-client-bank.mjs` inspecciona ambas exportaciones sin imprimir credenciales o claves.
- Pruebas nuevas: `supabase/tests/apex-bank.test.ts`, `supabase/tests/routes.test.ts`, `tests/bank-journey.spec.ts`. Fixtures ajustados: `supabase/tests/harness.ts`, `supabase/tests/http-fixture.ts`, `tests/journey.spec.ts`.
- Documentación vigente: este archivo, `RUTAS_IA.md`, `PROGRESO.md`, `SUPABASE.md`, `CONTEXTO_APEX.md`, `CONTENIDO_DOCUMENTAL.md`, `INTEGRACIONES.md` y `README.md`. Los documentos/diagramas históricos y `server/` se conservan.
- SQL nuevo: las tres migraciones listadas a continuación, la carga y `supabase/verify-apex-bank.sql`. Las seis migraciones anteriores, `seed-demo.sql` y la carga ICFES 2018 se conservan sin cambios.
- Artefactos locales: exportaciones actualizadas en `dist/` y `dist-android/`, y capturas móviles en `Docs/evidence/`; no son despliegues ni APK.

**No se ejecutó este orden en un servicio real.** Antes de usarlo, comprobar con `supabase/preflight.sql` el esquema y el historial del proyecto correcto. Las cinco migraciones originales y la demo están informadas como aplicadas por el propietario; sus hashes siguen intactos. No repetirlas, no resetear la base ni modificar migraciones aplicadas. La sexta continúa preservada, pendiente según la documentación previa; si también está aplicada, omitir su ejecución.

1. Aplicar `supabase/migrations/202610040001_english_question_blocks.sql` **solo si está pendiente**. Es la dependencia de bloques existente, sin cambios.
2. Aplicar `supabase/migrations/202610060001_apex_english_bank.sql`: metadata, aprobación interna, plantillas, convocatorias, snapshots, exposición, agotamiento y restricciones del PDF.
3. Aplicar `supabase/migrations/202610060002_bank_assessment_api.sql`: selección servidor, recuperación, validación de instrumentos y extensión de `apex_api`. El delegado anterior pierde permiso de ejecución cliente.
4. Aplicar `supabase/migrations/202610060003_individual_route_contract.sql`: catálogo de lecciones propias, reglas versionadas, contrato/validación de rutas y estado pendiente. No crea lecciones, reglas de avance ni completados.
5. Ejecutar `supabase/content/apex-ingles-105-v0.2.sql` desde un entorno autorizado de servidor/SQL Editor. Es una carga transaccional **idempotente**: compara los campos existentes, no actualiza ni sobrescribe versiones, rechaza conflictos y completa un estado parcial únicamente cuando cada fila existente coincide exactamente. Puede repetirse tras habilitación, intentos y resultados sin alterar sus historiales. No publica ni asigna instrumentos; las cuatro plantillas nacen deshabilitadas.
6. Si corresponde al procedimiento del responsable, subir por separado el PDF al bucket privado y a la ruta exacta, sin sobrescritura (`upsert:false`); verificar objeto, MIME/tamaño y hash. No usar URL pública ni agregarlo como material estudiantil. Esta subida no es requisito para servir las preguntas ya importadas por RPC.
7. Ejecutar `supabase/verify-apex-bank.sql` (solo lectura) y las comprobaciones posteriores descritas abajo.

La carga anterior `supabase/content/icfes-ingles-2018-draft.sql` es independiente; no forma parte de la importación del banco nuevo ni debe repetirse automáticamente. No se cambió su aprobación pendiente ni se publicó su diagnóstico.

Habilitar plantillas y asignar controles/finales queda para una acción posterior autorizada. La operación administrativa preparada es `apex_assign_bank(student_ids text[], template_id text)`: comprueba rol administrador, perfil activo, programa con Inglés y plantilla habilitada. Es idempotente y no asigna automáticamente controles al completar el perfil. No se invocó fuera de pruebas aisladas. Cada versión nueva es una nueva evaluación explícitamente asignada; no un reintento silencioso.

Para regenerar localmente la carga revisada:

```powershell
npm run prepare:bank
```

Para reconstruir evidencia/transcripción desde el mismo PDF, con PyMuPDF disponible en `.tools/pdf`:

```powershell
python scripts/extract-apex-bank.py
node scripts/transcribe-apex-bank.mjs
npm run prepare:bank
```

Los scripts no demuestran por sí mismos un cotejo visual nuevo. Si cambia el hash/PDF, realizar un nuevo cotejo y usar otra versión/IDs antes de actualizar la constancia editorial; no reutilizar una aprobación o evidencia anterior.

## Verificaciones posteriores en servicios reales

- Fuente/hash/ruta correctos; 105 preguntas, 35 por nivel, 40 bloques, 475 opciones, una clave por pregunta y cero bloques incompletos. Metadatos bibliográficos íntegros.
- Repetir la carga y verificar que no cambien fuente, opciones, convocatoria, intento, respuestas o resultados existentes. Un conflicto debe abortar toda la transacción.
- Cuatro plantillas deshabilitadas y cero convocatorias nuevas después de migraciones/carga. Catálogo de lecciones/reglas vacío en ausencia de contenido previo autorizado; ruta pendiente.
- `apex_private` fuera de los esquemas expuestos de Data API; sin permisos DML/SELECT cliente sobre banco, claves, snapshots, reglas o rutas. Verificar ACL públicas y que `apex_api_anterior` sea inaccesible.
- Bucket privado. Probar descarga/listado/firma con tokens estudiante, docente, administrador y anónimo, incluidas políticas permisivas previas. El banco con soluciones solo debe ser accesible al administrador. El contexto tutor del banco debe ser vacío para todos.
- En un proyecto de pruebas autorizado y con cuentas de prueba: asignación explícita, 10/10/10/25, bloques/etiquetas/orden completos, recuperación tras corte/reautenticación, doble inicio concurrente, intento único, calificación servidor incluyendo omisiones, agotamiento registrado y ausencia de selección parcial/reutilización.
- Comparar historiales anteriores antes/después. Probar PostgREST, GoTrue, Storage, SMTP/hook e inactividad reales y concurrencia de conexiones; PGlite no sustituye esos servicios.
- Probar Android en dispositivo/development build, recuperación Auth y desconexión. La exportación Hermes es una compilación, no una prueba física.

## Verificación local ejecutada

`npm run check:migrations`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run export:web`, `npm run export:android` y `npm run check:client-bank`. Los resultados finales y el inventario están en `PROGRESO.md`. Las pruebas PostgreSQL usan PGlite con esquemas mínimos de Auth/Storage; el E2E usa Auth simulado, la misma base temporal y Edge invisible. El fixture carga el banco real únicamente en esa base local y asigna solo cuentas ficticias con prefijo `bank-e2e-`.

No se verificaron servicios reales, presencia del PDF en Storage, concurrencia multiconexión de PostgreSQL remoto, publicación/asignación con estudiantes reales ni ejecución física Android. La conexión n8n/Gemini sigue ausente. Ver [contrato de rutas](RUTAS_IA.md).

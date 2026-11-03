# Inglés: incorporación del cuadernillo ICFES 2018

## Estado de esta entrega

Inglés es el componente confirmado del MVP; no es un programa académico. El propietario confirma que las cinco migraciones anteriores y `seed-demo.sql` están aplicadas y que registro, diagnóstico y resultados funcionan con Supabase real. No se consultó ni modificó el proyecto remoto en esta entrega.

La fuente existente es `icfes-ingles-2018-v1`, pendiente, con archivo en el bucket privado `materiales-estudio`, ruta exacta `Ingles/icfes-2018/05_02_Cuadernillo_de_preguntas_ingles_Saber_Pro.pdf`. [PDF oficial](https://www.icfes.gov.co/wp-content/uploads/2025/01/05_02_Cuadernillo_de_preguntas_ingles_Saber_Pro.pdf): Cuadernillo de preguntas, Módulo de inglés, Saber Pro, edición octubre de 2018.

**Extracción completa y cotejada visualmente por el asistente; aprobación humana pendiente.** Se utilizó el PDF local suministrado (`Docs/materiales/05_02_Cuadernillo_de_preguntas_ingles_Saber_Pro.pdf`, solo local; v?ase la gu?a de reproducibilidad), de 11 páginas. Se compararon las imágenes de páginas 1, 2 y 5–10 con la transcripción. La lectura de la página 7, ausente de la capa de texto, se transcribió directamente de su imagen; no se completaron huecos a partir de claves ni se inventó contenido. SHA-256: `3a0a6f32a09f467bf76bf5239dd9996a3c2db058fdaa94bce19232191dbcefc2`.

`content/ingles-2018/revision.json` contiene las 25 preguntas y sus 100 filas de opciones, cuatro bloques con instrucciones/ejemplos, y las dos lecturas. REVISION.md (`content/ingles-2018/REVISION.md`, solo local; v?ase la gu?a de reproducibilidad) permite leerlas sin las claves de las preguntas calificables. `claves.servidor.json` contiene las 25 claves cotejadas fila por fila con la página 10. El SQL real ya está generado en `supabase/content/icfes-ingles-2018-draft.sql`. Fuente pendiente, preguntas/bloques en borrador, responsables/fechas de revisión nulos y diagnóstico sin publicar. No se ejecutó aprobación humana alguna.

## Referencias cotejadas y disponibles para revisión humana

| Preguntas | Página del PDF | Contexto que debe conservarse |
| --- | --- | --- |
| 1–5 | 5 | Parte 2, instrucciones, ejemplo y opciones compartidas A–H. |
| 6–10 | 6 | Parte 3, instrucciones y conversaciones con opciones A–C. |
| 11–18 | 7 | Parte 4, GREEK AND ROMAN CULTURES: lectura transcrita visualmente, huecos 0 y 11–18, ejemplo y opciones A–C. |
| 19–25 | 9 | Parte 5, instrucciones y lectura de la página 8; ejemplo y opciones en página 9. |
| Claves 1–25 | 10 | Uso privado del servidor; nunca contexto del tutor. |

La paginación física coincide con la impresa en el contenido 5–10. Edición octubre de 2018 e ISBN 978-958-11-1069-8 comprobados en página 2. `visuallyChecked=true` y `extractionStatus=visually_checked_pending_human_review` describen exclusivamente el cotejo por el asistente; **no equivalen a aprobación editorial**. `humanReview` permanece pendiente con responsable/fecha nulos.

Se unieron líneas de maquetación dentro de cada párrafo y se representaron los huecos con ocho guiones bajos, conservando sus números. Para 11–18 el enunciado almacenado es el localizador `(n) ________`; la pregunta original es el hueco dentro de la lectura compartida. No se crearon enunciados independientes. Se conserva el contenido verbal de los ejemplos, incluida su respuesta 0 marcada; no se reproducen las ilustraciones decorativas ni las burbujas. El ejemplo 0 de página 7 marca A, `have`; se conserva literalmente sin corregir su concordancia. Es una observación para el revisor humano.

## Propuesta pedagógica y diagnóstico

Las partes, numeración y páginas se atribuyen al documento. Los siguientes núcleos y competencias son **propuestas de APEX**, no clasificaciones oficiales del ICFES. La base conserva `origen_clasificacion='propuesta_apex'` y la interfaz lo indica.

| Núcleo propuesto | Competencia propuesta | Selección preliminar |
| --- | --- | --- |
| Vocabulario: estados y necesidades | Interpretación léxica | 1 y 4 |
| Conversaciones cotidianas | Respuesta comunicativa pertinente | 6 |
| Gramática y cohesión en contexto | Selección gramatical y cohesión | 11 y 16 |
| Comprensión lectora: información explícita | Localización de información explícita | 21 y 24 |

La selección propuesta de siete ítems reutiliza íntegros sus contextos originales. Las preguntas 1 y 4 cubren estados/necesidades diferentes; la 6, respuesta pertinente a una preferencia cotidiana; la 11, negación y concordancia en presente; la 16, cohesión mediante relación de contraste; la 21, motivo de visita del narrador; y la 24, permanencia/cambio de una instalación. La selección y clasificación aún requieren validación pedagógica humana. Dos ítems por bloque, salvo conversaciones, dan una muestra breve; no prueban cobertura exhaustiva ni fiabilidad psicométrica. El resultado es porcentaje de aciertos de esta práctica, **no nivel MCER ni medición oficial Saber Pro**. No atribuir dificultad calibrada ni equivalencias oficiales. Las 25 preguntas se cargan como `original_pdf`; no se generaron ni adaptaron preguntas.

## Esquema e interfaz preparados

La nueva migración `202610040001_english_question_blocks.sql` agrega bloques compartidos, etiquetas y números originales, páginas de claves y origen de clasificación. Mantiene RLS, validación de publicación y congelación de bloques utilizados. La RPC del intento solo devuelve campos permitidos; las claves permanecen privadas.

Web y Android comparten `QuestionDocument`: instrucciones, lectura, ejemplo sin puntaje, opciones compartidas, referencia de página y número de hueco. Las instrucciones originales pueden referirse al bloque completo; la interfaz aclara que solo se responden los ítems asignados. El tablero encuentra evaluaciones pendientes aunque la demo ya esté finalizada, y el historial conserva el título de cada evaluación.

La clasificación `tipo_contenido` de fragmentos distingue documental/instrumento/clave. La RPC de contexto excluye instrumentos, claves y toda página registrada como página de claves, además de los bloqueos ya existentes durante intentos. La carga no crea fragmentos IA. El PDF completo contiene respuestas: no debe enviarse al tutor durante una evaluación. El JSON privado de claves y el SQL generado no se importan en Expo ni en el tutor.

## SQL que debes aplicar, en este orden

1. Conservar las cinco migraciones y la semilla ya aplicadas. `npm run check:migrations` comprueba sus hashes locales; no verifica el historial remoto. Si se usó SQL Editor, reconciliar el historial de CLI antes de un futuro `db push`, comprobando equivalencia; no reaplicar ni resetear.
2. **Primero:** [202610040001_english_question_blocks.sql](../supabase/migrations/202610040001_english_question_blocks.sql), únicamente si todavía no la aplicaste. Es la nueva migración de esquema preparada en la entrega anterior; no se modificó para esta extracción. Ejecutar el archivo completo como responsable de la base en SQL Editor, nunca con una clave privilegiada en Expo.
3. **Después:** icfes-ingles-2018-draft.sql (`supabase/content/icfes-ingles-2018-draft.sql`, solo local; v?ase la gu?a de reproducibilidad), archivo completo. Crea componente Inglés, cuatro núcleos y cuatro competencias propuestos, cuatro bloques, 25 preguntas, 100 opciones y un diagnóstico de siete ítems **en borrador**. Contiene claves privadas: no publicarlo ni enviarlo al tutor. No es necesario volver a generar el archivo entregado.
4. La carga exige la fuente existente y su ruta/URL compatibles, verifica hash/páginas si ya están registrados y completa los metadatos ausentes. Conserva título y estado de la fuente. No duplica la fuente ni modifica demo, programas, estudiantes, respuestas o resultados. Si detecta contenido ya cargado, aborta toda la transacción en vez de sobreescribirlo. No repetirla para corregir contenido: inspeccionar el estado y preparar una carga correctiva separada. Si el hash difiere, comprobar el PDF de Storage contra el local antes de continuar; no forzar metadatos.
5. Un responsable debe revisar fuente, transcripción, opciones, claves, clasificación y selección; registrar revisión y responsable; después publicar mediante una operación administrativa separada. No se automatiza esta aprobación ni hay botones de publicación en esta entrega.
6. Tras publicación, el administrador selecciona programas académicos existentes en la nueva tarjeta de asignación y ejecuta `apex_assign_english`. La operación asocia el componente Inglés a esos programas y asigna una vez el diagnóstico a estudiantes activos con perfil completo. Es idempotente. El flujo de perfil existente lo asigna a estudiantes nuevos de esos programas; repetir la operación para incorporar otros programas/estudiantes reactivados. No cambia `estudiante.id_programa` ni crea un programa llamado Inglés.

Los dos SQL solo preparan borradores; no hacen visibles las preguntas en la app. Los pasos 5 y 6 quedan para después de la revisión humana. **No se ejecutaron cambios remotos, aprobación, publicación ni asignación.** La carga real se ejecutó únicamente dentro de una prueba PostgreSQL temporal aislada, que no está conectada a la app.

## Archivos y reproducción local

- `content/ingles-2018/REVISION.md`: documento legible con todo el instrumento, sin claves de los 25 ítems.
- `content/ingles-2018/revision.json`: fuente, bloques, preguntas/opciones, notas y estado de revisión humana pendiente.
- `content/ingles-2018/claves.servidor.json`: clave privada de página 10, con registro de cotejo por el asistente.
- `content/ingles-2018/evidence/page-*.png`: páginas renderizadas para cotejo; `automatic-text.json`: capa de texto y versión del extractor. Estas evidencias incluyen la página de claves; son material editorial privado, no contexto del tutor.
- `scripts/extract-english-pdf.py`: genera evidencia desde el PDF local con PyMuPDF 1.28.2, instalado para esta tarea en `.tools/pdf`. No transcribe automáticamente la lectura ausente ni marca revisiones.
- `node scripts/render-english-review.mjs`: regenera el Markdown desde la transcripción JSON.
- `node scripts/build-english-load.mjs`: valida transcripción y hash del PDF y genera SQL sin sobrescribir una carga previa. El archivo entregado ya existe; conservarlo para revisión. Todo esto es preparación local, no una fuente de preguntas para Expo.

## Verificación y pendientes

`npm test`: siete pruebas PostgreSQL aprobadas. La prueba nueva aplica el **SQL real** únicamente en una base temporal de pruebas: verifica hash, correspondencia con JSON, 25 preguntas/100 opciones/cuatro bloques, textos, páginas y claves; fuente pendiente, revisión humana nula, siete ítems sin publicar/asignar; rechazo de metadata incompatible y carga repetida; y conservación del resultado de demo, perfil y asignaciones anteriores. No aprueba ni publica este contenido real ni siquiera en esa prueba. Las otras pruebas de permisos y publicación usan contenido sintético identificado como tal. Los tres E2E y exportaciones web/Android de la entrega anterior verificaron la interfaz con contenido sintético; no sustituyen el cotejo del PDF ni la validación humana. No hubo cambios de interfaz en esta extracción.

Pendientes: revisión humana de transcripción completa (especialmente página 7 y ejemplo 0), opciones y claves; validación pedagógica de clasificación/selección; aplicación de los dos SQL; aprobación explícita, publicación y activación por programas cuando corresponda. No se probó en dispositivo Android físico ni contra Supabase remoto en esta entrega. El editor docente de banco, OCR automatizado y tutor IA operativo siguen fuera de esta implementación. Las preguntas de la app continúan obteniéndose exclusivamente de Supabase.

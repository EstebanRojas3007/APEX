# Auditoría de arquitectura de datos de APEX

Fecha: 13/10/2026, America/Bogota. Alcance: modelo original, 18 migraciones Supabase, SQL auxiliares, contratos TypeScript, cliente y worker IA actuales. Esta entrega solo añade documentos de auditoría. No modifica fuentes existentes, migraciones, bases locales, datos, configuración ni comportamiento; no conecta con Supabase ni ejecuta las consultas adjuntas.

## 1. Justificación y diagnóstico

**Las 50 tablas definidas localmente tienen un propósito identificable. La evidencia disponible no permite recomendar la eliminación inmediata de ninguna.** Parte de la complejidad procede de garantías necesarias: instrumentos históricos, selección por bloques, exposición, repetición autorizada, decisiones pedagógicas independientes de la nota, contratos IA y plazos persistidos. El principal problema es la coexistencia y el acoplamiento de dos generaciones de rutas, sumados a funciones RPC encadenadas y requisitos originales todavía incompletos.

La correspondencia numérica es **32 originales − 11 nombres originales ausentes + 29 ampliaciones = 50 tablas locales**. Se conservan 21 nombres del modelo original. Ausencia de un nombre no significa cancelación del requisito: roles se representan parcialmente en `usuario`, y conversaciones/mensajes tienen una realización contextual limitada en el módulo de refuerzo.

El inventario remoto de 50 tablas y la retirada de la prueba técnica se aceptan como **información del usuario**, sin verificación independiente. Coincidir en cantidad no acredita nombres, columnas, restricciones, permisos, funciones ni migraciones aplicadas. Los documentos locales todavía describen la prueba como preparada sin ejecución remota; esa descripción histórica no invalida lo informado hoy ni demuestra el estado remoto actual.

No se encontraron identificadores formales de requisitos RF/RNF que permitan numerarlos. La trazabilidad de esta auditoría utiliza **archivo, sección, página/celda de diagrama y función**. No se atribuye aprobación individual a toda elección técnica: cuando la documentación registra una decisión de implementación pero no su aceptación separada, se dice expresamente. La nueva prioridad del usuario prevalece sobre la autonomía de implementación descrita en documentos antiguos.

### Hallazgos que condicionan administración

1. **Aprendizaje v1 y v2 no son duplicados semánticos completos.** V1 planifica un subconjunto de lecciones de catálogo aprobadas, con hechos de finalización y reglas autorizadas. V2 guarda contenido personalizado de siete secciones por nivel, finalización declarada, tutor contextual y repetición tras repaso. No existe una equivalencia automática entre sus progresos.
2. **V2 todavía depende de v1.** `contexto_generacion()` extrae las métricas diagnósticas mediante `contexto_ruta()`. `apex_my_route()` expone `validatedVersion` de `ruta_version` y `completedLessons` de `progreso_leccion`. El contrato v1 continúa disponible para `service_role`. El worker actual solo consume v2; no se encontró un llamador de producción local del agente v1.
3. **Separar snapshot y ejecución es correcto.** `solicitud_ruta` es una solicitud académica inmutable de v1; `trabajo_ia` es una cola mutable de v2, con lease, recuperación y resultados. Fusionarlas por parecido nominal destruiría garantías diferentes.
4. **Nota, avance y reloj son hechos distintos.** `resultado` guarda calificación; `decision_avance` interpreta una regla pedagógica; `reloj_intento` conserva una política temporal por intento y errores de procesamiento. Mantenerlos separados evita recalificación o plazos retroactivos.
5. **Retirar la prueba técnica revoca acceso, pero conserva clasificación e historial técnico.** Las exclusiones dependen del marcador `prueba_reloj_tecnica` incluso deshabilitado. Suprimirlo convertiría esas filas, a ojos de varias consultas, en actividad académica.
6. **La administración ya tiene una implementación básica.** `StaffPanel` y RPC permiten consultar estudiantes/resultados autorizados, cambiar roles con auditoría, asignar docentes y realizar la transición diagnóstica. Falta la administración completa: invitaciones propias, vigencias, tutorías, retroalimentación, retención y recuperación/suspensión de intentos.
7. **El versionado de rutas v2 está preparado en tablas, pero la regeneración no está implementada.** `solicitar_nivel()` usa una clave única terminada en `:v1`; `apex_ai_finish()` inserta `version=1` sin `id_anterior`. No se debe ofrecer un botón administrativo de “regenerar” suponiendo que la cadena de versiones ya funciona.
8. **Las citas y el modelo real del chat no cumplen todavía todo el original.** Las referencias de una respuesta v2 permanecen en `trabajo_ia.respuesta`; `mensaje_refuerzo` almacena texto y vínculo al trabajo, y `chat_json()` proyecta texto/fecha. El contrato `GeneratedChat` no devuelve metadata de proveedor/modelo. No equivale a `CITA_FUENTE` ni a `MENSAJE.modelo_utilizado` plenamente implementados.
9. **Las FK no expresan todas las dependencias.** Prerrequisitos y referencias de lecciones/secciones están en arrays/JSON con validación servidor. El chat encuentra su sesión analizando `trabajo_ia.clave`; no tiene una FK directa trabajo→sesión. También existen dependencias en cuerpos PL/pgSQL, políticas Storage y consumidores externos que no se deducen solo de `pg_depend`.
10. **Hay duplicación informativa intencionada que necesita verificarse.** `resultado.detalle`, decisiones, DTO de selección y comienzo del reloj son snapshots o proyecciones; no se deben sobrescribir para “normalizar”. `decision_avance` referencia al intento, no directamente a `resultado`, y replica aciertos/total. Su coherencia depende del flujo transaccional y debe comprobarse.

## 2. Evidencia y grado de certeza

| Fuente | Qué demuestra | Qué no demuestra |
| --- | --- | --- |
| [Modelo relacional original](../diagrams/APEX_Modelo_Relacional_v1.drawio), 9 páginas, versión interna 1.1 | 32 tablas y 3 vistas; nombres, atributos y reglas originales | Que todas las funciones estén implementadas o aprobadas definitivamente |
| [Clases](<../diagrams/Diagrama_de_clases_APEX_v2 (1) (1).drawio>), celdas `class_ruta`, `class_modulo`, `class_progreso`; [casos de uso](<../diagrams/Casos_de_uso_APEX_v2 (1) (1).drawio>), `uc_generate_route`, `uc_view_route`, `uc_chat_ai` | Rutas adaptativas, progreso y tutor estaban en el alcance documental, aunque no en las 32 tablas | Reglas concretas de siete secciones, umbrales, repetición o conexión IA real |
| [CONTEXTO_APEX](../CONTEXTO_APEX.md), §§4–11 y actualizaciones fechadas | Decisiones acordadas/documentadas, prioridad de Supabase y límites del MVP | Evidencia remota independiente ni aceptación separada de cada detalle técnico |
| [Migraciones](../../supabase/migrations/) | Esquema y funciones previstos si se aplica la secuencia completa | Aplicación remota, activación de plantillas/relojes/hook o ejecución de cron |
| [applied-baseline.json](../../supabase/applied-baseline.json) y [check-migrations.mjs](../../scripts/check-migrations.mjs) | Hashes protegidos de cinco migraciones/semilla; reporte histórico del propietario | Libro completo de aplicación remota; migraciones manuales pueden no estar en CLI |
| [src/api.ts](../../src/api.ts), [StaffPanel](../../src/StaffPanel.tsx), [contratos](../../shared/contracts.ts) | Operaciones que el cliente puede solicitar y proyecciones esperadas | Uso efectivo por usuarios reales ni despliegue de esa versión |
| [Worker](../../server/ai/worker.ts), [adaptador](../../server/ai/adapter.ts) | Consumidor v2 implementado y validación local de transporte/contratos | Configuración, ejecución de n8n/Gemini, calidad pedagógica o consentimiento externo adecuado |
| `supabase/tests`, `tests`, `server/ai/adapter.test.ts` | Escenarios de verificación disponibles para una migración posterior | Pruebas ejecutadas durante esta auditoría; no se corrieron ni se aplicaron migraciones a una base temporal |

Se revisó directamente el XML del Draw.io, no solo resúmenes. Se recorrieron las migraciones en orden, incluyendo `ALTER FUNCTION ... RENAME` y reemplazos: las funciones `*_pre_*` siguen siendo dependencias internas cuando las llama la fachada actual. Una aparición en pruebas, una carga opcional o un cuerpo antiguo interceptado no se registra como actividad real del cliente.

Referencias directas para reproducir los hallazgos:

| Hallazgo | Evidencia de implementación |
| --- | --- |
| Identidad, roles, sesiones y bloqueo | [identity_permissions.sql](../../supabase/migrations/202610030001_identity_permissions.sql), tablas líneas7–24; `actor`, `password_verification_hook`; [assessment_api.sql](../../supabase/migrations/202610030003_assessment_api.sql), ramas `set_role`, `assign_teacher`, `students`; [registration_profile.sql](../../supabase/migrations/202610060004_registration_profile.sql) |
| Material, fuentes y claves privadas | [versioned_content.sql](../../supabase/migrations/202610030002_versioned_content.sql), [document_storage.sql](../../supabase/migrations/202610030004_document_storage.sql), [apex_english_bank.sql](../../supabase/migrations/202610060001_apex_english_bank.sql), `material_autorizado`, `archivo_autorizado`, `apex_document_context` |
| Forma/selección/exposición y repetición | [bank_assessment_api.sql](../../supabase/migrations/202610060002_bank_assessment_api.sql), `guardar_seleccion_intento`; [learning_assessments.sql](../../supabase/migrations/202610110002_learning_assessments.sql), `seleccionar_forma`, `iniciar_banco`, `registrar_avance`; [transition-learning-v2.sql](../../supabase/transition-learning-v2.sql), backfill de decisiones |
| Contrato v1 y ausencia de ejecutor | [individual_route_contract.sql](../../supabase/migrations/202610060003_individual_route_contract.sql), tablas líneas4–43, `contexto_ruta` línea77, APIs agente líneas89/98, inserción de pasos y retorno final |
| V2 depende de v1, metadatos y versión1 | [learning_ai.sql](../../supabase/migrations/202610110004_learning_ai.sql), `contexto_generacion` línea27, `chat_json`34, `apex_my_route`153, claim169, finish187; [learning_schema.sql](../../supabase/migrations/202610110001_learning_schema.sql) |
| Diagnóstico/corte y protección de historial | [diagnostic_guard.sql](../../supabase/migrations/202610110005_diagnostic_guard.sql), [mvp_component_summary.sql](../../supabase/migrations/202610110006_mvp_component_summary.sql) |
| Políticas de plazo y calificador único | [assessment_clocks.sql](../../supabase/migrations/202610120001_assessment_clocks.sql), configuración6, snapshot13, calificador93, scheduler139, barrera155 y fachada170 |
| Exclusión técnica permanente | [technical_clock_test.sql](../../supabase/migrations/202610120002_technical_clock_test.sql), marker6, clasificadores24/27, guards31–48, vistas70–83, historiales84–99 y fachada166; withdraw-technical-clock-test.sql (`supabase/withdraw-technical-clock-test.sql`, solo local; v?ase la gu?a de reproducibilidad) |

Las referencias de línea describen estos archivos locales, no el SQL remoto ni una migración aplicada. Los rangos aquí sirven para lectura documental; el JSON incluye una línea exacta de creación por tabla.

**“Lectura/escritura real” en la matriz significa un camino implementado alcanzable en el código local actual**, no un evento observado en Supabase. Se distingue escritura de aplicación, servidor, preparación/importación y fixture. Para comprobar actividad efectiva remota harían falta las consultas adjuntas y, cuando corresponda, registros de ejecución del propietario; la cantidad de filas por sí sola no establece uso.

### Inventario acumulado local

| Migración o grupo | Tablas nuevas | Acumulado |
| --- | ---: | ---: |
| `202609280001` dominio inicial | 20 | 20 |
| `202610030001` identidad/permisos | 4 | 24 |
| `202610030002` fragmentos documentales | 1 | 25 |
| `202610030003`, `004` | 0 | 25 |
| `202610040001` bloques | 1 | 26 |
| `202610060001` banco | 6 | 32 |
| `202610060002` API banco | 0 | 32 |
| `202610060003` rutas v1 | 6 | 38 |
| `202610060004` registro/perfil | 0 | 38 |
| `202610110001` aprendizaje v2 | 9 | 47 |
| `202610110002`–`006` | 0 | 47 |
| `202610120001` relojes | 2 | 49 |
| `202610120002` prueba técnica | 1 | 50 |

El momento en que el acumulado llegó a 32 no corresponde a completar el modelo original. Las tres vistas académicas se cuentan aparte; tampoco se cuentan tablas administradas de `auth`, `storage`, `cron`, historial CLI ni las tablas SQLite históricas. El cliente actual no usa `server/service.ts` ni `server/data/apex.sqlite`; su conservación es un asunto separado de las 50 tablas PostgreSQL.

## 3. Matriz de las 50 tablas actuales definidas localmente

Convenciones: **C** conservar; **V1** conservar contrato/catálogo/historial y delimitar su ámbito; **H** conservar evidencia y exclusiones técnicas; **O** consolidación opcional posterior, nunca aprobada por esta auditoría. `→` identifica FK saliente; “usada por” indica dependencia funcional o entrante relevante. El [inventario local](inventario-local.json) contiene todas las FK salientes/entrantes detectadas y las líneas de creación. Las dependencias remotas se deben contrastar antes de cualquier propuesta estructural.

### Organización e identidad: 11 tablas

| Tabla / propósito | Equivalente original | Requisito o decisión que justifica | Lecturas y escrituras implementadas | Dependencias y propuesta |
| --- | --- | --- | --- | --- |
| `programa_academico`: carreras | `PROGRAMA_ACADEMICO`, p.02 | Registro académico y autorización por programa; CONTEXTO §§3,6 | L: `apex_catalog`, validadores de perfil, panel docente. E: semilla/importación administrada; sin editor de catálogo actual | Referenciada por `estudiante`, `programa_componente`. **C**; Inglés es componente, no una carrera sustituta |
| `componente`: áreas evaluadas | `COMPONENTE`, p.02 | Organización del aprendizaje; Inglés MVP y RC histórico | L: clasificación, evaluación y autorizaciones mediante relaciones. E: cargas/semilla, sin CRUD cliente | Referenciada por competencias, núcleos y puentes de programa/evaluación. **C** |
| `programa_componente`: habilitación N:M | `PROGRAMA_COMPONENTE`, p.02 | Material/evaluaciones por programa; decisión documentada y aprobación explícita de `demo/ingles` en DIAGNOSTICO_RUTA_CORRECCION | L: alta, transición, asignación banco, material/contexto IA y componente principal. E: seed y SQL administrativo dirigido; editar perfil no crea autorización | → programa/componente; sin hijos FK, pero central para permisos. **C**; no eliminar aunque tenga pocas asociaciones |
| `competencia`: habilidad evaluada | `COMPETENCIA`, p.02 | Métricas por competencia y personalización; clasificación APEX diferenciada de oficial | L: DTO, desgloses, v1/v2, validación IA. E: importación/seed; taxonomía usada en instrumentos/banco se protege | → componente; hijos pregunta, lección, sección. **C**; cardinalidad múltiple por pregunta sigue condicionada al banco futuro |
| `nucleo_tematico`: temas | `NUCLEO_TEMATICO`, p.02 | Progreso por núcleo y vínculo material/programa | L: resultados, materiales y permisos/contexto. E: cargas; protegido si ya participa en banco/instrumentos | → componente; hijos pregunta y material_nucleo. **C**; no es equivalente a competencia |
| `usuario`: identidad de dominio/perfil/rol | `USUARIO`, p.01; absorción parcial de `DOCENTE`/`ADMINISTRADOR` | Supabase Auth definitivo, rol único actual, registro público estudiante; CONTEXTO §§4–6 y REGISTRO_PERFIL | L: `actor`, perfil, permisos y worker. E: trigger `alta_auth`, recuperación de perfil, `profile`, `set_role`; sin contraseña | → `auth.users` UUID RESTRICT; hijos estudiante, consentimiento, sesión, asignación docente. **C**; no vincular históricos por correo. Atributos especializados y multirrol pendientes |
| `estudiante`: matrícula | `ESTUDIANTE`, p.01 | Carrera y semestre obligatorios; edición opcional sin modificar historiales | L: toda pertenencia y autorización académica. E: alta validada, recuperación conservadora, `profile` | → usuario/programa; hijos asignaciones, intentos indirectos, rutas, IA/progresos. Fila usada como lock de serialización. **C** |
| `consentimiento`: hechos de aceptación | `CONSENTIMIENTO`, p.01 | Aviso y registro de aceptación, privacidad; relacional p.09 y CONTEXTO §11 | L: completitud de perfil; E: registro y `profile_consent` para antiguos. No hay flujo completo de revocación/retención ni consentimiento IA específico acreditado | → usuario; sin hijos FK. **C**; no reducir a booleano ni asumir que `perfil-y-evaluacion` autoriza automáticamente uso externo |
| `asignacion_docente`: ámbito docente | `ASIGNACION_DOCENTE`, p.07, parcial | Docente solo consulta asignados; CONTEXTO §5 | L: `puede_leer_estudiante`, panel y permisos documentales. E: RPC `assign_teacher`, inserción idempotente | → usuario docente/estudiante. PK pareja actual; faltan ID, asignador, fechas, estado y vigencias originales. **C** y ampliar después si se aprueba administración de vigencias; cambiar rol no borra la pareja |
| `auditoria_rol`: cambios de rol | Sin tabla idéntica; responsabilidad administrativa p.01/p.09 | Gestión de permisos auditada; SUPABASE §roles. Implementación técnica documentada, sin aceptación individual adjunta | L: SQL administrativo/verificación; panel actual no lista auditoría. E: `set_role`; primer administrador por procedimiento explícito | UUID de actor/destinatario **sin FK**; relación lógica con Auth/usuario. **C**; preservar registro aunque no tenga lector UI; falta endurecimiento append-only y política de retención verificable |
| `sesion_actividad`: inactividad/estado de sesión | No equivale a `EVENTO_ACCESO` | 90 s en menú y 8 min en evaluación; relacional p.09 `txt7`, CONTEXTO §§6–7 | L/E: `actor` crea si falta y bloquea fila; actividad/start/answer/finish/logout actualizan ámbito/fecha/cierre. Consultar RPC no es lectura pura por este motivo | → auth.sessions CASCADE, usuario. **C**; separada de plazos de evaluación y del historial de accesos |

### Seguridad, fuentes y material: 5 tablas

| Tabla / propósito | Equivalente original | Requisito o decisión que justifica | Lecturas y escrituras implementadas | Dependencias y propuesta |
| --- | --- | --- | --- | --- |
| `bloqueo_auth`: ventana de fallos | Sin equivalente directo; `EVENTO_ACCESO` es histórico, no contador | Cinco fallos/4 min; ventana provisional de 15 min en CONTRASTE_DOCUMENTAL | L/E/DELETE: `password_verification_hook` incrementa/reinicia y elimina al éxito. Depende de activar el hook externo; auditoría no lo confirma | → auth.users CASCADE; ningún hijo. **C**; no sustituir por sesión ni afirmar protección remota sin verificar hook |
| `fuente`: procedencia/PDF/autorización | `FUENTE`, p.03 | Trazabilidad documental, Storage privado y separación entre educación e instrumentos con claves | L: publicación, permisos, DTO, referencias, IA. E: importaciones/manifiesto administrado; no se encontró CRUD general cliente; banco/instrumentos congelan cambios | Hijos material, pregunta, bloque, fragmento, carga, plantilla; vínculo lógico `ruta_archivo`→storage.objects. **C**; mantener hash, páginas, revisión, restricciones y versiones |
| `material_estudio`: contenido publicable | `MATERIAL_ESTUDIO`, p.03 | Estudio con material autorizado por programa; CONTEXTO §8 | L: `apex_materials`, autorización Storage, `fuentes_ia`. E: seed/carga/revisión administrativa; no editor completo actual | → fuente; hijo material_nucleo. **C**; una fuente principal es decisión de simplificación original, no veto a bibliografía múltiple futura |
| `material_nucleo`: clasificación N:M | `MATERIAL_NUCLEO`, p.03 | Organización y autorización material→núcleo→componente→programa | L: materiales y contexto/documentos. E: cargas/seed | → material/núcleo. **C**; retirar el puente altera permisos, incluso si IA obtiene un JSON final |
| `fragmento_documental`: extractos revisados | Sin tabla idéntica; soporte de `FUENTE`/citas p.08 | PDF/página verificables y contexto educativo sin claves; CONTENIDO_DOCUMENTAL/APRENDIZAJE_MVP | L: `apex_document_context`, `fuentes_ia`, validación de referencias. E: extracción/carga/revisión, no el modelo IA ni el cliente; `validar_fragmento` verifica página | → fuente; referencias desde JSON IA sin FK. **C** aunque falte material habilitado; no confundir con citas efectivamente emitidas |

### Preguntas, instrumentos y asignaciones: 9 tablas

| Tabla / propósito | Equivalente original | Requisito o decisión que justifica | Lecturas y escrituras implementadas | Dependencias y propuesta |
| --- | --- | --- | --- | --- |
| `pregunta`: pregunta versionada y clasificación | `PREGUNTA`, p.04 | Banco revisado; una fuente/núcleo/competencia y única respuesta en MVP | L: selector, DTO, calificación, métricas y validación de práctica independiente. E: carga editorial/seed; inmutable cuando aprobada/usada | → fuente/núcleo/competencia/bloque y auth.users revisor. Hijos opciones/items/selección/exposición. **C**; claves/justificación privadas, sin banco local cliente |
| `opcion_respuesta`: opciones y clave privada | `OPCION_RESPUESTA`, p.04 | Calificación objetiva servidor y opciones ordenadas | L: DTO sin `es_correcta`, validador, calificador/contexto de errores. E: cargas; protección de banco/instrumento | → pregunta; hijo respuesta. **C**; no fusionar con DTO ni enviar claves al tutor |
| `bloque_preguntas`: contexto y unidad indivisible | Sin tabla en las 32; extensión de instrumento p.04 | Lecturas/instrucciones/opciones compartidas; decisiones INGLES_2018/APEX_BANCO_105 | L: DTO y selección/publicación por bloques completos. E: cargas editoriales versionadas | → fuente/revisor Auth; hijos preguntas y selección. **C**; integridad de composición y orden depende de ella |
| `carga_banco`: registro privado de importación/aprobación | Sin equivalente directo | Banco 105, cotejo y aprobación **interna** documentada; importación idempotente | L: publicación, selector, protección del banco, separación práctica/banco. E: carga preparada; guarda checksum, contenido/claves originales y aprobación; inmutable | → fuente; sin hijos FK, numerosos triggers/funciones la usan. **C** aunque tenga una fila; no borrar ni atribuir aprobación docente/ICFES |
| `plantilla_evaluacion`: composición/versiones de evaluación | Extiende `EVALUACION`, no reemplaza forma concreta | Decisiones documentadas: diagnóstico 2+2+3, controles10, final25 8+7+10; políticas v1/v2 | L: asignación, selección, publicación, tipo/nivel, reloj. E: cargas de plantillas y habilitación explícita; composición congelada | → fuente; hijos convocatoria/evaluacion/configuración MVP. **C**; conservar política histórica y plantilla técnica deshabilitada |
| `evaluacion`: instrumento concreto congelado | `EVALUACION`, p.05 | Reproducibilidad antes de asignar; CONTEXTO §§7–8 | L: inicio, historial, resultados y permisos. E: cargas originales o `seleccionar_forma` por cada intento; publicación tras validar | → plantilla opcional; hijos items/componentes/asignación/convocatoria. **C**; template y forma tienen cardinalidad/ciclo diferentes |
| `evaluacion_componente`: cobertura N:M | `EVALUACION_COMPONENTE`, p.05 | Autorización por programa y compatibilidad de clasificación | L: alta/transición, validadores, historial/contratos y `componentIds`. E: cargas o selector al crear forma | → evaluación/componente. **C**; mantener históricos RC y futuros instrumentos multicomponente |
| `item_evaluacion`: pregunta/orden de una forma | `ITEM_EVALUACION`, p.05 | Respuestas por ítem del instrumento, no solo por pregunta | L: presentación, publicación, snapshots, corrección y desgloses. E: importaciones/`seleccionar_forma`; congelado | → evaluación/pregunta; hijos respuesta y selección. **C**; no sustituir relación por JSON |
| `asignacion_evaluacion`: propiedad de la forma | `ASIGNACION_EVALUACION`, p.05 | Un intento por asignación, historial y autorización de propietario | L: todas las operaciones sobre intento; E: alta/diagnóstico antiguo y selector. Cada repetición v2 crea asignación nueva | → estudiante/evaluación; hijo intento. **C**; UQ estudiante/evaluación permite nuevas formas sin reabrir anteriores |

### Intentos, selección y resultados: 8 tablas

| Tabla / propósito | Equivalente original | Requisito o decisión que justifica | Lecturas y escrituras implementadas | Dependencias y propuesta |
| --- | --- | --- | --- | --- |
| `intento`: ejecución/estado académico | `INTENTO`, p.05 | Reanudación del mismo intento y cierre idempotente; repetición posterior solo autorizada | L: recuperación, reloj, calificación, historial y aprendizaje. E: start/selector; actividad/respuestas actualizan última actividad; calificador finaliza | → asignación UNIQUE; hijos respuesta/resultado/selección/exposición/reloj/avance/intento_ruta/refuerzo. **C**; no cambiar UQ para habilitar reintento sobre la misma asignación |
| `respuesta`: confirmaciones servidor | `RESPUESTA`, p.05 | Reanudar sin pérdida, validar opción/ítem/propietario y omisiones | L: intento, corrección/desgloses, repaso; E: `answer` UPSERT permitido solo en activo y antes del plazo; triggers validan | → intento/item/opción; PK intento+ítem sustituye ID redundante original. **C**; no eliminar tras calificar |
| `resultado`: calificación guardada y snapshot | `RESULTADO`, p.06 | Nota reproducible, independiente de IA; omisiones en denominador | L: historial/UI, decisiones y contexto IA; E: `calificar_intento` atómico/idempotente; ramas anteriores conservadas internamente. Migración antigua fijó detalle observable | → intento PK; dependencia lógica de decisiones, sin FK entrante directa. **C**; no sobrescribir detalle/version_regla al cambiar pedagogía |
| `convocatoria_banco`: asignación lógica antes de seleccionar | Extensión de `ASIGNACION_EVALUACION` | Selección al inicio y resumen único de una evaluación con repeticiones | L: listados/start/selector y cadena de repeticiones; E: alta/transición/RPC admin, secciones/avance; vincula primera forma una sola vez | → estudiante/plantilla/evaluación opcional; hijos agotamiento/intento_ruta/marcador técnico. **C**; convocatoria puede existir sin forma ni intento |
| `seleccion_intento`: snapshot de lo presentado | Sin tabla directa; refuerza p.05/p.09 | Versiones, orden y DTO exactos al iniciar; APEX_BANCO_105 | L: intento y repaso; E: trigger `snapshot_intento`, backfill previsto de observables anteriores; inmutable | → intento/item/pregunta/bloque; versiones y DTO sin claves. **C**; el snapshot no acredita reconstrucción de cambios previos a congelar instrumentos |
| `exposicion_pregunta`: eventos de presentación | Sin equivalente | Evitar vistos v1 y LRU de bloques v2 por ID original; decisión APRENDIZAJE_MVP | L: selector calcula la exposición más reciente de cualquier miembro; E: trigger de intento académico; técnicos se excluyen | → estudiante/pregunta/intento; ID original lógico entre versiones. **C**; exposición no equivale a respuesta ni a acierto |
| `agotamiento_banco`: fallo de composición auditable | Sin equivalente | `BANK_EXHAUSTED` sin selección parcial ni intento creado | L: revisión SQL administrativa y pruebas; E: selector devuelve error como resultado de RPC para conservar la auditoría | → convocatoria. **C**; aunque no tenga visor actual ni filas, diagnostica capacidad/política |
| `intento_ruta`: genealogía de repetición | Extiende `INTENTO`/asignación; no son pasos de lección | Reintento tras repaso consumible una vez; APRENDIZAJE_MVP | L: start/listado encuentra último intento por convocatoria; E: inicio v2 y registro de primer intento antiguo al repetir; inmutable | → intento/convocatoria/sesion_refuerzo UNIQUE; UQ convocatoria+número. **C**; nombre ambiguo, no mezclar con rutas de contenido |

### Contrato de ruta v1: 6 tablas

| Tabla / propósito | Equivalente original | Requisito o decisión que justifica | Lecturas y escrituras implementadas | Dependencias y propuesta |
| --- | --- | --- | --- | --- |
| `regla_ruta_version`: estructura autorizada | Fuera de las32; clases RutaAprendizaje y alcance de ruta adaptativa | RUTAS_IA: transiciones/refuerzo aprobados por responsable; aprobación debe constar en cada fila | L: catálogo/contexto/propuesta v1; E: carga aprobada de servidor; ninguna regla real sembrada por esa migración | Hijos progreso_leccion y ruta_version; inmutable. **V1**; conservar incluso pendiente; no equivale a 7/10 o22/25 |
| `leccion_version`: catálogo reutilizable aprobado | Analogía con MATERIAL_ESTUDIO; no equivalente exacto en relacional | RUTAS_IA: práctica propia, habilidad, referencias educativas y prerrequisitos aprobados | L: contexto/propuesta y validación v1; E: carga/revisión de servidor; no escritor estudiantil ni worker v1 local | → competencia; hijos paso/progreso; referencias y prerrequisitos en JSON/array validados. **V1**; no convertir automáticamente en sección personalizada |
| `progreso_leccion`: finalización con evidencia/regla | Progreso de clases; ausente de las32 | RUTAS_IA: hecho inmutable, no fabricado por IA ni por apertura de pantalla | L: contexto v1 y campos de `apex_my_route`; E: no RPC de completado de producción encontrada; fixtures insertan evidencia | → estudiante/lección/regla. **V1**; función pendiente no cancela estructura; no sustituir por declaración v2 |
| `solicitud_ruta`: contexto emitido inmutable | Sin equivalente directo | Contrato v1, idempotencia y rechazo de contexto desactualizado | L: `apex_save_route_proposal`; E: `apex_route_agent_context` **inserta** snapshot, service_role; sin llamador productivo local encontrado | → estudiante; hijo ruta_version UNIQUE. **V1**; no fusionar con cola ni llamar RPC para auditar “lectura” |
| `ruta_version`: propuesta global de catálogo | RutaAprendizaje de clases; ausente de las32 | RUTAS_IA: versiones enlazadas/propuesta validada, estado `validada_pendiente_conexion` | L: contexto/propuesta y `validatedVersion` v2; E: `apex_save_route_proposal` service_role, tras validar y bloquear estudiante | → estudiante/regla/solicitud/anterior; hijo paso. **V1/O**: conservar; única consolidación opcional con cabecera v2 descrita en §6 |
| `paso_ruta`: plan ordenado sobre catálogo | ModuloRuta de clases, correspondencia parcial | RUTAS_IA: motivos, lesson/refuerzo, requisitos y orden propios del estudiante | L: no se encontró lectura productiva directa de esta tabla; inspección SQL/pruebas. E: `apex_save_route_proposal` materializa los pasos de la propuesta; sin ejecutor implementado | → ruta/lección; PK ruta+orden y UQ ruta+lección, inmutable. **V1**; paso es relación de planificación, sección v2 contiene contenido |

### Aprendizaje y tutor v2: 7 tablas

| Tabla / propósito | Equivalente original | Requisito o decisión que justifica | Lecturas y escrituras implementadas | Dependencias y propuesta |
| --- | --- | --- | --- | --- |
| `trabajo_ia`: cola y control de entrega | Sin equivalente directo; soporte técnico del tutor/rutas | APRENDIZAJE_MVP: ejecución real con reintentos, fencing e idempotencia; elección técnica documentada | L/E: `solicitar_nivel`, operaciones de chat/retry, `apex_ai_claim` y `apex_ai_finish` service_role; worker v2 consume. No ejecución remota acreditada | → estudiante; hijos ruta_nivel/mensaje; sesión inferida de `clave`, sin FK. **C**; preservar contexto/hash de request, lease y respuesta; proponer después FK a sesión para trabajos chat |
| `ruta_nivel_version`: cabecera de contenido individual | RutaAprendizaje de clases, parcial | APRENDIZAJE_MVP: tres niveles, versiones y metadata proveedor/modelo/prompt | L: Mi ruta, contenido/progreso y habilitación de control; E: `apex_ai_finish` válido inserta versión1; actualmente no crea versión2 | → estudiante/trabajo/anterior; hijo sección. **C/O**; versionado futuro requiere diseño, no asumir regeneración implementada |
| `seccion_ruta`: contenido original personalizado | ModuloRuta y material de clases; sin equivalente exacto en32 | Siete secciones por nivel con prácticas/citas/prerrequisitos, decisión documentada APRENDIZAJE_MVP | L: ruta/sección/chat y control; E: finish IA validado; inmutable. Cliente abre sección independiente | → ruta_nivel/competencia; hijos progreso/refuerzo. **C**; preservar referencias snapshot; normalización adicional si integridad/citas lo requieren, no reducir por JSON |
| `progreso_seccion`: inicio y finalización declarada | Progreso de clases; ausente de las32 | Abrir registra inicio; completar explícitamente siete habilita control; no prueba dominio | L: disponibilidad, UI, control/contexto generación; E: `section`/`section_complete`/chat de sección insertan inicio; completar actualiza una vez | → estudiante/sección. **C**; semántica distinta del hecho con evidencia v1; preservar por versión y propietario |
| `sesion_refuerzo`: chat de sección o repaso de reprobado | `CONVERSACION_IA`, p.08, **parcial/contextual** | Tutor y repaso vinculado; distinguir opcional de habilitación de repetición | L: chat, contexto, start repetición; E: `chat_open`, estados del worker, `review_complete`, consumo `id_nuevo_intento` | → estudiante/sección/intento fallido/nuevo intento; hijos mensajes e intento_ruta. **C**; no equivale a TUTORIA docente; tutor general/historial amplio pendientes |
| `mensaje_refuerzo`: intercambios persistidos | `MENSAJE`, p.08, parcial | Historial de tutor y prueba de intercambio antes de completar repaso | L: `chat_json`, contexto y `canComplete`; E: chat_send usuario, finish IA asistente; UQ sesión+rol+clave e inmutabilidad | → sesión/trabajo opcional; sin FK cita/recomendación. **C**; modelo real por respuesta y citas visibles no completos en contrato actual |
| `decision_avance`: interpretación pedagógica | Complementa `RESULTADO`; no equivalente separado original | APRENDIZAJE_MVP: umbrales control7/final22 y corte sin recalificar históricos | L: habilitación nivel/control/final, resultado DTO, repaso; E: `registrar_avance`, backfill de transición explícita; inmutable | → intento PK; resultado es dependencia lógica. **C**; conservar regla, total, umbral y nullable diagnóstico; verificar coherencia, no fusionar con nota |

### Configuraciones, plazos y aislamiento: 4 tablas

| Tabla / propósito | Equivalente original | Requisito o decisión que justifica | Lecturas y escrituras implementadas | Dependencias y propuesta |
| --- | --- | --- | --- | --- |
| `configuracion_mvp`: selector del diagnóstico/corte | Sin equivalente; configuración de alcance | APRENDIZAJE_MVP/DIAGNOSTICO_RUTA_CORRECCION: habilitar plantilla no activa diagnóstico | L: alta, transición, protección historial, presentación/comportamiento v1→v2. E: fila nula en migración; corte explícito cambia FK | → plantilla; singleton, sin hijos FK. **C**; independiente del reloj; no tabla genérica clave/valor |
| `configuracion_reloj`: activación prospectiva | Sin equivalente; política temporal p.09 | RELOJES_EVALUACIONES: activación separada, diagnóstico sin límite y antiguos preservados | L: trigger del reloj y condiciones presentadas; E: fila desactivada en migración, script explícito activa tras verificar scheduler | Sin FK; usada por trigger/API, no por decisión pedagógica. **C**; una fila expresa un límite de despliegue distinto; compartir pantalla futura no requiere fusionar almacenamiento |
| `reloj_intento`: política/plazo/estado de procesamiento | Complementa `INTENTO`; p.09 exige política, no tabla particular | RELOJES_EVALUACIONES: 900/2250s nuevos, antiguos sin límite, cierre independiente del cliente | L: intento/clock, barrera respuestas, calificador/cron; E: trigger al iniciar/backfill, calificador fija motivo/fecha; errores incrementan fallos | → intento PK; índice parcial de vencidos; start/deadline inmutables. **C**; no confundir plazo con inactividad ni recalcular desde config actual |
| `prueba_reloj_tecnica`: clasificación/exclusión permanente | Sin equivalente; decisión técnica temporal documentada | PRUEBA_TECNICA_RELOJ y retirada informada hoy: evidencia sin impacto académico/IA | L: asignacion/intento_tecnico, vistas/historial/API/triggers; E: habilitación y retirada explícitas; guarda identidad/convocatoria y fechas, no se borra | → estudiante/convocatoria UNIQUE; sin hijos FK pero dependencia funcional transversal. **H**; retirar acceso no autoriza retirar tabla/guards/cron/evidencia |

Todas las tablas tienen razón de conservación en el estado auditado. La clasificación V1 identifica un ámbito que requiere delimitación, no una lista de tablas obsoletas aprobadas para borrar. H preserva evidencia necesaria aunque la campaña esté terminada.

## 4. Requisitos originales implementados, parciales y pendientes

| Estructura o función original | Estado verificable en código local | Pendiente que no debe confundirse con supresión |
| --- | --- | --- |
| Registro estudiante, programa/semestre, consentimiento, perfil y Auth externo | Implementado; birthDate se valida en alta y no se edita por RPC de perfil | Recuperación administrativa de datos incompletos y política de consentimiento/retención completa |
| `DOCENTE` | Rol en usuario y acceso a asignados implementados | Código de empleado, especialidad, invitación propia y posibles varios perfiles |
| `ADMINISTRADOR` | Rol/RPC/panel básico implementados | `nivel_acceso` original y administración completa; granularidad del catálogo de niveles sin definir |
| `INVITACION_DOCENTE` | No existe tabla ni flujo propio. Invitación inicial por Supabase Auth fuera del dominio | Token con huella, vigencia, emisor, aceptación transaccional de una sola vez, reenvío y auditoría |
| `EVENTO_ACCESO` | No existe tabla. Hook/contador y estado de sesión cubren prevención, no historial | Eventos persistentes con referencia de intento, incluidos usuarios desconocidos; alcance/retención y conexión con logs Auth |
| `ASIGNACION_DOCENTE` | Pareja docente-estudiante y autorización actual | Historial de vigencias, asignador, revocación y tutorías/retroalimentación sobre asignación concreta |
| `TUTORIA`, `RETROALIMENTACION` | Tablas/operaciones ausentes | Gestión docente original; el refuerzo IA no las satisface |
| `CONVERSACION_IA`, `MENSAJE` | Sesión/mensaje_refuerzo contextual realizan parte de la función | Tutor general, títulos/estado/historial de conversación amplio y modelo real por mensaje; no añadir tablas homónimas sin resolver correspondencia |
| `RECOMENDACION`, `RECOMENDACION_RESULTADO` | Ausentes; motivos de rutas y texto de chat no son recomendaciones relacionadas con resultados | Trazabilidad N:M de medidas que sustentan una recomendación y validación del dueño |
| `CITA_FUENTE` | Fuentes/fragmentos y referencias v2 validadas; respuestas del worker guardan referencias en trabajo | Cita ligada al mensaje, localizador/fragmento y estado de verificación originales; conservar lo ya emitido |
| Diagnóstico/resultados/historial/desgloses | Implementados; original simplificado utiliza tres vistas y ahora detalle snapshot | No se implementa puntaje oficial ni fórmula definitiva de nivel; comparar solo instrumentos/reglas compatibles |
| Ruta adaptativa de clases/casos de uso | V1 contrato validado; v2 contenido/UI/cola implementados | Servicios reales y material autorizado sin verificación; regeneración/versiones sucesivas, ejecución v1 y revisión pedagógica real pendientes |
| Control/final y repetición | V2 implementado localmente: 7/10,22/25, repaso respondido y consumo único | Verificación remota/concurrencia/IA; no equivale a simulacro general original de otros componentes |
| Plazos y suspensión administrativa | Relojes preparados; controles15min/final37:30; corte explícito separado | Suspensión30/45/60min y nuevo intento autorizado sin repaso están solo documentados, sin estado ni autorización implementados |
| Material/preguntas multifuente o multietiqueta | FK principal simplificada implementada | Recuperar relaciones N:M si el contenido aprobado lo necesita, como ya exige relacional p.03/p.04; el conteo no puede impedirlo |
| Borrado de cuenta/investigación/retención | Sin flujo completo acreditado | Coordinar Auth, Storage, consentimiento, resultados, auditoría e IA. No inferir borrado por tabla vacía o por seis meses |

Los 11 nombres originales ausentes son DOCENTE, ADMINISTRADOR, INVITACION_DOCENTE, EVENTO_ACCESO, TUTORIA, RETROALIMENTACION, CONVERSACION_IA, MENSAJE, RECOMENDACION, RECOMENDACION_RESULTADO y CITA_FUENTE. **No son once requisitos abandonados ni once tablas que deban crearse a ciegas.** Cada correspondencia requiere completar o aprobar el alcance. Las elecciones de 3×7, umbrales, LRU, snapshot temporal y aislamiento constan en documentación posterior; no se inventa un identificador RF ni se presume aprobación pedagógica de contenido generado.

## 5. Análisis de los grupos especialmente solicitados

### Rutas, lecciones, secciones y progreso

V1: `solicitud_ruta → ruta_version → paso_ruta → leccion_version`, con `regla_ruta_version` y `progreso_leccion`. El catálogo es reusable; el estudiante recibe una planificación validada global con subconjunto/orden/motivos. Sus completados exigen evidencia y regla y son inmutables. Las rutas v1 no se presentan como activas ni implementan desbloqueo/ejecución.

V2: `trabajo_ia → ruta_nivel_version → seccion_ruta → progreso_seccion`, acompañado de refuerzo. Cada sección pertenece a una ruta/estudiante y contiene material generado. Inicio y completado declarado son estados diferentes. Los tres niveles y siete secciones son invariantes del contrato actual, no la prueba de que dos estudiantes deban recibir el mismo contenido.

Dependencias cruzadas actuales: `contexto_generacion → contexto_ruta → ruta_version/leccion_version/progreso_leccion/regla_ruta_version`, aunque v2 solo toma `diagnosticBySkill`; `apex_my_route → ruta_version/progreso_leccion`. Además, `shared/contracts.ts` conserva tipos v1/v2. **Simplificación recomendada:** separar un cálculo diagnóstico común y puro; v1 conserva sus APIs/catálogo/hechos; v2 usa su contenido/progreso; ambas reutilizan métricas académicas y permisos, sin escrituras cruzadas ni equivalencia fabricada de completados. Es una propuesta posterior, no un cambio ejecutado.

### solicitud_ruta y trabajo_ia

`solicitud_ruta.contexto` captura lo autorizado al emitir contexto; una propuesta idéntica devuelve la misma ruta, una distinta entra en conflicto y cambios académicos invalidan la propuesta. No tiene estados de cola, lease ni recuperación. La RPC cuyo nombre incluye “context” **escribe** esa tabla.

`trabajo_ia` tiene estados pending/running/ready/error/unavailable; el claim captura/reemplaza el contexto de la ejecución, asigna lease de3min y aumenta intentos; finish acepta solo lease vigente/contexto válido y entrega idempotente. El request enviado al adaptador incluye ID del trabajo + hash del contexto. Los chats se vinculan a sesión/clave por un protocolo de texto. No hay una unión FK entre solicitud_v1 y job_v2. Conservar ambos; compartir un proveedor IA no crea identidad entre solicitudes.

Riesgo actual: recuperar el mismo trabajo puede reemplazar su contexto; no existe una tabla append-only de cada ejecución/lease. Si se exige historial de todos los envíos externos, haría falta una entidad de ejecuciones adicional, definida por retención y contrato. Eso puede aumentar el conteo justificadamente; no se propone esconderlo en un JSON acumulativo.

### reloj_intento e intento

Relación1:1. `intento` representa propiedad, actividad y estado académico; `reloj_intento` fija política/tipo/inicio/límite/vencimiento y cierre/error operativo. Los intentos previos reciben política sin límite; activación global afecta solo nuevas inserciones. En diagnóstico sigue sin haber cierre por plazo total. La inactividad de90s/8min utiliza sesiones y última actividad, no `vence_en`.

El calificador bloquea estudiante→intento; la barrera de respuestas evalúa hora servidor después de esperar locks. Cron y RPC comparten calificador. **No retirar el índice de vencidos, los errores ni el snapshot por parecer una extensión 1:1 prescindible.** Fusionar físicamente con intento reduciría una tabla, pero exigiría reescribir triggers, DTO, procesos y backfill sin cambiar milisegundos/políticas; no hay beneficio funcional acreditado que compense ese riesgo ahora.

No está implementada la suspensión de intentos. El estado admite activo/finalizado. Agregarla en el futuro debe conservar respuestas y evitar un resultado fabricado; la autorización de un nuevo intento es un hecho diferente del repaso existente.

### decision_avance y resultado

`resultado` es la medición: aciertos/total/regla/calculado_en/detalle. `decision_avance` es una decisión según regla `avance-apex-v2`, tipo, nivel y umbral. Los diagnósticos no tienen passed ni umbral. La transición añade decisiones sobre notas anteriores sin modificar sus detalles ni selección; por eso tener ambas tablas es justificable.

No fusionar. Verificar existencia/coherencia de resultado, totales, niveles, umbrales y aprobación, y excepciones técnicas. Si una regla cambia, diseñar versiones de decisión y selección de la decisión vigente, conservando anteriores. La PK actual id_intento solo permite una decisión por intento; no afirmar que múltiples reglas históricas ya estén soportadas. Los cambios de pedagogía no deben alterar `aciertos-v1` ni la nota objetiva.

### Las dos configuraciones

`configuracion_mvp` selecciona una plantilla diagnóstica por FK y señala corte de aprendizaje; `configuracion_reloj` activa una política temporal prospectiva. Habilitar las cinco plantillas no selecciona el diagnóstico; configurar cron no activa relojes; prueba técnica fuerza900s sin activar plazos académicos globales. Ambos singleton tienen responsables y momentos diferentes.

Conservar ambas con campos tipados. Una pantalla administrativa puede presentar sus estados conjuntamente sin una tabla genérica JSON/clave-valor. No se constató auditoría de cambios de configuración en las propias tablas; si se necesita, definir registro de cambios independiente preservando cuándo se activó cada política.

### Infraestructura de la prueba técnica retirada

La retirada local prevista pone `prueba_reloj_tecnica.habilitada=false`, registra `retirada_en` y deshabilita la plantilla técnica. Si fue retirada con intento activo, el cron compartido debe finalizarlo al vencimiento original; hace falta verificarlo, no inferirlo de la retirada.

Se conservan marcador, plantilla, convocatoria, evaluación concreta/componentes/ítems, intento, selección, respuestas, reloj, resultado y auditoría de agotamiento/error. Los guards excluyen exposición, decisiones, vínculos de ruta y repasos; las vistas e historiales académicos/IA consultan la clasificación aun retirada. Las tablas de evidencia son las mismas del flujo común, no un segundo banco ni un segundo calificador.

**Propuesta:** mantener marcador y exclusiones permanentemente mientras se conserve esa evidencia. La tarjeta/adaptador de inicio podrían retirarse de una versión futura del cliente después de comprobar revocación, ausencia de activos y compatibilidad de versiones instaladas. Beneficio: menor superficie temporal. Riesgo: clientes antiguos, respuestas ya descargadas y clasificación histórica. Pruebas: técnicos nunca aparecen en listados/contextos; IDs conocidos denegados; cierre compartido/reintento sigue funcionando; historial académico idéntico. No se ejecuta esa retirada de código ni se detiene el job compartido durante esta auditoría.

El motivo `tiempo_agotado` no prueba por sí solo ejecución de cron: la misma rutina puede ser llamada por RPC. Correlacionar tiempos de procesamiento con ejecuciones reales y constancia de ausencia de otro llamador; la arquitectura no persiste la procedencia del invocador.

## 6. Modelo objetivo y conteo justificado

**Recomendación principal: mantener inicialmente 50 tablas y simplificar la arquitectura por responsabilidades y dependencias, con v2 como recorrido estudiantil actual y v1 como contrato/catálogo compatible preservado.** El inventario incluye estructuras operativas, pendientes y evidencia; no se elimina una tabla por estar vacía. El modelo objetivo tiene las mismas relaciones que protegen datos, pero deja de construir el contexto v2 consultando el agregado de v1 y documenta una sola fuente por cada hecho.

| Dominio objetivo | Tablas actuales conservadas | Fuente de verdad |
| --- | ---: | --- |
| Organización/identidad y ámbito docente | 11 | Perfil/matrícula/programa; permisos en servidor y auditoría de rol |
| Bloqueo, fuentes/material/fragmentos | 5 | Auth hook separado; documentos revisados y autorizados |
| Banco, composición e instrumento | 9 | Preguntas/opciones/bloques congelados; plantilla distinta de forma |
| Intentos, selección, exposición y resultados | 8 | Intento/asignación; snapshots/exposición; nota objetiva; cadena de repetición |
| Contrato/catálogo/hechos v1 preservados | 6 | Plan validado y finalización con evidencia |
| Contenido, ejecución IA y progreso v2 | 7 | Trabajo→contenido; inicio/declaración; tutor/repaso; decisión pedagógica |
| Configuraciones, reloj e aislamiento | 4 | Cortes independientes; snapshot temporal; clasificación técnica permanente |
| **Total** | **50** | **44 fuera del grupo v1 +6 v1** |

“44 fuera de v1” no significa44 funciones listas en producción; incluye preparación operativa y evidencia técnica. Simplicidad no exige menos tablas: exige identificar qué hecho gobierna cada operación, eliminar dependencias accidentales y conservar las relaciones esenciales. Las tres vistas permanecen aparte.

### Única consolidación estructural opcional que merece evaluar

Si tras el inventario remoto y decisión de producto se quiere una cabecera única de rutas, combinar **solo `ruta_version` y `ruta_nivel_version`** podría llevar a **49 tablas físicas**, dejando intactas las demás48. Sería una tabla de versiones de ruta con ámbito explícito global-v1/nivel-v2, dueño, nivel cuando corresponda, serie de versión, predecesor, y FK tipadas a solicitud v1/regla o trabajo v2 según origen. Los pasos de catálogo y las secciones con contenido seguirían en tablas distintas; también sus dos clases de progreso.

Correspondencias: antigua ruta global→cabecera scope v1 conservando UUID/version/propuesta/FK; ruta por nivel→cabecera scope v2 conservando UUID/nivel/version/trabajo/motivo/agente. Se validaría exclusividad de origen y homogeneidad de propietario/ámbito/nivel en el predecesor. Si UUID colisionan entre tablas, usar mapa relacional reversible; no reidentificar silenciosamente. Vistas/adaptadores compatibles conservarían nombres y DTO/contratos históricos.

Beneficio: una política común de identidad/versionado y antecedentes, menos duplicación de cabeceras. Riesgos: ámbitos de versión diferentes, estado v1 pendiente frente a contenido v2 ready, baseVersion/idempotencia v1, referencia de progreso/sección y todos los consumidores. Requiere pruebas completas del §7 y aprobación posterior. **No es requisito de la recomendación; no se considera que ahorrar una tabla por sí solo la justifique.** Si no aporta claridad o compromete catálogo aprobado, mantener50 es preferible.

### Crecimiento legítimo para requisitos originales y posteriores

Completar el original puede requerir `docente`, `administrador`, `invitacion_docente`, `evento_acceso`, `tutoria`, `retroalimentacion`, `recomendacion`, `recomendacion_resultado` y `cita_fuente`: **hasta9 entidades adicionales**, según aceptación de atributos especializados y solución de auditoría/citas. `CONVERSACION_IA`/`MENSAJE` se podrían cubrir ampliando las entidades contextuales existentes con ámbitos y atributos claros; si sus ciclos/permisos resultan distintos, nuevas tablas también serían justificables.

Así, una realización que conserve50 y materialice esas9 llegaría a **59**, o **58** con la consolidación opcional de cabeceras. Son escenarios de alcance, no metas ni migraciones preparadas. Vigencia docente puede exigir identidad/historial de asignación; suspensión/nuevo intento, ejecución IA por lease, cambios de configuración y multirrol pueden añadir otras entidades cuando se definan sus reglas. No se simula cobertura de esos requisitos para presentar un conteo cerrado artificialmente.

No se recomienda consolidar solicitud/trabajo, resultado/decisión, intento/reloj, configuraciones, convocatoria/asignación, ni lección/sección o progresos. No se sustituyen FK/puentes por JSON para reducir números. Los JSON actuales de contrato/DTO/contenido son snapshots o documentos validados; los nuevos vínculos de auditoría, prerrequisitos/citas o permisos pueden necesitar más normalización.

## 7. Plan posterior de transición y pruebas, sin ejecución

1. **Establecer línea base de solo lectura.** Ejecutar por el responsable bloques A y luego B del SQL adjunto, guardando resultados privadamente. Comparar nombres/DDL/funciones/ACL/RLS con local; reconciliar historial manual sin repetir migraciones. Identificar clientes desplegados, worker, workflows n8n, cron, Edge Functions u otros consumidores externos.
2. **Resolver semántica y aceptación antes de diseñar DDL.** Confirmar continuidad del catálogo v1, contenido individual v2, requisitos docentes/retención y regeneración. Registrar decisión con fuentes reales. No usar “cero filas” como autorización de retirada.
3. **Probar separación de métricas comunes en copia aislada.** Mantener contrato v1 `contextId/baseVersion/ruleVersionId/steps`, v2 contractVersion2, `requestId`/Idempotency-Key, leases y citas autorizadas. Comparar contextos antes/después, sin PII/claves ni técnicos. Progreso v1 no autoriza automáticamente secciones v2.
4. **Solo si se aprueba cabecera común, preparar cambio aditivo.** Copiar cabeceras con mapa de IDs/origen, preservar secuencias de versión y anteriores; remapear FK de pasos/secciones sin alterar IDs públicos. Mantener tablas originales durante validación. No sortear triggers de inmutabilidad ni reescribir migraciones ya aplicadas. Revisión de diff y aprobación preceden cambios reales.
5. **Preservar ejecución en curso.** No renovar inicios/plazos, reordenar preguntas, publicar formas nuevas, consumir repasos ni alterar respuestas/resultados durante migración. Migrar cola solo tras resolver/drain leases o mantener consumidor compatible; un worker antiguo debe seguir rechazado por fencing. Un intento activo mantiene política original, selección, dueño e ID.
6. **Verificar con datos copiados y staging multiconexión.** Reconciliar cantidades/identidades/FK y hashes privados de filas inmutables; probar contratos y recorridos del cuadro inferior. Las fixtures PGlite serializadas existentes no prueban locks entre conexiones reales ni pg_cron.
7. **Cortar consumidores de forma reversible.** Actualizar funciones/worker/cliente compatibles, permisos y búsqueda de dependencias PL/pgSQL; conservar adaptadores v1 y clasificación técnica. Verificar staging y observación operativa antes del corte real autorizado. No conceder SELECT de banco/vistas para facilitar la transición.
8. **Reversión y conservación.** Antes del corte puede descartarse la copia nueva sin tocar originales; después del corte deben reconciliarse nuevas filas mediante el mapa y regresar consumidores compatibles, conservando lo escrito. No duplicar grades, trabajos ni consumos. Retirar físicamente estructuras solo en otra tarea aprobada, tras evidencia de dependencia cero y política de retención, sin CASCADE a ciegas.

| Garantía | Prueba exigida para cualquier cambio relacionado |
| --- | --- |
| Historial académico y contratos | IDs, versiones, respuestas, nota y detalles antiguos iguales; RC/ICFES/APEX accesibles; vistas incluyen omisiones; DTO y contexto v1/v2 compatibles |
| Propietario/permisos | Estudiante solo lo propio; docente solo asignados; administrador auditado; PUBLIC/anon sin tablas/claves; antiguas RPC privadas sin EXECUTE; RLS y Storage preservados |
| Selección | 2+2+3; control10; final25 y8+7+10; bloques completos/versiones/orden; no vistos/LRU por exposición más reciente; BANK_EXHAUSTED sin forma/intento parcial |
| Relojes/concurrencia | Diagnóstico/antiguos sin límite; nuevo900/2250; reanudar no renueva; respuesta tardía rechazada después de locks; manual/cron concurrentes dan un solo resultado/avance; errors/backlog y retry preservados |
| Repaso/repetición | Sesión del reprobado correcto; intercambio de usuario respondido; declaración única; exactamente un intento nuevo; sección opcional no concede repetición; doble click/red concurrente no duplica |
| IA | JSON exacto, metadata real cuando el contrato la exige, material permitido vigente, sin claves/PII/técnicos; contexto obsoleto y lease viejo rechazados; entrega igual idempotente/diferente conflictiva; timeout/unavailable no fabrican contenido |
| V1 frente a V2 | Evidencia/regla/completados v1 conservados; inicios/declaraciones v2 conservados por sección/versión; ninguna conversión automática de dominio; IDs y series de versión correctos |
| Prueba retirada | Marker deshabilitado y fecha; ninguna exposición/decisión/repaso/historial/contexto académico; IDs conocidos denegados; evidencia completa y cierre original si quedó activo; cron compartido intacto |
| Nuevas funciones administrativas | Invitaciones/vigencias/suspensión solo tras especificación y migración propias; sin modificar nota objetiva, privilegios o intentos para arreglar inconsistencias |

## 8. Consultas y límites de la comprobación remota

El archivo [consultas-solo-lectura.sql](consultas-solo-lectura.sql) **no se ejecutó**. El bloque A es catálogo/privilegios y genera instrucciones SELECT para recursos opcionales; no asume que existan las50 tablas, historial CLI, extensión cron ni permisos de administrador. El bloque B requiere comprobar primero el inventario y los privilegios: consulta tablas concretas y falla de forma segura si no existen. Cada bloque usa transacción REPEATABLE READ READ ONLY y termina con ROLLBACK. No usa RPC de aplicación, worker, DML/DDL, `FOR UPDATE` ni procesador de cierres.

La distinción es esencial: `apex_api('me')`, `attempt_clock`, `actor`, `apex_route_agent_context` y `apex_ai_claim` pueden crear sesión, cerrar/calificar vencidos, asignar evaluación o escribir solicitud/lease. No son instrumentos de lectura para esta auditoría. Las funciones SQL de proyección llamadas por vistas existentes deben inspeccionarse primero en remoto; no se presume que un nombre conocido conserve su definición local. Las consultas opcionales generadas deben ejecutarse también dentro de una transacción READ ONLY y terminar con ROLLBACK.

El SQL permite comprobar inventario, tamaños/conteos, columnas, FK/constraints/indexes, triggers, cuerpos SQL y referencias textuales, RLS/políticas/grants, configuraciones, cobertura de snapshots, coherencia de resultados/decisiones/plazos, rutas/progresos, cola/citas y contaminación técnica. No imprime contraseñas, tokens, texto de chats, enunciados, opciones correctas ni justificaciones privadas.

`pg_depend` no cubre íntegramente cuerpos PL/pgSQL, SQL dinámico ni consumidores externos. Las estadísticas de filas/operaciones pueden haberse reiniciado; una ausencia de llamadas/filas no prueba ausencia de dependencia. La comparación de definiciones precisa revisión humana o herramienta sobre resultados privados. El histórico CLI vacío no prueba que no se aplicó SQL manual. Configuración del hook Auth, esquemas expuestos de Data API y despliegue del worker/n8n necesitan evidencia adicional de ajustes/logs que el responsable consulte en modo lectura.

Los conteos y snapshots permiten verificar cobertura/versiones, pero no prueban por sí solos el sorteo ni toda la elección LRU histórica. Para reconstruirla hacen falta las exposiciones disponibles en el instante de selección, el instrumento/política y evidencia suficiente de ese momento. Los casos locales de selección sirven como especificación de regresión; esta auditoría no los ejecutó ni atribuye sus resultados históricos a la instancia remota.

Verificación de los entregables:50 filas únicas de matriz, coincidentes con las50 creaciones locales;32 originales,21 correspondencias por nombre y11 ausencias;31 enlaces de evidencia comprobados. El SQL contiene dos bloques de lectura y50 conteos exactos, con revisión manual y comprobación léxica de que sus instrucciones ejecutables son únicamente BEGIN READ ONLY, SET LOCAL, SELECT/WITH y ROLLBACK. Esta comprobación no sustituye validación de sintaxis/ejecución en PostgreSQL ni acredita resultados remotos. No se ejecutaron tests, migraciones ni SQL.

Se compararon hashes SHA-256 de222 archivos preexistentes del ámbito revisado, incluidos código, migraciones, documentación y bases locales: ninguno cambió. Solo se crearon `INFORME.md`, `inventario-local.json` y `consultas-solo-lectura.sql` en esta carpeta de auditoría.

**Cierre de la auditoría local:** existencia y propósito justificados para50 tablas;11 nombres originales ausentes clasificados por correspondencia/pendiente; riesgos y comprobaciones preparados; ninguna retirada estructural aprobada ni ejecutada. No se promete diagnóstico definitivo del contenido remoto hasta recibir esas evidencias.

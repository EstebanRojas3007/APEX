# Contraste de documentos APEX

## Actualización vigente — 03/10/2026

Se volvieron a revisar los textos de los ocho diagramas y las restricciones de los modelos. Las instrucciones actuales sustituyen las alternativas tecnológicas anteriores: **Auth, PostgreSQL y Storage de Supabase; Firebase excluido**. El detalle de referencias por página/celda y el diagrama vigente están en `diagrams/APEX_Supabase_20261003.md`. Las 32 tablas continúan siendo modelo completo de referencia; la implementación tiene 25 y 3 vistas, con roles controlados, asignación docente y contexto documental.

Las secciones que siguen registran el contraste de la entrega SQLite del 28/09 y se conservan como antecedente. Sus menciones de integración Supabase pendiente, proveedor local o ausencia de paneles no describen el código actual. Estado vigente y limitaciones: `SUPABASE.md`, `CONTENIDO_DOCUMENTAL.md` y `PROGRESO.md`.

Revisión: 28/09/2026. Se leyeron el contexto completo, el XML de las 41 páginas de los ocho Draw.io y el HTML/CSS/JavaScript del mockup. `diagramas-extraidos.json` conserva textos, identificadores de celdas y extremos de conectores como evidencia de lectura. Los originales no se alteraron.

## Inventario localizado

| Archivo en `Docs/diagrams/` | Páginas | Observación |
| --- | ---: | --- |
| APEX_Modelo_Relacional_v1.drawio | 9 | Versión **interna 1.1**, simplificada, 32 tablas identificadas y 3 vistas |
| APEX_MER_v1.drawio | 7 | Versión 1.0; varias relaciones N:M anteriores |
| APEX_Modelo_Conceptual_v1.drawio | 5 | Dominio, acuerdos y pendientes; no prescribe tablas |
| APEX_Diagrama_Comunicacion_v1.drawio | 6 | Registro, invitaciones, evaluación, recuperación e IA |
| Casos_de_uso_APEX_v2 (1) (1).drawio | 1 | Alcance más amplio, sin registro explícito |
| Diagrama_de_clases_APEX_v2 (1) (1).drawio | 1 | Progreso/rutas/grupos y nomenclatura anterior |
| Diagrama_de_procesos_APEX (1).drawio | 6 | Flujos previos, personalización y tareas docentes |
| Diagrama_de_actividades_UML_APEX (1).drawio | 6 | Flujos UML, abandono y propuestas por confirmar |

Mockup: `Docs/mockups/mockup-saber-pro-desktop (1) (2).html` (solo local, excluido de Git por falta de confirmación de sus identidades de demostración y procedencia). No se localizaron un PDF de propuesta ni un archivo de secuencia separado, aunque procesos/actividades los mencionan. El diagrama de comunicación no se presenta como sustituto del de secuencia.

## Diferencias y tratamiento explícito

Las instrucciones actuales del usuario y las reglas acordadas en CONTEXTO_APEX son el marco de esta entrega. La fecha, el nombre de archivo o el número de tablas **no** resuelven automáticamente contradicciones. Las decisiones limitadas al banco propio de prueba no aprueban una cardinalidad para el banco real.

| Tema | Evidencia contrastada | Decisión para la entrega / cuestión abierta |
| --- | --- | --- |
| Fuentes de material | MER p.02 `t2`, «varias fuentes», relación «Se respalda en»; relacional p.03 `txt2`, elimina MATERIAL_FUENTE y usa `id_fuente` | Una fuente propia por material de prueba. Si el contenido real requiere bibliografía múltiple, recuperar tabla puente; no truncarla. |
| Clasificación y fuentes de preguntas | MER p.03 relaciones «Evalúa competencias», «Trata temas», «Procede de», N:M; relacional p.04 `txt2`, una FK a fuente/núcleo/competencia | Un valor de cada clase para cada pregunta propia. Validación del banco real pendiente. No importar aún preguntas multietiqueta. |
| Desgloses persistentes | MER p.04 `t2` y DETALLE_RESULTADO; clases ResultadoCompetencia y Progreso; relacional p.06 `txt8` elimina detalles de núcleo/competencia | Resumen global almacenado y vistas derivadas, incluyendo no respondidas mediante LEFT JOIN. Se mantiene el instrumento de prueba v1. |
| Rutas y módulos | Clases RutaAprendizaje/ModuloRuta/Progreso; procesos p.03 y actividades p.03 guardan esas entidades | No están en las 32 tablas. La ruta actual es catálogo fijo de guías, rotulado como tal. Persistencia de avance y adaptación quedan pendientes. |
| Conversaciones y grupos | Clases Conversacion con participantes y GrupoEstudio; mockup muestra grupos y docentes | Relacional p.08 modela CONVERSACION_IA de un estudiante y MENSAJE estudiante/asistente. No implementar grupos/videollamadas ni interpretar el chat ficticio como requisito. Tutor de esta entrega no guarda historial. |
| Relación respuesta/instrumento | Clases relaciona RespuestaEstudiante directamente con Pregunta; relacional p.05 usa ITEM_EVALUACION y ASIGNACION_EVALUACION | Intento por asignación e ítem versionado. Servidor verifica propietario, evaluación e identidad de la opción. El número 32 no sustituye estas invariantes. |
| Registro y roles | Casos de uso omite registro; procesos p.06 recupera registro como propuesta; comunicación p.01 y contexto §5 lo especifican | Registro exclusivamente estudiante. No hay selector de roles. Docente invitado y administrador habilitado por desarrolladores se implementarán después. |
| Varios roles | MER p.01 y relacional p.01 proponen perfiles combinados; contexto lo deja pendiente | Entrega solo de estudiante. No se impone una exclusividad futura ni se crea cambio de rol. |
| Gestión de contenido docente | Clases, casos de uso, procesos p.04 y actividades p.04 permiten publicar material/preguntas; contexto §8 y relacional p.03 dicen desarrolladores inicialmente | Semilla gestionada por desarrolladores. Panel y permisos docentes no habilitados; acordar ámbito futuro. |
| Modalidad y adaptación durante evaluación | Procesos p.03 selecciona dificultad/modalidad y ajusta próxima pregunta; actividades p.03 conserva ese flujo | Diagnóstico fijo de 7 preguntas, única respuesta, sin pistas ni adaptación. Se preserva un instrumento reproducible; reglas adaptativas no definidas. |
| Abandono e inactividad | Actividades p.03 `cancel` registra abandono; comunicación p.05/relacional dejan efecto del bloqueo pendiente | Pausar o desconectar conserva el mismo intento sin resultado. Bloqueo a 8 min revoca sesión y retorna al acceso; después del ingreso se vuelve al menú y se retoma. Es una política provisional reversible, no abandono definitivo. |
| Tiempo | Contexto y relacional p.09: 7 sin límite / 15 en 30 min / general propuesto 167 en 330 min; mockup: 20 en 40 min, reloj se reinicia y muestra 4 h 30 para general | Solo diagnóstico sin límite total. No copiar reloj de mockup. Cuestionario y simulacro no habilitados; guía oficial aún pendiente. |
| Corrección y niveles | Mockup `correctAnswer='C'` y `confirmAnswer()` revelan corrección durante intento; clases contiene esCorrecta; contexto prohíbe entregar claves | Claves solo en semilla/DB del servidor, DTO público sin corrección. Resultado objetivo `aciertos-v1`, sin nivel bajo/medio/alto ni escala ICFES. |
| Datos de progreso | Mockup 72 %, 87 %, 42 h, rachas/tendencias y María Alejandra precargados | Estado vacío hasta completar diagnóstico; estadísticas calculadas exclusivamente de resultados guardados. Una observación no produce una tendencia inventada. |
| Autenticación y seguridad | Conceptual p.05 menciona Firebase integrado en prototipo; relacional p.09 permite Supabase/Firebase; contexto propone Supabase nuevo | Proveedor local de prueba con hashes scrypt y sesiones opacas en memoria del cliente. No migrar el Firebase hermano. Supabase real pendiente; no copiar afirmaciones JWT/E2E/2FA del mockup. |
| IA, resultado y fuentes | Casos de uso relaciona IA/ruta; comunicación p.04/p.06 y actividades p.03 toleran fallo de IA | El resultado se guarda antes e independientemente de IA. Tutor de reglas claramente etiquetado, no Gemini; usa fuente propia existente y métricas del solicitante. |
| Privacidad | MER p.06, relacional p.09, contexto §11: retención y eliminación pendientes | Aviso local v1, solo datos ficticios. No convertir seis meses en borrado automático ni prometer anonimización. No hay envío externo ni historial de mensajes en esta etapa. |

## Decisiones provisionales de la demostración

- Componente: Razonamiento Cuantitativo; etiquetas de núcleo/competencia ilustrativas, no taxonomía ICFES validada.
- Semestre de prueba: 1–20. El límite real debe depender del programa.
- Ventana de cinco fallos: 15 minutos por correo normalizado. Bloqueo de 4 minutos, verificado en servidor; no depende de contador del navegador.
- Inactividad: 90 s en menú; avisos cliente a 5 y 7 min; bloqueo servidor a 8 min en evaluación. Eventos de entrada y estado de app participan; peticiones de salud no renuevan sesiones. Temporizadores miden tiempo transcurrido, no número de intervalos.
- Sin plazo máximo de reconexión para el diagnóstico. No tiene reloj total. El comportamiento del reloj de evaluaciones cronometradas queda abierto.
- Confirmaciones de inicio y entrega en UI; intento único, propiedad, guardado y finalización idempotente en servidor.
- Autenticación y perfil local se crean en una transacción: no existe alta parcial local. La recuperación de un alta parcial con proveedor externo deberá implementarse al integrar Supabase.
- Navegación explícita por estado, sin combinar Router y React Navigation. No hay enlaces profundos en esta primera entrega; recargar requiere iniciar sesión y recupera datos del servidor.

## Preguntas que bloquean etapas posteriores, no el recorrido local

1. ¿Inglés o Razonamiento Cuantitativo? ¿Qué banco y guía oficial se utilizarán? De ello depende validar cardinalidades y taxonomía.
2. ¿Qué relaciones de fuentes y clasificaciones requiere ese banco? ¿Se acepta ampliar la propuesta de 32 tablas cuando sea necesario?
3. ¿Qué efecto definitivo tiene el bloqueo/abandono y cuál será la política temporal de reconexión en exámenes cronometrados?
4. ¿Qué proyectos Supabase, proveedor de correo, modelo Gemini y conexión n8n se habilitarán?
5. ¿Qué retención, eliminación y consentimiento se aplicarán a estudiantes reales y estudios posteriores?
6. ¿Qué repositorio debe recibir esta entrega y qué operaciones remotas se autorizarán? No hay asociación inferida del plugin.

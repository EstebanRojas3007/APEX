# CONTEXTO APEX — Arquitectura Supabase definitiva

**Prueba técnica del reloj preparada localmente, 12/10/2026:** procedimiento y aislamiento (`Docs/PRUEBA_TECNICA_RELOJ.md`, solo local; v?ase la gu?a de reproducibilidad). Migración aditiva `202610120002`, habilitación/retirada explícitas para una identidad, 10 preguntas/900 segundos con el calificador y procesador existentes. Excluida de exposición, historial, progreso, avance, repasos e IA. Diagnóstico activo bloquea la habilitación sin alterarse. No se consultó ni habilitó remoto; cierre real y Android en dispositivo pendientes.

**Estado del 12/10/2026:** [relojes de evaluaciones](RELOJES_EVALUACIONES.md): diagnóstico de siete sin límite/entrega automática; nuevos controles 900 segundos y final 2250, con cierre y calificación en PostgreSQL, aun sin cliente. Migración aditiva preparada, configuración Cron cada 30 segundos y activación explícita separadas; ninguna acción remota. Intentos anteriores persisten política sin límite, sin recalificación. Se conservan Mi ruta/acordeón, reglas de inactividad, selección/versiones y repasos. La suspensión administrativa 30/45/60 minutos queda documentada para después, sin implementación. Esta actualización prevalece sobre las descripciones temporales históricas siguientes.

**Estado del 11/10/2026:** [bloque de aprendizaje MVP](APRENDIZAJE_MVP.md): diagnóstico del banco APEX, 21 secciones individuales mediante contrato IA v2, controles, final, progreso y repasos persistidos. Cuatro migraciones nuevas y corte preparado; historial anterior conservado. El banco está cargado/verificado según el propietario; n8n/Gemini no están verificados como conectados. Esta actualización prevalece sobre los pendientes históricos del resto del documento.

**Registro y perfil, 06/10/2026:** [REGISTRO_PERFIL.md](REGISTRO_PERFIL.md) describe la migración aditiva 10, sin aplicación remota. Los datos personales/académicos y el consentimiento se guardan y validan durante el alta Auth, también con correo pendiente. Después de autenticar se accede al diagnóstico asignado; no se fuerza otra pantalla de perfil. «Editar perfil» es opcional y precarga nombre, semestre y carrera; la fecha es solo lectura y el servidor rechaza su edición. Cambiar matrícula no modifica asignaciones, intentos ni historial. Perfiles antiguos se recuperan conservadoramente, sin inventar datos ni consentimiento. Esta actualización sustituye el paso obligatorio de completar perfil descrito en estados anteriores.

**Estado vigente del 06/10/2026:** [banco APEX de 105 preguntas](APEX_BANCO_105.md), aprobado internamente por el responsable y cotejado visualmente por el asistente; no se atribuye revisión docente ni aval del ICFES. Controles 10 por nivel y final 25, con selección servidor por bloques completos no vistos y snapshots por intento. El diagnóstico previo de siete y los historiales se conservan. [Rutas individuales](RUTAS_IA.md): contrato/versionado preparado, lecciones y reglas de avance aún por aprobar, n8n/Gemini sin conectar; mostrar «generación de ruta pendiente». Tres migraciones nuevas y carga idempotente solo locales; ninguna publicación/asignación real. Esta instrucción actual sustituye las cantidades y los estados antiguos de implementación descritos más abajo.

Actualizado el 03/10/2026. Decisión vigente: **Supabase Auth para registro/login/recuperación; PostgreSQL Supabase para todas las tablas; Supabase Storage para archivos. Firebase queda fuera de la arquitectura.** Consultar `SUPABASE.md` para migraciones, límites y conexión; `CONTENIDO_DOCUMENTAL.md` para PDF y contexto IA; `diagrams/APEX_Supabase_20261003.md` para el diagrama vigente.

Este archivo es el punto de partida del proyecto. Está dirigido a Astra/Codex en Visual Studio Code. Describe el producto, las decisiones acordadas y el margen de autonomía para implementarlo.

## 1. Tu misión y autonomía

Actúa como arquitecto de software y desarrollador full stack. Construye una primera versión funcional de APEX para Android y web, mediante entregas pequeñas, ejecutables y verificables.

El proyecto existe en `APEX`, con código Expo/TypeScript, ocho diagramas Draw.io, una entrega SQLite anterior y migraciones Supabase. El propietario confirma las cinco migraciones y semilla aplicadas manualmente, el recorrido funcionando con Supabase real y la fuente/PDF de Inglés registrados. Este estado fue informado por el propietario; no se inspeccionó ni modificó el remoto en esta entrega. La sexta migración es nueva y solo se verificó localmente.

Tienes autonomía para:

- Inicializar el proyecto, crear carpetas y archivos, instalar dependencias necesarias y configurar herramientas locales.
- Elegir una organización sencilla del código, navegación y bibliotecas compatibles.
- Implementar pantallas, lógica, servicios, migraciones y pruebas relevantes.
- Corregir errores y refactorizar conforme avance el desarrollo.
- Resolver decisiones técnicas reversibles, documentando brevemente el motivo.
- Elegir valores provisionales configurables para aspectos pendientes, identificándolos como tales.

No te detengas después de proponer un plan: comienza la implementación y completa una etapa funcional. No pidas confirmación para cada archivo, carpeta o dependencia. Comunica avances breves y trabaja por objetivos concretos.

Solicita intervención solo cuando falten accesos indispensables, exista una decisión de producto con efectos importantes o sea necesario realizar una acción externa no autorizada, como contratar servicios, publicar, enviar invitaciones reales o modificar datos de producción. Mientras tanto, avanza en todo lo que sea independiente de ese bloqueo.

No inventes credenciales ni resultados de pruebas. Distingue claramente entre funcionalidad real, demostración con datos ficticios y conexión pendiente.

## 2. Qué es APEX

APEX es una plataforma de autoestudio para la preparación de pruebas Saber Pro. Permite evaluar conocimientos, consultar material, observar el progreso y recibir acompañamiento de un tutor de inteligencia artificial.

Público inicial: estudiantes universitarios, en el contexto de la Universidad de Cundinamarca, extensión Soacha. La primera versión trabaja con una sola institución o compañía. Se espera inicialmente una carga pequeña, aproximadamente siete usuarios simultáneos.

Experiencia principal:

1. Registrarse con los datos personales y académicos, guardados y validados una sola vez.
2. Confirmar correo si aplica e iniciar sesión; edición del perfil opcional.
3. Presentar un diagnóstico inicial.
4. Consultar una estimación del nivel de conocimiento.
5. Estudiar material y recibir recomendaciones.
6. Presentar nuevas evaluaciones asignadas.
7. Observar la evolución por núcleo temático y competencia.
8. Consultar al tutor IA y, en etapas posteriores, recibir acompañamiento docente.

## 3. Alcance inicial

El componente confirmado del MVP es **Inglés**. Es un componente de estudio asociado a programas académicos existentes; nunca sustituye el programa del estudiante.

La demo de Razonamiento Cuantitativo y sus resultados se conservan. El contenido real procede de la fuente existente `icfes-ingles-2018-v1`, todavía sin aprobación ni publicación. Las 25 preguntas/opciones, instrucciones, ejemplos y lecturas se transcribieron del PDF local y cotejaron visualmente por el asistente; las claves de página 10 están separadas. Consultar [INGLES_2018.md](INGLES_2018.md) y `content/ingles-2018/REVISION.md`. El SQL real en borrador está generado; falta revisión humana y aplicación remota autorizada, no extracción.

La entrega inicial debe cubrir un recorrido completo: registro → confirmar correo si aplica → inicio de sesión → diagnóstico → resultado → historial. Después incorpora material documental y tutor IA. Los permisos de docente/administrador forman parte del servidor desde esta etapa; sus flujos completos se implementan después.

La IA forma parte del objetivo del MVP; no la elimines del alcance general porque la primera etapa se concentre en evaluaciones. Tampoco es necesario construir todos los módulos al mismo tiempo.

## 4. Tecnología y arquitectura

Decisiones existentes:

- Frontend: React Native con Expo y TypeScript, con soporte Android y web.
- El prototipo Firebase hermano es un antecedente, no una dependencia ni proveedor de APEX.
- No hay una migración de usuarios ni datos autorizada como parte de este arranque.

Base técnica definitiva:

- **Las preguntas de la app se obtienen exclusivamente de Supabase**, mediante las RPC autorizadas. No usar JSON locales, SQLite, PGlite ni datos de prueba como proveedor o respaldo del funcionamiento normal. Si Supabase no está configurado o no responde, mostrar el estado/error correspondiente; no sustituir el banco. Las bases temporales y las respuestas sintéticas quedan limitadas a pruebas aisladas. Los archivos locales de extracción/revisión sirven para preparar una futura carga aprobada en Supabase, nunca para alimentar directamente la app.

- PostgreSQL administrado en Supabase para persistencia relacional.
- Supabase Auth para registro, login y recuperación; perfil vinculado por `auth_user_id UUID REFERENCES auth.users(id)`. No guardar contraseñas en el dominio.
- Supabase Storage, bucket privado `materiales-estudio`, para archivos PDF versionados.
- RPC PostgreSQL autorizadas para perfil, roles, evaluación y calificación. Funciones futuras de servidor para invitaciones propias e integración IA. RLS se conserva y el esquema `apex_private` no se expone por Data API.
- SQLite y el servidor de autenticación local anterior quedan como referencia histórica; el cliente actual no los usa. No se borran sus datos ni se migran identidades automáticamente.
- Gemini como proveedor IA y n8n como herramienta prevista para orquestar su flujo.

Comprueba versiones compatibles antes de instalar. No copies automáticamente las versiones del prototipo anterior ni actualices paquetes sin necesidad. Mantén TypeScript estricto.

TypeScript es el lenguaje del código; no es por sí mismo el backend. Identifica qué código se ejecuta en el cliente y cuál en un entorno de servidor.

Prefiere una aplicación modular sencilla. No introduzcas microservicios ni capas de abstracción que no resuelvan una necesidad real.

Organización orientativa, adaptable a la navegación que elijas:

- Módulos: auth, profile, dashboard, assessments, study, progress, ai, tutoring, administration y help.
- Dentro de cada módulo: pantallas, componentes, hooks, servicios, tipos y validaciones, solo cuando sean necesarios.
- Código compartido: componentes visuales, layouts, tema, utilidades y clientes de conexión.
- Backend y migraciones: separados del código que se distribuye a Android o al navegador.
- Documentación: instrucciones de ejecución, decisiones, avances y limitaciones.

Si eliges Expo Router, utiliza su estructura de rutas; si eliges navegación explícita, configura los navegadores correspondientes. No combines dos sistemas sin motivo.

## 5. Usuarios y permisos

Usuario es el concepto base del dominio; no significa superadministrador. Los roles son estudiante, docente y administrador.

### Estudiante

- Consulta y modifica únicamente su perfil autorizado.
- Accede a material y evaluaciones relacionados con su programa/componente.
- Presenta evaluaciones y consulta sus resultados, historial y progreso.
- Consulta al tutor IA.
- No puede modificar otros usuarios, sus permisos o sus resultados.

### Docente

- Ingresa mediante invitación enviada a un correo autorizado.
- La invitación permite establecer su propia contraseña; no se le envía una contraseña elegida por el administrador.
- Consulta estudiantes asignados y sus resultados.
- Registra retroalimentación y gestiona tutorías dentro de su ámbito autorizado.
- No tiene acceso general a todos los estudiantes.

### Administrador

- Inicialmente es habilitado por los desarrolladores.
- Gestiona usuarios, invitaciones, asignaciones y contenido según sus permisos.
- Nadie puede obtener este rol mediante el registro público o modificando datos desde el cliente.

El registro público habilita estudiantes. Las pantallas y opciones por rol no sustituyen la autorización en servidor. La combinación de varios roles en una misma cuenta sigue pendiente: no inventes una interfaz de cambio de rol sin necesitarla.

## 6. Registro y sesión

Datos comunes: nombre, correo, fecha de nacimiento obligatoria y estado de cuenta. La foto de perfil es opcional.

Datos académicos del estudiante: programa académico y semestre. El docente tiene código de empleado y especialidad, cuya captura se integra con el flujo de invitación.

La contraseña debe cumplir las reglas solicitadas:

- Mínimo ocho caracteres.
- Al menos una letra mayúscula.
- Al menos tres dígitos numéricos.
- Al menos uno de estos símbolos: `*`, `+`, `-`, `/`.

Muestra los requisitos antes de enviar y marca en tiempo real cuáles se cumplen. Ofrece mostrar/ocultar contraseña y errores comprensibles.

La validación de interfaz no es suficiente para imponer una política de seguridad. Comprueba cómo aplicar las reglas en el proveedor o flujo de servidor elegido y documenta cualquier limitación. No guardes contraseñas en las tablas del dominio ni en logs.

Incluye recuperación por correo, cambio de contraseña con verificación de identidad y cierre de sesión accesible. Maneja por separado fallos de autenticación y fallos al crear el perfil, permitiendo recuperar un alta parcialmente completada.

Reglas de sesión acordadas:

- Fuera de evaluaciones: noventa segundos de inactividad requieren nueva autenticación.
- Cinco intentos fallidos producen un bloqueo temporal de cuatro minutos.
- La ventana para contar intentos y la retención de eventos de acceso todavía deben definirse.
- El bloqueo y la autorización deben ser efectivos en el servidor/proveedor; un contador local no basta.

## 7. Evaluaciones

Tipos previstos:

| Tipo | Cantidad | Duración |
| --- | --- | --- |
| Diagnóstico inicial | 7 preguntas | Sin límite total; aplica inactividad |
| Control de Inglés por nivel | 10 preguntas | Duración total sin definir; se conserva inactividad existente |
| Examen final de Inglés, tres niveles | 25 preguntas | Duración total sin definir; se conserva inactividad existente |

Dos minutos por pregunta es una referencia promedio para los cuestionarios; no es un temporizador individual obligatorio. No presentes una configuración interna como reproducción oficial del examen sin verificarla.

Para la primera implementación se propone selección múltiple con única respuesta. Los demás formatos se validarán contra el banco elegido; no los des por implementados.

Reglas principales:

- Un intento por estudiante y evaluación asignada.
- Pueden asignarse nuevas evaluaciones posteriormente para medir evolución.
- Se permite retroceder entre preguntas.
- Se conservan respuestas confirmadas por el servidor.
- El inicio requiere doble confirmación e información sobre duración, intento único y conexión.
- Una desconexión bloquea temporalmente la interacción, conserva lo guardado y permite retomar el mismo intento; no crea un intento nuevo.
- La finalización debe ser idempotente y evitar cambios posteriores de respuestas.
- El servidor valida pertenencia de ítems, opciones, propietario, estado y tiempos del intento.
- El cliente no recibe la clave de corrección durante una evaluación activa.

Inactividad dentro de una evaluación:

- Aviso al llegar a cinco minutos.
- Cuenta atrás de un minuto a partir de los siete minutos.
- Bloqueo al completar ocho minutos y retorno al menú.
- Contemplar interacción táctil, teclado y mouse, así como el estado de la app.

Leer o resolver en papel puede implicar no tocar la pantalla. No interpretes esa ausencia de interacción como evidencia de fraude. La política de inactividad debe mostrar avisos claros y conservar las respuestas.

Siguen pendientes el plazo de reconexión, si el reloj continúa durante una interrupción y el efecto definitivo del bloqueo por inactividad. Puedes usar una política provisional configurable para desarrollar y probar, documentándola; debe revisarse antes de aplicarse a estudiantes reales.

## 8. Resultados, progreso y material

- El diagnóstico produce una estimación inicial, no un puntaje oficial ICFES.
- La corrección de preguntas objetivas usa la clave y la regla definidas en servidor.
- La IA explica y recomienda; no inventa aciertos ni modifica unilateralmente una calificación objetiva.
- Mostrar aciertos, porcentajes, evolución por núcleo/competencia y evaluaciones completadas.
- Incluir preguntas no respondidas en el denominador de la evaluación finalizada.
- No mostrar gráficas con valores inventados cuando no existen resultados; utiliza estados vacíos.
- Versionar las reglas de estimación y conservar instrumentos históricos para reproducir los cálculos.
- La fórmula definitiva del nivel está pendiente: usa métricas simples y explícitas para el desarrollo, sin simular una escala oficial.
- Los documentos fuente serán PDF de la caja de herramientas ICFES. Registrar título verificado, edición cuando exista, URL original, ruta Storage, hash y páginas físicas PDF. No inventar contenido o referencias si faltan archivos.
- Distinguir preguntas originales del documento, adaptadas, generadas y propias de demostración. Carga de PDF, extracción, revisión y publicación son pasos separados; no publicar automáticamente preguntas.
- Preparar fragmentos documentales con PDF/página para contexto IA; solo contenido revisado y autorizado, sin exponer claves de evaluaciones. Los desarrolladores gestionan inicialmente la revisión.

## 9. Base de datos y diagramas

Se elaboraron casos de uso, clases, secuencia, procesos, actividades, modelo conceptual, comunicación/colaboración, MER y modelo relacional.

El modelo relacional propone 32 tablas y tres vistas. Los ocho Draw.io y sus 41 páginas están disponibles en `Docs/diagrams`, con extracción en `diagramas-extraidos.json`. Las cinco migraciones aplicadas según el propietario llevan el esquema de aplicación a 25 tablas y conservan las tres vistas. La sexta migración preparada agrega `bloque_preguntas` (26 tablas). No se reescriben migraciones aplicadas ni se infiere el historial CLI a partir de ejecuciones manuales; comprobarlo antes de usar herramientas de despliegue.

Inventario de referencia:

- Identidad: USUARIO, ESTUDIANTE, DOCENTE, ADMINISTRADOR, INVITACION_DOCENTE, EVENTO_ACCESO, CONSENTIMIENTO.
- Organización: PROGRAMA_ACADEMICO, COMPONENTE, COMPETENCIA, NUCLEO_TEMATICO, PROGRAMA_COMPONENTE.
- Material: MATERIAL_ESTUDIO, FUENTE, MATERIAL_NUCLEO.
- Preguntas: PREGUNTA, OPCION_RESPUESTA.
- Evaluaciones: EVALUACION, ITEM_EVALUACION, EVALUACION_COMPONENTE, ASIGNACION_EVALUACION, INTENTO, RESPUESTA.
- Resultados: RESULTADO.
- Docentes: ASIGNACION_DOCENTE, TUTORIA, RETROALIMENTACION.
- IA: CONVERSACION_IA, MENSAJE, RECOMENDACION, RECOMENDACION_RESULTADO, CITA_FUENTE.
- Vistas: V_HISTORIAL_ACADEMICO, V_PROGRESO_NUCLEO, V_PROGRESO_COMPETENCIA.

Simplificaciones de esa propuesta:

- Una fuente principal por material y por pregunta, mediante FK directa.
- Un núcleo y una competencia por pregunta, mediante FK directa.
- Los desgloses por núcleo y competencia se calculan desde las respuestas; no se guardan dos tablas adicionales de resúmenes.
- Se conservan las relaciones N:M necesarias, como materiales/núcleos y programas/componentes.

Estas cardinalidades deben validarse con el contenido real. Si una pregunta necesita varias competencias, documenta el ajuste necesario en lugar de perder información para mantener artificialmente el número 32.

No necesitas implementar las 32 tablas en la primera etapa. Implementa las necesarias para cada recorrido, con migraciones coherentes y restricciones de integridad. Tampoco necesitas 32 módulos en el frontend.

Restricciones esenciales: una asignación por estudiante/evaluación, un intento por asignación, una respuesta por intento/ítem y un resultado por intento. La opción seleccionada debe corresponder a la pregunta del ítem y este a la evaluación del intento. Autoriza las consultas y las vistas según el usuario solicitante.

## 10. Tutor IA y n8n

La IA recibe el contexto académico autorizado, comprende resultados y adapta recomendaciones. Entrenar un modelo con datos propios es una posibilidad futura, no parte de esta versión.

- Proveedor previsto: Gemini. El identificador exacto del modelo debe ser configurable y verificarse contra la API disponible al implementar.
- Orquestador previsto: n8n, inicialmente local.
- La aplicación llama a una operación autenticada del backend; no incluye claves privadas de Gemini ni credenciales de n8n.
- El backend verifica el usuario y selecciona únicamente los resultados a los que tiene acceso.
- Añade límites de uso configurables, manejo de errores, tiempos de espera y estados de carga.
- No inventes fuentes ni presentes cualquier respuesta generada como información verificada.
- El flujo debe conservar citas verificables cuando use información externa.
- Una función alojada en la nube no puede llamar al localhost del computador del desarrollador. Diseña y documenta la conexión del entorno de desarrollo sin asumir acceso automático a n8n local.

Si no existen credenciales o n8n no está disponible, prepara la integración y un proveedor de demostración explícito. No lo presentes como una conexión real con Gemini.

## 11. Privacidad y seguridad

- Solicitar consentimiento informado para los usos de información que lo requieran, con finalidad y versión del aviso.
- Enviar a la IA solo los datos académicos necesarios; no enviar deliberadamente nombre, correo ni fecha de nacimiento como contexto de desempeño.
- Considerar que un mensaje escrito libremente puede contener datos personales.
- El estudiante conserva su historial académico. Para estudios posteriores se pretende conservar resultados, pero los plazos, la anonimización y su relación con la eliminación de cuenta no están cerrados.
- Se mencionó un horizonte de seis meses; no lo conviertas automáticamente en una regla de borrado para todos los datos.
- Eliminar la cuenta debe coordinar identidad de autenticación, perfil, progreso e historial IA. Documentar las decisiones pendientes sobre auditoría y copias de respaldo.
- Proteger las claves correctas, roles y operaciones administrativas en servidor.
- Las claves de servicio, credenciales de base de datos y secretos de IA nunca deben incluirse en el paquete del frontend ni en variables públicas de Expo.
- Proporcionar archivos de ejemplo de configuración sin secretos.

## 12. Experiencia visual

Existe el mockup HTML en `Docs/mockups`, usado como referencia visual de la primera entrega. Sus estadísticas, claves y datos ficticios no son reglas del producto. Usa estas referencias:

- Interfaz en español, minimalista y enfocada en estudiar.
- Azul suave como color principal, verde como acento, fondos claros, tarjetas y espaciado consistente.
- Colores orientativos: principal #5B7FA5, principal oscuro #3D5A80, acento #6BA38A y fondo #F5F7FA. Ajusta contrastes cuando sea necesario.
- Secciones principales: acceso, dashboard, ruta de estudio, simulacros, progreso y tutor IA.
- Web de escritorio con navegación lateral cuando convenga; Android con navegación y distribución adaptadas a pantallas pequeñas.
- Componentes reutilizables para botones, campos, tarjetas, mensajes, carga, errores y confirmaciones.
- Objetivo de accesibilidad WCAG 2.2 AA: contraste, etiquetas, teclado en web, lectores de pantalla, tamaño de texto adaptable y estados que no dependan solo del color. No declares cumplimiento sin comprobarlo.
- FAQ, ayuda contextual, presentación del servicio y recuperación de cuenta accesibles según corresponda sin sesión.

El mockup anterior contenía demostraciones que no deben copiarse como reglas: respuestas correctas visibles durante el simulacro, chats grupales, videollamadas, tiempos y estadísticas ficticias. Chat grupal y videollamadas quedan fuera de esta primera implementación.

Confirmar acciones críticas como iniciar una evaluación, cerrar sesión, borrar conversaciones, cancelar tutorías o eliminar datos. Evitar perder respuestas o trabajo por una navegación accidental.

## 13. Rendimiento y estados de interfaz

Se acordó hasta un minuto para cargar preguntas y alrededor de treinta segundos para entregar resultados. Son límites/objetivos iniciales, no demoras que debas introducir. Busca respuestas más rápidas.

El guardado de respuestas necesita confirmación visible y manejo de fallos. La latencia de la IA depende del proveedor, pero la interfaz debe tener una espera acotada, errores comprensibles y posibilidad de reintentar cuando sea seguro.

## 14. Forma de trabajar y primera entrega

1. Revisa el contenido real de la carpeta y cualquier instrucción existente.
2. Explica brevemente la arquitectura elegida y las primeras etapas.
3. Inicializa una aplicación ejecutable para web y Android.
4. Implementa el primer recorrido completo con navegación, formularios, diagnóstico, resultado y progreso.
5. Prepara las migraciones y conexiones necesarias. Si faltan accesos, permite probar el recorrido en un modo de demostración claramente separado y documenta qué falta conectar.
6. Verifica TypeScript y el funcionamiento de lo implementado. Prioriza pruebas de reglas críticas: intento único, pertenencia de respuestas, cálculo y permisos.
7. Continúa con material e integración IA cuando la base del recorrido esté lista.

Documenta en README cómo instalar, configurar y ejecutar, y en un archivo de progreso qué funciona, qué es provisional y qué sigue pendiente. Si creas AGENTS.md, úsalo para instrucciones breves de trabajo; conserva este archivo como contexto de producto.

No generes únicamente carpetas vacías, pantallas de adorno o un plan. La meta es una primera entrega que se pueda ejecutar y recorrer. Tampoco describas como terminada una función que depende de conexiones todavía no configuradas.

Al cerrar una etapa, informa qué implementaste, cómo lo verificaste, cómo probarlo y cuáles son los bloqueos reales. Usa esta información como base, conserva las reglas acordadas y toma decisiones técnicas reversibles sin requerir supervisión constante.


## 15. Estado vigente: Supabase e Inglés

- Cliente Expo conectado a Supabase Auth/RPC/Storage. El propietario confirma registro, diagnóstico y resultados con Supabase real; no se inspeccionó ni modificó remoto en esta entrega.
- Registro, confirmación de correo, login, perfil pendiente recuperable, recuperación/cambio de contraseña, diagnóstico, resultado e historial implementados. Las pruebas locales usan Auth simulado y PostgreSQL PGlite.
- Las cinco migraciones y seed-demo están aplicadas según el propietario y se preservan byte por byte. Nueva sexta migración pendiente: bloques originales de Inglés, clasificación propuesta, asignación por programas y protección de contexto IA. Ver [guía de Inglés](INGLES_2018.md) y [diagrama complementario](diagrams/APEX_Ingles_2018.md).
- RLS conservada, tablas/vistas privadas y DTO sin claves. Guardado y finalización bloquean la fila del intento; el resultado incluye omisiones y snapshot de desgloses.
- Diagnóstico de 7 ítems de selección única sin límite total. Los formatos múltiple/abierta son representables en borrador, pero se rechazan al publicar. Nuevas evaluaciones/versiones usan IDs nuevos.
- Docente consulta asignados; administrador cambia roles con auditoría. Invitaciones propias, código/especialidad, vigencias, tutoría y retroalimentación pendientes.
- Fuente `icfes-ingles-2018-v1` y PDF en Storage ya registrados por el propietario. PDF local en `Docs/materiales/05_02_Cuadernillo_de_preguntas_ingles_Saber_Pro.pdf`; transcripción completa cotejada por el asistente, incluida lectura de página 7 desde imagen y claves de página 10. SQL real generado en `supabase/content/icfes-ingles-2018-draft.sql`; preguntas/bloques en borrador y diagnóstico sin publicar. Aprobación humana pendiente. La demo aplicada y su historial se conservan.
- Bloqueo de cinco fallos requiere activar el hook Auth. La complejidad exacta de tres dígitos/símbolos no queda impuesta por la configuración estándar del proveedor; requiere decisión explícita antes de uso real.
- Pendientes: revisión humana de transcripción/claves y taxonomía/selección propuestas, aplicar sexta migración y carga en borrador, publicación/asignación autorizadas; verificar recuperación/SMTP y hook real según configuración, IA Gemini/n8n, multirrol, formatos/tiempos avanzados, retención/eliminación y prueba Android en dispositivo. Inglés ya está confirmado; no reabrir la elección del componente.
- APEX no tiene repositorio Git ni remoto. El proyecto hermano no se modifica ni se publica por inferencia.

# Progreso APEX

## Catálogo administrativo — investigación y corrección frontend del 01/11/2026

- Reproducción local anterior a la corrección: `admin_catalog_save` devolvía 200 y actualizaba listado/opciones; el aviso quedaba fuera del área visible en escritorio. La retirada permitida dependía del motivo del formulario de catálogo, sin campo propio en Asociaciones. Los errores de lectura tampoco diferenciaban condiciones anteriores de una nueva comprobación.
- Corrección: feedback junto a cada acción, revisión con ID/nombre/motivo, conservación de borradores, comprobación del ID y de la respuesta de la API, nueva lectura verificada y prevención de escrituras simultáneas. Asociaciones tiene motivo explícito, comprobación manual, estados de carga/regla/error y revalidación del estado actual al confirmar. Inglés y las restricciones del servidor se conservan.
- **19/19 pruebas web dirigidas y 5/5 SQL administrativas existentes aprobadas**; TypeScript y hashes de migraciones correctos. Incluyen éxito real local, retirada/reasociación, rechazos del servidor, error/ambigüedad, refresco fallido y condiciones cambiantes. No se repitió la regresión completa de docente/estudiante ni se cerró su fallo de desplazamiento previo.
- Exportaciones web y Android/Hermes correctas; cinco archivos exportados revisados sin contenido privado o marcadores de credenciales. No se ejecutó Android en dispositivo. Comparación SHA-256 de 122 archivos de backend/contratos/configuración: intactos, sin adiciones.
- Sin operaciones remotas ni programas/asociaciones reales creados o retirados. El SQL permite retirar solo componentes distintos de Inglés sin perfiles del programa, incluyendo perfiles conservados sin filtrar estado/rol actual. No se reprodujo un defecto backend; la respuesta y proyección del entorno remoto siguen requiriendo evidencia depurada para explicar los intentos concretos del responsable.

Detalles, archivos y capturas: [CATALOGO_ADMINISTRADOR.md](CATALOGO_ADMINISTRADOR.md).

## Rediseño frontend del administrador — entrega local del 01/11/2026

- Cinco vistas con menú lateral APEX y menú móvil: Inicio, Consultar, Asignación y transición (Profesores e invitaciones / Salones), Programas y componentes y Auditoría. Se conservan opciones comunes, cuentas de todos los roles, editores, grupos, membresías, catálogo, invitaciones y enlaces anteriores.
- Inicio muestra conteos globales y barras de estados desde `admin_overview`; Consultar añade copia de ID y resultados por la operación administrativa ya autorizada. Auditoría usa opciones con etiquetas y calendarios, fechas civiles inclusivas de Bogotá y rechazo de rangos invertidos. Sin filtro inventado de rol en auditoría ni salones por profesor inferidos a partir de páginas parciales.
- Verificación: TypeScript, hashes de migraciones, exportaciones web y Android/Hermes y revisión de cinco archivos exportados correctos; **10/10** pruebas administrativas dirigidas aprobadas. Regresión web completa: **44/45**; persiste el fallo docente de desplazamiento a 390 px previamente documentado (572 px ante cambio de altura, tolerancia <5). No se da por corregido ni se modificó su panel. Android es compilación, sin ejecución en dispositivo.
- Comparación SHA-256 de **123 archivos** de backend/contratos/configuración sin cambios ni adiciones. No hubo cambios remotos, correos reales, nuevas dependencias ni modificaciones de SQL, roles, datos reales, permisos, Edge, secretos o SMTP. Ambos recorridos de invitación se conservaron y probaron mediante simulaciones locales; la confirmación manual real del responsable sigue separada abajo.

Entrega, mapa anterior → nuevo, capturas de las vistas a 1280/390 px y límites de datos/pruebas: [REDISENO_ADMINISTRADOR.md](REDISENO_ADMINISTRADOR.md).

## Invitaciones de profesores — confirmación manual registrada el 01/11/2026

El responsable del proyecto confirma que **realizó personalmente las pruebas manuales reales** de las dos modalidades y que ambas funcionan correctamente. Son resultados informados y confirmados por el responsable, **no pruebas ejecutadas por el asistente**:

- **Cuenta existente:** envío mediante Gmail API, recepción del correo, aceptación explícita y acceso al panel de profesor.
- **Cuenta nueva:** envío mediante Supabase Auth con SMTP de Gmail, recepción del correo, establecimiento de contraseña, aceptación y acceso al panel de profesor.
- **Servicios remotos:** `admin-invitations` desplegada en Supabase y secretos necesarios configurados, según confirmación del responsable. Gmail API y Supabase Auth con SMTP de Gmail verificados operativamente en esos recorridos, sin inspección remota independiente del asistente.
- **Frontend local:** sigue en `http://localhost:8081`, con retorno `http://localhost:8081/auth/invite`; requiere la aplicación ejecutándose y abrir el enlace en el mismo computador. No acredita publicación del frontend ni retorno desde otro dispositivo o Android nativo.
- **Limitaciones y pendientes conservados:** OAuth External/Testing mantiene el vencimiento de refresh tokens a siete días para `gmail.send` y requiere reautorización; no se acredita operación permanente. Quedan por verificar caducidad/reautorización y errores reales de Google/SMTP, fallo/reintento de alta vinculada, rechazo por identidad ajena, permisos antes de aceptar, auditoría e historial, login posterior/estado administrativo, revocación, vencimiento/cancelación, examen activo, cambios de cuenta, reenvío y doble aceptación; además, gateway, concurrencia multiconexión, Android nativo y fallo intermitente de desplazamiento docente.

Actualización exclusivamente documental en esta guía y INVITACIONES_PROFESORES.md (`Docs/INVITACIONES_PROFESORES.md`, solo local; v?ase la gu?a de reproducibilidad). El asistente no repitió pruebas ni realizó envíos, cambios de código, migraciones, roles, datos o configuración remota. No se incluyen valores de contraseñas, tokens o secretos. La guía conserva por separado las pruebas automatizadas locales del 27/10/2026 y el procedimiento de referencia. Las entregas anteriores siguen debajo como historial; sus pendientes de envío básico y despliegue de estas invitaciones quedan actualizados por esta confirmación, sin extenderla a otros módulos.

**11/10/2026 — entrega local:** [Mi ruta, diagnóstico APEX 2+2+3 y repasos](APRENDIZAJE_MVP.md) implementados con migraciones aditivas, avance explícito y repetición vinculada. [Verificación](VERIFICACION_APRENDIZAJE.md): SQL/seguridad, navegador desktop/móvil y compilación web/Android. [Limpieza](LIMPIEZA_APRENDIZAJE.md) acotada, con candidatos conservados. Falta configurar y verificar el proveedor IA, fragmentos educativos y flujo nativo. Sin publicaciones, cambios remotos ni asignaciones reales. Los apartados siguientes conservan las entregas anteriores.

**Decisión posterior aprobada:** `demo` debe incluir Inglés como componente principal del MVP, conservando `rc`. La falta de esa asociación es la causa confirmada del listado vacío. [SQL dirigido y orden pendiente](DIAGNOSTICO_RUTA_CORRECCION.md) preparados con IDs reales y una única cuenta destinataria; transiciones idempotentes protegen el historial. Las 21 secciones abren pantallas independientes con regreso y contenido pendiente sin finalización si falta. Diagnóstico completo sin IA, validado localmente; ninguna operación remota ejecutada.

## Registro sin duplicación y edición opcional — entrega local del 07/10/2026

- Alta Auth y perfil en una sola transacción: nombre, fecha de nacimiento, semestre, carrera y consentimiento se guardan y validan incluso antes de confirmar el correo. No se depende de una segunda RPC del cliente ni se marca completo un perfil sin comprobar sus datos persistidos.
- «Editar perfil» es opcional, precarga datos y admite únicamente nombre, semestre y carrera. Fecha de nacimiento de solo lectura; servidor rechaza fecha, identidad, correo, rol, estado y banderas de completitud. Roles, permisos y sesiones actuales conservados.
- Cambiar carrera/semestre de un perfil completo no crea asignaciones ni modifica intentos, respuestas, snapshots, resultados o progreso. La migración aditiva 10 recupera conservadoramente perfiles pendientes; no inventa fechas ni aceptación del aviso.
- Verificado: 19 pruebas PostgreSQL/PGlite y 6 E2E web pasan; registro con/sin confirmación simulada, enlace web, recarga/nuevo login, diagnóstico, edición opcional en 1280/390 px y conservación del historial. TypeScript pasa. Exportaciones web/Android verificadas; las nueve migraciones anteriores conservan sus hashes.
- Android nativo **parcial**: `npm run test:android` comprobó registro, calendario y persistencia de nombre, fecha, carrera, semestre y `complete=true` en PGlite local. El último intento falló al navegar al diagnóstico con `androidDevice.info: androidx.test.uiautomator.StaleObjectException`. La automatización pierde una referencia durante una transición de la interfaz. No se da por verificado diagnóstico, edición, reinicio ni confirmación de correo en Android nativo. No se repiten pruebas aprobadas para resolver esa limitación.
- Pendiente: completar esos recorridos nativos mediante prueba manual o una sesión de automatización estable; aplicar solo la nueva migración pendiente mediante el procedimiento del propietario y comprobar Auth/SMTP/redirect reales. No se ejecutaron cambios remotos.

SQL e instrucciones: [REGISTRO_PERFIL.md](REGISTRO_PERFIL.md). Evidencia web: `Docs/evidence/profile-edit-1280.png` y `profile-edit-390.png`. Prueba nativa preparada en `scripts/verify-profile-android.mjs`; logs de la última sesión en `test-results/android-fixture.log` y `android-metro.log`, captura del fallo en `test-results/android-profile-failure.png`. Las secciones siguientes conservan entregas anteriores.

## Banco APEX 105 y rutas individuales — entrega local del 06/10/2026

Esta sección es el estado vigente; los avances anteriores se conservan como historial.

- PDF localizado en `Docs/Materiales`, extraído/cotejado en sus 65 páginas: 105 preguntas, 35 por nivel, 40 bloques, 475 opciones, IDs/versiones/habilidades, contextos completos, claves/justificaciones y referencias conservados. Aprobación interna del responsable registrada por instrucción expresa; ninguna revisión docente ni aval del ICFES atribuidos.
- Tres migraciones nuevas `202610060001`–`202610060003` y carga idempotente `supabase/content/apex-ingles-105-v0.2.sql`. Las cinco aplicadas según el propietario, la sexta anterior y la demo se preservan. La carga verifica conflictos y no modifica versiones/historiales. Plantillas deshabilitadas, sin publicaciones ni asignaciones reales.
- Controles 10/10/10 y examen final 25 (8+7+10), seleccionados en servidor por familias de habilidad/dificultad prevista y bloques completos no vistos. Convocatoria/intento únicos, selección/orden/versiones y exposición persistidos; recuperación idéntica y agotamiento explícito registrado sin consumo parcial. Diagnóstico anterior de siete y resultados/SQLite históricos conservados.
- PDF privado, administrador exclusivamente; fuente completa excluida del tutor para todos los roles. `apex_private` continúa fuera de Data API. Cliente y paquetes exportados sin banco/claves locales.
- Modelo y contrato de rutas por estudiante con catálogo propio autorizado, prerrequisitos, motivos, reglas versionadas e idempotencia; rechaza propuestas inválidas/desactualizadas y conserva versiones/progreso. Sin lecciones, umbrales, reglas de avance, completados o conexión IA inventados. Web/Android muestran «generación de ruta pendiente» y separan materiales disponibles.
- Verificación local: TypeScript y hashes de migraciones pasan; 15 pruebas PostgreSQL/PGlite pasan, incluyendo carga real, rechazo de bloques/órdenes/composiciones inválidas y rutas; 4 E2E pasan en Edge invisible, incluido control real 10 → pausa/recuperación → final 25 → ruta pendiente; exportaciones web y Android/Hermes pasan; inspección de los 5 archivos exportados sin contenido/IDs/claves del banco. No se publicó un sitio, APK o evaluación.
- Pendiente: aplicar migraciones/carga en el proyecto real después del preflight, comprobar Storage y su PDF, PostgREST/GoTrue/SMTP/hooks/permisos y concurrencia multiconexión; prueba Android física; aprobar contenido propio de lecciones y reglas de avance; conectar IA posteriormente. No se inspeccionó ni modificó Supabase remoto durante esta entrega.

Entrega y orden exacto: [APEX_BANCO_105.md](APEX_BANCO_105.md). Contrato: [RUTAS_IA.md](RUTAS_IA.md). Comprobación posterior solo lectura: `supabase/verify-apex-bank.sql`. Evidencia móvil: `Docs/evidence/apex-control-mobile.png` y `apex-route-pending-mobile.png`.

## Inglés — contenido real transcrito, aprobación humana pendiente

- Inglés confirmado como componente. El propietario informa cinco migraciones y demo aplicadas y el recorrido funcionando en Supabase real. Sus archivos se conservan con hashes verificados.
- Nueva migración `202610040001_english_question_blocks.sql`: bloques, numeración/etiquetas originales, origen de clasificación, protección de contexto y RPC administrativa de asignación por programas existentes. No sustituye el programa académico ni cambia la demo.
- Interfaz compartida web/Android para instrucciones, opciones A–H, ejemplos y lecturas. El tablero muestra pendientes aunque otro diagnóstico esté finalizado; historial con títulos.
- PDF local suministrado en `Docs/materiales` leído y renderizado con PyMuPDF 1.28.2. Se cotejaron visualmente páginas 1, 2 y 5–10; lectura de p. 7 transcrita desde imagen. `revision.json` y `REVISION.md`: 25 preguntas, 100 filas de opciones y cuatro bloques con instrucciones/ejemplos y dos lecturas. Claves de p. 10 cotejadas y separadas en `claves.servidor.json`. Revisión humana pendiente explícita.
- SQL real generado: `supabase/content/icfes-ingles-2018-draft.sql`, para aplicar después de la sexta migración si está pendiente. Exige fuente existente y metadata compatible, conserva su estado pendiente y el título registrado; preguntas/bloques en borrador, sin revisores, diagnóstico sin publicar, sin asignaciones ni fragmentos IA. Los archivos locales son insumos editoriales, no fuentes de preguntas para Expo.
- Propuesta preliminar de siete ítems: 1, 4, 6, 11, 16, 21, 24. Cobertura y límites en [INGLES_2018.md](INGLES_2018.md); sin equivalencia de nivel oficial.
- Verificación de contenido: siete pruebas PostgreSQL aprobadas. La nueva prueba carga el SQL real únicamente en una base temporal aislada, verifica correspondencia de textos/opciones/claves/páginas y que no se apruebe, publique ni asigne; preserva un resultado de demo previo y rechaza metadata incompatible/repetición. La app sigue leyendo solo de Supabase. Los tres E2E y exportaciones web/Android de la entrega anterior usaron contenido sintético; no hubo cambios de interfaz en esta extracción. No se ejecutaron cambios remotos ni se aprobó/publicó contenido.

## Entrega Supabase anterior — 03/10/2026

## Implementado

- Cliente Expo usa exclusivamente Supabase Auth y RPC PostgreSQL. Registro con confirmación, login, recuperación por enlace web/Android, cambio con verificación de contraseña actual, perfil pendiente recuperable y cierre de sesión. Sin proveedor Firebase ni API SQLite en el recorrido actual.
- UUID FK a `auth.users`; rol público estudiante, gestión administrativa auditada y docente limitado a estudiantes asignados. Paneles básicos por rol. RLS permanece en todas las tablas; sin lectura directa del banco o vistas por el cliente.
- Intento único recuperable, validación servidor de ítem/evaluación/opción, bloqueo transaccional y finalización idempotente con omisiones en el denominador. Instrumentos y fuentes utilizadas se congelan; resultados conservan snapshot de desgloses.
- Cuatro migraciones aditivas; original intacta, checksum comprobado. 25 tablas y 3 vistas privadas. Preflight de solo lectura y orden exacto en `SUPABASE.md`. No se comprobó el historial remoto por falta de configuración; no se ejecutó ningún cambio remoto.
- Bucket privado `materiales-estudio`, controles restrictivos incluso frente a políticas Storage permisivas existentes, carga administrativa, lectura por programa/asignación y sin sobrescribir versiones. Durante un intento activo, el estudiante tampoco accede a material/PDF/contexto de sus fuentes.
- Metadata documental y fragmentos por página con revisión separada; tipos/procedencia de preguntas; publicación explícita. Script local de manifiesto/extracción opcional. No hay PDF ICFES, fuentes/páginas inventadas ni publicaciones automáticas. Semilla propia opcional.
- Contexto, guía de integración, contraste y diagrama complementario actualizados. Datos SQLite y ocho diagramas originales conservados; APEX sigue sin repositorio remoto.

## Verificación de esta entrega

| Comprobación | Evidencia y alcance |
| --- | --- |
| TypeScript | `npm run typecheck`, cliente, utilidades, pruebas PostgreSQL y servidor histórico sin errores. |
| PostgreSQL local | `npm test`: 4 pruebas con múltiples aserciones sobre recorrido, cuentas ajenas, escalada de rol, respuestas inválidas, idempotencia, inmutabilidad, RLS, Storage, revisión, hook y actualización sobre datos anteriores. Motor PGlite; esquemas internos Auth/Storage simulados. |
| E2E web | `npm run test:e2e`: 2 recorridos en Edge invisible. Registro/diagnóstico/resultado/historial, desconexión real del navegador y recuperación, viewport móvil; además alta pendiente/perfil y recuperación de contraseña por enlace. Auth HTTP simulado, RPC SQL reales en PGlite; no SMTP. |
| Compilación | Exportaciones web y Android correctas. Android es bundle Hermes, no APK ni prueba en teléfono. |
| Separación de secretos | Bundle web revisado: sin `es_correcta`, identificadores de opciones de la semilla, `scryptSync` ni `node:sqlite`. Clave publicable configurable, ninguna clave de servicio. |
| Migración inicial | `npm run check:migrations` verifica SHA-256 original y enumera archivos sin acceder a la red. Estado de aplicación remoto desconocido. |
| PDF | Sintaxis del script validada. No se ejecutó extracción sobre un PDF real ni se probó OCR/Poppler, pues no hay documentos fuente disponibles. |

Las pruebas detectaron y permitieron corregir la sintaxis de una condición SQL, encabezados del fixture y recuperación web al abrir el enlace en la misma pestaña. Una ejecución simultánea con ambas compilaciones sufrió un fallo nativo de V8/Wasm; la ejecución PostgreSQL aislada posterior pasó las cuatro pruebas. No se ocultan esas limitaciones del entorno. La instalación npm informó 23 avisos de dependencias (7 moderados y 16 altos); su remediación requiere revisión separada, no se aplicó `audit fix --force` ni se degradó Expo.

## Pendiente y provisional

Conectar/configurar tu proyecto, verificar migraciones ya aplicadas, SMTP/redirects, GoTrue/PostgREST/Storage reales, habilitar y comprobar el hook de bloqueo, concurrencia real de varias conexiones y Android en dispositivo. La política exacta de tres dígitos y símbolos todavía no queda impuesta por Supabase estándar: está documentada como brecha de servidor, no como control completo por tener validación UI.

Diagnóstico de 7, selección única, porcentaje `aciertos-v1`, semestre 1–20 y reconexión sin plazo total siguen provisionales. Cuestionarios, simulacros y formatos múltiple/abierta no se pueden publicar todavía. Pendientes de producto: componente/taxonomía oficial, abandono/plazos/reloj, multirrol, retención y eliminación. Pendientes del modelo completo: invitaciones propias y datos especializados docentes, tutoría/retroalimentación, IA/conversaciones/recomendaciones/citas persistidas y posible clasificación/fuentes múltiples. Ver `CONTENIDO_DOCUMENTAL.md`.

---

# Antecedente conservado: primera entrega SQLite — 28/09/2026

Lo siguiente es evidencia histórica; no describe la arquitectura activa. Para ejecución y pendientes vigentes usar las secciones anteriores y `SUPABASE.md`.

## Disponible localmente

- Expo SDK 57, React Native 0.86.3, React 19.2.3, TypeScript 6.0 estricto; versiones comprobadas por Expo.
- Acceso y registro de estudiantes con fecha válida, semestre, confirmación de contraseña y requisitos visibles en tiempo real. Programa y contenido explícitamente de demostración.
- API local con SQLite persistente. Alta de identidad/perfil/consentimiento/asignación atómica. Contraseñas con hash/sal fuera de USUARIO, sesiones opacas revocables, bloqueo tras cinco fallos y control servidor de inactividad.
- Perfil propio editable; contraseña actual requerida para cambiarla y revocación de todas las sesiones; cierre confirmado.
- Diagnóstico fijo de siete preguntas: doble confirmación, selección única, retroceso, omisiones, guardado confirmado, pausa y recuperación del mismo intento.
- Claves solo en servidor; protección de pertenencia estudiante/asignación/ítem/opción. Finalización transaccional e idempotente. Restricciones SQLite adicionales bloquean respuestas incompatibles y alteración de instrumentos asignados.
- Resultado reproducible `aciertos-v1`, incluye todas las preguntas; tres vistas de historial/desgloses. Sin resultados precargados, niveles inventados o tendencias con una sola evaluación.
- Tres guías propias; tutor por reglas con consentimiento por consulta, límite de uso y procedencia explícita. No hay conexión externa ni historial de mensajes.
- Interfaz inspirada en el mockup: acceso en dos paneles, barra lateral oscura, tarjetas claras, azul/verde; navegación horizontal en pantallas pequeñas. Etiquetas, estados seleccionados, botones deshabilitados y mensajes accesibles. No se declara conformidad WCAG completa.
- Contexto actualizado, contraste de los ocho diagramas/41 páginas y preparación de esquema privado PostgreSQL/Supabase sin aplicación remota.

## Verificación

| Comprobación | Evidencia / resultado |
| --- | --- |
| TypeScript cliente y servidor | `npm run typecheck` sin errores |
| Compatibilidad Expo | `npx expo install --check`: dependencias alineadas |
| Reglas del servidor | 14 pruebas pasan: registro, transacción de alta, intento único, claves ocultas, permisos, pertenencia, omisiones, finalización repetida, integridad SQLite, persistencia tras reinicio, sesiones/bloqueo, cambio de contraseña, consentimiento y contrato HTTP |
| Recorrido navegador | Playwright en Edge: registro → diagnóstico → resultado → progreso → material → tutor; desconexión real del contexto de navegador y restauración de respuesta; viewport 390 px sin desbordamiento horizontal |
| Compilación web | `npm run export:web`, bundle generado localmente en `dist/` |
| Compilación Android | `npm run export:android`, bundle Hermes generado en `dist-android/`; no es prueba en dispositivo ni APK |
| Separación cliente/servidor | Bundle web inspeccionado: no contiene semilla de preguntas, identificadores de opciones de la semilla, tablas de identidad ni hashes de contraseña |
| Revisión visual | Capturas en `Docs/evidence/`: dashboard de escritorio, diagnóstico y progreso móvil |
| Dependencias | Auditoría npm: 10 alertas moderadas transitivas en cadena Expo/xcode/uuid, cero altas o críticas. La corrección automática propuesta baja Expo a 46: no aplicada porque rompe la compatibilidad elegida. Revisar actualización compatible del upstream antes de distribución. |

La primera prueba de navegador detectó estados ARIA faltantes en casillas/opciones; se corrigieron y se verificó de nuevo. También se hicieron explícitas las etiquetas de navegación y el cierre de confirmaciones, y se reinicia la posición de lectura al cambiar de pantalla/pregunta. Las pruebas no usan datos de estudiantes reales ni servicios remotos.

## Provisional y pendiente

- Política de desarrollo: Razonamiento Cuantitativo, taxonomía ilustrativa, semestre 1–20, ventana de fallos de 15 minutos y reconexión del diagnóstico sin vencimiento total. El bloqueo de evaluación devuelve al acceso y permite volver al menú/retomar tras autenticación. No constituye abandono definitivo. Consultar `CONTRASTE_DOCUMENTAL.md`.
- Supabase y correo: preparación SQL privada, sin conexión ni adaptador operativo. Recuperación por correo informa indisponibilidad; no simula un envío. Recuperación de un alta parcial externa pendiente; en el proveedor local el alta es atómica.
- Gemini/n8n: contrato documentado, falta proveedor real, credenciales, modelo, privacidad del texto libre, validación de citas y conexión accesible desde backend. El tutor actual es demostrativo.
- Banco académico oficial, elección final del componente, cardinalidades múltiples, fórmula de nivel, guía de simulacro, retención/borrado y roles combinados requieren decisión. No se importan contenidos perdiendo clasificaciones para mantener 32 tablas.
- Docentes/invitaciones/administración, nuevas asignaciones, evaluaciones cronometradas, historial IA y ruta adaptativa no están implementados. Las 32 tablas no se presentan como creadas: son 20 de dominio y tres internas de autenticación local.
- Android: pendiente instalar/recorrer en dispositivo o emulador; `adb` no está disponible en PATH en este entorno. Pendientes pruebas con lector de pantalla, auditoría de contraste completa y ensayo de carga de siete usuarios.
- La API de prueba es HTTP local y no está endurecida para internet. No desplegar con estudiantes reales; falta completar las integraciones y decisiones anteriores.

## Repositorio y entrega

APEX no tiene `.git` ni remoto. La raíz tampoco. El repositorio anterior `ProyectoAPEX/my-app-apex` conserva su propio origin y no se utilizó como destino. `tarea_reto` es un repositorio local sin remoto. El plugin GitHub expone herramientas, pero no asocia una carpeta ni concede permiso para publicar. No se hizo push, commit, creación de repositorio, PR ni modificación remota.

Arranque y recorrido detallados en `README.md`; los procesos de pruebas se cierran al terminar. Para explorar manualmente, abrir dos terminales y ejecutar `npm run server` y `npm run web` desde APEX.

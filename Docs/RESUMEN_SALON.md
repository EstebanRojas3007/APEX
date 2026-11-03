# Resumen gráfico del salón

Actualización local del 25/10/2026: las [intervenciones del profesor](INTERVENCIONES_PROFESOR.md) usan un estado `suspendido` separado. Sin resultado ni decisión no aportan notas, reprobaciones, habilidades o repasos al resumen; un reemplazo activo conserva las notas finalizadas previas, conforme a las reglas descritas aquí. No se reconstruyó ni cambió la pantalla gráfica.

Entrega local del 23/10/2026 (America/Bogota). Se conserva el panel docente y el recorrido del estudiante. El propietario confirma su funcionamiento en Supabase; esta entrega no consultó ni modificó ese proyecto remoto. No se crean usuarios, grupos, resultados, rutas ni tablas de métricas en producción. Los datos sintéticos y las respuestas simuladas de generación existen exclusivamente en las bases desechables de pruebas.

## Pantalla y contrato

Grupo → **Resumen del salón** abre una vista independiente en `#profesor/grupos/<UUID>/resumen`, conservando el ID del grupo. Incluye nombre, código, Inglés, estudiantes incluidos, actualización del servidor, Actualizar, Volver al salón, carga, reintento y vacíos. Historial web y `BackHandler` de Android conservan el regreso al grupo. La sesión sigue siendo de memoria: una recarga requiere login; después se resuelve el enlace conservado.

`apex_api('teacher_group_summary', '{"groupId":"<UUID>"}')` devuelve `GroupSummary`, definido en `shared/teacher.ts`. El contrato contiene agregados y metadatos del grupo, sin nombres/IDs individuales, preguntas, respuestas, claves, soluciones, contenido de rutas, conversaciones ni contextos IA. No se usa la API de IA ni se modifica el contrato del worker. Los gráficos son barras de `View` con texto visible accesible: etiquetas, fracciones y porcentajes. Las barras son decorativas para lectores de pantalla. No hay nuevas dependencias; se utiliza React Native 0.86.3 / React Native Web 0.21.2, React 19.2.3 y Expo 57 existentes.

Cada consulta comprueba `actor()` (cuenta y sesión vigentes), rol docente, `docente_grupo` (docente/grupo/asignación activos) e `integrante_grupo`. La población es la membresía activa, con estudiante activo, rol estudiante y componente autorizado por su programa. No se emplean las parejas antiguas de `asignacion_docente`. Un segundo docente no multiplica integrantes. Los ayudantes y la fachada anterior quedan sin EXECUTE para PUBLIC/anon/authenticated; solo la RPC pública vigente conserva EXECUTE autenticado.

Las reservas activas se muestran aparte cuando `membershipCount` difiere de la población elegible. Una reserva sin autorización vigente no aporta datos. Se describe a los integrantes actuales, incluyendo resultados anteriores a su ingreso si existen; no se reconstruye una cohorte histórica ni se atribuyen resultados a una clase.

## Definiciones de indicadores

En toda la pantalla, `N` es la cantidad de estudiantes elegibles actuales del grupo, deduplicados por ID de dominio. Se excluyen antes de cualquier cálculo las asignaciones técnicas (incluida su retirada), los instrumentos ajenos a Inglés y los instrumentos con varios componentes: el resultado global no permite separarlos con fiabilidad. Las reglas de avance y los umbrales no se cambian.

| Indicador | Fuente y fórmula | Población/denominador | Reintentos e insuficiencias |
| --- | --- | --- | --- |
| Diagnóstico | `intento`, `resultado`, evaluación/plantilla. Completado si hay un diagnóstico finalizado con resultado; en progreso si no lo hay y existe uno activo; pendiente en los demás casos. | Tres estados excluyentes sobre N; su suma es N. No hay aprobación diagnóstica. | Activo no equivale a terminado. Un finalizado sin resultado no completa el diagnóstico y genera aviso histórico. |
| Etapa del recorrido | Evidencia autorizada de diagnóstico terminado y `decision_avance`: diagnóstico pendiente; básico tras diagnóstico; intermedio tras control 1 aprobado; intermedio-avanzado tras control 2 o 3 aprobado; final aprobado tras decisión final favorable. Se conserva la lógica de `nivel_habilitado`/`control_aprobado`: una aprobación registrada habilita avance, no se revoca por una nota posterior. | Un estado por estudiante sobre N. | No se infiere de porcentaje de aciertos ni del estudio. Es una etapa del recorrido APEX, sin interpretación MCER o de dominio. |
| Estudio por nivel | Última `ruta_nivel_version` por estudiante/nivel y `progreso_seccion.completada_en`, mediante `seccion_ruta`. Suma de secciones completas / (7 × estudiantes con ruta disponible). | Se informa cuántos tienen ruta y cuántos la tienen pendiente, sobre N. Denominador del porcentaje: solo rutas disponibles. | La versión más reciente evita duplicar secciones entre versiones. Si no hay ruta, el avance queda pendiente, sin porcentaje ni lecciones inventadas. Estudiar no demuestra dominio. |
| Control 1, 2, 3 y final | Último intento **finalizado con resultado**, por estudiante y tipo/nivel. Estados: sin resultado, aprobado, no aprobado, resultado sin decisión. `passed` procede de `decision_avance`, nunca de un umbral inventado para históricos. | Distribución sobre N. Aprobación = aprobados / (aprobados + no aprobados). Se muestran ambos números; ausentes e indeterminados no entran en esa fracción. | Fecha de finalización descendente, nulos al final, e ID descendente como desempate. Un activo conserva el resultado previo; intentos activos y reintentos con nota previa se informan aparte. Controles 7/10; final 22/25. |
| Habilidad | Por categoría separada: diagnóstico, control 1/2/3 o final. Último finalizado **compatible** por estudiante/categoría; aciertos acumulados / preguntas evaluadas por ID estable de competencia. | Se informa el número de estudiantes y de preguntas por habilidad, los estudiantes con resultado y los que tienen evidencia verificable. Las preguntas omitidas aportan al total cuando figuran en el desglose del calificador. | Verificación descrita abajo. Si el más reciente no es fiable se usa el anterior compatible y se avisa cuántos casos usan ese respaldo. Nunca se suma más de un intento por estudiante/categoría. No hay promedio general entre categorías. |
| Repaso obligatorio | `decision_avance`, `intento_ruta` y `sesion_refuerzo` tipo `review`. Se toma el estado actual de cada cadena (`id_convocatoria`, o asignación en históricos), ordenando por número servidor de intento, inicio e ID descendentes; fallo vigente con repaso no completado ni consumido por un nuevo intento. | Cantidad de estudiantes con al menos una cadena pendiente / N. Cada estudiante cuenta una vez. | Un repaso completado, un reintento activo o aprobado que sucede al fallo no deja alerta antigua. El refuerzo opcional tipo `section` no participa. |

Los intentos finalizados sin fila de resultado se identifican en `incompleteHistory` (estudiantes distintos). No sustituyen una nota finalizada disponible. La ausencia de decisión se mantiene como desconocida aunque los aciertos parezcan suficientes.

### Fiabilidad de habilidades

Los snapshots antiguos de `resultado.detalle.competencies` guardan etiquetas, sin IDs estables. No basta con agrupar esas etiquetas. `evidencia_habilidades_docente` acepta exclusivamente:

1. Resultado finalizado con regla `aciertos-v1`, plantilla conocida y fuente en `carga_banco`, cuyo contenido/taxonomía están protegidos por los triggers existentes.
2. `seleccion_intento` completa, con las versiones de pregunta registradas, fuente coincidente y competencias de Inglés.
3. Totales/aciertos reconstruidos mediante IDs estables y respuestas autorizadas que coincidan exactamente con el resultado y su desglose guardado; etiquetas únicas dentro del intento. Se respeta el vencimiento del reloj al verificar respuestas; las omitidas permanecen en el total.

El ayudante no envía preguntas ni opciones: solo competencias y conteos permitidos. Un resultado sin desglose guardado, una regla desconocida, una selección inconsistente o una taxonomía ambigua se excluyen del cálculo de habilidades. Se informa **información histórica insuficiente**, sin reconstruir certeza ausente.

La clave de compatibilidad incluye regla de calificación, fuente inmutable, ID/versión de plantilla y política temporal. Las series diferentes se presentan separadas, incluso cuando comparten IDs de habilidad; no se equipara dificultad. Cada estudiante solo aporta a la serie de su último resultado compatible de esa categoría. Los porcentajes son descriptivos de la práctica APEX, sin equivalencia con puntajes oficiales del ICFES.

### Vacíos y actualización

- N = 0: salón sin estudiantes elegibles; no se muestran indicadores poblacionales de cero.
- N > 0 y nadie presentó una categoría: sin datos; aprobación sin porcentaje.
- Rutas no generadas: pendiente de generación, sin promedio de cero.
- Conteo registrado de cero, con población/denominador existente: cero real (por ejemplo, 0/N repasos o 0/P aciertos verificables).
- Resultado sin decisión, sin desglose fiable o intento finalizado sin resultado: información histórica insuficiente con su alcance explícito.

`updatedAt` proviene del servidor. Cambiar de ubicación/revisión invalida inmediatamente el render anterior; las solicitudes se aíslan por grupo, vista y revisión, y el efecto descarta respuestas tardías tras desmontarse. Cada recarga limpia datos, también ante errores o revocación. Se reutiliza la revalidación docente al recuperar foco/AppState activo y cada 30 segundos. No requiere recargar el navegador. El cliente no puede retirar retroactivamente información que ya fue recibida; la siguiente lectura autorizada limpia el contenido revocado.

## Correcciones enfocadas y archivos

La nueva migración `202610230001_teacher_group_summary.sql` reemplaza únicamente proyecciones docentes y añade dos ayudantes privados y una rama de la RPC. Corrige en `seguimiento_estudiante` el resultado ocultado por un activo, el desempate no determinista del diagnóstico y las alertas de fallos antiguos resueltos. Las escrituras académicas y funciones de avance existentes permanecen intactas; ningún resultado histórico se actualiza.

- Interfaz: `src/TeacherPanel.tsx`, nuevo `src/TeacherGroupSummary.tsx`.
- Contratos: `shared/teacher.ts`.
- Servidor: una migración nueva; ninguna tabla nueva ni migración anterior editada.
- Verificación/operación: `supabase/preflight-teacher-summary.sql`, `supabase/verify-teacher-summary.sql`.
- Pruebas: `supabase/tests/teacher-summary.test.ts`, `teacher-summary-fixture.ts`, extensión aislada de `http-fixture.ts`, `tests/teacher-summary.spec.ts`.
- Documentación: esta guía, `PROFESOR_GRUPOS.md` y `README.md`.

## Despliegue futuro y consultas

No se ejecutó ninguno de estos pasos en remoto.

1. Revisar el [preflight de solo lectura](../supabase/preflight-teacher-summary.sql), las definiciones remotas y el registro de migraciones. Comparar con el panel docente que ya funciona. Si existe `apex_api_pre_resumen_docente` o el nuevo resumen, comprobar si la migración ya se aplicó: no volver a ejecutarla. El registro CLI vacío no demuestra que no haya SQL manual aplicado.
2. Con las dependencias existentes hasta `202610220001` confirmadas, aplicar **solo** [202610230001_teacher_group_summary.sql](../supabase/migrations/202610230001_teacher_group_summary.sql), que es transaccional. No repetir las migraciones docentes/anteriores, no activar la prueba técnica, no cargar fixtures, no habilitar IA ni generar rutas.
3. Ejecutar la [verificación de solo lectura](../supabase/verify-teacher-summary.sql): privilegios, población única, estados y exclusión técnica. Las consultas usan proyecciones privadas sin suplantar JWT, llamar RPC mutantes ni cerrar evaluaciones. El operador propietario puede revisar los datos; no se concede esa lectura al cliente.
4. Distribuir después el cliente. Con sesiones reales autorizadas, llamar `apex_api('teacher_group_summary', '{"groupId":"<UUID asignado>"}')` y probar grupo propio, ajeno, retirada de membresía/asignación y login revocado. Confirmar regreso y actualización en web/Android. No crear estudiantes de prueba reales.
5. Para retirar la pantalla, revertir el cliente. Mantener la migración y sus restricciones; no reabrir fachadas anteriores ni ejecutar DROP de las tablas existentes. No hay datos métricos que revertir.

## Evidencia local

Verificaciones realmente ejecutadas en esta entrega:

| Comprobación | Resultado |
| --- | --- |
| TypeScript cliente y servidor | Correcto, tras los cambios finales de contrato. |
| Suite PostgreSQL completa (`npm test`) | **60/60** correctas, incluidas seis pruebas del resumen y las regresiones del estudiante/docente. |
| Regresión web completa (`npx playwright test`) | **25/25** correctas con Edge invisible. Incluye tres pruebas del resumen y las dos existentes del docente, a 1280/390 px. |
| Repetición docente tras el ajuste final del orden de repaso | **5/5** correctas (grupos y resumen). |
| Exportación web | Correcta, bundle de producción en `dist/`. |
| Exportación Android | Correcta, bundle Hermes en `dist-android/`; sin APK/AAB ni ejecución nativa. |
| Integridad de migraciones y semilla protegidas | Correcta; las migraciones anteriores se conservan. |
| Exclusión del banco en ambos clientes exportados | Correcta mediante `check:client-bank`. |
| Preflight y SQL de verificación nuevos | Ejecutados correctamente sobre PGlite con datos sintéticos; no en remoto. |
| Inspección visual | Capturas web a 390 y 1280 px, sin desbordamiento horizontal; etiquetas, valores y fracciones visibles. Roles y textos accesibles comprobados en navegador, sin prueba manual de lector de pantalla nativo. |
| Dispositivo/emulador Android y Supabase remoto | No ejecutados. |

Las seis pruebas del resumen cubren grupo vacío/sin resultados, diagnósticos activos/finalizados/pendientes, rutas pendientes y avance 3/7–7/7, control 6/10 → repaso → 7/10, final 21/25 → repaso → 22/25, reintentos activos con nota previa, decisiones ausentes, desgloses ausentes/reglas incompatibles, respaldo compatible, separación v1/v2, desempates por fecha/ID y por número de cadena, exclusión técnica retirada/otros componentes/instrumentos mixtos, varios docentes sin duplicación, permisos revocados, reservas no elegibles y acceso a ayudantes/fachadas denegado. La prueba web retrasa una respuesta real del primer salón hasta que ya se muestra el segundo, comprueba que no se cruza y verifica enlaces directos tras login. Los errores y la revocación al recuperar foco limpian la vista.

Comandos reproducibles:

```powershell
npm run typecheck
npm run check:migrations
npm test
npx playwright test
npm run export:web
npm run export:android
npm run check:client-bank
```

Las capturas `Docs/evidence/teacher-summary-*-synthetic-390.png` / `*-1280.png` y `teacher-summary-synthetic-390.png` / `-1280.png` llevan el aviso **DATOS SINTÉTICOS · PRUEBA LOCAL AISLADA · SIN DATOS REALES**. Muestran cabecera, diagnóstico/etapa y habilidades con datos producidos por RPC reales sobre PostgreSQL PGlite, Auth HTTP simulado y un generador sintético aislado, sin llamadas IA. Se inspeccionan como capturas web; 390 px no equivale a Android nativo.

La exportación Android genera JavaScript/Hermes. No equivale a compilar un APK/AAB ni ejecutar en teléfono/emulador. La ejecución Android real y la comprobación de permisos en Supabase remoto quedan pendientes del entorno autorizado.

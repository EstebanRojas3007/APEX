# Rutas individuales: contrato preparado, conexión pendiente

**Actualización 11/10/2026:** el [contrato v2 y su ejecución](APRENDIZAJE_MVP.md) agregan contenido original generado por IA, siete secciones por nivel, finalización declarada explícita, controles y repasos. Se mantienen este contrato v1 y sus versiones históricas. El worker/adaptador están preparados; n8n/Gemini y las fuentes educativas autorizadas requieren configuración y verificación reales. No se ejecutaron cambios remotos. Los estados descritos a continuación corresponden a la entrega anterior.

Los tres niveles son una estructura compartida. No hay una ruta fija generada por IA, lecciones inventadas, completados precargados ni umbrales de aprobación. Web y Android consultan `apex_my_route()` y muestran **«generación de ruta pendiente»**. Las propuestas que se prueban localmente quedan `validada_pendiente_conexion`; no se ejecutan ni se muestran como rutas activas.

## Datos versionados

- `leccion_version`: identidad/código/versión, nivel, habilidad, objetivo, explicación propia, ejemplos, práctica propia, referencias educativas y prerrequisitos. Una lección aprobada es inmutable. La aprobación exige una habilidad de Inglés, referencias a fuentes revisadas aptas para educación (excluyendo el banco con soluciones), práctica independiente y prerrequisitos ya aprobados. No se cargaron lecciones en esta entrega.
- `regla_ruta_version`: transiciones entre niveles autorizadas y permiso de refuerzo, con aprobación del responsable. No se insertan valores predeterminados ni umbrales. Estas son reglas de estructura/orden; no implementan avance o finalización automática.
- `progreso_leccion`: hechos de finalización con evidencia y regla aplicada, privados e inmutables. No existe una RPC estudiantil para autoasignarse completados ni se escribieron hechos de progreso fuera de fixtures de pruebas.
- `solicitud_ruta`: snapshot del contexto académico seguro de un estudiante, emitido en servidor.
- `ruta_version` / `paso_ruta`: propuestas validadas, motivo, orden, lecciones/versiones, prerrequisitos, tipo de paso (`lesson`/`reinforcement`), regla, metadata del agente y vínculo a la versión anterior. Las versiones/pasos son inmutables; el progreso y las versiones anteriores se conservan aunque una propuesta nueva omita una lección realizada.

## Operaciones de servidor

`apex_route_agent_context(student_id)` y `apex_save_route_proposal(proposal)` tienen permiso de ejecución únicamente para `service_role` y el propietario del servidor. No los llama Expo, ni hay credenciales privadas o integración IA en el cliente. La clave de servicio no debe colocarse en `EXPO_PUBLIC_*`. No se crearon webhooks, conexiones, jobs, Edge Functions ni llamadas n8n/Gemini.

El contexto exige estudiante activo, perfil completo y programa autorizado para Inglés. Devuelve un `contextId` y:

```typescript
{
  contractVersion: 1,
  baseVersion: number,
  diagnosticBySkill: Array<{ skillId: string; skill: string; correct: number; total: number }>,
  catalog: Array<{
    lessonVersionId: string; code: string; version: number; title: string;
    level: number; skillId: string; objective: string; prerequisites: string[];
  }>,
  progress: { completedLessons: CompletionFact[]; assessmentResults: Result[] },
  rules: Array<{
    ruleVersionId: string; version: number;
    allowedLevelTransitions: [number, number][]; allowReinforcement: boolean;
  }>
}
```

Los aciertos/totales se calculan en servidor desde diagnósticos finalizados de Inglés, incluyendo omisiones. Los resultados de otros componentes, incluida la demo histórica de Razonamiento Cuantitativo, no se envían a este agente. No se envían nombre, correo, fecha de nacimiento, respuestas/opciones, claves, justificaciones, lecturas del banco, PDF con soluciones o credenciales. El contexto no contiene el UUID de Auth del estudiante. La selección del destinatario permanece en servidor.

La propuesta tiene la siguiente forma; los tipos completos están en `shared/contracts.ts`:

```typescript
{
  contractVersion: 1,
  contextId: string,
  baseVersion: number,
  ruleVersionId: string,
  reason: string,
  agent: { provider: string; model: string; promptVersion: string },
  steps: Array<{
    lessonVersionId: string;
    order: number;
    prerequisites: string[];
    kind: 'lesson' | 'reinforcement';
    reason: string;
  }>
}
```

No hay una propuesta de ejemplo con lecciones o reglas reales porque ese contenido está pendiente. El agente podrá proponer distintos subconjuntos y órdenes dentro del catálogo autorizado, con motivos individuales.

El servidor bloquea la fila del estudiante, verifica destinatario/versión/contexto vigentes y valida todos los pasos antes de insertar. Rechaza contenido desconocido/no aprobado, campos ajenos al contrato, repeticiones, orden no consecutivo, motivos vacíos, prerrequisitos distintos del catálogo o posteriores al paso, transiciones/refuerzos no autorizados, y reutilización de una lección completada como si fuera nueva. Un prerrequisito puede estar realizado o aparecer antes en la propuesta; eso planifica el orden, sin inventar que el paso anterior esté completado. No se implementa ejecución ni desbloqueo de pasos.

Una solicitud admite una sola propuesta: reenviar la misma devuelve la misma versión; una propuesta diferente para ese contexto es un conflicto. Si cambian diagnóstico, progreso, catálogo, reglas o versión anterior, se rechaza el contexto desactualizado y se exige emitir uno nuevo. La nueva versión referencia la anterior y conserva sus pasos y todos los hechos de progreso. La validación no concede aprobación al contenido redactado por un agente.

Antes de conectar IA faltan contenido propio de lecciones aprobado, reglas pedagógicas del responsable, política de avance/completado y ejecución, consentimiento/uso externo, autenticación del backend, límites operativos y conexión n8n/Gemini. El contrato y sus pruebas permiten preparar esa conexión posteriormente sin alterar notas o historiales.

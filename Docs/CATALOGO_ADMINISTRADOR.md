# Catálogo administrativo: investigación y corrección frontend

Actualización local del **01/11/2026**, America/Bogota. Se conserva el [rediseño del administrador](REDISENO_ADMINISTRADOR.md). La investigación usa el código existente, SQL de solo lectura como fuente y pruebas contra servicios simulados/PGlite local. **No se consultó ni modificó el entorno remoto, no se crearon programas reales y no se retiraron asociaciones reales.**

## Causas comprobadas y límites de la evidencia

| Recorrido | Evidencia local anterior a la corrección | Conclusión |
| --- | --- | --- |
| Crear programa | Formulario → revisión → confirmación → `apex_api`, operación `admin_catalog_save`, `entity: program`, ID/nombre/motivo y `confirmed: true`. La respuesta fue HTTP 200 con el mensaje previsto por el SQL. La lectura posterior incluyó el programa tanto en el listado como en las opciones de asociación. En escritorio, el mensaje original quedó fuera del área visible (`originalMessageVisible: false`). | No se reprodujo un fallo de escritura para una entrada válida. El aviso de éxito/error se renderizaba al principio de una vista larga y no junto al formulario. Ver un formulario aparentemente sin cambios no acreditaba que la operación hubiera fallado. |
| Motivo de retirada | La condición del botón era `busy || !reason.trim() || !a.impact.canRemove`. `reason` era el motivo del formulario de catálogo, no un campo visible en Asociaciones. Con `canRemove: true`, escribir en aquel campo habilitó la retirada en la prueba anterior a la corrección. | Había un requisito de presentación poco claro: el motivo compartido podía impedir una operación permitida por el servidor sin explicar ese bloqueo junto al botón. |
| Condiciones de retirada | Las decide `admin_catalog` mediante `impact.canRemove` y `impact.reason`. La vista mantenía el catálogo anterior durante un refresco y tras un error; el formulario no recibía el estado de consulta. | No distinguía las condiciones anteriores de una comprobación en curso o de un error de consulta. No se demuestra que los datos del proyecto remoto estuvieran obsoletos. |
| Validación del ID | El servidor exige `^[a-z0-9][a-z0-9_-]{0,59}$`. El formulario solo comprobaba que hubiera un ID. | Una entrada con mayúsculas, espacios o tildes podía alcanzar la API y ser rechazada, con el error lejos del formulario. Se añade la misma comprobación visual, sin transformar el ID ni cambiar la regla. No se afirma que este fuera el ID utilizado por el responsable. |

La creación ya tenía refresco de catálogo y un guardia contra operaciones simultáneas. La corrección conserva esos mecanismos y añade confirmación visible y verificación del resultado de la lectura; no se atribuye el problema a una operación RPC equivocada.

## Comportamiento corregido

### Creación y edición de programas/componentes

1. La revisión muestra tipo, ID, nombre y motivo; cancelar no llama a la API.
2. Confirmar utiliza la misma operación y payload autorizados. El guardia compartido impide dos escrituras concurrentes, incluso ante dos activaciones del botón de confirmación.
3. El estado «Guardando» y el resultado se muestran junto a Revisar catálogo. Los errores conservan ID, nombre y motivo y muestran el mensaje público recibido.
4. Una respuesta válida de éxito inicia una nueva lectura de `admin_catalog`; no se insertan entradas optimistas en el listado. Se comprueba que esa lectura contenga el ID y nombre guardados antes de anunciar «Listado, selectores y asociaciones actualizados».
5. Si la escritura está confirmada pero falla la consulta posterior, se informa de ambas cosas por separado y se pide comprobar el catálogo antes de repetir. Si la respuesta de lectura no refleja todavía el cambio, se identifica esa discrepancia sin afirmar que el listado esté actualizado.
6. Una respuesta nula/incompleta o un error dentro de una respuesta HTTP 200 no se convierte en éxito. No hay reintento automático de escrituras. Una vez comprobada la actualización, los refrescos posteriores siguen mostrando datos nuevos sin volver a exigir indefinidamente el nombre de una escritura histórica.

La actualización afecta al listado y a los selectores del panel, que comparten la proyección administrativa. No se modifica la consulta pública de programas ni su refresco existente en `App.tsx`.

### Asociaciones

El formulario de Asociaciones tiene ahora su propio **Motivo de asociación o retirada**. La consulta puede repetirse mediante **Comprobar condiciones de asociaciones**, además del refresco automático existente.

| Estado | Presentación y acción |
| --- | --- |
| Comprobando condiciones | Mensaje específico; retirada deshabilitada mientras llega la respuesta. |
| Consulta fallida o condiciones incompletas | Error concreto de consulta; los datos anteriores no autorizan la retirada. Se permite volver a comprobar, sin borrar el motivo. |
| Bloqueo por regla | «Retirada bloqueada» con `impact.reason`; Inglés conserva además su protección como componente principal. |
| Falta motivo | Instrucción explícita junto a la asociación, aunque el servidor permita retirarla. Escribir el motivo del catálogo no sustituye este campo. |
| Operación en curso | Se indica que debe esperarse la respuesta y se impiden operaciones simultáneas. |
| Condiciones consultadas y permitidas | Revisar exige motivo, `canRemove === true` y datos completos. La confirmación vuelve a consultar el estado más reciente disponible en frontend; el servidor vuelve a validar en la transacción. |

Una retirada confirmada dispara la lectura del catálogo y se comprueba que la asociación ya no aparezca. El resultado se conserva cerca de la posición de la asociación retirada, sin presentar esa confirmación como una asociación todavía vigente. Si el servidor rechaza la retirada por una dependencia nueva, se muestra el motivo en esa fila y se actualizan las condiciones. Se conserva el motivo para la revisión posterior.

Las generaciones de consulta invalidan respuestas anteriores a una escritura o a un cambio de vista/sesión. Los controles conservan montaje y borradores durante los refrescos; no se fuerza un salto de desplazamiento para buscar el aviso.

## Reglas comprobadas en el SQL existente

Fuente: [202610250002_admin_panel.sql](../supabase/migrations/202610250002_admin_panel.sql), funciones `impacto_asociacion`, `administrar_catalogo` y `motivo_administrativo`. **No se modificaron.**

- `canRemove` exige que el componente sea distinto de `ingles` **y que no exista ningún perfil `estudiante` del programa**. No basta con tener cero exámenes activos, rutas o membresías.
- El conteo de perfiles no filtra por estado ni por rol actual de la cuenta. Los perfiles conservados siguen contando; no se propone eliminarlos ni moverlos para superar el bloqueo.
- El motivo devuelto prioriza Inglés, después exámenes activos y después perfiles vinculados. Los demás conteos son contexto; la interfaz no deduce permisos a partir de ceros.
- La retirada revalida `impacto_asociacion` en servidor, además de identidad administrativa, motivo/confirmación y existencia de programa/componente. Un estado anterior permitido no evita esa validación.

En PGlite se comprobó una retirada de un programa vacío con componente no Inglés, una nueva asociación mediante el formulario y el rechazo real por perfiles vinculados al entregar deliberadamente una proyección anterior permitida. **No se identificó un defecto backend reproducible en esos recorridos.** El bloqueo por perfiles es una regla vigente, no una corrección pendiente que esta entrega pueda omitir.

## Evidencia remota todavía necesaria

Los síntomas del responsable no permiten determinar si su escritura fue aceptada, rechazada o si su catálogo remoto coincide con el SQL versionado. Para cerrar ese diagnóstico harían falta, exclusivamente de forma depurada:

- ID y nombre del programa intentado; operación y campos de negocio enviados, estado HTTP y mensaje/código público de la respuesta. Omitir cabeceras de autorización, cookies, claves y datos de sesión.
- Resultado de la consulta posterior de `admin_catalog` para ese ID y, en la retirada, el par programa/componente con `students`, `memberships`, `routes`, `assignments`, `activeExams`, `canRemove` y `reason` de una consulta reciente.
- Si esos valores contradicen la regla del SQL versionado, el responsable deberá contrastar en lectura las definiciones aplicadas de `administrar_lectura`, `impacto_asociacion` y `administrar_catalogo` y la versión desplegada del cliente.

**Pendiente separado, condicionado a esa evidencia:** si se confirma una discrepancia de funciones/proyección remota, documentar el resultado y preparar una corrección backend específica para revisión y autorización independientes. No se preparó ni ejecutó SQL correctivo, migración, `db push`, cambio de permisos o relajación de dependencias. Si lo que se desea es permitir retiradas con perfiles conservados, requiere una decisión de producto y política de preservación separada; no se trata como defecto frontend.

## Verificación de esta corrección

- **19/19 pruebas web dirigidas**: nueve de `tests/admin-catalog.spec.ts` y las diez administrativas/de rediseño/invitaciones existentes. Incluyen escritorio/móvil, éxito local con SQL real, operaciones/payloads, revisión cancelada, error y borradores, doble confirmación, actualización de listado/selectores, retirada/reasociación, Inglés, perfiles vinculados, carga/error/condiciones incompletas, revisión desactualizada, respuesta nula/error HTTP 200, y escritura confirmada con lectura fallida/desactualizada y recuperación sin repetir la escritura.
- **5/5 pruebas SQL existentes** en `supabase/tests/admin-panel.test.ts`, sin cambiar ese archivo. PGlite de una conexión, no concurrencia PostgreSQL multiconexión.
- `npm run typecheck` y `npm run check:migrations`: correctos. La verificación íntegra de docente/estudiante no se repitió por esta corrección acotada; los resultados y el fallo docente pendientes de la entrega anterior siguen documentados en la guía de rediseño.
- Exportaciones web y Android/Hermes sin caché: correctas. `npm run check:client-bank` comprobó cinco archivos exportados sin banco privado, marcadores de credenciales de servidor ni configuración de pruebas. Android es compilación, sin APK/AAB ni ejecución en dispositivo real.
- Comparación SHA-256 de **122 archivos** de backend, contratos y configuración al inicio/final: sin cambios ni adiciones. Incluye `supabase/`, `server/`, `shared/`, adaptadores API/Auth, dependencias, configuración de pruebas y `.env`, sin registrar sus valores.
- Los primeros arranques de Playwright y de las pruebas Node fueron bloqueados por `spawn EPERM` y se repitieron con autorización local. Se corrigió el nombre sintético repetido entre casos de escritorio/móvil para que la prueba distinguiera sus propias opciones de programa.

Los programas/asociaciones de las pruebas solo existen en el fixture local. HTTP/Auth/correo son simulados; no se envió correo ni se usó el proyecto Supabase real. Las pruebas de error controlado y consulta desactualizada interceptan únicamente el transporte del navegador de pruebas.

Capturas con datos sintéticos: éxito escritorio (`Docs/evidence/admin-catalog-save-1280.png`, solo local; v?ase la gu?a de reproducibilidad), éxito móvil web (`Docs/evidence/admin-catalog-save-390.png`, solo local; v?ase la gu?a de reproducibilidad), error con borrador conservado (`Docs/evidence/admin-catalog-error.png`, solo local; v?ase la gu?a de reproducibilidad), bloqueo y protección de Inglés (`Docs/evidence/admin-catalog-blocked.png`, solo local; v?ase la gu?a de reproducibilidad). La última captura usa deliberadamente `canRemove: false` aun con conteos sintéticos en cero para comprobar que el frontend no infiera autorización por su cuenta; no representa datos remotos.

## Archivos

- `src/AdminForms.tsx`: avisos junto a los controles, revisión explícita, validación de ID, motivo separado, estados y resultado de cada asociación.
- `src/StaffPanel.tsx`: propagación del estado de lectura, confirmación válida de la API, refresco verificado, control de respuestas anteriores y revalidación al confirmar.
- `src/adminCatalog.ts`: comprobaciones de presentación/respuestas y tipos de feedback del frontend; no es un contrato de servidor nuevo.
- `tests/admin-catalog.spec.ts`: regresiones aisladas nuevas. Documentación: esta guía, `Docs/PROGRESO.md` y enlaces desde `Docs/PANEL_ADMINISTRADOR.md` y `Docs/REDISENO_ADMINISTRADOR.md`.

No cambian API/Auth, contratos compartidos, backend, SQL, migraciones, roles, permisos, políticas, datos reales, configuración local/remota, Edge Functions, secretos o SMTP. Se conservan ambos flujos de invitación y la confirmación manual del responsable registrada en su guía.

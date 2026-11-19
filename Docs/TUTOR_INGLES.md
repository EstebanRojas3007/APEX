# Tutor de inglés: piloto Groq

El menú **Tutor IA** abre el chat general `english-tutor`. **Refuerzo** e **Ir al repaso** conservan sus flujos contextuales. La migración cambia exclusivamente el proveedor del chat general; no cambia el generador de rutas, n8n, las operaciones académicas ni sus proveedores.

## Contrato y acceso

El frontend sigue enviando solo `{ "message": "..." }` y recibiendo `{ "reply": "..." }`. Los fallos mantienen mensajes genéricos, sin detalles del proveedor. La función solo valida Auth y llama a Groq; no escribe en la base de datos ni ejecuta RPC académicos. El prompt educativo se conserva completo: explicaciones en español, ejemplos en inglés, práctica original de Saber Pro y redirección de temas fuera del inglés, sin herramientas ni acciones sobre notas, rutas o repasos.

Se conserva JWT en el gateway y `auth.getUser(token)` en el servidor. Solo puede acceder el UUID configurado en `ENGLISH_TUTOR_PILOT_USER_ID`, comparado con el usuario validado, antes de llamar a Groq. Tokens inválidos y cuentas anónimas se rechazan. Las aplicaciones nativas sin Origin siguen necesitando sesión y pertenecer al piloto.

## Secretos del servidor

Configurar exclusivamente en el servidor; nunca en variables `EXPO_PUBLIC_*`:

| Nombre | Uso |
| --- | --- |
| `GROQ_API_KEY` | Clave de Groq, enviada exclusivamente como `Authorization: Bearer ...`. |
| `GROQ_MODEL` | Identificador exacto de un modelo de chat habilitado para esa cuenta; obligatorio, sin valor predeterminado ni selección automática. Acepta letras, números, puntos, guiones, guiones bajos y namespaces separados por `/`; no URL, espacios o segmentos vacíos. |
| `ENGLISH_TUTOR_PILOT_USER_ID` | UUID de Auth > Users de la única cuenta piloto; no correo ni UUID de perfil académico. |
| `ENGLISH_TUTOR_ALLOWED_ORIGINS` | Orígenes web exactos separados por comas, con puerto si corresponde y sin rutas ni barra final. |

`SUPABASE_URL` y `SUPABASE_ANON_KEY` los proporciona el runtime de Supabase. No se requiere `service_role`. La configuración faltante o inválida impide el arranque. Se eliminan las lecturas de secretos de Gemini exclusivamente en este tutor; no hay fallback al proveedor anterior ni cambios en secretos remotos de otras integraciones.

El ejemplo sin valores está en `supabase/functions/.env.example`. Para servir localmente, copiarlo a `supabase/functions/.env.local` (ignorado por Git), completar las variables necesarias y ejecutar:

```powershell
supabase functions serve english-tutor --env-file supabase/functions/.env.local
```

El cliente debe apuntar al proyecto local y disponer de la sesión piloto. No se desplegó ni se cambiaron secretos remotos durante esta migración.

## Adaptador REST

Se usa `POST https://api.groq.com/openai/v1/chat/completions`, con `Content-Type: application/json` y `Authorization: Bearer GROQ_API_KEY`. El modelo viaja en el cuerpo, no en la URL. El adaptador usa REST directamente, sin SDK adicional, reintentos ni redirecciones.

El cuerpo contiene `model`, `messages`, `temperature: 0.5`, `max_completion_tokens: 1536` y `stream: false`. El primer mensaje es `system`, con `TUTOR_INSTRUCTION` sin cambios. Cada turno de memoria se convierte a un mensaje `user` o `assistant`, en orden. El formato interno temporal de los turnos se conserva; el rol interno `model` se convierte a `assistant` solo al salir hacia Groq.

Se extrae exclusivamente `choices[0].message.content` como cadena de texto, con espacios externos eliminados, y se exige `finish_reason: "stop"`. Texto ausente, no textual, vacío, mayor de 12000 caracteres o finalización por límite, filtro o herramientas se rechaza con 502. No se incorporan campos de razonamiento ni herramientas a la respuesta.

La estructura y el límite de salida siguen la [referencia oficial de Groq](https://console.groq.com/docs/api-reference#chat-create). Validar el identificador del modelo no confirma su disponibilidad o permisos; la selección corresponde a `GROQ_MODEL`.

## Memoria y límites conservados

- Mensajes de hasta 2000 caracteres y cuerpos de hasta 12000 bytes. Salida del proveedor de hasta 1536 tokens y respuesta aceptada de hasta 12000 caracteres.
- Contexto solo en memoria del proceso Edge, por `session_id` verificado: últimos ocho intercambios, caducidad de 30 minutos y hasta diez sesiones retenidas. Sin persistencia; puede perderse al reiniciar o cambiar de instancia.
- Una petición en curso por sesión. Los turnos fallidos no se retienen y la sesión se libera al terminar el fallo.
- Historial visible solo en memoria de la app, limpiado al cerrar sesión o recargar. El texto se conserva al fallar; no hay reintentos automáticos.
- Proveedor: 30000 ms, incluida la lectura del cuerpo. Auth: 10000 ms. Cliente: 40000 ms, incluida la lectura JSON por el SDK. La pantalla conserva la cancelación al cambiar de identidad.
- El fetch compartido respeta la señal explícita de la API del tutor. Sin señal usa 40 segundos para `/functions/v1/english-tutor`; las otras llamadas conservan su respaldo predeterminado de 12 segundos.

## Logs seguros

Se registra una sola línea JSON por fallo del servidor, con `stage`, `code` y `duration_ms`. Solo `GROQ_REJECTED` incluye además `groq_status: response.status`. La duración usa `performance.now()`, redondeada a milisegundos no negativos. No se registran claves, tokens, UUID, mensajes, excepciones ni cuerpos del proveedor. No se amplían los errores visibles en la interfaz.

| Etapa | Código | Resultado |
| --- | --- | --- |
| `configuration` | `CONFIG_MISSING` / `CONFIG_INVALID` | Arranque detenido. |
| `auth` | `AUTH_UNAVAILABLE` | Auth no disponible; HTTP 503. |
| `groq_response` | `GROQ_REJECTED` | HTTP no exitoso de Groq; se registra el estado original, se responde 503 genérico. |
| `groq_request` / `groq_response` | `GROQ_TIMEOUT` | Espera agotada o llamada abortada; HTTP 503. |
| `groq_request` / `groq_response` | `GROQ_NETWORK_ERROR` | Fallo de transporte o lectura; HTTP 503. |
| `groq_response` | `GROQ_INVALID_RESPONSE` | JSON o contenido inválido; HTTP 502. |
| Etapa en curso | `UNEXPECTED_ERROR` | Excepción imprevista; HTTP 503 o estado del error tipado. |

Ejemplo hipotético: `{"stage":"groq_response","code":"GROQ_REJECTED","duration_ms":174,"groq_status":429}`. Éxitos y errores esperados del cliente (400/401/403/413/429) no generan estos logs.

## Comprobación real independiente

El script hace una única petición real a Groq con `Responde únicamente OK`, sin instrucciones del sistema, historial o temperatura personalizada. Usa el mismo modelo configurado, autenticación Bearer, 1536 tokens y 30 segundos:

```powershell
node scripts/check-english-tutor.mjs --env-file supabase/functions/.env.local
```

Solo acepta un archivo local ignorado por Git y no versionado, o variables del proceso. Para introducir la clave sin mostrarla ni escribirla en el historial:

```powershell
$env:GROQ_MODEL = Read-Host 'GROQ_MODEL exacto configurado en el servidor'
$tutorKeyInput = Read-Host 'GROQ_API_KEY (entrada oculta)' -AsSecureString
try {
 $env:GROQ_API_KEY = [System.Net.NetworkCredential]::new('', $tutorKeyInput).Password
 node scripts/check-english-tutor.mjs
} finally {
 Remove-Item Env:GROQ_API_KEY -ErrorAction SilentlyContinue
 $tutorKeyInput.Dispose()
}
```

La salida informa HTTP y duración; ante rechazo, solo `error.code`, `error.type` y `error.message` con credenciales redactadas y texto limitado a 1200 caracteres. En éxito indica si el texto es exactamente `OK` y la finalización es `stop`. No imprime claves, cabeceras ni cuerpos completos. Esta salida manual no se agrega a los logs o a la respuesta de la Edge Function. Sin configuración devuelve `CONFIG_MISSING` y `request_attempted: false`, sin contactar al proveedor.

## Verificación local

```powershell
npm run test:english-tutor
npm run typecheck
npm run test:learning
npx playwright test tests/english-tutor.spec.ts tests/learning.spec.ts tests/journey.spec.ts
npx playwright test tests/english-tutor-visual.spec.ts
npm exec --yes --package=deno -- deno check --config supabase/functions/english-tutor/deno.json supabase/functions/english-tutor/index.ts
node --check scripts/check-english-tutor.mjs
```

Las pruebas locales del adaptador usan proveedor simulado: verifican endpoint fijo, Bearer, modelo explícito, prompt, conversión de roles e historial, límites, extracción del texto, rechazos HTTP, timeout, red, JSON inválido y logs sin datos sensibles. También verifican que los secretos del proveedor anterior no sustituyan a los de Groq. Las pruebas de navegador comprueban contrato, acceso piloto, memoria, aislamiento académico y espera de 40 segundos sin reintentos. Estas comprobaciones no equivalen a una llamada real al proveedor.

Resultado local del 18 de noviembre de 2026: 13 pruebas del tutor/transporte y 8 de aprendizaje aprobadas; TypeScript, Deno, sintaxis del script y `git diff --check` correctos. En navegador pasaron los 6 casos del tutor y los 2 de journey; ruta de escritorio pasó y ruta móvil falló inicialmente por un selector que encontró varios textos «Contenido pendiente». La repetición aislada de ruta móvil pasó sin modificar código ni pruebas de ese flujo. Se comprobó por hash que el prompt, el bloque de autenticación, los archivos del cliente y la configuración del gateway permanecen idénticos.

No hay `GROQ_API_KEY` ni `GROQ_MODEL` en el entorno local disponible. La comprobación del script terminó antes de contactar al proveedor con `CONFIG_MISSING` y `request_attempted: false`; no se ha validado una conexión real a Groq ni se ha desplegado la migración. El script queda preparado para esa comprobación al aportar ambos secretos.

## Presentación del chat general

En escritorio (desde 1000 px), Tutor IA presenta el panel **Mensajes**, con una única conversación seleccionada, y el chat con encabezado, historial desplazable y compositor inferior. En pantallas pequeñas se oculta el panel de conversaciones. Se conserva la navegación general de APEX.

Las respuestas del tutor aparecen en burbujas blancas con avatar; las del estudiante, en azul. `TutorMarkdown` interpreta títulos, negritas, cursivas y listas con `markdown-it`, y los presenta exclusivamente mediante `Text` y `View` de React Native, compatibles con web. No se genera ni inserta HTML; el texto original de cada respuesta permanece en el estado del chat.

El botón de información abre un modal con cierre accesible, contención y restauración de foco en web y cierre mediante Escape o el botón Atrás nativo. Incluye proveedor Groq, modelo informativo `openai/gpt-oss-120b`, propósito, advertencia sobre errores, borrado temporal y aislamiento académico. Ese texto no configura el proveedor ni el modelo: la configuración efectiva sigue en el servidor.

Los adjuntos se muestran desactivados y no abren un selector. Se conservan el máximo de 2000 caracteres, las validaciones, la espera únicamente durante solicitudes reales, la cancelación y el texto ante errores. La bienvenida breve aparece solo cuando no hay mensajes. No se agregan conversaciones, estados ficticios ni almacenamiento.

El compositor se ajusta al teclado nativo con `KeyboardAvoidingView` y a los cambios de `visualViewport` en web. Las pruebas visuales cubren 1440, 1024, 390 y 320 px, Markdown, respuestas largas, HTML literal inocuo, ausencia de desbordamientos, foco del modal y reducción simulada del área visible por el teclado. Las capturas en `Docs/evidence/tutor-*.png` usan datos de prueba y son artefactos locales ignorados por Git. La comprobación móvil de navegador y el bundle Android no sustituyen una prueba de teclado en dispositivo físico.

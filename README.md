# APEX

APEX es una plataforma de autoestudio para preparar Saber Pro, con Inglés como componente inicial. Incluye registro y perfil, diagnóstico, evaluaciones, progreso, rutas de aprendizaje, seguimiento docente y administración. El tutor y la generación de rutas tienen integración de servidor con n8n/Gemini y dependen de su configuración y de material autorizado.

El cliente funciona en Android y web. Consulta preguntas y resultados exclusivamente mediante las RPC autorizadas de Supabase; no usa un banco local de respaldo. Sin servicios configurados muestra el estado correspondiente.

## Tecnologías

- Node.js 24 o posterior, npm y TypeScript estricto.
- Expo 57, React 19 y React Native 0.86; React Native Web para navegador.
- Supabase Auth, PostgreSQL, Storage privado y Edge Functions. El backend controla permisos, selección y calificación.
- PGlite para PostgreSQL aislado en pruebas y Playwright con Microsoft Edge para recorridos web.
- `server/` conserva una implementación SQLite histórica y utilidades de servidor. El cliente actual no usa el servidor SQLite.

Las versiones exactas están en `package.json` y `package-lock.json`.

## Instalación y ejecución del cliente

```powershell
npm ci
```

En una copia nueva, crea `.env` a partir de `.env.example`. Si ya existe, conserva su contenido. Completa las variables mediante un canal privado autorizado:

| Variable | Uso |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase autorizado |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable del cliente |
| `EXPO_PUBLIC_AUTH_REDIRECT_URL` | Retorno Auth permitido para la plataforma |

El ejemplo usa un retorno ficticio/local. La URL de retorno debe coincidir con la configuración Auth existente. Nunca pongas claves de servicio, contraseñas, OAuth ni tokens IA en variables `EXPO_PUBLIC_*`: se incorporan al cliente.

```powershell
npm run web
npm run android
```

Ejecuta el comando de la plataforma que necesites. Android requiere el entorno Android/emulador o dispositivo compatible con Expo. Los enlaces nativos de recuperación requieren un development build con el scheme `apex`. El funcionamiento habitual contacta Supabase real y las acciones de usuario pueden escribir datos y enviar invitaciones; no forma parte de las verificaciones aisladas.

Esta instalación de código no crea, migra, resetea, publica contenido ni modifica el backend. Una instancia nueva de Supabase requiere un procedimiento independiente autorizado. No reproduzcas migraciones sobre una instancia existente solo por clonar el proyecto. `supabase/applied-baseline.json` registra hashes y declaraciones históricas del responsable; no prueba el estado remoto actual.

## Configuración opcional de servidor

Los archivos de ejemplo contienen nombres y valores vacíos o ficticios. No se guardan valores reales en Git ni se cambian los secretos que ya funcionan.

| Componente | Variables |
| --- | --- |
| Worker IA, ejemplo `.env.ai.example` | `APEX_AI_SUPABASE_URL`, `APEX_AI_SUPABASE_SERVICE_KEY`, `APEX_AI_N8N_URL`, `APEX_AI_N8N_TOKEN` |
| Invitaciones, ejemplo `supabase/functions/.env.example` | `APEX_ADMIN_SUPABASE_PUBLISHABLE_KEY`, `APEX_ADMIN_SUPABASE_SERVICE_KEY`, `APEX_ADMIN_INVITE_REDIRECT_URL`, `APEX_ADMIN_EXISTING_INVITE_REDIRECT_URL`, `APEX_ADMIN_ALLOWED_ORIGINS` |
| OAuth Gmail del servicio de invitaciones | `APEX_ADMIN_GMAIL_CLIENT_ID`, `APEX_ADMIN_GMAIL_CLIENT_SECRET`, `APEX_ADMIN_GMAIL_REFRESH_TOKEN` |
| Runtime Edge | `SUPABASE_URL`, suministrada por el runtime; no es configuración Expo |
| Servidor SQLite histórico, opcional | `APEX_DB`, `HOST`, `PORT`; no necesario para el cliente actual |

El worker (`npm run ai:worker`) reclama trabajos y escribe resultados en Supabase; no es una prueba. Gmail API, OAuth, SMTP y despliegues Edge se administran por separado. No es necesario arrancarlos, desplegarlos ni configurar secretos remotos para revisar o subir el código.

## Verificaciones aisladas

Con dependencias instaladas, estas verificaciones locales no necesitan las credenciales de `.env` ni acceden al backend remoto:

```powershell
npm run check:migrations
npm run typecheck
npm run test:admin:service
node --import tsx --test server/ai/adapter.test.ts src/assessmentTime.test.ts
npm run test:legacy
```

Las pruebas administrativas sustituyen los puertos HTTP/correo; no envían mensajes. Las pruebas históricas crean bases temporales, sin abrir `server/data/`. PGlite ejecuta SQL únicamente dentro de bases de prueba; no ejecuta migraciones en Supabase. Los hashes de migraciones aplicadas se conservan.

Parte de la suite completa aún depende de material reservado excluido de Git. Los originales se conservan localmente; una copia del repositorio requiere recibirlos por un canal privado autorizado, respetando sus rutas. No elimines pruebas ni migres la base para suplir archivos faltantes.

Con esos insumos autorizados disponibles:

```powershell
npm test
npm run test:e2e
```

La suite PGlite y el E2E siguen siendo aislados. Playwright inicia un simulador Auth/RPC en `127.0.0.1:54329` y Expo en `localhost:8091` con variables de prueba explícitas; necesita Microsoft Edge instalado y puertos libres. `APEX_E2E_PORT` permite cambiar el puerto web. Conserva las pruebas sintéticas; que una prueba use PGlite no garantiza que su insumo editorial sea redistribuible.

`npm run test:admin:concurrency` y `npm run test:teacher:concurrency` requieren bases PostgreSQL locales vacías y desechables con nombres restringidos por los scripts; no se ejecutan sobre Supabase. `npm run test:android` requiere además un dispositivo/emulador y preparación específica. No están incluidos en las verificaciones anteriores.

Los comandos `export:web` y `export:android` generan compilados locales que pueden contener configuración pública. `check:client-bank` inspecciona ambos compilados y necesita la revisión editorial local. Las salidas, logs y capturas se excluyen de Git.

## Organización y material reservado

- `App.tsx`, `src/`, `shared/`: cliente y contratos.
- `supabase/migrations/`, `server/migrations/`: migraciones originales; conservar su integridad.
- `supabase/tests/`, `tests/`, pruebas de `server/` y `src/`: verificaciones y fixtures.
- `supabase/content/apex-learning-v2-templates.sql`: plantillas técnicas; las cargas del banco se mantienen aparte.
- `scripts/`: comprobaciones, preparación editorial y herramientas locales; no equivalen a una autorización de despliegue.
- `Docs/`: documentación técnica. Algunos documentos operativos quedan solo locales por contener identidades reales.

`content/`, PDF, capturas y las cargas SQL del banco se mantienen fuera de Git hasta decidir derechos y confidencialidad. Incluyen preguntas, lecturas, claves y justificaciones. También se excluyen bases locales, perfiles, hashes de contraseña, exportaciones, credenciales, dependencias y compilados. Un repositorio privado no sustituye esa selección.

Consulta [reproducibilidad y material autorizado](Docs/REPRODUCIBILIDAD.md) para las rutas exactas de los paquetes privados, las suites que los necesitan y los ejemplos operativos con marcadores. Los enlaces a documentación y capturas excluidas se identifican como rutas de texto «solo local». Las guías históricas describen operaciones remotas: no deben ejecutarse automáticamente.

## Preparación de GitHub

Git está inicializado en `main`, sin commits ni archivos rastreados. Se comprobó mediante consultas de lectura que `EstebanRojas3007/APEX` existe, es privado, tiene `main` como rama predeterminada y no tiene ramas ni commits al 02/11/2026. `origin` ya apunta a ese repositorio. Se conservan `.git` y los puntos de control locales. No se ha hecho staging, commit, push, creación de repositorio ni invitaciones.

La [revisión para GitHub privado](Docs/PREPARACION_GITHUB_PRIVADO.md) documenta la selección definitiva, exclusiones, datos residuales, comprobaciones y comandos exactos del primer commit/envío. Los SQL dirigidos a cuentas reales quedan fuera; las migraciones y el remitente actual permanecen intactos. `.gitattributes` evita conversiones de fin de línea en migraciones y semilla protegida para conservar sus hashes al clonar en Windows. No se ha añadido una licencia de código abierto ni se concede autorización de redistribución de materiales de terceros.

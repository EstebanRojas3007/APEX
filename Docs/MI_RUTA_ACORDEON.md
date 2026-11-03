# Mi ruta: acordeón de niveles — 12/10/2026

Cambio local limitado al frontend de APEX. Se revisaron README, CONTEXTO_APEX, APRENDIZAJE_MVP, la navegación de App.tsx y LearningRoute/LearningSection. No hay AGENTS.md en el proyecto ni en sus directorios superiores consultados.

Los niveles Básico, Intermedio e Intermedio-avanzado tienen cabeceras completas pulsables con progreso X/7, estado y flecha. Solo uno puede estar abierto. Como la RPC no expone un campo de nivel actual, se abre inicialmente el primer nivel disponible cuyo control aún no está aprobado; si todos los disponibles están aprobados, se abre el último disponible. Sin niveles disponibles, todos quedan cerrados. Las actualizaciones periódicas respetan la selección del usuario, incluido cerrar todos los niveles.

Cada panel contiene siete filas con número, título persistido o «Contenido pendiente», estado y acceso a su pantalla independiente, además del estado/requisitos del control. Los niveles bloqueados muestran su requisito pendiente. «Ver estado» conserva la consulta de una sección bloqueada o pendiente; LearningSection mantiene la protección de contenido, finalización y Refuerzo. El examen final se muestra por separado, habilitado o con su requisito pendiente, con 25 preguntas y mínimo 22 aciertos.

App.tsx conserva el nivel y el desplazamiento durante la ida y vuelta entre Mi ruta y las secciones. La restauración espera al contenido medido; en web se captura también el desplazamiento antes de desmontar el ScrollView para evitar perder el último evento. Una entrada desde otras pantallas selecciona de nuevo el nivel actual. El cierre de sesión limpia el estado de la ruta. Los enlaces directos a secciones mantienen su nivel al regresar.

Se conservan componentes, dependencias, colores y tipografía. Las cabeceras incluyen estado accesible expanded/aria-expanded, etiquetas, indicaciones y foco visible. Pressable proporciona activación con Enter y espacio en web. Las filas completas son pulsables y tienen una altura mínima de 64 px; el texto se ajusta en pantallas estrechas.

Abrir/cerrar el acordeón solo cambia estado local. No solicita generación, registra inicio/finalización ni crea intentos. Se mantiene la consulta periódica existente de cinco segundos, evitando solapar consultas de ese intervalo. La generación continúa requiriendo su botón explícito. No se modificaron SQL, permisos, reglas pedagógicas, contratos, contenido personalizado, versiones guardadas, migraciones ni servicios remotos.

Archivos de implementación y pruebas: App.tsx, src/LearningRoute.tsx, tests/route-accordion.spec.ts (nuevo), tests/learning.spec.ts y tests/mvp-demo.spec.ts. Este documento registra la verificación. Las pruebas y exportaciones producen sus artefactos locales habituales.

Verificación con el código final:

- `npm run typecheck`: correcto.
- `npx playwright test tests/route-accordion.spec.ts tests/learning.spec.ts tests/mvp-demo.spec.ts`: **7/7 aprobadas**, en Edge invisible con Auth simulado y PostgreSQL PGlite local. Incluye web a 1280, 390 y 320 px, teclado, apertura/cierre/exclusión, nivel inicial disponible o bloqueado, resúmenes bloqueados, filas/títulos largos, ausencia de solicitudes al desplegar, carga/error/generación, conservación del nivel/desplazamiento, atrás/adelante del navegador, actualización del progreso, control/final y el recorrido existente de finalización explícita/repaso/recuperación. Las capturas nuevas `test-results/route-accordion-{1280,390,320}.png` fueron revisadas visualmente a 1280 y 320 px.
- `npm run export:web`: correcto, 272 módulos.
- `npm run export:android`: correcto, 665 módulos y bytecode Hermes. Esto es compilación, no ejecución Android.
- `npm run check:migrations`: hashes protegidos conservados, sin consultas remotas.
- `adb devices -l`: ningún dispositivo conectado. No se ejecutó la interacción ni el botón físico Atrás en Android; esa validación permanece pendiente de un dispositivo/emulador disponible. Las pruebas de anchura móvil son web.

Playwright y Hermes fallaron inicialmente con `spawn EPERM` dentro del sandbox; las ejecuciones locales autorizadas fuera del sandbox pasaron. Las pruebas detectaron un selector duplicado y que React Native Web necesita conectar onLayout desde el primer render para observar el tamaño; se corrigieron antes de la ejecución final aprobada. No se instalaron dependencias ni se realizaron cambios remotos.

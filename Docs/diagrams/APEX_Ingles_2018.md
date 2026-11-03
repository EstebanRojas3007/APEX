# Incorporación de Inglés: complemento al modelo Supabase

Los diagramas originales se conservan. Esta ampliación corresponde a la sexta migración pendiente y al procedimiento de [Inglés 2018](../INGLES_2018.md).

```mermaid
flowchart TD
  PDF[PDF privado y fuente existente] --> EXTRA[Extracción y cotejo visual por asistente completados]
  EXTRA --> DRAFT[Bloques, preguntas y opciones en borrador]
  DRAFT --> REVIEW[Revisión humana independiente]
  REVIEW --> PUB[Publicación explícita del diagnóstico]
  PUB --> ADMIN[Administrador elige programas existentes]
  ADMIN --> LINK[programa_componente: Inglés]
  LINK --> EXIST[Asignar a estudiantes actuales]
  LINK --> NEW[Asignar al completar perfil]
  EXIST --> TRY[Intento y calificación en servidor]
  NEW --> TRY
  TRY --> HIST[Resultado e historial conservados]
  PDF --> FRAG[Fragmentos documentales revisados]
  FRAG --> FILTER[Autorización, bloqueo de intento y exclusión de claves]
  FILTER --> AI[Contexto permitido para futuro tutor]
```

```mermaid
erDiagram
  fuente ||--o{ bloque_preguntas : contiene
  fuente ||--o{ pregunta : documenta
  bloque_preguntas o|--o{ pregunta : comparte_contexto
  pregunta ||--|{ opcion_respuesta : etiquetas_originales
  pregunta ||--o{ item_evaluacion : version_fija
  evaluacion ||--|{ item_evaluacion : selecciona
  evaluacion ||--o{ asignacion_evaluacion : asignada
  estudiante ||--o{ asignacion_evaluacion : recibe
  programa_academico ||--o{ estudiante : conserva_programa
  programa_academico ||--o{ programa_componente : ofrece
  componente ||--o{ programa_componente : pertenece
```

Bloques, preguntas y opciones utilizados quedan congelados. La respuesta del intento contiene instrucciones/lecturas y opciones permitidas, sin claves. La carga no inserta fragmentos del tutor. Ninguna flecha representa una acción remota ejecutada en esta entrega.

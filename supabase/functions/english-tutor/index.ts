import {tutorConfig} from './config.ts';
import {englishTutorHandler} from './handler.ts';
import {tutorPorts} from './service.ts';

// Diagnostics allow stage/code/duration and Groq HTTP status only on rejection.
const config=tutorConfig(name=>Deno.env.get(name));
Deno.serve(englishTutorHandler(tutorPorts(config),config));

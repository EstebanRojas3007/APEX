import type { DatabaseSync } from 'node:sqlite';
// Contenido propio v1, exclusivamente demostrativo. Nunca importar desde el cliente.
export function seed(db: DatabaseSync) {
  if (db.prepare('SELECT id FROM evaluacion').get()) return;
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO programa_academico VALUES (?,?)').run('demo', 'Programa de demostración');
    db.prepare('INSERT INTO componente VALUES (?,?)').run('rc', 'Razonamiento Cuantitativo');
    db.prepare('INSERT INTO programa_componente VALUES (?,?)').run('demo', 'rc');
    for (const [id, name] of [['numeros','Números y proporciones'],['datos','Datos y probabilidad'],['geometria','Geometría']]) db.prepare('INSERT INTO nucleo_tematico VALUES (?,?,?)').run(id!, 'rc', name!);
    for (const [id, name] of [['interpretar','Interpretación'],['resolver','Resolución de problemas']]) db.prepare('INSERT INTO competencia VALUES (?,?,?)').run(id!, 'rc', name!);
    db.prepare('INSERT INTO fuente VALUES (?,?,?,?)').run('propia-v1', 'Contenido propio de demostración APEX', 'APEX', 'v1 · No es material oficial ICFES');
    db.prepare('INSERT INTO evaluacion VALUES (?,?,?)').run('diagnostico-v1', 'Diagnóstico inicial', 1);
    db.prepare('INSERT INTO evaluacion_componente VALUES (?,?)').run('diagnostico-v1', 'rc');
    const questions: [string,string,string,string[],number][] = [
      ['Una libreta cuesta $20.000 y tiene un descuento del 15 %. ¿Cuánto pagas?', 'numeros','resolver', ['$17.000','$15.000','$18.500','$19.700'],0],
      ['Una receta para 4 personas usa 300 g de arroz. ¿Cuánto se necesita para 6 personas?', 'numeros','resolver', ['350 g','400 g','450 g','600 g'],2],
      ['Las notas son 2, 3, 3 y 4. ¿Cuál es su promedio?', 'datos','interpretar', ['2','3','3,5','4'],1],
      ['En una bolsa hay 3 fichas azules y 2 verdes. ¿Cuál es la probabilidad de sacar una verde?', 'datos','resolver', ['1/5','3/5','2/3','2/5'],3],
      ['Un rectángulo mide 8 m de largo y 5 m de ancho. ¿Cuál es su área?', 'geometria','resolver', ['13 m²','26 m²','40 m²','80 m²'],2],
      ['Una biblioteca prestó 12 libros el lunes y 18 el martes. ¿Cuántos prestó en total?', 'datos','interpretar', ['6','24','28','30'],3],
      ['Si 3x + 6 = 21, ¿cuál es el valor de x?', 'numeros','resolver', ['5','7','9','15'],0],
    ];
    questions.forEach(([text,nucleus,competency,options,correct],index) => {
      const id = `q${index+1}`;
      db.prepare('INSERT INTO pregunta VALUES (?,?,?,?,?,?)').run(id,'propia-v1',nucleus,competency,text,1);
      options.forEach((option,j) => db.prepare('INSERT INTO opcion_respuesta VALUES (?,?,?,?,?)').run(`${id}-o${j}`,id,option,j+1,j===correct?1:0));
      db.prepare('INSERT INTO item_evaluacion VALUES (?,?,?,?)').run(`item${index+1}`,'diagnostico-v1',id,index+1);
    });
    const materials = [
      ['porcentajes','Porcentajes, paso a paso','numeros','Un porcentaje expresa una parte de cada cien. Para calcular un descuento, multiplica el precio por el porcentaje dividido entre 100 y resta ese valor. Ejemplo distinto al diagnóstico: 10 % de $50.000 son $5.000; el precio final es $45.000. Practica: calcula el 20 % de 80.'],
      ['promedios','Lee los datos con calma','datos','El promedio es la suma de los valores dividida entre su cantidad. Para 4, 6 y 8: (4 + 6 + 8) / 3 = 6. Antes de operar, identifica la unidad y lo que pide la pregunta. En una probabilidad simple, divide los casos favorables entre los casos posibles igualmente probables.'],
      ['areas','Distingue área y perímetro','geometria','El área de un rectángulo es base por altura; su unidad es cuadrada. El perímetro suma todos sus lados. Para un rectángulo de 3 m por 2 m: área = 6 m² y perímetro = 10 m. Dibuja la figura y escribe las unidades antes de calcular.'],
    ];
    for (const [id,title,nucleus,body] of materials) {
      db.prepare('INSERT INTO material_estudio VALUES (?,?,?,?,?)').run(id!,'propia-v1',title!,body!,1);
      db.prepare('INSERT INTO material_nucleo VALUES (?,?)').run(id!,nucleus!);
    }
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
}

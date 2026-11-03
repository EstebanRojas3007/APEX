import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ApexService } from './service';
import { makeServer } from './http';
const directory=new URL('./data/',import.meta.url);
mkdirSync(directory,{recursive:true});
const service=new ApexService(process.env.APEX_DB??fileURLToPath(new URL('apex.sqlite',directory)));
const host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??3001);
const server=makeServer(service);
server.listen(port,host,()=>console.log(`APEX · demostración local · http://${host}:${port}`));
function shutdown() {server.close(()=>{service.db.close();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

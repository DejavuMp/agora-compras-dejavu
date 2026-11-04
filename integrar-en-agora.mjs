// Ejecutar con: node integrar-en-agora.mjs
// Desde la raíz del repositorio Agora, después de copiar el contenido del ZIP.
import fs from 'node:fs';
const src='firestore.rules';
if(!fs.existsSync(src)||!fs.existsSync('firebase.json')){console.error('Coloca estos archivos en la raíz del repositorio de ÁGORA.');process.exit(1);}
let rules=fs.readFileSync(src,'utf8');
const marker='// INCORPORAR estos dos match';
const fragment=fs.readFileSync('firestore.archivos.rules.fragment','utf8');
if(!rules.includes('match /agora_file_deliveries/{token}')){
  const ending='    // Todas las demás colecciones permanecen cerradas.';
  if(!rules.includes(ending))throw Error('No encontré la posición segura de inserción en firestore.rules. No se modificó.');
  fs.copyFileSync(src,src+'.backup');
  rules=rules.replace(ending,fragment.replaceAll('\n','\n    ')+ '\n'+ending);
  fs.writeFileSync(src,rules);
  console.log('Reglas de archivos integradas; respaldo firestore.rules.backup creado.');
}else console.log('Las reglas de archivos ya estaban integradas.');
const settings=JSON.parse(fs.readFileSync('firebase.json','utf8'));
if(!settings.storage)settings.storage={rules:'storage.rules'};
if(!settings.functions)settings.functions={source:'functions'};
if(settings.hosting?.ignore){for(const item of ['functions/**','firestore.archivos.rules.fragment','firestore.rules.backup','integrar-en-agora.mjs','README_ARCHIVOS.md','index.html.backup','firebase.json.backup'])if(!settings.hosting.ignore.includes(item))settings.hosting.ignore.push(item);}
fs.copyFileSync('firebase.json','firebase.json.backup');fs.writeFileSync('firebase.json',JSON.stringify(settings,null,2)+'\n');
console.log('firebase.json actualizado. No se han publicado cambios en Firebase ni se ha alterado la base de datos.');
const indexFile='index.html';
if(fs.existsSync(indexFile)){
  let html=fs.readFileSync(indexFile,'utf8');
  if(!html.includes('agora-archivos-bridge.js')){
    if(!html.includes('</body>'))throw Error('No se encontró </body> en index.html');
    fs.copyFileSync(indexFile,indexFile+'.backup');
    html=html.replace('</body>','<script defer src="./agora-archivos-bridge.js"></script></body>');
    fs.writeFileSync(indexFile,html);
    console.log('Acceso «Envío de archivos» agregado al menú lateral de Pedidos.');
  }
}

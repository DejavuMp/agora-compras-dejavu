import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve("operaciones");
const m=JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8"));
assert.equal(m.start_url,"./visor.html");
assert.equal(m.scope,"./");
assert.equal(m.display,"standalone");
assert.ok(m.icons.length>=2);
for(const icon of m.icons){
 assert.ok(fs.existsSync(path.resolve(root,icon.src)),icon.src+" debe existir");
}
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
assert.ok(sw.includes("caches.open"));
assert.ok(sw.includes("req.method!==\"GET\""),"no interceptar escrituras");
assert.ok(sw.includes("url.origin!==self.location.origin"),"no interceptar dominios Firebase");
assert.ok(sw.includes("!STATIC.has(url.pathname)"),"solo cachear shell explícito");
const paths=["index.html","visor.html"];
for(const page of paths){
 const html=fs.readFileSync(path.join(root,page),"utf8");
 assert.ok(html.includes('rel="manifest"'),page+" manifiesto");
 assert.ok(html.includes('register("./sw.js"'),page+" Service Worker");
}
assert.ok(fs.readFileSync(path.join(root,"visor.html"),"utf8").includes('id="install-ops-app"'));
console.log("OK PWA: manifiesto, iconos, registro y caché exclusivo del shell estático.");

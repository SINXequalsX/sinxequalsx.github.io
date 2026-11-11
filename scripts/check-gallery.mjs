import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporary = await mkdtemp(path.join(os.tmpdir(),'peter-gallery-check-'));
const fixture = {navigation:[{id:'intro',label:'Introduction',slug:''}],intro:{title:'Gallery check',intro:'',blocks:[]}};
await Promise.all(['scripts','public','content','editor'].map(name => mkdir(path.join(temporary,name))));
for (const name of ['scripts/editor.mjs','scripts/build.mjs','public/site.css','public/gallery.js','public/gallery-viewer.js']) await copyFile(path.join(root,name),path.join(temporary,name));
if (process.argv.includes('--serve')) {
  for (const name of ['editor/index.html','editor/editor.js','editor/editor.css','editor/preview.html','editor/preview.js','public/theme.js','public/favicon.svg']) await copyFile(path.join(root,name),path.join(temporary,name));
}
await writeFile(path.join(temporary,'package.json'),JSON.stringify({type:'module'}));
await writeFile(path.join(temporary,'content','published.json'),JSON.stringify(fixture));
const reservation = createServer();
await new Promise(resolve => reservation.listen(0,'127.0.0.1',resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const child = spawn(process.execPath,['scripts/editor.mjs'],{cwd:temporary,env:{...process.env,PORT:String(port),GIT_EXE:path.join(temporary,'nonexistent-git')},windowsHide:true,stdio:['ignore','pipe','pipe']});
let output = '', errors = '';
child.stderr.on('data',chunk => { errors += chunk; });
try {
  const token = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error(`Editor startup timed out. ${errors}`)),20000);
    child.on('error',reject);
    child.on('exit',code => { clearTimeout(timer); reject(new Error(`Editor exited ${code}. ${errors}`)); });
    child.stdout.on('data',chunk => { output += chunk; const token = /token=([a-f0-9]{48})/.exec(output)?.[1]; if (token) { clearTimeout(timer); resolve(token); } });
  });
  const origin = `http://127.0.0.1:${port}`;
  const request = (url,options = {}) => fetch(origin+url,{...options,headers:{'x-editor-token':token,...options.headers}});
  assert.equal((await fetch(origin+'/api/content')).status,403);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNCcAAAAASUVORK5CYII=','base64');
  const uploads = [];
  for (const name of ['drawing-one.png','drawing-two.png','removed.png']) {
    const result = await request('/api/upload-gallery',{method:'POST',headers:{'x-file-name':encodeURIComponent(name),'content-type':'image/png'},body:png});
    assert.equal(result.status,200);
    uploads.push((await result.json()).path);
  }
  const privateFile = await request(uploads[0]);
  assert.equal(privateFile.status,200);
  assert.equal(privateFile.headers.get('cache-control'),'private, no-store');
  assert.equal(privateFile.headers.get('cross-origin-resource-policy'),'same-origin');
  assert.equal((await request('/api/upload-gallery',{method:'POST',headers:{'x-file-name':'bad.svg'},body:'<svg></svg>'})).status,415);
  await assert.rejects(readFile(path.join(temporary,'public',uploads[0].slice(1))));
  const data = structuredClone(fixture);
  data.intro.blocks = [{id:'test-gallery',type:'gallery',size:'full',galleryLayout:'stack',galleryImages:[
    {id:'second',src:uploads[1],alt:'Second drawing',caption:'Second <then> first'},
    {id:'first',src:uploads[0],alt:'First drawing',caption:''},
    {id:'bad',src:'javascript:alert(1)',alt:'Bad'}
  ]}];
  const save = await request('/api/draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  assert.equal(save.status,200);
  const restored = (await (await request('/api/content')).json()).content.intro.blocks[0];
  assert.equal(restored.type,'gallery');
  assert.equal(restored.galleryLayout,'stack');
  assert.deepEqual(restored.galleryImages.map(image => image.src),[uploads[1],uploads[0]]);
  assert.equal(restored.galleryImages[0].caption,'Second <then> first');
  const publish = await request('/api/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  assert.equal(publish.status,502); // An intentionally missing Git executable prevents any real push.
  const html = await readFile(path.join(temporary,'dist','index.html'),'utf8');
  assert.ok(html.includes('gallery-images-stack'));
  assert.ok(html.includes('Second &lt;then&gt; first'));
  assert.ok(html.includes('gallery-viewer.js'));
  assert.ok(html.indexOf(uploads[1]) < html.indexOf(uploads[0]));
  assert.deepEqual(await readFile(path.join(temporary,'public',uploads[0].slice(1))),png);
  await assert.rejects(readFile(path.join(temporary,'public',uploads[2].slice(1))));
  console.log('Passed gallery uploads, private drafts, validation, ordering, save/reload, and public rendering. No real draft or GitHub repository was changed.');
  if (process.argv.includes('--serve')) {
    console.log(`Gallery test editor: ${origin}/admin`);
    process.on('SIGINT',() => { child.kill(); process.exit(0); });
    await new Promise(() => {});
  }
} finally {
  child.kill();
}

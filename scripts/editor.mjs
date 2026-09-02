import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const git = process.env.GIT_EXE || 'git';
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const token = randomBytes(24).toString('hex');
const pages = ['intro','notes','cv','projects','photos'];
const types = ['hero','text','image','feature','list','quote'];
const tones = ['white','sky','mint','lilac','peach'];
const sizes = ['full','half','third'];
const fonts = ['clean','bold','rounded','serif'];
const textColors = ['default','black','white','gray','blue','red'];
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'};

function build() { execFileSync(node,[path.join(root,'scripts','build.mjs')],{cwd:root,stdio:'pipe',timeout:30000}); }
function json(response,statusCode,value) { response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); response.end(JSON.stringify(value)); }
function isAuthorized(request) { const localHost = String(request.headers.host || '').split(':')[0]; return ['127.0.0.1','localhost'].includes(localHost) && request.headers['x-editor-token'] === token; }
async function readBody(request,limit) { const chunks = []; let length = 0; for await (const chunk of request) { length += chunk.length; if (length > limit) throw new Error('Request is too large.'); chunks.push(chunk); } return Buffer.concat(chunks); }
function cleanText(value,max=20000) { return typeof value === 'string' ? value.slice(0,max) : ''; }

function validateContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Content must be an object.');
  const output = {};
  for (const key of pages) {
    const page = value[key]; if (!page || typeof page !== 'object' || !Array.isArray(page.blocks)) throw new Error(`Page ${key} is invalid.`);
    output[key] = { title:cleanText(page.title,200), intro:cleanText(page.intro,1000), backgroundImage:cleanText(page.backgroundImage,1000), blocks:page.blocks.slice(0,100).map((block,index) => ({
      id:cleanText(block.id,100) || `${key}-${index}`, type:types.includes(block.type) ? block.type : 'text', tone:tones.includes(block.tone) ? block.tone : 'white', size:sizes.includes(block.size) ? block.size : 'full', fontStyle:fonts.includes(block.fontStyle) ? block.fontStyle : 'clean', textColor:textColors.includes(block.textColor) ? block.textColor : 'default',
      eyebrow:cleanText(block.eyebrow,300), title:cleanText(block.title,500), body:cleanText(block.body), meta:cleanText(block.meta,500), imageSrc:cleanText(block.imageSrc,1000), imageAlt:cleanText(block.imageAlt,500),
      linkLabel:cleanText(block.linkLabel,200), linkUrl:cleanText(block.linkUrl,2000), pdfLabel:cleanText(block.pdfLabel,200), pdfSrc:cleanText(block.pdfSrc,1000),
      links:Array.isArray(block.links) ? block.links.slice(0,30).map((item,itemIndex) => ({id:cleanText(item.id,100) || `link-${itemIndex}`,label:cleanText(item.label,200),url:cleanText(item.url,2000)})) : [],
      pdfs:Array.isArray(block.pdfs) ? block.pdfs.slice(0,30).map((item,itemIndex) => ({id:cleanText(item.id,100) || `pdf-${itemIndex}`,label:cleanText(item.label,200),src:cleanText(item.src,1000)})) : [],
      items:Array.isArray(block.items) ? block.items.slice(0,100).map(item => cleanText(item,2000)) : [],
    })) };
  }
  return output;
}

async function atomicWrite(file,data) { const temporary = `${file}.tmp`; await writeFile(temporary,JSON.stringify(data,null,2)+'\n','utf8'); await rename(temporary,file); }
function gitCommand(args,timeout=90000) { return execFileSync(git,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout}).trim(); }
async function serveFile(response,file) {
  try { const info = await stat(file); if (!info.isFile()) throw new Error('Not a file'); response.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream','cache-control':'no-cache'}); createReadStream(file).pipe(response); }
  catch { response.writeHead(404,{'content-type':'text/plain; charset=utf-8'}); response.end('Not found'); }
}

build(); await mkdir(path.join(root,'public','uploads'),{recursive:true});

const server = createServer(async (request,response) => {
  try {
    const url = new URL(request.url,`http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname === '/admin') { response.writeHead(302,{location:`/editor/?token=${token}`}); return response.end(); }
    if (url.pathname.startsWith('/api/')) {
      if (!isAuthorized(request)) return json(response,403,{error:'Editor session not authorized. Restart the local editor and use its private URL.'});
      if (request.method === 'GET' && url.pathname === '/api/content') {
        const draft = path.join(root,'content','draft.json'), published = path.join(root,'content','published.json');
        return json(response,200,{content:JSON.parse(await readFile(existsSync(draft) ? draft : published,'utf8')),draft:existsSync(draft)});
      }
      if (request.method === 'POST' && ['/api/draft','/api/publish'].includes(url.pathname)) {
        const data = validateContent(JSON.parse((await readBody(request,4*1024*1024)).toString('utf8')));
        await atomicWrite(path.join(root,'content','draft.json'),data);
        if (url.pathname === '/api/draft') {
          const savedAt = new Date();
          return json(response,200,{message:`Draft saved locally at ${savedAt.toLocaleTimeString()}. The public site is unchanged.`,savedAt:savedAt.toISOString()});
        }
        await atomicWrite(path.join(root,'content','published.json'),data); build();
        try {
          gitCommand(['add','content/published.json','public']);
          if (gitCommand(['diff','--cached','--name-only'])) gitCommand(['commit','-m',`Publish website update ${new Date().toISOString().slice(0,10)}`]);
          gitCommand(['-c','http.version=HTTP/1.1','push','origin','main']);
          const commit = gitCommand(['rev-parse','--short','HEAD']);
          const publishedAt = new Date();
          return json(response,200,{message:`Published commit ${commit} to GitHub at ${publishedAt.toLocaleTimeString()}. The public site normally updates within one minute.`,commit,publishedAt:publishedAt.toISOString(),liveUrl:'https://sinxequalsx.github.io'});
        } catch (error) { return json(response,502,{error:`The site was built and committed locally, but GitHub push needs attention: ${String(error.stderr || error.message).trim()}`}); }
      }
      if (request.method === 'POST' && url.pathname === '/api/upload-pdf') {
        const body = await readBody(request,30*1024*1024); const original = decodeURIComponent(String(request.headers['x-file-name'] || 'document.pdf')); const extension = path.extname(original).toLowerCase();
        if (extension !== '.pdf') return json(response,415,{error:'Please choose a PDF file.'});
        if (body.subarray(0,5).toString('ascii') !== '%PDF-') return json(response,415,{error:'The selected file is not a valid PDF.'});
        const basename = path.basename(original,extension).replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'document';
        const filename = `${Date.now()}-${basename}-${randomBytes(3).toString('hex')}.pdf`; await writeFile(path.join(root,'public','uploads',filename),body); return json(response,200,{path:`/uploads/${filename}`});
      }
      if (request.method === 'POST' && url.pathname === '/api/upload') {
        const body = await readBody(request,15*1024*1024); const original = decodeURIComponent(String(request.headers['x-file-name'] || 'image')); const extension = path.extname(original).toLowerCase();
        if (!['.jpg','.jpeg','.png','.webp','.gif','.avif'].includes(extension)) return json(response,415,{error:'Please choose a JPG, PNG, WebP, GIF, or AVIF image.'});
        const basename = path.basename(original,extension).replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,50) || 'image';
        const filename = `${Date.now()}-${basename}-${randomBytes(3).toString('hex')}${extension}`; await writeFile(path.join(root,'public','uploads',filename),body); return json(response,200,{path:`/uploads/${filename}`});
      }
      return json(response,404,{error:'Unknown editor endpoint.'});
    }
    if (url.pathname.startsWith('/editor/')) {
      const relative = url.pathname === '/editor/' ? 'index.html' : url.pathname.slice('/editor/'.length); const base = path.resolve(root,'editor'); const resolved = path.resolve(base,relative);
      if (!resolved.startsWith(base + path.sep) && resolved !== path.join(base,'index.html')) return serveFile(response,''); return serveFile(response,resolved);
    }
    let relative = url.pathname.replace(/^\/+/, ''); if (!relative || relative.endsWith('/')) relative += 'index.html'; const base = path.resolve(root,'dist'); const resolved = path.resolve(base,relative);
    if (!resolved.startsWith(base + path.sep) && resolved !== path.join(base,'index.html')) return serveFile(response,''); return serveFile(response,resolved);
  } catch (error) { json(response,500,{error:error.message || 'Unexpected local server error.'}); }
});

server.listen(port,host,() => {
  console.log('\nPeter Jiang website editor'); console.log(`Editor:  http://${host}:${port}/editor/?token=${token}`); console.log(`Preview: http://${host}:${port}/`); console.log('Press Ctrl+C to stop.\n');
});

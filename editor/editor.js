const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('peter-editor-token') || '';
if (token) sessionStorage.setItem('peter-editor-token', token);

const tabs = [['intro','Introduction'],['notes','Notes'],['cv','CV'],['projects','Projects'],['photos','Photos']];
const blockChoices = [
  ['hero','Hero','A large opening statement'],['text','Text','Heading and paragraph'],
  ['image','Image','Photo with a caption'],['feature','Feature','A highlighted idea or project'],
  ['list','List','Entries, interests, or milestones'],['quote','Quote','A spacious statement'],
];
const tones = ['white','sky','mint','lilac','peach'];
const sizes = ['full','half','third'];
let content, active = 'intro', openPicker = null, busy = false;
const statusElement = document.querySelector('#status');
const pageTabs = document.querySelector('#page-tabs');
const pageSettings = document.querySelector('#page-settings');
const blockList = document.querySelector('#block-list');

function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]); }
function setStatus(message, kind = '') { statusElement.textContent = message; statusElement.dataset.kind = kind; }
function setBusy(next) { busy = next; document.querySelectorAll('#save-draft,#publish').forEach(button => button.disabled = next); }
function authHeaders(extra = {}) { return {'x-editor-token':token, ...extra}; }
function newBlock(type) { return { id:crypto.randomUUID(), type, tone:type === 'image' ? 'white' : 'sky', size:['hero','quote'].includes(type) ? 'full' : 'half', eyebrow:'', title:type === 'hero' ? 'A clear new beginning' : '', body:'', meta:'', imageSrc:'', imageAlt:'', items:type === 'list' ? ['First item'] : [] }; }

function field(label, value, options = {}) {
  const wrapper = document.createElement('label'); wrapper.className = `editor-field${options.wide ? ' wide' : ''}`;
  const title = document.createElement('span'); title.textContent = label;
  const control = options.multiline ? document.createElement('textarea') : document.createElement('input');
  if (options.multiline) control.rows = options.rows || 3;
  control.value = value || ''; control.addEventListener('input', () => options.onInput(control.value));
  wrapper.append(title, control); return wrapper;
}

function renderTabs() {
  pageTabs.replaceChildren(...tabs.map(([key,label]) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = active === key ? 'selected' : '';
    button.innerHTML = `<span>${label[0]}</span>${label}`;
    button.addEventListener('click', () => { active = key; openPicker = null; render(); }); return button;
  }));
}

function renderSettings() {
  const page = content[active];
  pageSettings.replaceChildren(
    field('Page title', page.title, {onInput:value => { page.title = value; document.querySelector('#active-page-name').textContent = value || tabs.find(tab => tab[0] === active)[1]; }}),
    field('Short introduction', page.intro, {multiline:true,rows:2,onInput:value => page.intro = value}),
  );
}

function renderPicker(index) {
  const holder = document.createElement('div'); holder.className = 'block-inserter';
  const add = document.createElement('button'); add.className = 'add-block-square'; add.type = 'button'; add.textContent = '+'; add.setAttribute('aria-label',`Add block at position ${index + 1}`);
  add.addEventListener('click', () => { openPicker = openPicker === index ? null : index; renderBlocks(); }); holder.append(add);
  if (openPicker === index) {
    const picker = document.querySelector('#picker-template').content.firstElementChild.cloneNode(true);
    picker.querySelector('[data-close-picker]').addEventListener('click', () => { openPicker = null; renderBlocks(); });
    const grid = picker.querySelector('.block-choice-grid');
    for (const [type,label,description] of blockChoices) {
      const button = document.createElement('button'); button.type = 'button'; button.innerHTML = `<span>${label}</span><small>${description}</small>`;
      button.addEventListener('click', () => { content[active].blocks.splice(index,0,newBlock(type)); openPicker = null; setStatus('Block added. Save the draft or publish when ready.'); renderBlocks(); }); grid.append(button);
    }
    holder.append(picker);
  }
  return holder;
}

function makeButton(label, title, action, disabled = false) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.title = title; button.disabled = disabled; button.addEventListener('click',action); return button;
}

function renderBlock(block, index) {
  const card = document.createElement('article'); card.className = `modular-editor-card tone-${block.tone}`;
  const toolbar = document.createElement('div'); toolbar.className = 'block-editor-toolbar'; toolbar.innerHTML = `<div><span class="block-type-label">${escapeHtml(block.type)}</span><span>Block ${index + 1}</span></div>`;
  const controls = document.createElement('div'); controls.className = 'block-layout-controls';
  const toneLabel = document.createElement('label'); toneLabel.innerHTML = '<span>Color</span>'; const toneSelect = document.createElement('select');
  tones.forEach(tone => toneSelect.add(new Option(tone[0].toUpperCase()+tone.slice(1),tone,false,block.tone === tone))); toneSelect.addEventListener('change',() => { block.tone = toneSelect.value; renderBlocks(); }); toneLabel.append(toneSelect);
  const sizeLabel = document.createElement('label'); sizeLabel.innerHTML = '<span>Width</span>'; const sizeSelect = document.createElement('select');
  sizes.forEach(size => sizeSelect.add(new Option(size[0].toUpperCase()+size.slice(1),size,false,block.size === size))); sizeSelect.addEventListener('change',() => block.size = sizeSelect.value); sizeLabel.append(sizeSelect);
  controls.append(toneLabel,sizeLabel,
    makeButton('↑','Move up',() => move(index,-1),index === 0), makeButton('↓','Move down',() => move(index,1),index === content[active].blocks.length-1),
    makeButton('Duplicate','Duplicate block',() => { content[active].blocks.splice(index+1,0,{...block,id:crypto.randomUUID(),items:[...block.items]}); renderBlocks(); }),
  );
  const remove = makeButton('Delete','Delete block',() => { if (confirm('Delete this block?')) { content[active].blocks.splice(index,1); renderBlocks(); } }); remove.className = 'remove-block'; controls.append(remove); toolbar.append(controls); card.append(toolbar);
  const fields = document.createElement('div'); fields.className = 'block-fields';
  fields.append(
    field('Eyebrow',block.eyebrow,{onInput:value => block.eyebrow = value}),
    field(block.type === 'quote' ? 'Statement' : 'Title',block.title,{onInput:value => block.title = value}),
    field('Body',block.body,{wide:true,multiline:true,rows:4,onInput:value => block.body = value}),
  );
  if (['hero','feature'].includes(block.type)) fields.append(field('Small label / metadata',block.meta,{wide:true,onInput:value => block.meta = value}));
  if (block.type === 'list') fields.append(field('Items — one per line; use Date|||Title|||Detail for timeline rows',block.items.join('\n'),{wide:true,multiline:true,rows:6,onInput:value => block.items = value.split('\n').filter(Boolean)}));
  if (block.type === 'image') {
    fields.append(field('Image description (alt text)',block.imageAlt,{wide:true,onInput:value => block.imageAlt = value}));
    const upload = document.createElement('label'); upload.className = 'upload-zone wide'; upload.innerHTML = `<strong>Choose an image</strong><span class="upload-result">${escapeHtml(block.imageSrc || 'JPG, PNG, WebP, GIF, or AVIF · maximum 15 MB')}</span>`;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif'; input.addEventListener('change',() => input.files[0] && uploadImage(block,input.files[0])); upload.append(input); fields.append(upload);
  }
  card.append(fields); return card;
}

function move(index, delta) { const blocks = content[active].blocks, target = index + delta; if (target < 0 || target >= blocks.length) return; [blocks[index],blocks[target]] = [blocks[target],blocks[index]]; renderBlocks(); }
function renderBlocks() { const nodes = []; content[active].blocks.forEach((block,index) => nodes.push(renderPicker(index),renderBlock(block,index))); nodes.push(renderPicker(content[active].blocks.length)); blockList.replaceChildren(...nodes); }
function render() { renderTabs(); document.querySelector('#active-page-name').textContent = content[active].title || tabs.find(tab => tab[0] === active)[1]; renderSettings(); renderBlocks(); }

async function save(publish) {
  if (busy) return; setBusy(true); setStatus(publish ? 'Building, committing, and publishing…' : 'Saving draft…');
  try {
    const response = await fetch(publish ? '/api/publish' : '/api/draft',{method:'POST',headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify(content)});
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    setStatus(result.message || (publish ? 'Published.' : 'Draft saved.'),'success');
  } catch (error) { setStatus(error.message || 'Could not save.','error'); } finally { setBusy(false); }
}

async function uploadImage(block,file) {
  if (busy) return; setBusy(true); setStatus('Copying image into the project…');
  try {
    const response = await fetch('/api/upload',{method:'POST',headers:authHeaders({'content-type':file.type,'x-file-name':encodeURIComponent(file.name)}),body:file});
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'Upload failed.');
    block.imageSrc = result.path; if (!block.imageAlt) block.imageAlt = file.name.replace(/\.[^.]+$/,''); setStatus('Image added locally. Save the draft or publish when ready.'); renderBlocks();
  } catch (error) { setStatus(error.message || 'Upload failed.','error'); } finally { setBusy(false); }
}

document.querySelector('#save-draft').addEventListener('click',() => save(false)); document.querySelector('#publish').addEventListener('click',() => save(true));
try {
  if (!token) throw new Error('The private session token is missing. Restart npm run dev and use the URL printed in the terminal.');
  const response = await fetch('/api/content',{headers:authHeaders()}); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'Could not load content.');
  content = result.content; render(); setStatus(result.draft ? 'Local draft loaded.' : 'Published content loaded.');
} catch (error) { setStatus(error.message,'error'); document.querySelector('.editor-panel').innerHTML = `<div class="page-settings-card"><h1>Editor unavailable</h1><p>${escapeHtml(error.message)}</p></div>`; }

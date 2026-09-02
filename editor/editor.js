const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('peter-editor-token') || '';
if (token) sessionStorage.setItem('peter-editor-token', token);

const defaultTabs = [['intro','Introduction',''],['notes','Notes','notes'],['cv','CV','cv'],['projects','Projects','projects'],['photos','Photos','photos']];
let tabs = defaultTabs.map(item => [...item]);
const blockChoices = [
  ['hero','Title'],['text','Text'],['image','Photo'],
  ['quote','Quote'],['list','List'],
];
const blockLabels = {...Object.fromEntries(blockChoices),feature:'Highlight',list:'List'};
const tones = ['white','sky','mint','lilac','peach'];
const sizes = ['full','half','third'];
const fonts = [['clean','Clean'],['bold','Bold'],['rounded','Rounded'],['serif','Serif']];
const textColors = [['default','Default'],['black','Black'],['white','White'],['gray','Gray'],['blue','Blue'],['red','Red']];
let content, active = 'intro', openPicker = null, busy = false;
const statusElement = document.querySelector('#status');
const feedbackElement = document.querySelector('#save-feedback');
const previewFrame = document.querySelector('#live-preview');
const previewChannel = 'BroadcastChannel' in window ? new BroadcastChannel('peter-editor-preview') : null;
const pageTabs = document.querySelector('#page-tabs');
const backgroundSettings = document.querySelector('#background-settings');
const blockList = document.querySelector('#block-list');
const editorStage = document.querySelector('.editor-stage');
const previewResizer = document.querySelector('#preview-resizer');

function setEditorSplit(percent, remember = true) {
  const bounded = Math.min(68,Math.max(32,Number(percent) || 42));
  editorStage.style.setProperty('--editor-pane',`${bounded}%`);
  previewResizer.setAttribute('aria-valuenow',String(Math.round(bounded)));
  if (remember) localStorage.setItem('peter-editor-split',String(bounded));
}
setEditorSplit(localStorage.getItem('peter-editor-split') || 42,false);
previewResizer.addEventListener('pointerdown',event => {
  previewResizer.setPointerCapture(event.pointerId); document.body.classList.add('is-resizing');
});
previewResizer.addEventListener('pointermove',event => {
  if (!previewResizer.hasPointerCapture(event.pointerId)) return;
  const bounds = editorStage.getBoundingClientRect(); setEditorSplit(((event.clientX - bounds.left) / bounds.width) * 100);
});
previewResizer.addEventListener('pointerup',event => { previewResizer.releasePointerCapture(event.pointerId); document.body.classList.remove('is-resizing'); });
previewResizer.addEventListener('pointercancel',() => document.body.classList.remove('is-resizing'));
previewResizer.addEventListener('keydown',event => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault(); const current = Number(previewResizer.getAttribute('aria-valuenow')) || 42;
  setEditorSplit(event.key === 'Home' ? 32 : event.key === 'End' ? 68 : current + (event.key === 'ArrowRight' ? 2 : -2));
});

function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]); }
function setStatus(message, kind = 'idle') {
  statusElement.textContent = message; statusElement.dataset.kind = kind;
  feedbackElement.dataset.kind = kind;
  feedbackElement.querySelector('strong').textContent = kind === 'success' ? 'Saved successfully' : kind === 'error' ? 'Action needed' : kind === 'dirty' ? 'Unsaved changes' : busy ? 'Working…' : 'Editor ready';
  feedbackElement.querySelector('small').textContent = message;
}
function setBusy(next) { busy = next; document.querySelectorAll('#save-draft,#publish').forEach(button => button.disabled = next); }
function authHeaders(extra = {}) { return {'x-editor-token':token, ...extra}; }
function newBlock(type) { return { id:crypto.randomUUID(), type, tone:type === 'image' ? 'white' : 'sky', size:['hero','quote'].includes(type) ? 'full' : 'half', fontStyle:'clean', textColor:'default', eyebrow:'', title:type === 'hero' ? 'A clear new beginning' : '', body:'', meta:'', imageSrc:'', imageAlt:'', imageHeight:400, links:[], pdfs:[], items:type === 'list' ? ['First item'] : [] }; }

function normalizeAttachments(siteContent) {
  const storedNavigation = Array.isArray(siteContent.navigation) ? siteContent.navigation : defaultTabs.map(([id,label,slug]) => ({id,label,slug}));
  tabs = storedNavigation.filter(item => item && siteContent[item.id]?.blocks).map(item => [item.id,item.label || 'Untitled',item.slug || '']);
  if (!tabs.length) tabs = defaultTabs.filter(([id]) => siteContent[id]?.blocks).map(item => [...item]);
  siteContent.navigation = tabs.map(([id,label,slug]) => ({id,label,slug}));
  for (const [key] of tabs) {
    const page = siteContent[key];
    for (const block of page.blocks) {
      block.links = Array.isArray(block.links) ? block.links.map(link => ({id:link.id || crypto.randomUUID(),label:link.label || '',url:link.url || ''})) : [];
      block.pdfs = Array.isArray(block.pdfs) ? block.pdfs.map(pdf => ({id:pdf.id || crypto.randomUUID(),label:pdf.label || '',src:pdf.src || ''})) : [];
      block.imageHeight = Math.min(900,Math.max(220,Number(block.imageHeight) || 400));
      if (!block.links.length && (block.linkLabel || block.linkUrl)) block.links.push({id:crypto.randomUUID(),label:block.linkLabel || '',url:block.linkUrl || ''});
      if (!block.pdfs.length && (block.pdfLabel || block.pdfSrc)) block.pdfs.push({id:crypto.randomUUID(),label:block.pdfLabel || '',src:block.pdfSrc || ''});
      if (block.type === 'list' && Array.isArray(block.items)) block.items = block.items.map(item => { const parts = String(item).split('|||'); return parts.length > 2 ? `${parts[1]}|||${parts[0]} · ${parts.slice(2).join(' · ')}` : item; });
      block.linkLabel = ''; block.linkUrl = ''; block.pdfLabel = ''; block.pdfSrc = '';
    }
  }
  return siteContent;
}

function previewState() { return {content,active,theme:document.documentElement.dataset.theme || 'light'}; }
function syncPreview() {
  if (!content) return;
  const state = previewState();
  localStorage.setItem('peter-live-preview',JSON.stringify(state));
  previewFrame.contentWindow?.postMessage({type:'peter-preview-state',state},location.origin);
  previewChannel?.postMessage({type:'state',state});
}
function markDirty() { setStatus('Your changes are visible in the draft preview but are not saved yet.','dirty'); syncPreview(); }

function field(label, value, options = {}) {
  const wrapper = document.createElement('label'); wrapper.className = `editor-field${options.wide ? ' wide' : ''}`;
  const title = document.createElement('span'); title.textContent = label;
  const control = options.multiline ? document.createElement('textarea') : document.createElement('input');
  if (options.multiline) control.rows = options.rows || 3;
  control.value = value || ''; control.addEventListener('input', () => { options.onInput(control.value); markDirty(); });
  wrapper.append(title, control); return wrapper;
}

function renderTabs() {
  const buttons = tabs.map(([key,label]) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = active === key ? 'selected' : '';
    button.innerHTML = `<span>${label[0]}</span>${label}`;
    button.addEventListener('click', () => { active = key; openPicker = null; render(); }); return button;
  });
  const addPage = makeButton('+','Add a new page',createPage); addPage.className = 'page-add-button'; addPage.setAttribute('aria-label','Add a new page');
  const renamePage = makeButton('Rename','Rename this page',renameActivePage); renamePage.className = 'page-rename-button';
  pageTabs.replaceChildren(...buttons,addPage,renamePage);
}

function pageSlug(label) {
  const base = String(label).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50) || 'page';
  const used = new Set(tabs.map(tab => tab[2])); let candidate = base, number = 2;
  while (used.has(candidate)) candidate = `${base}-${number++}`; return candidate;
}
function createPage() {
  const label = prompt('Name this page:','New page')?.trim(); if (!label) return;
  const id = `page-${crypto.randomUUID().slice(0,8)}`, slug = pageSlug(label), titleBlock = newBlock('hero'); titleBlock.title = label;
  content[id] = {title:label,intro:'',backgroundImage:'',blocks:[titleBlock]}; tabs.push([id,label,slug]); content.navigation = tabs.map(([pageId,pageLabel,pagePath]) => ({id:pageId,label:pageLabel,slug:pagePath}));
  active = id; openPicker = null; render(); markDirty();
}
function renameActivePage() {
  const tab = tabs.find(item => item[0] === active); if (!tab) return;
  const oldLabel = tab[1], label = prompt('Rename this page:',oldLabel)?.trim(); if (!label || label === oldLabel) return;
  tab[1] = label; if (!content[active].title || content[active].title === oldLabel) content[active].title = label;
  content.navigation = tabs.map(([id,pageLabel,slug]) => ({id,label:pageLabel,slug})); render(); markDirty();
}

function renderBackgroundSettings() {
  const page = content[active];
  const heading = document.createElement('div'); heading.className = 'background-settings-heading';
  heading.innerHTML = '<div><strong>Background photo</strong><span>Behind the boxes on this page</span></div>';
  const actions = document.createElement('div'); actions.className = 'background-settings-actions';
  const upload = document.createElement('label'); upload.className = 'background-upload'; upload.textContent = page.backgroundImage ? 'Replace photo' : 'Choose photo';
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif'; input.addEventListener('change',() => input.files[0] && uploadBackground(input.files[0])); upload.append(input); actions.append(upload);
  if (page.backgroundImage) {
    const remove = makeButton('Remove','Remove page background',() => { page.backgroundImage = ''; renderBackgroundSettings(); markDirty(); }); remove.className = 'background-remove'; actions.append(remove);
  }
  heading.append(actions); backgroundSettings.replaceChildren(heading);
  if (page.backgroundImage) {
    const preview = document.createElement('div'); preview.className = 'background-photo-preview';
    const image = document.createElement('img'); image.src = page.backgroundImage; image.alt = 'Current page background'; preview.append(image); backgroundSettings.append(preview);
  }
}

function renderPicker(index) {
  const holder = document.createElement('div'); holder.className = 'block-inserter';
  const add = document.createElement('button'); add.className = 'add-block-square'; add.type = 'button'; add.textContent = '+'; add.setAttribute('aria-label',`Add block at position ${index + 1}`);
  add.addEventListener('click', () => { openPicker = openPicker === index ? null : index; renderBlocks(); }); holder.append(add);
  if (openPicker === index) {
    const picker = document.querySelector('#picker-template').content.firstElementChild.cloneNode(true);
    picker.querySelector('[data-close-picker]').addEventListener('click', () => { openPicker = null; renderBlocks(); });
    const grid = picker.querySelector('.block-choice-grid');
    for (const [type,label] of blockChoices) {
      const button = document.createElement('button'); button.type = 'button'; button.innerHTML = `<span>${label}</span>`;
      button.addEventListener('click', () => { content[active].blocks.splice(index,0,newBlock(type)); openPicker = null; renderBlocks(); markDirty(); }); grid.append(button);
    }
    holder.append(picker);
  }
  return holder;
}

function makeButton(label, title, action, disabled = false) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.title = title; button.disabled = disabled; button.addEventListener('click',action); return button;
}

function renderImageResizer(block) {
  const wrapper = document.createElement('div'); wrapper.className = 'image-resize-editor wide';
  const preview = document.createElement('div'); preview.className = 'image-resize-preview'; preview.style.height = `${block.imageHeight}px`;
  const image = document.createElement('img'); image.src = block.imageSrc; image.alt = '';
  const handle = document.createElement('div'); handle.className = 'image-resize-handle'; handle.tabIndex = 0; handle.setAttribute('role','slider'); handle.setAttribute('aria-label','Image height'); handle.setAttribute('aria-valuemin','220'); handle.setAttribute('aria-valuemax','900');
  const label = document.createElement('span');
  const update = value => { block.imageHeight = Math.min(900,Math.max(220,Math.round(value))); preview.style.height = `${block.imageHeight}px`; label.textContent = `Drag to resize · ${block.imageHeight} px`; handle.setAttribute('aria-valuenow',String(block.imageHeight)); syncPreview(); };
  update(block.imageHeight);
  let startY = 0, startHeight = block.imageHeight;
  handle.addEventListener('pointerdown',event => { startY = event.clientY; startHeight = block.imageHeight; handle.setPointerCapture(event.pointerId); wrapper.classList.add('resizing'); });
  handle.addEventListener('pointermove',event => { if (handle.hasPointerCapture(event.pointerId)) update(startHeight + event.clientY - startY); });
  const finish = event => { if (event.pointerId !== undefined && handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); wrapper.classList.remove('resizing'); markDirty(); };
  handle.addEventListener('pointerup',finish); handle.addEventListener('pointercancel',finish);
  handle.addEventListener('keydown',event => { if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return; event.preventDefault(); update(event.key === 'Home' ? 220 : event.key === 'End' ? 900 : block.imageHeight + (event.key === 'ArrowDown' ? 10 : -10)); markDirty(); });
  preview.append(image,handle,label); wrapper.append(preview); return wrapper;
}

function renderTextOptions(block) {
  const options = document.createElement('div'); options.className = 'text-options wide';
  const link = document.createElement('section'); link.className = 'text-option-card';
  link.innerHTML = '<div class="text-option-heading"><strong>Links</strong><span>Web pages</span></div>';
  const linkList = document.createElement('div'); linkList.className = 'attachment-list';
  for (const [index,item] of block.links.entries()) {
    const row = document.createElement('div'); row.className = 'attachment-row link-row';
    const remove = makeButton('Remove','Remove link',() => { block.links.splice(index,1); renderBlocks(); markDirty(); }); remove.className = 'clear-attachment';
    row.append(field('Button text',item.label,{onInput:value => item.label = value}),field('Address',item.url,{onInput:value => item.url = value}),remove); linkList.append(row);
  }
  const addLink = makeButton('+ Add link','Add another link',() => { block.links.push({id:crypto.randomUUID(),label:'',url:''}); renderBlocks(); markDirty(); }); addLink.className = 'add-attachment';
  link.append(linkList,addLink);

  const pdf = document.createElement('section'); pdf.className = 'text-option-card';
  pdf.innerHTML = '<div class="text-option-heading"><strong>PDFs</strong><span>Documents</span></div>';
  const pdfList = document.createElement('div'); pdfList.className = 'attachment-list';
  for (const [index,item] of block.pdfs.entries()) {
    const row = document.createElement('div'); row.className = 'attachment-row pdf-row';
    const attached = document.createElement('small'); attached.className = 'attached-file'; attached.textContent = item.src.split('/').pop();
    const remove = makeButton('Remove','Remove PDF',() => { block.pdfs.splice(index,1); renderBlocks(); markDirty(); }); remove.className = 'clear-attachment';
    row.append(field('Button text',item.label,{onInput:value => item.label = value}),attached,remove); pdfList.append(row);
  }
  const upload = document.createElement('label'); upload.className = 'compact-upload';
  const uploadText = document.createElement('span'); uploadText.textContent = '+ Attach PDF';
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'application/pdf,.pdf'; file.addEventListener('change',() => file.files[0] && uploadPdf(block,file.files[0]));
  upload.append(uploadText,file); pdf.append(pdfList,upload);
  options.append(link,pdf); return options;
}

function renderBlock(block, index) {
  const card = document.createElement('article'); card.className = `modular-editor-card tone-${block.tone}`;
  const toolbar = document.createElement('div'); toolbar.className = 'block-editor-toolbar'; toolbar.innerHTML = `<div><span class="block-type-label">${escapeHtml(blockLabels[block.type] || block.type)}</span><span>Box ${index + 1}</span></div>`;
  const controls = document.createElement('div'); controls.className = 'block-layout-controls';
  const toneLabel = document.createElement('label'); toneLabel.innerHTML = '<span>Color</span>'; const toneSelect = document.createElement('select');
  tones.forEach(tone => toneSelect.add(new Option(tone[0].toUpperCase()+tone.slice(1),tone,false,block.tone === tone))); toneSelect.addEventListener('change',() => { block.tone = toneSelect.value; renderBlocks(); markDirty(); }); toneLabel.append(toneSelect);
  const sizeLabel = document.createElement('label'); sizeLabel.innerHTML = '<span>Width</span>'; const sizeSelect = document.createElement('select');
  sizes.forEach(size => sizeSelect.add(new Option(size[0].toUpperCase()+size.slice(1),size,false,block.size === size))); sizeSelect.addEventListener('change',() => { block.size = sizeSelect.value; markDirty(); }); sizeLabel.append(sizeSelect);
  const fontLabel = document.createElement('label'); fontLabel.innerHTML = '<span>Font</span>'; const fontSelect = document.createElement('select');
  fonts.forEach(([value,label]) => fontSelect.add(new Option(label,value,false,(block.fontStyle || 'clean') === value))); fontSelect.addEventListener('change',() => { block.fontStyle = fontSelect.value; markDirty(); }); fontLabel.append(fontSelect);
  const colorLabel = document.createElement('label'); colorLabel.innerHTML = '<span>Text</span>'; const colorSelect = document.createElement('select');
  textColors.forEach(([value,label]) => colorSelect.add(new Option(label,value,false,(block.textColor || 'default') === value))); colorSelect.addEventListener('change',() => { block.textColor = colorSelect.value; markDirty(); }); colorLabel.append(colorSelect);
  controls.append(toneLabel,sizeLabel,fontLabel,colorLabel,
    makeButton('↑','Move up',() => move(index,-1),index === 0), makeButton('↓','Move down',() => move(index,1),index === content[active].blocks.length-1),
    makeButton('Duplicate','Duplicate block',() => { content[active].blocks.splice(index+1,0,{...block,id:crypto.randomUUID(),items:[...block.items],links:block.links.map(item => ({...item,id:crypto.randomUUID()})),pdfs:block.pdfs.map(item => ({...item,id:crypto.randomUUID()}))}); renderBlocks(); markDirty(); }),
  );
  const remove = makeButton('Delete','Delete block',() => { if (confirm('Delete this block?')) { content[active].blocks.splice(index,1); renderBlocks(); markDirty(); } }); remove.className = 'remove-block'; controls.append(remove); toolbar.append(controls); card.append(toolbar);
  const fields = document.createElement('div'); fields.className = 'block-fields';
  fields.append(
    field('Eyebrow',block.eyebrow,{onInput:value => block.eyebrow = value}),
    field(block.type === 'quote' ? 'Statement' : 'Title',block.title,{onInput:value => block.title = value}),
    field('Body — three backslashes make a line break',block.body,{wide:true,multiline:true,rows:4,onInput:value => block.body = value}),
  );
  if (['hero','feature'].includes(block.type)) fields.append(field('Small label / metadata',block.meta,{wide:true,onInput:value => block.meta = value}));
  if (block.type === 'text') fields.append(renderTextOptions(block));
  if (block.type === 'list') fields.append(field('Items — one per line; use Title|||Description; three backslashes break a line inside an item',block.items.join('\n'),{wide:true,multiline:true,rows:6,onInput:value => block.items = value.split('\n').filter(Boolean)}));
  if (['image','hero'].includes(block.type)) {
    fields.append(field(block.type === 'hero' ? 'Title photo description (alt text)' : 'Image description (alt text)',block.imageAlt,{wide:true,onInput:value => block.imageAlt = value}));
    const upload = document.createElement('label'); upload.className = 'upload-zone wide'; upload.innerHTML = `<strong>${block.type === 'hero' ? 'Choose title photo' : 'Choose an image'}</strong><span class="upload-result">${escapeHtml(block.imageSrc || 'JPG, PNG, WebP, GIF, or AVIF · maximum 15 MB')}</span>`;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif'; input.addEventListener('change',() => input.files[0] && uploadImage(block,input.files[0])); upload.append(input); fields.append(upload);
    if (block.type === 'image' && block.imageSrc) fields.append(renderImageResizer(block));
    if (block.imageSrc) { const removePhoto = makeButton(block.type === 'hero' ? 'Remove title photo' : 'Remove image','Remove uploaded image',() => { block.imageSrc = ''; renderBlocks(); markDirty(); }); removePhoto.className = 'clear-attachment wide'; fields.append(removePhoto); }
  }
  card.append(fields); return card;
}

function move(index, delta) { const blocks = content[active].blocks, target = index + delta; if (target < 0 || target >= blocks.length) return; [blocks[index],blocks[target]] = [blocks[target],blocks[index]]; renderBlocks(); markDirty(); }
function renderBlocks() { const nodes = []; content[active].blocks.forEach((block,index) => nodes.push(renderPicker(index),renderBlock(block,index))); nodes.push(renderPicker(content[active].blocks.length)); blockList.replaceChildren(...nodes); }
function render() { renderTabs(); document.querySelector('#active-page-name').textContent = tabs.find(tab => tab[0] === active)?.[1] || 'Page'; renderBackgroundSettings(); renderBlocks(); syncPreview(); }

async function save(publish) {
  if (busy) return; setBusy(true); setStatus(publish ? 'Building the site and synchronizing it with GitHub…' : 'Saving the draft on this computer…');
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
    block.imageSrc = result.path; if (!block.imageAlt) block.imageAlt = file.name.replace(/\.[^.]+$/,''); renderBlocks(); markDirty();
  } catch (error) { setStatus(error.message || 'Upload failed.','error'); } finally { setBusy(false); }
}

async function uploadBackground(file) {
  if (busy) return; const pageKey = active; setBusy(true); setStatus('Copying background photo into the project…');
  try {
    const response = await fetch('/api/upload',{method:'POST',headers:authHeaders({'content-type':file.type,'x-file-name':encodeURIComponent(file.name)}),body:file});
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'Upload failed.');
    content[pageKey].backgroundImage = result.path; if (active === pageKey) renderBackgroundSettings(); markDirty();
  } catch (error) { setStatus(error.message || 'Upload failed.','error'); } finally { setBusy(false); }
}

async function uploadPdf(block,file) {
  if (busy) return; setBusy(true); setStatus('Copying PDF into the project…');
  try {
    const response = await fetch('/api/upload-pdf',{method:'POST',headers:authHeaders({'content-type':'application/pdf','x-file-name':encodeURIComponent(file.name)}),body:file});
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'PDF upload failed.');
    block.pdfs.push({id:crypto.randomUUID(),label:file.name.replace(/\.pdf$/i,''),src:result.path}); renderBlocks(); markDirty();
  } catch (error) { setStatus(error.message || 'PDF upload failed.','error'); } finally { setBusy(false); }
}

document.querySelector('#save-draft').addEventListener('click',() => save(false)); document.querySelector('#publish').addEventListener('click',() => save(true));
previewFrame.addEventListener('load',syncPreview);
window.addEventListener('message',event => { if (event.origin === location.origin && event.data?.type === 'peter-preview-navigate' && content?.[event.data.active]) { active = event.data.active; openPicker = null; render(); } });
previewChannel?.addEventListener('message',event => { if (event.data?.type === 'navigate' && content?.[event.data.active]) { active = event.data.active; openPicker = null; render(); } });
new MutationObserver(syncPreview).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
try {
  if (!token) throw new Error('The private session token is missing. Restart npm run dev and use the URL printed in the terminal.');
  const response = await fetch('/api/content',{headers:authHeaders()}); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'Could not load content.');
  let browserDraft = null; try { browserDraft = JSON.parse(localStorage.getItem('peter-live-preview') || 'null')?.content; } catch {}
  const hasBrowserDraft = browserDraft && tabs.every(([key]) => Array.isArray(browserDraft[key]?.blocks));
  content = normalizeAttachments(hasBrowserDraft ? browserDraft : result.content); render(); setStatus(hasBrowserDraft ? 'Your current local draft was recovered.' : result.draft ? 'Local draft loaded.' : 'Published content loaded.');
} catch (error) { setStatus(error.message,'error'); document.querySelector('.editor-panel').innerHTML = `<div class="page-settings-card"><h1>Editor unavailable</h1><p>${escapeHtml(error.message)}</p></div>`; }

const root = document.querySelector('#preview-root');
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('peter-editor-preview') : null;
const defaultPages = [['intro','Introduction'],['notes','Notes'],['cv','CV'],['projects','Projects'],['photos','Photos']];
const allowedTypes = new Set(['hero','text','image','feature','list','quote']);
const allowedTones = new Set(['white','sky','mint','lilac','peach']);
const allowedSizes = new Set(['full','half','third']);
const allowedFonts = new Set(['clean','bold','rounded','serif']);
const allowedTextColors = new Set(['default','black','white','gray','blue','red']);
let state = null;

function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[character]); }
function formatText(value = '') { return escapeHtml(value).replace(/\\{3}/g,'<br>'); }
function safeImageSource(value = '') { const source = String(value).trim(); return /^\/uploads\/[a-zA-Z0-9._-]+$/.test(source) || /^https:\/\//i.test(source) ? escapeHtml(source) : ''; }
function safeBackgroundSource(value = '') { const source = String(value).trim(); return /^\/uploads\/[a-zA-Z0-9._-]+$/.test(source) ? source : ''; }
function safeLinkSource(value = '') { const source = String(value).trim(); return /^https?:\/\//i.test(source) || /^mailto:/i.test(source) || /^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(source) ? escapeHtml(source) : ''; }
function safePdfSource(value = '') { const source = String(value).trim(); return /^\/uploads\/[a-zA-Z0-9._-]+\.pdf$/i.test(source) ? source : ''; }
function renderList(items = []) {
  return items.map(item => {
    const parts = String(item).split('|||');
    const [title,...descriptionParts] = parts.length > 2 ? [parts[1],parts[0],...parts.slice(2)] : parts;
    const description = descriptionParts.join(' · ');
    return description ? `<div class="structured-list-item"><strong>${formatText(title)}</strong><p>${formatText(description)}</p></div>` : `<span class="list-pill">${formatText(title)}</span>`;
  }).join('');
}
function renderBlock(raw) {
  const type = allowedTypes.has(raw.type) ? raw.type : 'text';
  const tone = allowedTones.has(raw.tone) ? raw.tone : 'white';
  const size = allowedSizes.has(raw.size) ? raw.size : 'full';
  const font = allowedFonts.has(raw.fontStyle) ? raw.fontStyle : 'clean';
  const textColor = allowedTextColors.has(raw.textColor) ? raw.textColor : 'default';
  const classes = `content-block block-${type} size-${size} tone-${tone} font-${font} text-${textColor}`;
  const eyebrow = raw.eyebrow ? `<p class="block-kicker">${escapeHtml(raw.eyebrow)}</p>` : '';
  const title = raw.title ? (type === 'quote' ? `<blockquote>${formatText(raw.title)}</blockquote>` : `<h2>${formatText(raw.title)}</h2>`) : '';
  const body = raw.body ? `<p class="block-copy">${formatText(raw.body)}</p>` : '';
  const meta = raw.meta ? `<span class="status-pill">${escapeHtml(raw.meta)}</span>` : '';
  if (type === 'image') {
    const source = safeImageSource(raw.imageSrc);
    const image = source ? `<img src="${source}" alt="${escapeHtml(raw.imageAlt || raw.title || '')}">` : '<div class="image-placeholder"><span>Image</span></div>';
    return `<figure class="${classes}">${image}${eyebrow || title || body ? `<figcaption>${eyebrow}${title}${body}</figcaption>` : ''}</figure>`;
  }
  const list = type === 'list' ? `<div class="block-list">${renderList(raw.items)}</div>` : '';
  const links = Array.isArray(raw.links) && raw.links.length ? raw.links : raw.linkLabel || raw.linkUrl ? [{label:raw.linkLabel,url:raw.linkUrl}] : [];
  const pdfs = Array.isArray(raw.pdfs) && raw.pdfs.length ? raw.pdfs : raw.pdfLabel || raw.pdfSrc ? [{label:raw.pdfLabel,src:raw.pdfSrc}] : [];
  const linkActions = type === 'text' ? links.map(item => { const source = safeLinkSource(item.url); return source ? `<a class="content-link" href="${source}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label || 'Open link')} <span>↗</span></a>` : ''; }).join('') : '';
  const pdfActions = type === 'text' ? pdfs.map(item => { const source = safePdfSource(item.src); return source ? `<a class="content-link document-link" href="${source}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label || 'Open PDF')} <span>PDF</span></a>` : ''; }).join('') : '';
  const actions = linkActions || pdfActions ? `<div class="block-actions">${linkActions}${pdfActions}</div>` : '';
  const heroPhoto = safeImageSource(raw.imageSrc);
  const ornament = type === 'hero' ? heroPhoto ? `<div class="clear-orbit hero-photo"><img src="${heroPhoto}" alt="${escapeHtml(raw.imageAlt || raw.title || 'Title photo')}"></div>` : '<div class="clear-orbit" aria-hidden="true"><span>PJ</span></div>' : type === 'feature' ? '<div class="feature-orbit" aria-hidden="true"></div>' : '';
  return `<article class="${classes}"><div class="block-content">${eyebrow}${title}${body}${list}${meta}${actions}</div>${ornament}</article>`;
}

function render(next) {
  if (!next?.content?.[next.active]) return;
  state = next;
  document.documentElement.dataset.theme = next.theme === 'dark' ? 'dark' : 'light';
  const page = next.content[next.active];
  const pages = Array.isArray(next.content.navigation) ? next.content.navigation.filter(item => next.content[item.id]?.blocks).map(item => [item.id,item.label || 'Untitled']) : defaultPages;
  const links = pages.map(([key,label]) => `<button type="button" data-page="${key}" class="${key === next.active ? 'active' : ''}">${label}</button>`).join('');
  const backgroundImage = safeBackgroundSource(page.backgroundImage);
  root.className = `fresh-site${backgroundImage ? ' has-page-background' : ''}`;
  backgroundImage ? root.style.setProperty('--page-background-image',`url('${backgroundImage}')`) : root.style.removeProperty('--page-background-image');
  root.innerHTML = `<nav class="site-nav"><button type="button" class="wordmark" data-page="intro">PJ<span>.</span></button><div class="nav-links">${links}</div></nav><div class="page-canvas"><section class="public-block-grid">${page.blocks.map(renderBlock).join('')}</section></div>`;
  root.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    const active = button.dataset.page;
    channel?.postMessage({type:'navigate',active});
    window.parent !== window && window.parent.postMessage({type:'peter-preview-navigate',active},location.origin);
    render({...state,active});
  }));
}

function readStoredPreview() {
  try { const stored = localStorage.getItem('peter-live-preview'); if (stored) render(JSON.parse(stored)); } catch {}
}

window.addEventListener('message', event => { if (event.origin === location.origin && event.data?.type === 'peter-preview-state') render(event.data.state); });
window.addEventListener('storage', event => { if (event.key === 'peter-live-preview' && event.newValue) { try { render(JSON.parse(event.newValue)); } catch {} } });
channel?.addEventListener('message', event => { if (event.data?.type === 'state') render(event.data.state); });
readStoredPreview();

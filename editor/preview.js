const root = document.querySelector('#preview-root');
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('peter-editor-preview') : null;
const pages = [['intro','Introduction'],['notes','Notes'],['cv','CV'],['projects','Projects'],['photos','Photos']];
const allowedTypes = new Set(['hero','text','image','feature','list','quote']);
const allowedTones = new Set(['white','sky','mint','lilac','peach']);
const allowedSizes = new Set(['full','half','third']);
let state = null;

function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[character]); }
function safeImageSource(value = '') { const source = String(value).trim(); return /^\/uploads\/[a-zA-Z0-9._-]+$/.test(source) || /^https:\/\//i.test(source) ? escapeHtml(source) : ''; }
function renderList(items = []) {
  return items.map(item => {
    const [leading,title,detail] = String(item).split('|||');
    return title ? `<div class="structured-list-item"><span>${escapeHtml(leading)}</span><div><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ''}</div></div>` : `<span class="list-pill">${escapeHtml(leading)}</span>`;
  }).join('');
}
function renderBlock(raw) {
  const type = allowedTypes.has(raw.type) ? raw.type : 'text';
  const tone = allowedTones.has(raw.tone) ? raw.tone : 'white';
  const size = allowedSizes.has(raw.size) ? raw.size : 'full';
  const classes = `content-block block-${type} size-${size} tone-${tone}`;
  const eyebrow = raw.eyebrow ? `<p class="block-kicker">${escapeHtml(raw.eyebrow)}</p>` : '';
  const title = raw.title ? (type === 'quote' ? `<blockquote>${escapeHtml(raw.title)}</blockquote>` : `<h2>${escapeHtml(raw.title)}</h2>`) : '';
  const body = raw.body ? `<p class="block-copy">${escapeHtml(raw.body)}</p>` : '';
  const meta = raw.meta ? `<span class="status-pill">${escapeHtml(raw.meta)}</span>` : '';
  if (type === 'image') {
    const source = safeImageSource(raw.imageSrc);
    const image = source ? `<img src="${source}" alt="${escapeHtml(raw.imageAlt || raw.title || '')}">` : '<div class="image-placeholder"><span>Image</span></div>';
    return `<figure class="${classes}">${image}${eyebrow || title || body ? `<figcaption>${eyebrow}${title}${body}</figcaption>` : ''}</figure>`;
  }
  const list = type === 'list' ? `<div class="block-list">${renderList(raw.items)}</div>` : '';
  const ornament = type === 'hero' ? '<div class="clear-orbit" aria-hidden="true"><span>PJ</span></div>' : type === 'feature' ? '<div class="feature-orbit" aria-hidden="true"></div>' : '';
  return `<article class="${classes}"><div class="block-content">${eyebrow}${title}${body}${list}${meta}</div>${ornament}</article>`;
}

function render(next) {
  if (!next?.content?.[next.active]) return;
  state = next;
  document.documentElement.dataset.theme = next.theme === 'dark' ? 'dark' : 'light';
  const page = next.content[next.active];
  const links = pages.map(([key,label]) => `<button type="button" data-page="${key}" class="${key === next.active ? 'active' : ''}">${label}</button>`).join('');
  const header = next.active === 'intro' ? '' : `<header class="page-title-block tone-white"><p class="block-kicker">${next.active === 'cv' ? 'Academic profile' : next.active === 'photos' ? 'Visual notebook' : 'Peter Jiang'}</p><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.intro)}</p></header>`;
  root.className = 'fresh-site';
  root.innerHTML = `<nav class="site-nav"><button type="button" class="wordmark" data-page="intro">PJ<span>.</span></button><div class="nav-links">${links}</div></nav><div class="page-canvas">${header}<section class="public-block-grid">${page.blocks.map(renderBlock).join('')}</section></div><footer class="site-footer"><span>Draft preview</span><span>Not public until published</span></footer>`;
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

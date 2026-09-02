import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const content = JSON.parse(await readFile(path.join(root, 'content', 'published.json'), 'utf8'));
const pages = [
  ['intro', '', 'Introduction'],
  ['notes', 'notes', 'Notes'],
  ['cv', 'cv', 'CV'],
  ['projects', 'projects', 'Projects'],
  ['photos', 'photos', 'Photos'],
];
const allowedTypes = new Set(['hero', 'text', 'image', 'feature', 'list', 'quote']);
const allowedTones = new Set(['white', 'sky', 'mint', 'lilac', 'peach']);
const allowedSizes = new Set(['full', 'half', 'third']);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}

function safeImageSource(value = '') {
  const source = String(value).trim();
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(source)) return source;
  if (/^https:\/\//i.test(source)) return escapeHtml(source);
  return '';
}

function safeLinkSource(value = '') {
  const source = String(value).trim();
  if (/^https?:\/\//i.test(source) || /^mailto:/i.test(source) || /^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(source)) return escapeHtml(source);
  return '';
}

function safePdfSource(value = '') {
  const source = String(value).trim();
  return /^\/uploads\/[a-zA-Z0-9._-]+\.pdf$/i.test(source) ? source : '';
}

function renderList(items = []) {
  return items.map((item, index) => {
    const [leading, title, detail] = String(item).split('|||');
    if (!title) return `<span class="list-pill">${escapeHtml(leading)}</span>`;
    return `<div class="structured-list-item"><span>${escapeHtml(leading)}</span><div><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ''}</div></div>`;
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
    const src = safeImageSource(raw.imageSrc);
    const image = src
      ? `<img src="${src}" alt="${escapeHtml(raw.imageAlt || raw.title || '')}" loading="lazy">`
      : '<div class="image-placeholder" aria-hidden="true"><span>Image</span></div>';
    const caption = eyebrow || title || body ? `<figcaption>${eyebrow}${title}${body}</figcaption>` : '';
    return `<figure class="${classes}">${image}${caption}</figure>`;
  }

  const list = type === 'list' ? `<div class="block-list">${renderList(raw.items)}</div>` : '';
  const linkSource = type === 'text' ? safeLinkSource(raw.linkUrl) : '';
  const pdfSource = type === 'text' ? safePdfSource(raw.pdfSrc) : '';
  const actions = linkSource || pdfSource ? `<div class="block-actions">${linkSource ? `<a class="content-link" href="${linkSource}" target="_blank" rel="noopener noreferrer">${escapeHtml(raw.linkLabel || 'Open link')} <span>↗</span></a>` : ''}${pdfSource ? `<a class="content-link document-link" href="${pdfSource}" target="_blank" rel="noopener noreferrer">${escapeHtml(raw.pdfLabel || 'Open PDF')} <span>PDF</span></a>` : ''}</div>` : '';
  const ornament = type === 'hero' ? '<div class="clear-orbit" aria-hidden="true"><span>PJ</span></div>' : type === 'feature' ? '<div class="feature-orbit" aria-hidden="true"></div>' : '';
  return `<article class="${classes}"><div class="block-content">${eyebrow}${title}${body}${list}${meta}${actions}</div>${ornament}</article>`;
}

function renderNav(active) {
  const links = pages.map(([key, slug, label]) => {
    const href = slug ? `/${slug}/` : '/';
    return `<a${key === active ? ' class="active" aria-current="page"' : ''} href="${href}">${label}</a>`;
  }).join('');
  return `<nav class="site-nav" aria-label="Primary navigation"><a class="wordmark" href="/" aria-label="Peter Jiang, home">PJ<span>.</span></a><div class="nav-links">${links}<button class="theme-toggle" data-theme-toggle type="button" aria-label="Toggle dark mode"><span class="theme-symbol-moon">◐</span><span class="theme-symbol-sun">☀</span></button></div></nav>`;
}

function renderPage(key, page) {
  const pageHeader = key === 'intro' ? '' : `<header class="page-title-block tone-white"><p class="block-kicker">${key === 'cv' ? 'Academic profile' : key === 'photos' ? 'Visual notebook' : 'Peter Jiang'}</p><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.intro)}</p></header>`;
  const blocks = Array.isArray(page.blocks) ? page.blocks.map(renderBlock).join('') : '';
  const canonical = key === 'intro' ? 'https://sinxequalsx.github.io/' : `https://sinxequalsx.github.io/${key}/`;
  const description = page.intro || 'Peter Jiang — mathematics, geometry, topology, and gravitation.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#f5fafc">
  <meta property="og:title" content="${escapeHtml(page.title)} · Peter Jiang">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="https://sinxequalsx.github.io/og.png">
  <meta property="og:url" content="${canonical}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="/favicon.svg">
  <link rel="stylesheet" href="/site.css">
  <script src="/theme.js"></script>
  <title>${escapeHtml(page.title)} · Peter Jiang</title>
</head>
<body>
  <main class="fresh-site">${renderNav(key)}<div class="page-canvas">${pageHeader}<section class="public-block-grid" aria-label="${escapeHtml(page.title)} content">${blocks}</section></div></main>
</body>
</html>`;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
await writeFile(path.join(dist, '.nojekyll'), '');

for (const [key, slug] of pages) {
  if (!content[key]) throw new Error(`Missing page content: ${key}`);
  const outputDirectory = slug ? path.join(dist, slug) : dist;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, 'index.html'), renderPage(key, content[key]), 'utf8');
}

console.log(`Built ${pages.length} pages in ${dist}`);

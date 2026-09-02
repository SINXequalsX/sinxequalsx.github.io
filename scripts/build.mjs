import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const content = JSON.parse(await readFile(path.join(root, 'content', 'published.json'), 'utf8'));
const siteCssVersion = createHash('sha256')
  .update(await readFile(path.join(root, 'public', 'site.css')))
  .digest('hex')
  .slice(0, 12);
const defaultPages = [
  ['intro', '', 'Introduction'],
  ['notes', 'notes', 'Notes'],
  ['cv', 'cv', 'CV'],
  ['projects', 'projects', 'Projects'],
  ['photos', 'photos', 'Photos'],
];
const pages = Array.isArray(content.navigation) ? content.navigation.filter(item => item && content[item.id]?.blocks).map(item => [item.id,item.slug || '',item.label || 'Untitled']) : defaultPages;
const allowedTypes = new Set(['hero', 'text', 'image', 'feature', 'list', 'quote']);
const allowedTones = new Set(['white', 'sky', 'mint', 'lilac', 'peach']);
const allowedSizes = new Set(['full', 'half', 'third']);
const allowedFonts = new Set(['clean', 'bold', 'rounded', 'serif']);
const allowedTextColors = new Set(['default', 'black', 'white', 'gray', 'blue', 'red']);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}

function formatText(value = '') {
  return escapeHtml(value).replace(/\\{3}/g, '<br>');
}

function safeImageSource(value = '') {
  const source = String(value).trim();
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(source)) return source;
  if (/^https:\/\//i.test(source)) return escapeHtml(source);
  return '';
}

function safeBackgroundSource(value = '') {
  const source = String(value).trim();
  return /^\/uploads\/[a-zA-Z0-9._-]+$/.test(source) ? source : '';
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
  return items.map((item) => {
    const parts = String(item).split('|||');
    const [title, ...descriptionParts] = parts.length > 2 ? [parts[1], parts[0], ...parts.slice(2)] : parts;
    const description = descriptionParts.join(' · ');
    if (!description) return `<span class="list-pill">${escapeHtml(title)}</span>`;
    return `<div class="structured-list-item"><strong>${formatText(title)}</strong><p>${formatText(description)}</p></div>`;
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
    const imageHeight = Math.min(900, Math.max(220, Number(raw.imageHeight) || 400));
    const src = safeImageSource(raw.imageSrc);
    const image = src
      ? `<img src="${src}" alt="${escapeHtml(raw.imageAlt || raw.title || '')}" loading="lazy">`
      : '<div class="image-placeholder" aria-hidden="true"><span>Image</span></div>';
    const caption = eyebrow || title || body ? `<figcaption>${eyebrow}${title}${body}</figcaption>` : '';
    return `<figure class="${classes}" style="--image-height:${imageHeight}px">${image}${caption}</figure>`;
  }

  const list = type === 'list' ? `<div class="block-list">${renderList(raw.items)}</div>` : '';
  const links = Array.isArray(raw.links) && raw.links.length ? raw.links : raw.linkLabel || raw.linkUrl ? [{ label:raw.linkLabel, url:raw.linkUrl }] : [];
  const pdfs = Array.isArray(raw.pdfs) && raw.pdfs.length ? raw.pdfs : raw.pdfLabel || raw.pdfSrc ? [{ label:raw.pdfLabel, src:raw.pdfSrc }] : [];
  const linkActions = type === 'text' ? links.map(item => { const source = safeLinkSource(item.url); return source ? `<a class="content-link" href="${source}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label || 'Open link')} <span>↗</span></a>` : ''; }).join('') : '';
  const pdfActions = type === 'text' ? pdfs.map(item => { const source = safePdfSource(item.src); return source ? `<a class="content-link document-link" href="${source}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label || 'Open PDF')} <span>PDF</span></a>` : ''; }).join('') : '';
  const actions = linkActions || pdfActions ? `<div class="block-actions">${linkActions}${pdfActions}</div>` : '';
  const heroPhoto = safeImageSource(raw.imageSrc);
  const heroImageSize = Math.min(600, Math.max(140, Number(raw.heroImageSize) || 300));
  const ornament = type === 'hero' ? heroPhoto ? `<div class="clear-orbit hero-photo"><img src="${heroPhoto}" alt="${escapeHtml(raw.imageAlt || raw.title || 'Title photo')}"></div>` : '<div class="clear-orbit" aria-hidden="true"><span>PJ</span></div>' : type === 'feature' ? '<div class="feature-orbit" aria-hidden="true"></div>' : '';
  const blockStyle = type === 'hero' ? ` style="--hero-photo-size:${heroImageSize}px"` : '';
  return `<article class="${classes}"${blockStyle}><div class="block-content">${eyebrow}${title}${body}${list}${meta}${actions}</div>${ornament}</article>`;
}

function renderNav(active) {
  const links = pages.map(([key, slug, label]) => {
    const href = slug ? `/${slug}/` : '/';
    return `<a${key === active ? ' class="active" aria-current="page"' : ''} href="${href}">${label}</a>`;
  }).join('');
  return `<nav class="site-nav" aria-label="Primary navigation"><a class="wordmark" href="/" aria-label="Peter Jiang, home"><span class="wordmark-logo"><img src="/uploads/1788353017407-Zheng-401a7a.jpg" alt=""></span></a><div class="nav-links">${links}<button class="theme-toggle" data-theme-toggle type="button" aria-label="Toggle dark mode"><span class="theme-symbol-moon">◐</span><span class="theme-symbol-sun">☀</span></button></div></nav>`;
}

function renderPage(key, page, slug, label) {
  const blocks = Array.isArray(page.blocks) ? page.blocks.map(renderBlock).join('') : '';
  const canonical = slug ? `https://sinxequalsx.github.io/${slug}/` : 'https://sinxequalsx.github.io/';
  const description = page.intro || 'Peter Jiang — mathematics, geometry, topology, and gravitation.';
  const backgroundImage = safeBackgroundSource(page.backgroundImage);
  const backgroundClass = backgroundImage ? ' has-page-background' : '';
  const backgroundStyle = backgroundImage ? ` style="--page-background-image:url('${backgroundImage}')"` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#f5fafc">
  <meta property="og:title" content="${escapeHtml(page.title || label)} · Peter Jiang">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="https://sinxequalsx.github.io/og.png">
  <meta property="og:url" content="${canonical}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="/favicon.svg">
  <link rel="stylesheet" href="/site.css?v=${siteCssVersion}">
  <script src="/theme.js"></script>
  <title>${escapeHtml(page.title || label)} · Peter Jiang</title>
</head>
<body>
  <main class="fresh-site${backgroundClass}"${backgroundStyle}>${renderNav(key)}<div class="page-canvas"><section class="public-block-grid" aria-label="${escapeHtml(page.title)} content">${blocks}</section></div></main>
</body>
</html>`;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
await writeFile(path.join(dist, '.nojekyll'), '');

for (const [key, slug, label] of pages) {
  if (!content[key]) throw new Error(`Missing page content: ${key}`);
  const outputDirectory = slug ? path.join(dist, slug) : dist;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, 'index.html'), renderPage(key, content[key], slug, label), 'utf8');
}

console.log(`Built ${pages.length} pages in ${dist}`);

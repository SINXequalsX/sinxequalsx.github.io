function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);
}

function safeGallerySource(value) {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (/^\/uploads\/[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp|gif|avif)$/i.test(source)) return source;
  if (!/^https:\/\//i.test(source)) return '';
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function renderGallery(raw, {classes, titleStyle, heading, preview = false}) {
  const images = (Array.isArray(raw.galleryImages) ? raw.galleryImages : []).flatMap(item => {
    const src = safeGallerySource(item?.src);
    return src ? [{src, alt:item.alt || '', caption:item.caption || ''}] : [];
  });
  const layout = raw.galleryLayout === 'stack' ? 'stack' : 'grid';
  const figures = images.map(({src,alt,caption}, index) => {
    const label = caption || alt || `Photo ${index + 1}`;
    const source = escapeHtml(src);
    return `<figure class="gallery-image"><a class="gallery-photo" href="${source}" aria-label="${escapeHtml(`View full image: ${label}`)}" target="_blank" rel="noopener noreferrer"><img src="${source}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async"></a>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
  }).join('');
  if (!figures && !heading && !preview) return '';
  const body = figures ? `<div class="gallery-images gallery-images-${layout}">${figures}</div>` : preview ? '<p class="gallery-empty">Add photos or drawings to this gallery.</p>' : '';
  return `<article class="${classes}"${titleStyle ? ` style="${titleStyle}"` : ''}>${heading ? `<div class="block-content">${heading}</div>` : ''}${body}</article>`;
}

export function installGalleryLightbox() {
  const dialog = document.createElement('dialog');
  if (typeof dialog.showModal !== 'function') return;
  dialog.className = 'gallery-lightbox';
  dialog.setAttribute('aria-label','Photo viewer');
  dialog.innerHTML = '<button class="gallery-lightbox-close" type="button" aria-label="Close photo viewer" autofocus>×</button><figure><img alt=""><figcaption hidden></figcaption></figure><div class="gallery-lightbox-controls"><button type="button" data-gallery-step="-1" aria-label="Previous image">←</button><span class="gallery-lightbox-count" aria-live="polite"></span><button type="button" data-gallery-step="1" aria-label="Next image">→</button><a class="gallery-original" target="_blank" rel="noopener noreferrer">Open original ↗</a></div>';
  const viewerImage = dialog.querySelector('img');
  const caption = dialog.querySelector('figcaption');
  const counter = dialog.querySelector('.gallery-lightbox-count');
  const original = dialog.querySelector('.gallery-original');
  const stepButtons = dialog.querySelectorAll('[data-gallery-step]');
  let photos = [], current = 0, opener;

  function show(index) {
    current = (index + photos.length) % photos.length;
    const photo = photos[current];
    viewerImage.alt = photo.alt || photo.caption || `Photo ${current + 1}`;
    viewerImage.src = photo.src;
    original.href = photo.src;
    caption.textContent = photo.caption;
    caption.hidden = !photo.caption;
    counter.textContent = `${current + 1} / ${photos.length}`;
    counter.hidden = photos.length < 2;
    for (const button of stepButtons) button.hidden = photos.length < 2;
  }

  for (const button of stepButtons) button.addEventListener('click', () => show(current + Number(button.dataset.galleryStep)));
  dialog.querySelector('.gallery-lightbox-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', event => {
    if (photos.length < 2 || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    show(current + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  dialog.addEventListener('close', () => {
    viewerImage.removeAttribute('src');
    if (opener?.isConnected) opener.focus();
    opener = undefined;
    photos = [];
  });

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const link = event.target.closest?.('.gallery-images a.gallery-photo');
    if (!link) return;
    const group = link.closest('.gallery-images');
    const items = [...group.querySelectorAll('a.gallery-photo')].flatMap(anchor => {
      const src = safeGallerySource(anchor.getAttribute('href'));
      return src ? [{anchor, src, alt:anchor.querySelector('img')?.alt || '', caption:anchor.parentElement.querySelector('figcaption')?.textContent || ''}] : [];
    });
    const index = items.findIndex(photo => photo.anchor === link);
    if (index < 0) return;
    if (!dialog.isConnected) document.body.append(dialog);
    dialog.showModal();
    event.preventDefault();
    opener = link;
    photos = items;
    show(index);
  });
}

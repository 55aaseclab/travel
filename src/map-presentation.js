/** Provider-neutral map cards and expanded-pane presentation. */
export function createMapPresentation({ t = (english) => english, strip, workspace, details, toggle, getRows, getSelected, getDay, isExpanded, onSelect, onDetails }) {
  const centered = () => matchMedia('(min-width:761px)').matches;
  function select(id, { scroll = true } = {}) {
    for (const card of strip?.children || []) {
      const chosen = card.dataset.mapCard === id;
      card.setAttribute('aria-current', String(chosen));
      card.querySelector('[data-map-card-select]').setAttribute('aria-pressed', String(chosen));
    }
    if (!scroll || !isExpanded() || !strip) return;
    const card = [...strip.children].find(value => value.dataset.mapCard === id);
    if (card) strip.scrollTo({ left: Math.max(0, centered() ? card.offsetLeft + card.offsetWidth / 2 - strip.clientWidth / 2 : card.offsetLeft - parseFloat(getComputedStyle(strip).paddingLeft)), behavior: 'instant' });
  }
  function render() {
    if (!strip) return;
    strip.replaceChildren();
    for (const [index, visit] of getRows().entries()) {
      const card = document.createElement('article'); card.className = 'map-place-card'; card.dataset.mapCard = visit.id;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'map-card-select'; button.dataset.mapCardSelect = visit.id;
      const image = document.createElement(visit.image ? 'img' : 'span');
      if (visit.image) { image.src = visit.image; image.alt = ''; image.loading = 'lazy'; image.draggable = false; }
      else { image.className = 'map-card-placeholder'; image.setAttribute('aria-hidden', 'true'); const icon = document.getElementById(visit.id)?.querySelector('.place-photo-placeholder svg'); if (icon) image.append(icon.cloneNode(true)); }
      const copy = document.createElement('span'); copy.className = 'map-card-copy';
      const title = document.createElement('span'); title.className = 'map-card-title'; title.textContent = `${index + 1}. ${visit.name}`; title.title = visit.name;
      const meta = document.createElement('span'); meta.className = 'map-card-meta'; meta.append(document.createTextNode(visit.metaLabel || ''));
      if (visit.duration !== undefined) { const duration = document.createElement('span'); duration.className = 'map-card-duration'; duration.textContent = visit.duration; meta.append(duration); }
      meta.title = meta.textContent; copy.append(title, meta); button.append(image, copy);
      button.addEventListener('click', () => onSelect(visit.id, { pan: true }));
      const detail = document.createElement('button'); detail.type = 'button'; detail.className = 'map-card-details'; detail.textContent = t('View details','查看详情'); detail.dataset.mapCardDetail = visit.id; detail.addEventListener('click', () => onDetails(visit));
      card.append(button, detail); strip.append(card);
    }
    select(getSelected());
  }
  function label(expanded) { const text = expanded ? t('Collapse map','收起地图') : t('Expand map','展开地图'); toggle.setAttribute('aria-expanded', String(expanded)); toggle.setAttribute('aria-label', text); toggle.title = text; }
  function setExpanded(expanded) {
    if (strip) strip.hidden = !expanded;
    workspace.classList.toggle('map-expanded', expanded); details.hidden = expanded; label(expanded);
    if (!expanded) workspace.style.removeProperty('height');
  }
  function fitHeight() {
    if (!isExpanded()) return false;
    const viewport = window.visualViewport, bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight);
    const height = Math.max(100, Math.floor(bottom - workspace.getBoundingClientRect().top - 12)) + 'px';
    if (workspace.style.height === height) return false;
    workspace.style.height = height; return true;
  }
  function captureReading() {
    const reading = { x: scrollX, y: scrollY, day: getDay() }, top = workspace.getBoundingClientRect().top;
    if (top < 12 || top > innerHeight * .55) window.scrollTo({ top: scrollY + top - 12, behavior: 'instant' });
    return reading;
  }
  function restoreReading(reading) {
    if (!reading) return;
    requestAnimationFrame(() => {
      if (isExpanded()) return;
      if (reading.day === getDay()) window.scrollTo({ left: reading.x, top: reading.y, behavior: 'instant' });
      else document.getElementById(getDay())?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
  let pending = false;
  strip?.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const rows = getRows(), index = rows.findIndex(visit => visit.id === getSelected());
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    if (!rows[next]) return;
    event.preventDefault(); onSelect(rows[next].id, { pan: true });
    [...strip.querySelectorAll('[data-map-card-select]')].find(button => button.dataset.mapCardSelect === rows[next].id)?.focus({ preventScroll: true });
  });
  strip?.addEventListener('scroll', () => {
    if (!isExpanded() || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (!isExpanded() || !strip.children.length) return;
      const anchor = strip.getBoundingClientRect().left + (centered() ? strip.clientWidth / 2 : parseFloat(getComputedStyle(strip).paddingLeft));
      const distance = card => { const rect = card.getBoundingClientRect(); return Math.abs(rect.left + (centered() ? rect.width / 2 : 0) - anchor); };
      const nearest = [...strip.children].reduce((best, card) => distance(card) < distance(best) ? card : best);
      onSelect(nearest.dataset.mapCard, { scroll: false, pan: true });
    });
  }, { passive: true });
  return { render, select, label, setExpanded, fitHeight, captureReading, restoreReading };
}

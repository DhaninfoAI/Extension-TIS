// Who the header shows. Before sign-in (and for organisations without a logo): SmartFill's own mark, the Boost star.
// After sign-in: the customer's logo from their organisation (org.brand, set by us on the SmartFill dashboard).
// Which web tool the customer works in comes from the same sign-in (org.platform).

export const STAR = '../icons/brand/boost-star.png';
/** Platforms this version of the extension has page code for (backend list: backend/lib/platforms.mjs). */
export const SUPPORTED_PLATFORMS = { ez: 'EZSurveyForm' };

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safe = u => (typeof u === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(u) ? u : '');

/** Fill the header's brand slot: the customer's logo when signed in and they have one, else the star. */
export function renderBrand(el, org) {
  if (!el) return;
  const b = org?.brand, light = safe(b?.logoLight), dark = safe(b?.logoDark) || light;
  el.classList.toggle('customer', !!light);
  el.innerHTML = light
    ? `<img class="logo logo-light" src="${light}" alt="${esc(b.name || org.name)}"><img class="logo logo-dark" src="${dark}" alt="${esc(b.name || org.name)}">`
    : `<img class="mark" src="${STAR}" alt="SmartFill">`;
  // a logo that does not load falls back to the star
  el.querySelectorAll('img.logo').forEach(i => i.addEventListener('error', () => renderBrand(el, null), { once: true }));
}

/** null when this extension can work for the organisation's platform, else a sentence for the person. */
export function platformProblem(org) {
  const p = org?.platform;
  if (!p || SUPPORTED_PLATFORMS[p]) return null;
  return 'Your organisation uses a web tool this version of SmartFill does not support yet. Please update the extension, or ask your administrator.';
}

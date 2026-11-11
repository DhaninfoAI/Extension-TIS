// Backend connection settings. Overridable from the side panel (stored in chrome.storage.local).
// People sign in with their own account (background.js keeps the tokens). `token` is only the developer token
// for local testing; it is empty by default, so a customer's extension always asks them to sign in.

export const DEFAULTS = {
  apiBase: 'https://dashboard.boost-usa.com/tis',   // hosted backend (local development: http://localhost:4010)
  token: '',
};

export async function getConfig() {
  const { config } = await chrome.storage.local.get('config');
  return { ...DEFAULTS, ...(config || {}) };
}

export async function setConfig(patch) {
  const cur = await getConfig();
  await chrome.storage.local.set({ config: { ...cur, ...patch } });
  return getConfig();
}

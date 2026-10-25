// Local CC BY 4.0 texture data; see THIRD_PARTY_NOTICES.md.
// Large image modules are requested after startup, so they never gate the app.
export const TEXTURES = Object.create(null);
const pending = new Map();
const listeners = new Set();
const sources = {
  earth: () => Promise.all([import('./tex-earth-1.js')]),
  'earth-clouds': () => Promise.all([import('./tex-earth-clouds-1.js'),import('./tex-earth-clouds-2.js')]),
  mars: () => Promise.all([import('./tex-mars-1.js'),import('./tex-mars-2.js')]),
  jupiter: () => Promise.all([import('./tex-jupiter-1.js')]),
  saturn: () => Promise.all([import('./tex-saturn-1.js')]),
  neptune: () => Promise.all([import('./tex-neptune-1.js')]),
  mercury: () => Promise.all([import('./tex-mercury-1.js'),import('./tex-mercury-2.js')]),
  venus: () => Promise.all([import('./tex-venus-1.js')]),
  uranus: () => Promise.all([import('./tex-uranus-1.js')]),
  sun: () => Promise.all([import('./tex-sun-1.js'),import('./tex-sun-2.js')]),
};

/** Observe future completions. The callback receives (kind, dataURL). */
export function onTextureReady(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Load one texture, sharing a single request with every concurrent caller. */
export function loadTexture(kind) {
  if (TEXTURES[kind]) return Promise.resolve(TEXTURES[kind]);
  if (pending.has(kind)) return pending.get(kind);
  if (!Object.hasOwn(sources,kind)) return Promise.reject(new Error('Unknown texture: '+kind));
  const promise = Promise.resolve().then(sources[kind]).then(parts => {
    const dataURL=parts.map(part=>part.default).join('');
    if (!dataURL.startsWith('data:image/jpeg;base64,')) throw new Error('Invalid texture data: '+kind);
    TEXTURES[kind]=dataURL;
    pending.delete(kind);
    for (const callback of listeners) {
      try { callback(kind,dataURL); } catch (error) { console.error('Texture listener failed',error); }
    }
    return dataURL;
  }).catch(error => {
    pending.delete(kind);
    throw error;
  });
  pending.set(kind,promise);
  return promise;
}

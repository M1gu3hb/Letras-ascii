// Resolve relative to the loaded script, including when mounted under a subpath.
const script = typeof document !== 'undefined' ? document.currentScript : null;
const base = script?.dataset.assetBase || script?.src || (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');
export const assetUrl = (path) => new URL(path, new URL('.', base)).href;

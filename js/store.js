// Guardado automático en el navegador (IndexedDB): el proyecto y la canción original.
// Vive solo en este navegador y este equipo; no se sube a ningún lado.
const DB = 'letras-ascii';
const OS = 'proyectos';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('sin IndexedDB'));
    const rq = indexedDB.open(DB, 2);
    rq.onupgradeneeded = () => {
      const s = rq.result.objectStoreNames.contains(OS) ? rq.transaction.objectStore(OS) : rq.result.createObjectStore(OS, { keyPath: 'id' });
      if (!s.indexNames.contains('kind')) s.createIndex('kind', 'kind');
    };
    rq.onblocked = () => reject(new Error('Cierra otras pestañas de Letras ASCII para actualizar el guardado.'));
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error || new Error('IndexedDB falló'));
  });
}
const wrap = (mode, fn) =>
  open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(OS, mode);
        const rq = fn(tx.objectStore(OS));
        tx.oncomplete = () => {
          db.close();
          resolve(rq ? rq.result : undefined);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB falló'));
        };
      }),
  );

// El proyecto (JSON chico) y la canción (archivo grande) van en registros separados:
// así el guardado automático no reescribe la canción cada vez.
export const putProject = (id, project, name) => wrap('readwrite', (s) => s.put({ id, kind: 'project', name, updated: Date.now(), project }));
export const getProject = (id) => wrap('readonly', (s) => s.get(id));
export async function putFile(id, source, name, type, mediaId) {
  // Own the bytes before IndexedDB serialization. WebKit can reject a File
  // backed by a picker/provider even after that same File decoded correctly.
  const blob = new Blob([await source.arrayBuffer()], { type: type || source.type });
  return wrap('readwrite', (s) => s.put({ id: id + ':file', kind: 'file', blob, name, type, mediaId }));
}
export const getFile = (id) => wrap('readonly', (s) => s.get(id + ':file'));
export const delProject = (id) =>
  wrap('readwrite', (s) => {
    s.delete(id);
    return s.delete(id + ':file');
  });
export const listProjects = () => wrap('readonly', (s) => s.index('kind').getAll('project')).then((rows) =>
  rows.map((r) => ({ id: r.id, name: r.name, updated: r.updated, size: r.project?.song?.size || 0 })).sort((a, b) => b.updated - a.updated));

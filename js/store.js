// Guardado automático en el navegador (IndexedDB): el proyecto y la canción original.
// Vive solo en este navegador y este equipo; no se sube a ningún lado.
const DB = 'letras-ascii';
const OS = 'proyectos';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('sin IndexedDB'));
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(OS, { keyPath: 'id' });
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
export const putFile = (id, blob, name, type) => wrap('readwrite', (s) => s.put({ id: id + ':file', kind: 'file', blob, name, type }));
export const getFile = (id) => wrap('readonly', (s) => s.get(id + ':file'));
export const delProject = (id) =>
  wrap('readwrite', (s) => {
    s.delete(id);
    return s.delete(id + ':file');
  });
export const listProjects = () =>
  wrap('readonly', (s) => s.getAll()).then((rows) => {
    const files = new Map((rows || []).filter((r) => r.kind === 'file').map((r) => [r.id.slice(0, -5), r.blob ? r.blob.size : 0]));
    return (rows || [])
      .filter((r) => r.kind === 'project')
      .map((r) => ({ id: r.id, name: r.name, updated: r.updated, size: files.get(r.id) || 0 }))
      .sort((a, b) => b.updated - a.updated);
  });

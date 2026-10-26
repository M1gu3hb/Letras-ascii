// Guardado automático en el navegador (IndexedDB): el proyecto y la canción original.
// Vive solo en este navegador y este equipo; no se sube a ningún lado.
const DB = 'letras-ascii';
const OS = 'proyectos';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('sin IndexedDB'));
    const rq = indexedDB.open(DB, 2);
    let blocked = false;
    rq.onupgradeneeded = () => {
      const s = rq.result.objectStoreNames.contains(OS) ? rq.transaction.objectStore(OS) : rq.result.createObjectStore(OS, { keyPath: 'id' });
      if (!s.indexNames.contains('kind')) s.createIndex('kind', 'kind');
    };
    rq.onblocked = () => { blocked = true; reject(new Error('Cierra otras pestañas de Letras ASCII para actualizar el guardado.')); };
    rq.onsuccess = () => { if (blocked) { rq.result.close(); return; } rq.result.onversionchange = () => rq.result.close(); resolve(rq.result); };
    rq.onerror = () => reject(rq.error || new Error('IndexedDB falló'));
  });
}
const wrap = (mode, fn) =>
  open().then(
    (db) =>
      new Promise((resolve, reject) => {
        let tx, rq, settled = false;
        const fail = error => { if (settled) return; settled = true; db.close(); reject(error); };
        try {
          tx = db.transaction(OS, mode);
          tx.oncomplete = () => { if (settled) return; settled = true; db.close(); resolve(rq ? rq.result : undefined); };
          tx.onerror = tx.onabort = () => fail(tx.error || new Error('IndexedDB falló'));
          rq = fn(tx.objectStore(OS));
        } catch (error) { fail(error); try { tx?.abort(); } catch {} }
      }),
  );

// El proyecto (JSON chico) y la canción (archivo grande) van en registros separados:
// así el guardado automático no reescribe la canción cada vez.
export const putProject = (id, project, name) => wrap('readwrite', (s) => s.put({ id, kind: 'project', name, updated: Date.now(), project }));
export const getProject = (id) => wrap('readonly', (s) => s.get(id));
export async function putFile(id, source, name, type, mediaId, { signal } = {}) {
  // Some WebKit storage contexts reject Blob/File serialization. ArrayBuffer
  // is structured-cloneable there; getFile recreates the same public Blob API.
  const active = () => { if (signal?.aborted) throw new DOMException('Carga cancelada', 'AbortError'); };
  active();
  const bytes = await source.arrayBuffer();
  active();
  return wrap('readwrite', (s) => { active(); return s.put({ id: id + ':file', kind: 'file', bytes, name, type: type || source.type, mediaId }); });
}
export const getFile = (id) => wrap('readonly', (s) => s.get(id + ':file')).then((record) => record?.bytes instanceof ArrayBuffer ? { ...record, blob: new Blob([record.bytes], { type: record.type }) } : record);
export const delProject = (id) =>
  wrap('readwrite', (s) => {
    s.delete(id);
    return s.delete(id + ':file');
  });
export const listProjects = () => wrap('readonly', (s) => s.index('kind').getAll('project')).then((rows) =>
  rows.map((r) => ({ id: r.id, name: r.name, updated: r.updated, size: r.project?.song?.size || 0 })).sort((a, b) => b.updated - a.updated));

import { modalDialog } from '../dialog.js';
import { getPreference, setPreference } from '../storage/preferences.js';
import { h, toast } from '../ui.js';
import { newProject, normalize } from '../project.js';
import { loadMedia } from '../audio.js';
import * as store from '../store.js';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function beginOperation(self) {
  self.cancelLoad();
  const controller = new AbortController();
  self.loadController = controller;
  const active = () => self.loadController === controller && !controller.signal.aborted && !self.destroyed;
  const finish = () => { if (self.loadController === controller) { self.loadController = null; self.busy(null); } };
  return { controller, active, finish };
}
export async function loadFile(self, file, { keepProject = false } = {}) {
    const replacing = !keepProject && self.project.song && (file.name !== self.project.song.name || file.size !== self.project.song.size);
    if (replacing && self.project.sync.some(Boolean) && !confirm('¿Cambiar la canción? Se conserva la letra y el diseño; tendrás que volver a marcar sus tiempos.')) return false;
    const { controller, active, finish } = beginOperation(self);
    const id = self.id;
    self.player.pause();
    if (self.audioFull) self.audioFull.pause();
    try {
      const media = await loadMedia(file, (m, f) => self.busy(m, f), { signal: controller.signal });
      if (!active() || id !== self.id) return false;
      self.media = media;
      self.file = file;
      const p = self.project;
      if (replacing) { p.sync = []; self.emit('reset'); }
      p.song = { name: file.name, size: file.size, type: file.type, dur: media.dur, video: media.video, mediaId: uid() };
      if (!p.name) p.name = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
      self.nameEl.value = p.name;
      if (!keepProject || !(p.clip.end > p.clip.start)) p.clip = { start: 0, end: +Math.min(media.dur, 60).toFixed(2) };
      self.busy('Guardando…', 0.99);
      self.refreshFull();
      self.refreshAudio();
      self.rebuild();
      self.emit('media', media);
      self.emit('clip', self.clip());
      // Capture the project immediately, before an asynchronous file write.
      self.saveSoon();
      self.mediaAlert.hidden = true;
      try {
        await store.putFile(id, file, file.name, file.type, p.song.mediaId);
      } catch (e) {
        if (active()) self.mediaAlert.hidden = false;
        if (active()) toast('No pude guardar la canción en este navegador. Funciona igual, pero si recargas tendrás que subirla otra vez.', 'bad');
      }
      if (!active() || id !== self.id) return false;
      await self.persistence.flush();
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message || 'No pude abrir ese archivo.', 'bad');
      return false;
    } finally {
      finish();
    }
}

export async function save(self) {
  return self.persistence.save(self.id, self.project);
}

export function projectChanged(self, { rebuild = true, save = true } = {}) {
    if (rebuild) self.rebuildSoon();
    if (save) self.saveSoon();
    self.emit('project');
}

export async function restoreLast(self) {
    let id = null;
    try {
      id = getPreference('last');
    } catch (e) {}
    if (!id) return false;
    return self.openProject(id);
}

export async function openProject(self, id) {
    const { controller, active, finish } = beginOperation(self);
    self.panels.mark?.leave('project');
    self.player.pause();
    self.audioFull.pause();
    try {
      if (!(await self.persistence.flush())) { if (active()) toast('No pude guardar el proyecto actual. Intenta de nuevo antes de cambiar.', 'bad'); return false; }
      if (!active()) return false;
      const rec = await store.getProject(id);
      if (!rec || !active()) return false;
      const project = normalize(rec.project);
      const fr = await store.getFile(id);
      if (!active()) return false;
      let media = null, file = null;
      // A failed replacement must never reopen an older, unrelated audio blob.
      const matches = fr?.blob && (!project.song?.mediaId || project.song.mediaId === fr.mediaId);
      if (matches) {
        const candidate = new File([fr.blob], fr.name || 'cancion', { type: fr.type || fr.blob.type });
        self.busy('Recuperando tu canción…', 0.02);
        try {
          media = await loadMedia(candidate, (m, f) => active() && self.busy('Recuperando tu canción… ' + m.replace(/…$/, ''), f), { signal: controller.signal });
          file = candidate;
        } catch (e) {
          if (!active() || e.name === 'AbortError') return false;
          toast('Recuperé tu proyecto, pero no pude abrir la canción guardada. Súbela otra vez.', 'bad');
        }
      } else if (project.song) {
        toast('Recuperé la letra y el diseño. Vuelve a elegir la canción; el archivo guardado no está disponible.', 'bad');
      }
      if (!active()) return false;
      self.mediaAlert.hidden = !project.song || !!file;
      self.id = id;
      self.project = project;
      self.media = media;
      self.file = file;
      self.nameEl.value = project.name || '';
      self.refreshFull();
      self.refreshAudio();
      self.rebuild();
      self.emit('media', self.media);
      self.emit('clip', self.clip());
      self.emit('project');
      self.emit('reset');
      try {
        setPreference('last', id);
      } catch (e) {}
      return true;
    } catch (e) {
      if (active() && e.name !== 'AbortError') toast(e.message || 'No pude abrir el proyecto.', 'bad');
      return false;
    } finally { finish(); }
}

export async function newAndReset(self) {
    const { active, finish } = beginOperation(self);
    try {
    self.panels.mark?.leave('project');
    self.player.pause();
    if (!(await self.persistence.flush())) { toast('No pude guardar tu trabajo. Intenta de nuevo antes de crear otro proyecto.', 'bad'); return false; }
    if (!active()) return false;
    self.audioFull.pause();
    self.player.pause();
    self.mediaAlert.hidden = true;
    self.id = uid();
    self.project = newProject();
    self.media = null;
    self.file = null;
    self.nameEl.value = '';
    self.refreshFull();
    self.refreshAudio();
    self.rebuild();
    self.emit('media', null);
    self.emit('clip', self.clip());
    self.emit('project');
    self.emit('reset');
    self.selectTab('song');
    self.savedEl.textContent = '';
    return true;
    } finally { finish(); }
}

export async function openProjects(self) {
    await self.persistence.flush();
    let rows = [];
    try {
      rows = await store.listProjects();
    } catch (e) { toast(e.message || 'No pude leer los proyectos guardados.', 'bad'); return; }
    const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mis proyectos' });
    self.closeProjects?.();
    let close = () => {};
    const list = h('div', { class: 'plist' });
    if (!rows.length) list.append(h('p', { class: 'muted' }, 'Todavía no hay proyectos guardados en este navegador.'));
    for (const r of rows) {
      list.append(
        h(
          'div',
          { class: 'prow' + (r.id === self.id ? ' cur' : '') },
          h('button', { class: 'pname-btn', type: 'button', onclick: async () => {
            close();
            await self.openProject(r.id);
          } }, h('b', {}, r.name || 'Sin nombre'), h('small', {}, new Date(r.updated).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) + (r.size ? ' · canción guardada' : ''))),
          h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Borrar ' + (r.name || 'proyecto'), onclick: async () => {
            if (!confirm('¿Borrar este proyecto de este navegador? No se puede deshacer.')) return;
            try {
              self.panels.mark?.leave('project');
              if (!(await self.persistence.flush())) { toast('No pude guardar los cambios. Resuelve el error antes de borrar el proyecto.', 'bad'); return; }
              await store.delProject(r.id);
              close();
              if (r.id === self.id) await self.newAndReset();
              else await self.openProjects();
            } catch (error) { toast(error.message || 'No pude borrar el proyecto.', 'bad'); }
          } }, 'Borrar'),
        ),
      );
    }
    dlg.append(h('div', { class: 'mbox' }, h('h2', {}, 'Mis proyectos'), h('p', { class: 'muted' }, 'Se guardan solo en este navegador y en este dispositivo.'), list, h('div', { class: 'mfoot' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cerrar'))));
    dlg.addEventListener('click', (e) => e.target === dlg && close());
    dlg.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    close = modalDialog(dlg, self.root);
    self.closeProjects = close;
}

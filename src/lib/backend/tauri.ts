import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { open, save } from '@tauri-apps/plugin-dialog';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import type { Backend } from './types';
import { toBase64 } from '../bytes';

let pendingUpdate: Update | null = null;

export const tauriBackend: Backend = {
  kind: 'tauri',
  list: (collection) => invoke('db_list', { collection }),
  get: (collection, id) => invoke('db_get', { collection, id }),
  put: (collection, id, data) => invoke('db_put', { collection, id, data }),
  insertNew: (collection, docs) => invoke('db_insert_new', { collection, docs }),
  remove: (collection, id) => invoke('db_delete', { collection, id }),

  secretSet: (name, value) => invoke('secret_set', { name, value }),
  secretStatus: () => invoke('secret_status'),

  searchCommunes: (query) => invoke('search_communes', { query }),
  fetchOffers: (source, criteria) => invoke('fetch_offers', { source, criteria }),
  claude: (request) => invoke('claude_complete', { request }),
  sendMail: (smtp, mail) => invoke('send_mail', { smtp, mail }),

  saveDocument: (folder, filename, bytes) =>
    invoke('save_document', { folder, filename, contentBase64: toBase64(bytes) }),
  openUrl: (url) => openUrl(url),
  reveal: (path) => revealItemInDir(path),
  openFile: (path) => openPath(path),
  dataDir: () => invoke('data_dir'),
  async exportBackup() {
    const path = await save({
      defaultPath: `boing-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Sauvegarde Boing', extensions: ['json'] }]
    });
    if (!path) return false;
    await invoke('backup_export', { path });
    return true;
  },
  async importBackup() {
    const path = await open({ multiple: false, filters: [{ name: 'Sauvegarde Boing', extensions: ['json'] }] });
    if (!path || Array.isArray(path)) return null;
    return invoke<number>('backup_import', { path });
  },
  wipe: () => invoke('data_wipe'),

  async checkUpdate() {
    pendingUpdate = await check();
    return pendingUpdate ? { version: pendingUpdate.version, notes: pendingUpdate.body ?? '' } : null;
  },
  async installUpdate() {
    if (!pendingUpdate) pendingUpdate = await check();
    if (!pendingUpdate) return;
    await pendingUpdate.downloadAndInstall();
    await relaunch();
  },
  appVersion: () => getVersion()
};

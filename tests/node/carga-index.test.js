/* Carrega TODOS os scripts do index.html na ordem real (com DOM mínimo) e confere que o núcleo se monta sem erro e na ordem certa */
'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const vm = require('vm'); const fs = require('fs'); const path = require('path');
const raiz = path.join(__dirname, '..', '..');

test('index.html: scripts carregam na ordem correta e a configuração do Firebase é válida', () => {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.ok(srcs.indexOf('config/firebase-config.js') >= 0 && srcs.indexOf('config/firebase-config.js') < srcs.indexOf('src/core/nuvem.js'));
  assert.ok(srcs.indexOf('src/core/sync.js') < srcs.indexOf('src/core/store.js'), 'sync antes do store');
  assert.ok(srcs.indexOf('src/core/store.js') < srcs.indexOf('src/modules/rtc/app.js'));
  assert.ok(srcs.indexOf('src/core/nuvem.js') < srcs.indexOf('src/core/auth.js'));
  assert.ok(!srcs.some((s) => /acessos\.js/.test(s)), 'sem arquivo de acessos publicado');
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] });
  const sb = { console, setTimeout, clearTimeout, Promise, performance, localStorage: mem(), sessionStorage: mem(), TextEncoder, TextDecoder, URL, Blob, Uint8Array, ArrayBuffer, DataView, Intl,
    document: { getElementById: () => el(), createElement: el, head: el(), body: el(), addEventListener() {}, querySelector: () => null }, location: { hash: '', pathname: '/', search: '' }, history: { replaceState() {} }, navigator: {}, addEventListener() {}, matchMedia: () => ({ matches: false }) };
  sb.window = sb; vm.createContext(sb);
  for (const s of srcs) vm.runInContext(fs.readFileSync(path.join(raiz, s), 'utf8'), sb, { filename: s });
  const N = sb.Nexus;
  assert.ok(N.sync && N.nuvem && N.auth && N.store && N.shell);
  assert.equal(typeof N.rtc.app.store.save, 'function');
  assert.equal(Object.keys(N.sync._estado()).sort().join(), 'lucro,rtc', 'os dois repositórios dos módulos estão registrados para a nuvem');
  const c = sb.NEXUS_FIREBASE;
  assert.equal(c.projectId, 'nexus-rtc'); assert.ok(c.apiKey && c.appId && c.authDomain);
  assert.ok(!('privateKey' in c) && !('private_key' in c) && !/PRIVATE KEY/.test(fs.readFileSync(path.join(raiz, 'config/firebase-config.js'), 'utf8')));
});

test('nenhum segredo/credencial no site (chave de serviço, senha embutida, hash de acesso antigo)', () => {
  const alvo = [];
  (function varrer(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.claude', 'fixtures'].includes(e.name)) varrer(p); } else if (/\.(js|html|json|md|txt|rules)$/.test(e.name)) alvo.push(p); }); })(raiz);
  alvo.forEach((p) => {
    const s = fs.readFileSync(p, 'utf8');
    assert.ok(!/BEGIN (RSA |EC )?PRIVATE KEY/.test(s), 'chave privada em ' + p);
    assert.ok(!/"type"\s*:\s*"service_account"/.test(s), 'conta de serviço em ' + p);
    if (!p.split(path.sep).includes('tests')) assert.ok(!/USUARIOS_INICIAIS|joalisonrafael/.test(s), 'usuário/hash embutido em ' + p);
  });
});

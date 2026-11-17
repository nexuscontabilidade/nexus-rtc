/* Executa a suíte de cálculo existente (tests/index.html) em Node, sem navegador: node tests/node/rodar-suite-navegador.js */
'use strict';
const vm = require('vm'); const fs = require('fs'); const path = require('path');
const raiz = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(raiz, 'tests', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => path.join(raiz, 'tests', m[1]));
const els = { resultado: { innerHTML: '', appendChild() {} }, resumo: { textContent: '', className: '' } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const sb = { console, setTimeout, clearTimeout, Promise, performance, localStorage: mem(), sessionStorage: mem(), TextEncoder, TextDecoder, URL, Blob, Uint8Array, ArrayBuffer, DataView,
  document: { getElementById: (id) => els[id], createElement: () => ({ set textContent(v) {}, className: '' }) }, location: { hash: '' }, history: { replaceState() {} }, navigator: {}, addEventListener() {} };
sb.window = sb; vm.createContext(sb);
for (const f of scripts) vm.runInContext(fs.readFileSync(f, 'utf8'), sb, { filename: path.relative(raiz, f) });
const res = vm.runInContext('T.run()', sb);
const falhas = res.filter((r) => !r.ok);
console.log(els.resumo.textContent);
falhas.forEach((f) => console.log('✘', f.nome, '—', f.erro));
process.exit(falhas.length ? 1 : 0);

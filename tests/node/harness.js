/*
 * Harness dos testes em Node: carrega os scripts do núcleo (sync, store, auth) em um "navegador" simulado
 * (localStorage/sessionStorage próprios) e liga-os a um backend de memória que imita o contrato do Firestore:
 * revisão por repositório (conflito), perfis, bloqueio, rede indisponível e permissão negada.
 * Vários dispositivos podem compartilhar o mesmo backend (mesma nuvem, navegadores diferentes).
 */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
function ler(rel) { return fs.readFileSync(path.join(RAIZ, rel), 'utf8'); }

function armazenamento() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => Array.from(m.keys())[i] || null,
    get length() { return m.size; },
    _chaves: () => Array.from(m.keys())
  };
}

function erro(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

/** A "nuvem": compartilhada entre dispositivos */
function criarNuvem() {
  const nuvem = {
    perfis: new Map(),            // uid -> perfil
    contas: new Map(),            // email -> { uid, senha }
    stores: new Map(),            // 'uid/id' -> { rev, texto }
    escritas: [],                 // registro de gravações: { uid, id, revBase }
    contador: 0,
    falha: null,                  // 'unavailable' | 'permission-denied' | null (aplicada a leitura/gravação de dados)
    dono: new Map()               // uid logado por dispositivo (preenchido pelo backend)
  };
  nuvem.criarContaDireta = (email, senha) => { const uid = 'uid' + (++nuvem.contador); nuvem.contas.set(email, { uid, senha }); return uid; };
  nuvem.criarPerfilDireto = (uid, p) => { nuvem.perfis.set(uid, Object.assign({ bloqueado: false, modulos: null }, p)); };
  nuvem.novoAdmin = (email, senha) => { const uid = nuvem.criarContaDireta(email, senha); nuvem.criarPerfilDireto(uid, { nome: 'Admin', email, perfil: 'admin' }); return uid; };
  nuvem.novoCliente = (email, senha, extra) => { const uid = nuvem.criarContaDireta(email, senha); nuvem.criarPerfilDireto(uid, Object.assign({ nome: 'Cliente ' + email, email, perfil: 'cliente' }, extra || {})); return uid; };
  return nuvem;
}

/** Adaptador (mesma interface de Nexus.nuvem) para um dispositivo, falando com a nuvem em memória */
function criarBackend(nuvem) {
  const be = { uid: null, email: '', ouvintesAuth: [], ouvintesPerfil: [], logins: 0 };
  const uidLogado = () => be.uid;
  const permitido = (uid, id) => {
    // espelha firestore.rules: só o dono, ativo, com o módulo liberado
    const me = be.uid && nuvem.perfis.get(be.uid);
    if (!be.uid || be.uid !== uid) return false;
    if (!me || me.bloqueado) return false;
    if (me.perfil === 'admin' || me.modulos == null) return ['rtc', 'lucro'].includes(id);
    return me.modulos.includes(id);
  };
  const adminAtivo = () => { const me = be.uid && nuvem.perfis.get(be.uid); return !!(me && !me.bloqueado && me.perfil === 'admin'); };
  const rede = (ctx) => { if (nuvem.falha === 'unavailable') throw erro('unavailable', 'Failed to get document because the client is offline.'); };
  Object.assign(be, {
    iniciar: () => Promise.resolve(),
    entrar(email, senha) {
      const c = nuvem.contas.get(email);
      if (!c || c.senha !== senha) return Promise.reject(erro('auth/invalid-credential'));
      be.uid = c.uid; be.email = email; be.logins++;
      return Promise.resolve({ uid: c.uid, email });
    },
    sair() { be.uid = null; return Promise.resolve(); },
    aoMudarAutenticacao(fn) { be.ouvintesAuth.push(fn); fn(be.uid ? { uid: be.uid, email: be.email } : null); return () => {}; },
    usuarioAtual: () => (be.uid ? { uid: be.uid, email: be.email } : null),
    redefinirSenha: (email) => { be.ultimoReset = email; return Promise.resolve(); },
    criarConta(email, senha) {
      if (nuvem.contas.has(email)) return Promise.reject(erro('auth/email-already-in-use'));
      return Promise.resolve({ uid: nuvem.criarContaDireta(email, senha), nova: true });
    },
    lerPerfil(uid) {
      if (nuvem.falha === 'unavailable') return Promise.reject(erro('unavailable'));
      if (!(be.uid === uid || adminAtivo())) return Promise.reject(erro('permission-denied'));
      const p = nuvem.perfis.get(uid); return Promise.resolve(p ? Object.assign({ id: uid }, JSON.parse(JSON.stringify(p))) : null);
    },
    observarPerfil(uid, cb) { const o = { uid, cb }; be.ouvintesPerfil.push(o); cb(Object.assign({ id: uid }, nuvem.perfis.get(uid))); return () => { be.ouvintesPerfil = be.ouvintesPerfil.filter((x) => x !== o); }; },
    listarPerfis() {
      if (!adminAtivo()) return Promise.reject(erro('permission-denied'));
      return Promise.resolve(Array.from(nuvem.perfis.entries()).map(([id, p]) => Object.assign({ id }, JSON.parse(JSON.stringify(p)))));
    },
    criarPerfil(uid, d) { if (!adminAtivo() || uid === be.uid) return Promise.reject(erro('permission-denied')); nuvem.perfis.set(uid, JSON.parse(JSON.stringify(d))); return Promise.resolve(); },
    atualizarPerfil(uid, d) {
      if (!adminAtivo()) return Promise.reject(erro('permission-denied'));
      const p = nuvem.perfis.get(uid); if (!p) return Promise.reject(erro('not-found'));
      if (uid === be.uid && ((d.perfil !== undefined && d.perfil !== p.perfil) || (d.bloqueado !== undefined && d.bloqueado !== p.bloqueado))) return Promise.reject(erro('permission-denied'));
      Object.assign(p, JSON.parse(JSON.stringify(d))); be.notificarPerfil(uid); return Promise.resolve();
    },
    excluirPerfil(uid) { if (!adminAtivo() || uid === be.uid) return Promise.reject(erro('permission-denied')); nuvem.perfis.delete(uid); be.notificarPerfil(uid); return Promise.resolve(); },
    notificarPerfil(uid) { be.ouvintesPerfil.filter((o) => o.uid === uid).forEach((o) => o.cb(nuvem.perfis.has(uid) ? Object.assign({ id: uid }, nuvem.perfis.get(uid)) : null)); },
    lerStore(uid, id) {
      try { rede(); } catch (e) { return Promise.reject(e); }
      if (!permitido(uid, id)) return Promise.reject(erro('permission-denied'));
      if (nuvem.falha === 'permission-denied') return Promise.reject(erro('permission-denied'));
      const s = nuvem.stores.get(uid + '/' + id);
      return Promise.resolve(s ? { rev: s.rev, texto: s.texto } : null);
    },
    gravarStore(uid, id, revBase, texto) {
      try { rede(); } catch (e) { return Promise.reject(e); }
      if (!permitido(uid, id) || nuvem.falha === 'permission-denied') return Promise.reject(erro('permission-denied'));
      const k = uid + '/' + id, s = nuvem.stores.get(k);
      const revAtual = s ? s.rev : 0;
      if (revAtual !== revBase) return Promise.reject(erro('conflito'));
      nuvem.stores.set(k, { rev: revAtual + 1, texto });
      nuvem.escritas.push({ uid, id, revBase });
      return Promise.resolve({ rev: revAtual + 1 });
    }
  });
  return be;
}

/** Um dispositivo = um navegador (storages próprios) com os scripts carregados */
function novoDispositivo(nuvem, opcoes) {
  opcoes = opcoes || {};
  const localStorage = opcoes.localStorage || armazenamento();
  const sessionStorage = armazenamento();
  const eventos = { recarregou: 0, dialogos: [], toasts: [] };
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, JSON, Math, Date, Object, Array, String, Number, Error, RegExp, Uint8Array,
    localStorage, sessionStorage,
    location: { reload() { eventos.recarregou++; }, pathname: '/', search: '', hash: '' },
    history: { replaceState() {} },
    addEventListener() {}
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  ['src/core/sync.js', 'src/core/store.js', 'src/core/auth.js'].forEach((f) => vm.runInContext(ler(f), ctx, { filename: f }));
  const N = sandbox.Nexus;
  N.dom = {
    confirmar: (...a) => { eventos.dialogos.push(['confirmar', a[0]]); return Promise.resolve(opcoes.migrar === undefined ? true : opcoes.migrar); },
    dialogo: (o) => { eventos.dialogos.push(['dialogo', o.titulo]); return Promise.resolve(opcoes.conflito || 'nuvem'); },
    toast: (m) => eventos.toasts.push(m)
  };
  N.shell = { render() { eventos.renders = (eventos.renders || 0) + 1; }, atual: { rota: 'usuarios' } };
  const backend = criarBackend(nuvem);
  N.nuvem = backend;
  N.sync._tempos(opcoes.atraso == null ? 20 : opcoes.atraso, [30, 30, 30]);
  return { N, ctx, sandbox, localStorage, sessionStorage, backend, eventos, nuvem };
}

/** Registra um repositório de teste (como os módulos fazem) */
function criarStore(d, id, legado) {
  return d.N.store.createStore(legado || 'nexus.' + id + '.v1', () => ({ versao: 1, empresas: [], ui: {} }), id);
}

/** Faz o login completo: entrar + iniciarSessao (o que exigir() faz no navegador) */
async function logar(d, email, senha) {
  const r = await d.N.auth.entrar(email, senha, false);
  if (!r.ok) return r;
  const u = d.backend.usuarioAtual();
  return d.N.auth._iniciarSessao(u);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(cond, ms) { const fim = Date.now() + (ms || 2000); while (Date.now() < fim) { if (cond()) return true; await espera(10); } return !!cond(); }

module.exports = { criarNuvem, novoDispositivo, criarStore, logar, espera, ate, armazenamento, erro };

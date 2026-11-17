/* Nexus — repositórios de dados: memória + cache local do usuário + nuvem (Nexus.sync), com backup/restauração em JSON */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  function uid(prefixo) {
    return (prefixo || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /** Mescla profunda: valores de `src` sobrescrevem `alvo`; arrays são substituídos. */
  function merge(alvo, src) {
    if (src == null || typeof src !== 'object' || Array.isArray(src)) return src === undefined ? alvo : src;
    var out = (alvo && typeof alvo === 'object' && !Array.isArray(alvo)) ? clone(alvo) : {};
    Object.keys(src).forEach(function (k) {
      var v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = merge(out[k], v);
      else if (v !== undefined) out[k] = v;
    });
    return out;
  }

  function getPath(obj, path) {
    var parts = path.split('.');
    var o = obj;
    for (var i = 0; i < parts.length; i++) {
      if (o == null) return undefined;
      o = o[parts[i]];
    }
    return o;
  }
  function setPath(obj, path, valor) {
    var parts = path.split('.');
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = valor;
  }

  /**
   * Cria um repositório persistente.
   * @param {string} chave chave no localStorage (modo local, sem nuvem; também a chave "antiga" que a migração oferece à conta)
   * @param {function} padrao função que devolve o estado inicial
   * @param {string} [id] identificador do módulo na nuvem ('rtc', 'lucro'). Com a sincronização ativa (Nexus.sync),
   *   os dados vão para o cache do usuário conectado e para o Firestore — nunca para a chave compartilhada `chave`.
   */
  function createStore(chave, padrao, id) {
    var memoria = null;
    var timer = null;
    var persistente = true;
    var ouvintes = [];

    function nuvem() { return !!(id && N.sync && N.sync.ativo()); }

    function ler() {
      try {
        var raw = root.localStorage.getItem(chave);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        persistente = false;
        return null;
      }
    }
    function gravar() {
      if (nuvem()) {
        // cache do usuário + envio à nuvem em segundo plano (Nexus.sync); `false` = módulo fora do acesso: só memória
        persistente = N.sync.alterado(id, JSON.stringify(memoria));
      } else if (!(id && N.sync && N.sync.exigeNuvem)) {
        try {
          root.localStorage.setItem(chave, JSON.stringify(memoria));
          persistente = true;
        } catch (e) {
          persistente = false;
        }
      }
      ouvintes.forEach(function (fn) { fn(memoria); });
    }

    var api = {
      get data() {
        if (!memoria) memoria = merge(padrao(), nuvem() ? {} : (ler() || {}));
        return memoria;
      },
      get persistente() { return nuvem() ? N.sync.status() !== 'erro' && N.sync.status() !== 'negado' : persistente; },
      save: function () {
        clearTimeout(timer);
        timer = setTimeout(gravar, 250);
      },
      saveNow: function () { clearTimeout(timer); gravar(); },
      onSave: function (fn) { ouvintes.push(fn); },
      exportar: function () {
        return JSON.stringify({ app: 'Nexus RTC Comparativo', exportadoEm: new Date().toISOString(), dados: api.data }, null, 2);
      },
      importar: function (texto) {
        var obj = JSON.parse(texto);
        var dados = obj && obj.dados ? obj.dados : obj;
        if (!dados || typeof dados !== 'object' || !Array.isArray(dados.empresas)) {
          throw new Error('Arquivo de backup inválido: estrutura de dados não reconhecida.');
        }
        memoria = merge(padrao(), dados);
        gravar();
      },
      reset: function () {
        memoria = padrao();
        gravar();
      },
      // --- usados por Nexus.sync
      _carregar: function (obj) { clearTimeout(timer); memoria = merge(padrao(), obj && typeof obj === 'object' ? obj : {}); },
      _serializar: function () { return JSON.stringify(api.data); },
      _descartar: function () { clearTimeout(timer); memoria = null; }
    };
    if (id && N.sync) N.sync.registrar(id, api, chave);
    return api;
  }

  N.store = { uid: uid, clone: clone, merge: merge, getPath: getPath, setPath: setPath, createStore: createStore };
})(typeof window !== 'undefined' ? window : globalThis);

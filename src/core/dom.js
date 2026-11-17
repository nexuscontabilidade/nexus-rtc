/* Nexus — utilidades de interface: avisos (toast), diálogos, download e carregamento sob demanda */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  var toastBox = null;
  function toast(msg, tipo) {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'nx-toasts';
      toastBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastBox);
    }
    var t = document.createElement('div');
    t.className = 'nx-toast ' + (tipo || 'ok');
    t.textContent = msg;
    toastBox.appendChild(t);
    setTimeout(function () { t.classList.add('saindo'); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  }

  /** Diálogo modal. botoes: [{rotulo, valor, tipo}] → Promise(valor) */
  function dialogo(opts) {
    return new Promise(function (resolve) {
      var fundo = document.createElement('div');
      fundo.className = 'nx-modal-fundo';
      var box = document.createElement('div');
      box.className = 'nx-modal';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      var h = document.createElement('h3');
      h.textContent = opts.titulo || '';
      box.appendChild(h);
      if (opts.texto) {
        var p = document.createElement('p');
        p.textContent = opts.texto;
        box.appendChild(p);
      }
      var campos = [];
      (opts.campos || []).forEach(function (c) {
        var lb = document.createElement('label');
        lb.className = 'nx-field';
        var sp = document.createElement('span');
        sp.className = 'nx-label';
        sp.textContent = c.rotulo;
        lb.appendChild(sp);
        var inp = document.createElement(c.multilinha ? 'textarea' : 'input');
        inp.className = 'nx-input';
        inp.value = c.valor || '';
        if (c.placeholder) inp.placeholder = c.placeholder;
        lb.appendChild(inp);
        box.appendChild(lb);
        campos.push(inp);
      });
      var acoes = document.createElement('div');
      acoes.className = 'nx-modal-acoes';
      function fechar(v) {
        document.removeEventListener('keydown', onKey);
        fundo.remove();
        resolve(v);
      }
      (opts.botoes || [{ rotulo: 'Cancelar', valor: null, tipo: 'ghost' }, { rotulo: 'OK', valor: true, tipo: 'primary' }]).forEach(function (b) {
        var bt = document.createElement('button');
        bt.type = 'button';
        bt.className = 'nx-btn ' + (b.tipo || 'ghost');
        bt.textContent = b.rotulo;
        bt.addEventListener('click', function () {
          if (campos.length && b.valor) fechar(campos.map(function (c) { return c.value; }));
          else fechar(b.valor);
        });
        acoes.appendChild(bt);
      });
      box.appendChild(acoes);
      fundo.appendChild(box);
      fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(null); });
      function onKey(e) { if (e.key === 'Escape') fechar(null); }
      document.addEventListener('keydown', onKey);
      document.body.appendChild(fundo);
      var foco = campos[0] || acoes.lastChild;
      if (foco) foco.focus();
    });
  }
  function confirmar(titulo, texto, rotuloOk, perigo) {
    return dialogo({ titulo: titulo, texto: texto, botoes: [{ rotulo: 'Cancelar', valor: false, tipo: 'ghost' }, { rotulo: rotuloOk || 'Confirmar', valor: true, tipo: perigo ? 'danger' : 'primary' }] });
  }

  function baixar(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  var scripts = {};
  function carregarScript(url) {
    if (scripts[url]) return scripts[url];
    scripts[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(); };
      s.onerror = function () { delete scripts[url]; reject(new Error('Falha ao carregar ' + url)); };
      document.head.appendChild(s);
    });
    return scripts[url];
  }

  function slug(s) {
    return String(s || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'arquivo';
  }

  N.dom = { $: $, $$: $$, toast: toast, dialogo: dialogo, confirmar: confirmar, baixar: baixar, carregarScript: carregarScript, slug: slug };
})(typeof window !== 'undefined' ? window : globalThis);

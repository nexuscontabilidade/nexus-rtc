/* Mini executor de testes para navegador (sem dependências) */
(function (root) {
  'use strict';
  var casos = [];
  function test(nome, fn) { casos.push({ nome: nome, fn: fn }); }
  function AssertError(msg) { this.message = msg; }
  function ok(cond, msg) { if (!cond) throw new AssertError(msg || 'condição falsa'); }
  function eq(a, b, msg) { if (a !== b) throw new AssertError((msg ? msg + ': ' : '') + 'esperado ' + JSON.stringify(b) + ', obtido ' + JSON.stringify(a)); }
  function near(a, b, tol, msg) {
    tol = tol == null ? 0.005 : tol;
    if (typeof a !== 'number' || !isFinite(a) || Math.abs(a - b) > tol) throw new AssertError((msg ? msg + ': ' : '') + 'esperado ≈ ' + b + ' (±' + tol + '), obtido ' + a);
  }
  function run() {
    var res = casos.map(function (c) {
      var t0 = performance.now();
      try { c.fn(); return { nome: c.nome, ok: true, ms: performance.now() - t0 }; }
      catch (e) { return { nome: c.nome, ok: false, erro: e.message || String(e), stack: e.stack, ms: performance.now() - t0 }; }
    });
    root.__RESULTADOS__ = res;
    var falhas = res.filter(function (r) { return !r.ok; });
    var el = document.getElementById('resultado');
    var resumo = document.getElementById('resumo');
    resumo.textContent = (res.length - falhas.length) + ' de ' + res.length + ' testes aprovados' + (falhas.length ? ' — ' + falhas.length + ' falha(s)' : '');
    resumo.className = falhas.length ? 'falha' : 'ok';
    el.innerHTML = '';
    res.forEach(function (r) {
      var li = document.createElement('li');
      li.className = r.ok ? 'ok' : 'falha';
      li.textContent = (r.ok ? '✔ ' : '✘ ') + r.nome + (r.ok ? '' : ' — ' + r.erro);
      el.appendChild(li);
    });
    return res;
  }
  root.T = { test: test, ok: ok, eq: eq, near: near, run: run };
})(window);

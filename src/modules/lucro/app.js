/*
 * Lucratividade por Item — estado, cálculo com cache, eventos e registro do módulo no shell.
 * Fluxo: Empresas (cadastro próprio) → 1. Parâmetros → 2. Compra → 3. Venda → 4. Resultado.
 * Recálculo em tempo real: CL e Σ ficam em cache por item (chave = compra + tributação + despesas + parâmetros);
 * mudar o preço refaz só a etapa 3 do motor. Gravação no navegador com espera de 500 ms após a digitação.
 */
(function (root) {
  'use strict';
  var N = root.Nexus, LC = N.lucro, M = LC.motor, U = N.rtc.ui, F = N.fmt, D = N.dom, esc = F.esc;
  LC.views = LC.views || {};

  function padrao() {
    // syncExcluidos: vínculos de produtos excluídos aqui, para a integração com o RTC não trazê-los de volta
    // cenario: ano da simulação de todo o módulo ('2026' PIS/Cofins; '2027' CBS e IBS), escolhido no menu de etapas
    return { versao: 1, cenario: '2026', empresas: [], analises: [], syncExcluidos: [], ui: { empresaId: null, analiseId: null, itemId: null, detalhes: 'menos', empresaEditando: null } };
  }
  var store = N.store.createStore('nexus.lucro.v1', padrao, 'lucro');
  var timerGravar = null;
  function gravar() { clearTimeout(timerGravar); timerGravar = setTimeout(function () { store.saveNow(); }, 500); }

  var MOD = LC.modelo;
  var novaEmpresa = MOD.novaEmpresa, novoItem = MOD.novoItem;
  function novaAnalise(emp, nome) { return MOD.novaAnalise(emp, nome || 'Análise ' + (L.analisesDa(emp.id).length + 1)); }

  // ------------------------------------------------------------------ estado
  var cache = {};
  var L = LC.app = {
    get d() { return store.data; },
    store: store,
    abertos: {},
    importacao: null,
    empresa: function (id) {
      var alvo = id || this.d.ui.empresaId;
      return this.d.empresas.filter(function (e) { return e.id === alvo; })[0] || null;
    },
    /** Empresa com a ficha aberta (null quando nenhuma: não cai na empresa selecionada) */
    editando: function () { return this.d.ui.empresaEditando ? this.empresa(this.d.ui.empresaEditando) : null; },
    analisesDa: function (empId) { return this.d.analises.filter(function (a) { return a.empresaId === empId; }); },
    analise: function () {
      var id = this.d.ui.analiseId, emp = this.empresa();
      return this.d.analises.filter(function (a) { return a.id === id && emp && a.empresaId === emp.id; })[0] || null;
    },
    item: function (id) {
      var an = this.analise();
      var alvo = id || this.d.ui.itemId;
      return an ? an.itens.filter(function (it) { return it.id === alvo; })[0] || null : null;
    },
    /** Parâmetros efetivos: os da empresa, com o regime da análise quando sobrescrito ("e se eu fosse Lucro Real?") */
    params: function (an) {
      var emp = this.empresa();
      if (!emp) return null;
      var p = N.store.merge(M.parametrosPadrao(), emp.params || {});
      p.regime = (an && an.regime) || emp.regime;
      p.uf = emp.uf;
      p.cenario = this.cenario();
      if (p.cenario === '2027') p.ref2027 = M.referencia2027(); // alíquotas do RTC (entram na chave do cache)
      return p;
    },
    /** Cenário da simulação, comum a todas as empresas e análises do módulo */
    cenario: function () { return this.d.cenario === '2027' ? '2027' : '2026'; },
    calculadora: function (item, p) {
      var chave = JSON.stringify([item.quantidade, item.compra, item.trib, item.cbsIbs, item.venda.comissao, item.venda.taxaCartao, p]);
      var c = cache[item.id];
      if (!c || c.chave !== chave) { c = cache[item.id] = { chave: chave, calc: M.calculadora(item, p) }; }
      return c.calc;
    },
    resultado: function (item) {
      var p = this.params(this.analise());
      return M.calcularItem(item, p, this.calculadora(item, p));
    },
    resultados: function () {
      var an = this.analise();
      var self = this;
      return an ? an.itens.map(function (it) { return { item: it, r: self.resultado(it) }; }) : [];
    }
  };

  function garantirSelecao() {
    var d = L.d;
    if (d.ui.empresaId && !L.empresa()) d.ui.empresaId = null;
    if (!d.ui.empresaId && d.empresas.length) d.ui.empresaId = d.empresas[0].id;
    var emp = L.empresa();
    if (emp) {
      var ans = L.analisesDa(emp.id);
      if (!ans.some(function (a) { return a.id === d.ui.analiseId; })) d.ui.analiseId = ans.length ? ans[ans.length - 1].id : null;
    } else d.ui.analiseId = null;
    var an = L.analise();
    if (an && an.itens.length && !an.itens.some(function (it) { return it.id === d.ui.itemId; })) d.ui.itemId = an.itens[0].id;
    if (d.ui.empresaEditando && !L.empresa(d.ui.empresaEditando)) d.ui.empresaEditando = null;
  }
  L.garantirSelecao = garantirSelecao;

  function tocar(an) { if (an) an.atualizadoEm = new Date().toISOString(); }
  /** Itens excluídos: o vínculo fica guardado para a integração com o RTC não trazê-los de volta */
  function excluidos(itens) { if (N.integracao) N.integracao.registrarExclusao(L.d, itens); }

  /** Seleção de itens da análise para exclusão em lote (não é gravada); ativo: caixas visíveis ("Selecionar produtos") */
  L.selecao = { analiseId: null, ids: {}, ativo: false };
  L.sel = function () {
    var an = L.analise();
    if (!an || L.selecao.analiseId !== an.id) L.selecao = { analiseId: an ? an.id : null, ids: {}, ativo: false };
    return L.selecao;
  };
  L.selecionados = function () {
    var an = L.analise(), s = L.sel();
    return an ? an.itens.filter(function (it) { return s.ids[it.id]; }) : [];
  };

  // ------------------------------------------------------------------ escrita de valores
  var NUMERICOS = ['money', 'pct', 'num', 'int', 'unit'];
  function lerValor(t) {
    var tipo = t.dataset.type;
    if (t.type === 'checkbox') return { valor: t.checked };
    if (NUMERICOS.indexOf(tipo) >= 0) {
      var v = F.parse(t.value);
      if (v !== null && isNaN(v)) return { invalido: true };
      if (v !== null && v < 0) return { invalido: true, msg: 'O valor não pode ser negativo.' };
      return { valor: v };
    }
    var val = t.value;
    if (t.dataset.cast === 'bool') val = val === true || val === 'true';
    if (t.dataset.cast === 'null' && val === '') val = null;
    return { valor: val };
  }

  /** Grava o campo; devolve true quando a tela precisa ser redesenhada */
  function set(scope, id, path, val) {
    var d = L.d;
    if (scope === 'emp') {
      var e = L.empresa(id);
      if (!e) return false;
      N.store.setPath(e, path, val);
      return path === 'regime' || path === 'uf';
    }
    if (scope === 'mod') { // configuração do módulo inteiro (cenário)
      N.store.setPath(d, path, val);
      return true;
    }
    if (scope === 'param') {
      var ep = L.empresa();
      if (!ep) return false;
      N.store.setPath(ep.params, path, val);
      return path === 'considerarIrpjCsll' || path === 'aplicarAdicional' || path === 'ibsCbsNaBaseIcms' || path === 'despesasSobreTotal' || path === 'manterIpi2027';
    }
    if (scope === 'ana') {
      var an = L.analise();
      if (!an) return false;
      N.store.setPath(an, path, val === '' ? null : val);
      tocar(an);
      return path === 'regime' || path.indexOf('vendaPadrao.modo') === 0 || path === 'vendaPadrao.descontoTipo';
    }
    if (scope === 'item') {
      var it = L.item(id);
      if (!it) return false;
      if (path.indexOf('trib.') === 0 && !it.trib) {
        var tp = M.tributacaoPadrao(it, L.params(L.analise()));
        delete tp.padrao;
        it.trib = tp; // ao editar a tributação, o item deixa de usar o padrão do regime
      }
      // modo "preço sem PIS/Cofins": o preço que está na tela vira o preço de hoje (quando ainda não há um)
      if (path === 'venda.modo' && val === 'PRECO_SEM_PIS_COFINS' && !(Number(it.venda.precoAtual) > 0)) {
        var r0 = L.resultado(it);
        if (r0 && !r0.erro) it.venda.precoAtual = r0.pv;
      }
      N.store.setPath(it, path, val);
      tocar(L.analise());
      return ['venda.modo', 'venda.descontoTipo', 'compra.daeCodigo', 'trib.icmsSt', 'cbsIbs.regime'].indexOf(path) >= 0;
    }
    if (scope === 'ui') {
      N.store.setPath(d.ui, path, val);
      if (path === 'detalhes') L.abertos = {};
      if (path === 'empresaId') { d.ui.analiseId = null; d.ui.itemId = null; garantirSelecao(); }
      if (path === 'analiseId') { d.ui.itemId = null; garantirSelecao(); }
      return true;
    }
    return false;
  }

  function marcarInvalido(t, msg) {
    var f = t.closest('.nx-field');
    if (!f) return;
    f.classList.toggle('is-invalid', !!msg);
    var e = f.querySelector('.nx-err');
    if (e) e.textContent = msg || '';
  }

  // ------------------------------------------------------------------ áreas vivas (recalculadas a cada digitação)
  var LIVE = {};
  LC.live = LIVE;
  function atualizarVivo() {
    D.$$('[data-lc-live]').forEach(function (node) {
      var fn = LIVE[node.getAttribute('data-lc-live')];
      if (fn) node.innerHTML = fn(L, node.getAttribute('data-lc-id'));
    });
  }
  L.atualizarVivo = atualizarVivo;

  /** Preço do item no campo de preço (quando o modo calcula o preço, o campo mostra o resultado) */
  function sincronizarPreco(itemId, exceto) {
    var it = L.item(itemId);
    if (!it) return;
    var r = L.resultado(it);
    D.$$('input[data-scope="item"][data-id="' + itemId + '"][data-path="venda.precoVenda"]').forEach(function (inp) {
      if (inp === exceto) return;
      inp.value = r && !r.erro ? F.inputValue(r.pv, 'unit') : (it.venda.precoVenda != null ? F.inputValue(it.venda.precoVenda, 'unit') : '');
    });
    D.$$('input[data-lc-margem="' + itemId + '"]').forEach(function (inp) {
      if (inp === exceto) return;
      inp.value = r && !r.erro && r.margem != null ? F.inputValue(r.margem * 100, 'pct') : '';
    });
    D.$$('input[data-scope="item"][data-id="' + itemId + '"][data-path="venda.modo"]').forEach(function (rad) {
      rad.checked = rad.value === it.venda.modo;
      var opt = rad.closest('.nx-seg-opt'); if (opt) opt.classList.toggle('is-on', rad.checked);
    });
    // o texto do modo acompanha a troca automática para "preço informado" ao digitar o preço
    var pn = L.params(L.analise());
    D.$$('.lc-modo-nota').forEach(function (el) { if (LC.views.modoTexto) el.textContent = LC.views.modoTexto(it.venda.modo, pn); });
  }

  /** Filtro da tela Venda: redesenha só a lista (o campo de busca mantém o foco) */
  function atualizarFiltroVenda() {
    var el = document.getElementById('lc-filtro-res');
    if (el && LC.views.vendaFiltro) el.innerHTML = LC.views.vendaFiltro(L);
  }

  function onInput(ev) {
    if (N.shell.atual.modulo !== 'lucro') return;
    var t = ev.target;
    // caixa de seleção de item (exclusão em lote)
    if (t.dataset && t.dataset.lcSel) {
      if (ev.type !== 'change') return;
      var s = L.sel();
      if (t.checked) s.ids[t.dataset.lcSel] = true; else delete s.ids[t.dataset.lcSel];
      rerender();
      return;
    }
    if (t.dataset && t.dataset.lcFiltro === 'busca') {
      if (ev.type !== 'input') return;
      (L.filtroVenda = L.filtroVenda || { busca: '', faixa: 'todos' }).busca = t.value;
      atualizarFiltroVenda();
      return;
    }
    // margem desejada → preço para a margem (PV_alvo); o preço passa a valer como informado
    if (t.dataset && t.dataset.lcMargem) {
      if (ev.type !== 'input') return;
      var it = L.item(t.dataset.lcMargem);
      var m = F.parse(t.value);
      if (!it || m == null || isNaN(m)) return;
      var p = L.params(L.analise());
      var calc = L.calculadora(it, p);
      var alvo = M.precoParaMargem(calc.compra.custoLiquidoUnit, it.venda, calc.sigma.sigma, m / 100);
      if (alvo.erro) { marcarInvalido(t, alvo.erro); return; }
      marcarInvalido(t, null);
      it.venda.modo = 'PRECO_INFORMADO';
      it.venda.precoVenda = alvo.pv;
      tocar(L.analise());
      sincronizarPreco(it.id, t);
      atualizarVivo();
      gravar();
      return;
    }
    if (!t.dataset || !t.dataset.path) return;
    var estrutural = t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'radio';
    if (ev.type === 'input' && estrutural) return;
    if (ev.type === 'change' && !estrutural) return;
    if (t.type === 'radio' && !t.checked) return;
    var lv = lerValor(t);
    if (lv.invalido) { marcarInvalido(t, lv.msg || 'Número inválido. Use o formato 1.234,56.'); return; }
    marcarInvalido(t, null);
    var redesenhar = set(t.dataset.scope, t.dataset.id, t.dataset.path, lv.valor);
    var ehItem = t.dataset.scope === 'item';
    if (ehItem && t.dataset.path === 'venda.precoVenda') {
      var iv = L.item(t.dataset.id);
      if (iv && iv.venda.modo !== 'PRECO_INFORMADO') { iv.venda.modo = 'PRECO_INFORMADO'; }
    }
    gravar();
    if (redesenhar) { rerender(); return; }
    if (ehItem) sincronizarPreco(t.dataset.id, t);
    atualizarVivo();
  }

  function onBlur(ev) {
    if (N.shell.atual.modulo !== 'lucro') return;
    var t = ev.target;
    var tipo = t.dataset && t.dataset.type;
    if (!tipo || NUMERICOS.indexOf(tipo) < 0) return;
    var v = F.parse(t.value);
    if (v === null || isNaN(v)) return;
    t.value = F.inputValue(v, tipo);
  }

  function rerender() {
    var ativo = document.activeElement;
    var chave = ativo && ativo.dataset && ativo.dataset.path ? [ativo.dataset.scope, ativo.dataset.id || '', ativo.dataset.path, ativo.type === 'radio' ? ativo.value : ''].join('|') : null;
    var y = window.scrollY;
    N.shell.render();
    window.scrollTo(0, y);
    if (chave) {
      var p = chave.split('|');
      var alvo = D.$$('[data-scope="' + p[0] + '"][data-path="' + p[2] + '"]').filter(function (x) { return (x.dataset.id || '') === p[1] && (!p[3] || x.value === p[3]); })[0];
      if (alvo) alvo.focus({ preventScroll: true });
    }
  }
  L.rerender = rerender;

  function ir(rota) { N.shell.navegar('lucro', rota); }

  // ------------------------------------------------------------------ ações
  var ACOES = {
    'lc-ir': function (ds) { ir(ds.rota); },
    'alternar-detalhe': function (ds, ev) {
      var b = ev && ev.target ? ev.target.closest('[data-acao="alternar-detalhe"]') : null;
      var aberto = !(b && b.getAttribute('aria-expanded') === 'true');
      L.abertos[ds.chave] = aberto;
      D.$$('[data-acao="alternar-detalhe"]').forEach(function (x) { if (x.getAttribute('data-chave') === ds.chave) x.setAttribute('aria-expanded', aberto ? 'true' : 'false'); });
      D.$$('[data-det]').forEach(function (x) { if (x.getAttribute('data-det') === ds.chave) x.hidden = !aberto; });
    },

    // ----- empresas (cadastro próprio do módulo)
    'lc-nova-empresa': function () {
      var e = novaEmpresa();
      L.d.empresas.push(e);
      L.d.ui.empresaEditando = e.id;
      L.d.ui.empresaId = e.id;
      e.__nova = true;
      gravar();
      if (N.shell.atual.rota !== 'empresas') ir('empresas'); else rerender();
      setTimeout(function () { var i = document.querySelector('[data-scope="emp"][data-path="razaoSocial"]'); if (i) i.focus(); }, 30);
    },
    'lc-editar-empresa': function (ds) { L.d.ui.empresaEditando = ds.id; L.d.ui.empresaId = ds.id; garantirSelecao(); gravar(); rerender(); },
    'lc-concluir-empresa': function () {
      var e = L.editando();
      if (e && !String(e.razaoSocial || '').trim()) { D.toast('Informe a razão social da empresa.', 'erro'); return; }
      if (e) delete e.__nova;
      L.d.ui.empresaEditando = null;
      gravar();
      D.toast('Empresa salva.');
      rerender();
    },
    'lc-cancelar-empresa': function () {
      var e = L.editando();
      if (e && e.__nova && !String(e.razaoSocial || '').trim()) L.d.empresas = L.d.empresas.filter(function (x) { return x.id !== e.id; });
      else if (e) delete e.__nova;
      L.d.ui.empresaEditando = null;
      garantirSelecao(); gravar(); rerender();
    },
    'lc-usar-empresa': function (ds) {
      L.d.ui.empresaId = ds.id; L.d.ui.analiseId = null; garantirSelecao();
      if (!L.analise()) { var an = novaAnalise(L.empresa()); L.d.analises.push(an); L.d.ui.analiseId = an.id; }
      gravar(); ir('parametros');
    },
    'lc-excluir-empresa': function (ds) {
      var e = L.empresa(ds.id);
      if (!e) return;
      var n = L.analisesDa(e.id).length;
      D.confirmar('Excluir empresa', 'Excluir "' + (e.razaoSocial || 'Empresa sem nome') + '"' + (n ? ' e suas ' + n + ' análise(s)' : '') + ' deste módulo? Esta ação não pode ser desfeita.', 'Excluir empresa', true).then(function (ok) {
        if (!ok) return;
        L.analisesDa(e.id).forEach(function (a) { excluidos(a.itens); });
        L.d.empresas = L.d.empresas.filter(function (x) { return x.id !== e.id; });
        L.d.analises = L.d.analises.filter(function (a) { return a.empresaId !== e.id; });
        if (L.d.ui.empresaEditando === e.id) L.d.ui.empresaEditando = null;
        garantirSelecao(); gravar(); D.toast('Empresa excluída.'); rerender();
      });
    },
    'lc-buscar-cnpj': function () {
      var e = L.editando();
      if (!e) return;
      if (!N.cnpja) { D.toast('Consulta de CNPJ indisponível.', 'erro'); return; }
      L.consultando = true; rerender();
      N.cnpja.consultar(e.cnpj).then(function (r) {
        L.consultando = false;
        e.razaoSocial = r.razaoSocial || e.razaoSocial;
        e.nomeFantasia = r.nomeFantasia || '';
        e.cnpj = F.cnpj(r.cnpj);
        if (r.endereco && r.endereco.uf) e.uf = r.endereco.uf;
        if (r.simples && r.simples.optante) e.regime = 'SIMPLES';
        e.receita = { situacao: r.situacao, cnae: r.cnaePrincipal, simples: r.simples, atualizadoEm: r.atualizadoEm, consultadoEm: r.consultadoEm };
        gravar(); rerender();
        D.toast('Dados da Receita Federal aplicados: ' + e.razaoSocial + '.');
        if (!(r.simples && r.simples.optante)) setTimeout(function () { D.toast('Não optante pelo Simples: confirme se o regime é Lucro Presumido ou Lucro Real.'); }, 400);
      }, function (err) { L.consultando = false; rerender(); D.toast(err.message, 'erro'); });
    },

    // ----- análises
    'lc-nova-analise': function () {
      var emp = L.empresa();
      if (!emp) { D.toast('Cadastre ou selecione uma empresa primeiro.', 'erro'); return; }
      var an = novaAnalise(emp);
      L.d.analises.push(an);
      L.d.ui.analiseId = an.id; L.d.ui.itemId = null;
      gravar(); D.toast('Nova análise criada.');
      if (N.shell.atual.rota === 'empresas') ir('compra'); else rerender();
    },
    'lc-renomear-analise': function () {
      var an = L.analise();
      if (!an) return;
      D.dialogo({ titulo: 'Renomear análise', campos: [{ rotulo: 'Nome da análise', valor: an.nome }], botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Salvar', valor: true, tipo: 'primary' }] }).then(function (v) {
        if (!v || !v[0].trim()) return;
        an.nome = v[0].trim(); tocar(an); gravar(); rerender();
      });
    },
    'lc-excluir-analise': function () {
      var an = L.analise();
      if (!an) return;
      D.confirmar('Excluir análise', 'Excluir a análise "' + an.nome + '"' + (an.itens.length ? ' e seus ' + an.itens.length + ' item(ns)' : '') + '?', 'Excluir análise', true).then(function (ok) {
        if (!ok) return;
        excluidos(an.itens);
        L.d.analises = L.d.analises.filter(function (a) { return a.id !== an.id; });
        L.d.ui.analiseId = null; garantirSelecao(); gravar(); rerender();
      });
    },

    // ----- itens
    'lc-novo-item': function () {
      var an = L.analise();
      if (!an) { D.toast('Crie uma análise primeiro.', 'erro'); return; }
      var it = novoItem(an);
      an.itens.push(it);
      L.d.ui.itemId = it.id;
      L.d.ui.itemAberto = it.id;
      tocar(an); gravar();
      if (N.shell.atual.rota !== 'compra') { L.manterFicha = true; ir('compra'); } else rerender();
      setTimeout(function () { var el = document.getElementById('lc-ficha-item'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); var i = el.querySelector('input'); if (i) i.focus({ preventScroll: true }); } }, 40);
    },
    'lc-abrir-item': function (ds) {
      L.d.ui.itemId = ds.id; L.d.ui.itemAberto = ds.id; gravar();
      if (N.shell.atual.rota !== 'compra') { L.manterFicha = true; ir('compra'); } else rerender();
      setTimeout(function () { var el = document.getElementById('lc-ficha-item'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 40);
    },
    'lc-fechar-item': function () { L.d.ui.itemAberto = null; gravar(); rerender(); },
    'lc-selecionar-item': function (ds) { if (!ds.id) return; L.d.ui.itemId = ds.id; gravar(); if (ds.rota && N.shell.atual.rota !== ds.rota) ir(ds.rota); else rerender(); },
    // filtro da tela Venda por situação; se o item aberto sair do filtro, abre o primeiro que ficou
    'lc-filtro-faixa': function (ds) {
      (L.filtroVenda = L.filtroVenda || { busca: '', faixa: 'todos' }).faixa = ds.faixa || 'todos';
      var lista = LC.views.vendaFiltrados ? LC.views.vendaFiltrados(L) : [];
      if (lista.length && !lista.some(function (x) { return x.item.id === L.d.ui.itemId; })) { L.d.ui.itemId = lista[0].item.id; gravar(); }
      rerender();
    },
    'lc-excluir-item': function (ds) {
      var an = L.analise(), it = L.item(ds.id);
      if (!an || !it) return;
      D.confirmar('Excluir item', 'Excluir "' + (it.codigo ? it.codigo + ' — ' : '') + (it.descricao || 'item sem descrição') + '" da análise?', 'Excluir item', true).then(function (ok) {
        if (!ok) return;
        excluidos([it]);
        an.itens = an.itens.filter(function (x) { return x.id !== it.id; });
        delete cache[it.id];
        if (L.d.ui.itemAberto === it.id) L.d.ui.itemAberto = null;
        garantirSelecao(); tocar(an); gravar(); rerender();
      });
    },
    // ----- relatório
    'lc-relatorio-pdf': function () { var o = LC.views.opcoesRelatorio(L); if (o) LC.relatorio.pdf(o); },
    'lc-relatorio-xlsx': function () { var o = LC.views.opcoesRelatorio(L); if (o) LC.relatorio.xlsx(o); },

    // ----- exclusão de itens em lote (as caixas aparecem ao clicar em "Selecionar produtos"; Cancelar esconde e desmarca)
    'lc-sel-modo': function () {
      var s = L.sel();
      s.ativo = !s.ativo;
      s.ids = {};
      rerender();
    },
    'lc-sel-todos': function () {
      var an = L.analise(), s = L.sel();
      if (!an) return;
      var todos = an.itens.length && an.itens.every(function (it) { return s.ids[it.id]; });
      s.ids = {};
      if (!todos) an.itens.forEach(function (it) { s.ids[it.id] = true; });
      rerender();
    },
    'lc-sel-origem': function () {
      var an = L.analise(), s = L.sel();
      if (!an) return;
      s.ids = {};
      an.itens.forEach(function (it) { if (it.origemModulo === 'rtc') s.ids[it.id] = true; });
      rerender();
    },
    'lc-excluir-lote': function () {
      var an = L.analise(), lista = L.selecionados();
      if (!an || !lista.length) return;
      D.confirmar('Excluir itens', 'Excluir ' + lista.length + ' item(ns) da análise "' + an.nome + '"? Esta ação não pode ser desfeita.' +
        (lista.some(function (it) { return it.origemModulo === 'rtc'; }) ? ' Os produtos vindos do RTC Comparativo continuam lá e não voltam para cá.' : ''), 'Excluir ' + lista.length + ' item(ns)', true).then(function (ok) {
        if (!ok) return;
        var ids = {};
        lista.forEach(function (it) { ids[it.id] = true; delete cache[it.id]; });
        excluidos(lista);
        an.itens = an.itens.filter(function (it) { return !ids[it.id]; });
        if (ids[L.d.ui.itemAberto]) L.d.ui.itemAberto = null;
        L.selecao.ids = {}; L.selecao.ativo = false;
        garantirSelecao(); tocar(an); gravar();
        D.toast(lista.length + ' item(ns) excluído(s).');
        rerender();
      });
    },
    'lc-aplicar-venda': function () {
      var an = L.analise();
      if (!an || !an.itens.length) return;
      D.confirmar('Aplicar a todos os itens', 'Aplicar o modo de preço, o markup, o desconto, a comissão e a taxa de cartão padrão a todos os ' + an.itens.length + ' itens? Preços informados item a item são mantidos quando o modo for "Preço informado"; no modo "Preço sem PIS/Cofins", o preço atual de cada item vira o preço de hoje.', 'Aplicar').then(function (ok) {
        if (!ok) return;
        var vp = an.vendaPadrao;
        an.itens.forEach(function (it) {
          var preco = it.venda.precoVenda;
          var hoje = Number(it.venda.precoAtual) > 0 ? it.venda.precoAtual : null;
          if (vp.modo === 'PRECO_SEM_PIS_COFINS' && hoje == null) { var r0 = L.resultado(it); hoje = r0 && !r0.erro ? r0.pv : preco; }
          it.venda = N.store.clone(vp);
          if (vp.modo === 'PRECO_INFORMADO') it.venda.precoVenda = preco;
          if (vp.modo === 'PRECO_SEM_PIS_COFINS') { it.venda.precoAtual = hoje; it.venda.precoVenda = preco; }
        });
        tocar(an); gravar(); D.toast('Venda padrão aplicada a ' + an.itens.length + ' itens.'); rerender();
      });
    },
    'lc-usar-padrao-trib': function (ds) {
      var it = L.item(ds.id);
      if (!it) return;
      it.trib = null; tocar(L.analise()); gravar(); rerender();
    },

    // ----- importação
    'lc-baixar-modelo': function () {
      D.baixar(LC.importar.modelo(), 'modelo-lucratividade-por-item.xlsx');
      D.toast('Modelo baixado: preencha as abas Compra e Tributação de venda.');
    },
    'lc-importar': function () {
      var an = L.analise();
      if (!an) { D.toast('Crie uma análise antes de importar.', 'erro'); return; }
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
      inp.onchange = function () {
        var f = inp.files[0];
        if (!f) return;
        N.rtc.planilha.lerArquivo(f).then(function (abas) {
          var r = LC.importar.processar(abas, an.itens);
          r.arquivo = f.name;
          L.importacao = r;
          rerender();
          setTimeout(function () { var el = document.getElementById('lc-importacao'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 40);
        }).catch(function (e) { D.toast(e && e.message ? e.message : 'Não foi possível ler a planilha.', 'erro'); });
      };
      inp.click();
    },
    'lc-confirmar-importacao': function () {
      var imp = L.importacao, an = L.analise();
      if (!imp || !an) return;
      var n = 0, nt = 0, np = 0;
      if (imp.compra) {
        imp.compra.itens.forEach(function (x, i) {
          var it = novoItem(an);
          it.codigo = x.codigo; it.descricao = x.descricao; it.ncm = x.ncm; it.quantidade = x.quantidade;
          it.compra = x.compra;
          // venda da planilha; o que vier vazio fica com a venda padrão da análise
          var v = x.venda || {};
          if (v.precoVenda != null) { it.venda.modo = 'PRECO_INFORMADO'; it.venda.precoVenda = v.precoVenda; np++; }
          if (v.comissao != null) it.venda.comissao = v.comissao;
          if (v.taxaCartao != null) it.venda.taxaCartao = v.taxaCartao;
          // tributação da venda: a da própria linha; sem ela, a da aba de tributação (pelo código ou NCM)
          var ap = imp.aplicacoes.filter(function (a) { return a.indice === i; })[0];
          if (x.cbsIbs) it.cbsIbs = N.store.clone(x.cbsIbs);
          if (x.trib) { it.trib = N.store.clone(x.trib); nt++; }
          else if (ap) { it.trib = N.store.clone(ap.trib); nt++; }
          an.itens.push(it);
          n++;
        });
      } else if (imp.tributacao) {
        imp.aplicacoes.forEach(function (a) { var it = an.itens[a.indice]; if (it) { it.trib = N.store.clone(a.trib); nt++; } });
      }
      L.importacao = null;
      garantirSelecao(); tocar(an); gravar();
      D.toast(imp.compra ? n + ' item(ns) importado(s); ' + np + ' com preço de venda' + (nt ? '; ' + nt + ' com tributação de venda' : '') + '.' : 'Tributação aplicada a ' + nt + ' item(ns).');
      rerender();
    },
    'lc-cancelar-importacao': function () { L.importacao = null; rerender(); }
  };
  L.acoes = ACOES;

  function onClick(ev) {
    if (N.shell.atual.modulo !== 'lucro') return;
    var b = ev.target.closest('[data-acao]');
    if (!b || b.disabled) return;
    var fn = ACOES[b.getAttribute('data-acao')];
    if (fn) { ev.preventDefault(); fn(b.dataset, ev); }
  }

  // ------------------------------------------------------------------ barra de contexto
  function contexto(rota) {
    garantirSelecao();
    var d = L.d;
    if (rota === 'empresas' || !d.empresas.length) return '';
    var emp = L.empresa();
    var ans = emp ? L.analisesDa(emp.id) : [];
    var an = L.analise();
    var p = an ? L.params(an) : (emp ? L.params(null) : null);
    var sobrescrito = an && an.regime && an.regime !== emp.regime;
    return '<div class="nx-ctx">' +
      '<label class="nx-ctx-field"><span>Empresa</span><span class="nx-input-wrap is-select"><select class="nx-input" data-scope="ui" data-path="empresaId" aria-label="Empresa">' +
        d.empresas.map(function (e) { return '<option value="' + esc(e.id) + '"' + (emp && e.id === emp.id ? ' selected' : '') + '>' + esc(e.razaoSocial || 'Empresa sem nome') + '</option>'; }).join('') + '</select></span></label>' +
      (p ? '<span class="nx-chip' + (sobrescrito ? ' is-on' : '') + '" title="' + (sobrescrito ? 'Regime sobrescrito nesta análise' : 'Regime da empresa') + '">' + esc(M.REGIMES[p.regime]) + (sobrescrito ? ' (simulação)' : '') + ' · ' + esc(p.uf || '—') + '</span>' : '') +
      '<label class="nx-ctx-field"><span>Análise</span><span class="nx-input-wrap is-select"><select class="nx-input" data-scope="ui" data-path="analiseId" aria-label="Análise">' +
        (ans.length ? ans.map(function (a) { return '<option value="' + esc(a.id) + '"' + (an && a.id === an.id ? ' selected' : '') + '>' + esc(a.nome) + ' (' + a.itens.length + (a.itens.length === 1 ? ' item' : ' itens') + ')</option>'; }).join('') : '<option value="">Nenhuma análise</option>') +
      '</select></span></label>' +
      U.segmento({ compacto: true, scope: 'mod', path: 'cenario', valor: L.cenario(), rotulo: 'Cenário', dica: 'Vale para todas as empresas e análises do módulo. 2026: ICMS + PIS/Cofins. 2027: ICMS + CBS e IBS por fora (LC 214/2025), com as regras do RTC Comparativo.',
        opcoes: [['2026', '2026', M.CENARIOS_INFO['2026']], ['2027', '2027', M.CENARIOS_INFO['2027']]] }) +
      '<div class="nx-ctx-actions">' + U.botao('Nova análise', 'lc-nova-analise', { classe: 'sm' }) +
        (an ? U.botao('Renomear', 'lc-renomear-analise', { classe: 'sm' }) + U.botao('Excluir análise', 'lc-excluir-analise', { classe: 'sm danger' }) : '') + '</div>' +
      '<div class="nx-ctx-summary" data-lc-live="ctx-resumo">' + LIVE['ctx-resumo'](L) + '</div>' +
      '</div>';
  }

  LIVE['ctx-resumo'] = function (L) {
    var lista = L.resultados();
    if (!lista.length) return '<span class="nx-muted">Cadastre ou importe os itens da compra.</span>';
    var t = M.totais(lista.map(function (x) { return x.r; }));
    if (!t.calculados) return '<span class="nx-muted">Informe o preço de venda dos itens.</span>';
    var p = L.params(L.analise());
    var alvo = p && p.margemAlvo != null ? Number(p.margemAlvo) / 100 : null;
    var faixa = t.lucro < 0 ? 'negativa' : alvo != null && t.margem < alvo ? 'abaixo' : 'ok';
    return '<span class="nx-ctx-k"><small>Lucro total</small><strong>' + F.brl(t.lucro) + '</strong></span>' +
      '<span class="nx-ctx-k"><small>Margem total</small><strong class="lc-faixa-txt is-' + faixa + '">' + F.pct(t.margem * 100) + '</strong></span>';
  };

  // ------------------------------------------------------------------ render
  function render(rota, el, info) {
    // integração: ao entrar numa tela, traz os produtos novos cadastrados no RTC Comparativo
    if (info && info.trocouRota && N.integracao) {
      var sync = N.integracao.puxar('lucro');
      if (sync && sync.novos) { cache = {}; setTimeout(function () { D.toast(N.integracao.mensagem(sync)); }, 50); }
    }
    garantirSelecao();
    if (info && info.trocouRota && rota === 'compra' && !L.manterFicha) L.d.ui.itemAberto = null; // ficha só abre ao clicar no item
    L.manterFicha = false;
    L.rota = rota;
    L.el = el;
    var v = LC.views[rota];
    el.innerHTML = v ? v.render(L) : '';
    var persist = document.getElementById('nx-persist');
    if (persist) persist.textContent = N.sync && N.sync.ativo() ? N.sync.rotulo() : (store.persistente ? 'Dados salvos neste navegador' : 'Armazenamento local indisponível');
  }

  function iniciar(shell) {
    [shell.els.content, shell.els.context].forEach(function (el) {
      el.addEventListener('input', onInput);
      el.addEventListener('change', onInput);
      el.addEventListener('click', onClick);
      el.addEventListener('focusout', onBlur);
    });
    // Enter na busca da tela Venda abre o primeiro item encontrado
    shell.els.content.addEventListener('keydown', function (ev) {
      if (N.shell.atual.modulo !== 'lucro' || ev.key !== 'Enter' || !ev.target.dataset || ev.target.dataset.lcFiltro !== 'busca') return;
      ev.preventDefault();
      var lista = LC.views.vendaFiltrados ? LC.views.vendaFiltrados(L) : [];
      if (lista.length) ACOES['lc-selecionar-item']({ id: lista[0].item.id });
    });
    garantirSelecao();
  }

  /** Estado vazio comum: sem empresa, sem análise ou (se exigeItens) sem itens */
  LC.views.semDados = function (L, exigeItens) {
    if (!L.d.empresas.length || !L.empresa()) {
      return U.vazio('Cadastre a primeira empresa', 'Este módulo tem cadastro próprio de empresas: informe regime e UF para calcular a lucratividade por item.', U.botao('Nova empresa', 'lc-nova-empresa', { tipo: 'primary' }));
    }
    if (!L.analise()) {
      return U.vazio('Nenhuma análise para ' + (L.empresa().razaoSocial || 'esta empresa'), 'Crie uma análise para reunir os itens de uma compra e simular a venda.', U.botao('Nova análise', 'lc-nova-analise', { tipo: 'primary' }));
    }
    if (exigeItens && !L.analise().itens.length) {
      return U.vazio('Nenhum item em "' + L.analise().nome + '"', 'Importe as planilhas de compra e tributação ou cadastre os itens um a um.',
        U.botao('Importar planilha', 'lc-importar', { tipo: 'primary' }) + U.botao('Cadastrar item', 'lc-novo-item') + U.botao('Baixar modelo', 'lc-baixar-modelo'));
    }
    return null;
  };

  N.shell.registrar({
    id: 'lucro',
    nome: 'Lucratividade por Item',
    curto: 'Lucratividade',
    descricao: 'Lucro e margem por item · custo líquido e preço',
    icone: 'lucro',
    resumo: 'Calcula, item a item, o lucro e a margem de uma venda: custo líquido de aquisição (já sem os créditos do regime) e preço líquido de tributos, comissões, taxas e descontos, com recálculo instantâneo ao mudar o preço.',
    rotas: [
      { id: 'empresas', nome: 'Empresas', titulo: 'Cadastro de empresas', icone: 'empresas', tag: 'Cadastro', desc: 'Cadastro próprio deste módulo' },
      { id: 'parametros', nome: 'Parâmetros', titulo: 'Parâmetros da empresa', icone: 'parametros', passo: '1', desc: 'Regime, UF, alíquotas e cenário' },
      { id: 'compra', nome: 'Compra', titulo: 'Compra — custo líquido por item', icone: 'custo', passo: '2', desc: 'Créditos e custo líquido de aquisição' },
      { id: 'venda', nome: 'Venda', titulo: 'Venda — preço e deduções do item', icone: 'preco', passo: '3', desc: 'Modo de preço, desconto, comissão e cartão' },
      { id: 'resultado', nome: 'Resultado', titulo: 'Resultado — lucro e margem', icone: 'comparativo', passo: '4', desc: 'Lucro e margem por item e no total' },
      { id: 'relatorio', nome: 'Relatório', titulo: 'Relatório da análise — PDF e Excel', icone: 'relatorio', passo: '5', desc: 'Resumo, resultado por item e DRE' }
    ],
    rotaPadrao: function () { return L.d.empresas.length ? (L.analise() && L.analise().itens.length ? 'resultado' : 'parametros') : 'empresas'; },
    resumoInicio: function (o) {
      var nItens = L.d.analises.reduce(function (s, a) { return s + a.itens.length; }, 0);
      var out = [
        { rotulo: 'Empresas', valor: String(L.d.empresas.length) },
        { rotulo: 'Análises', valor: String(L.d.analises.length) },
        { rotulo: 'Itens', valor: String(nItens) }
      ];
      // no painel de etapas o cenário tem seletor próprio (painelInicio)
      if (!(o && o.painel)) out.push({ rotulo: 'Cenário', valor: L.cenario() });
      return out;
    },
    /** Seletor do cenário no painel "Etapas do módulo" do menu inicial */
    painelInicio: function () {
      var c = L.cenario();
      function opc(v, tit, sub) {
        var on = c === v;
        return '<button type="button" class="lc-cen-opt' + (on ? ' is-on' : '') + '" data-inicio-mod="lucro" data-inicio-acao="cenario" data-valor="' + v + '" aria-pressed="' + on + '">' +
          '<b>' + tit + '</b><small>' + sub + '</small></button>';
      }
      return '<div class="lc-cenario-ini"><div class="lc-cenario-txt"><span class="nx-eyebrow">Cenário da simulação</span>' +
        '<p>Escolha o ano das regras tributárias. Vale para todas as empresas e análises do módulo e pode ser trocado a qualquer momento.</p></div>' +
        '<div class="lc-cen-opts" role="group" aria-label="Cenário da simulação">' +
          opc('2026', '2026 · regras atuais', 'ICMS + PIS e Cofins (ou DAS)') +
          opc('2027', '2027 · reforma tributária', 'ICMS + CBS e IBS por fora (LC 214/2025)') +
        '</div></div>';
    },
    acaoInicio: function (acao, ds) {
      if (acao !== 'cenario' || (ds.valor !== '2026' && ds.valor !== '2027')) return;
      L.d.cenario = ds.valor;
      gravar();
      D.toast('Cenário ' + ds.valor + ' selecionado: ' + M.CENARIOS_INFO[ds.valor] + '.');
    },
    iniciar: iniciar,
    render: render,
    contexto: contexto
  });
})(typeof window !== 'undefined' ? window : globalThis);

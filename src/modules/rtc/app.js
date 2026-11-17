/*
 * RTC Comparativo — controlador do módulo: estado persistente, vínculo dos formulários,
 * ações, recálculo ao vivo e registro no shell da plataforma Nexus.
 *
 * Estrutura: Empresa → Operações (A.d.simulacoes) → Produtos (operacao.itens).
 * Campos com data-scope="sim" referem-se ao PRODUTO ativo; data-scope="op", à operação.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};
  RTC.views = RTC.views || {};
  var U = RTC.ui;
  var D = N.dom;
  var esc = N.fmt.esc;

  function padrao() {
    return {
      versao: 2,
      empresas: [],
      simulacoes: [],          // operações
      parametros: {},          // { idParametro: { valor, status, nota, atualizadoEm } }
      paramsAtualizadoEm: null,
      aliquotasUF: {},         // { UF: { interna, fcp, fonte, atualizadoEm } }
      regras: [],              // regras cadastradas pelo usuário
      syncExcluidos: [],       // vínculos de produtos excluídos aqui (a integração com a Lucratividade não os traz de volta)
      ui: { empresaId: null, simulacaoId: null, empresaEditando: null, rascunhoEmpresa: null, produtoAberto: null, analise: '1', visao: 'consolidado', regraSelecionada: '', abaParametros: 'aliquotas' }
    };
  }

  var store = N.store.createStore('nexus.rtc.v1', padrao, 'rtc');

  var A = RTC.app = {
    store: store,
    get d() { return store.data; },
    res: null,      // resultado do produto ativo
    cons: null,     // consolidado da operação
    rota: null,
    el: null,

    /** Empresa ativa, empresa pelo id ou o rascunho de nova empresa */
    empresa: function (id) {
      var alvo = id || this.d.ui.empresaId;
      var e = this.d.empresas.filter(function (x) { return x.id === alvo; })[0];
      var r = this.d.ui.rascunhoEmpresa;
      if (!e && id && r && r.id === id) e = r;
      return e || null;
    },
    operacao: function () {
      var emp = this.empresa();
      if (!emp) return null;
      var id = this.d.ui.simulacaoId;
      return this.d.simulacoes.filter(function (x) { return x.id === id && x.empresaId === emp.id; })[0] || null;
    },
    /** Produto ativo da operação ativa */
    item: function () {
      var op = this.operacao();
      if (!op || !op.itens.length) return null;
      return op.itens.filter(function (it) { return it.id === op.itemAtivoId; })[0] || null;
    },
    simulacao: function () { return this.item(); },
    /** Produto cuja ficha está aberta no Cadastro da operação (null = apenas listas) */
    produtoAberto: function () {
      var op = this.operacao();
      var id = this.d.ui.produtoAberto;
      if (!op || !id) return null;
      return op.itens.filter(function (it) { return it.id === id; })[0] || null;
    },
    opsDaEmpresa: function (empId) {
      return this.d.simulacoes.filter(function (s) { return s.empresaId === empId; });
    },
    simsDaEmpresa: function (empId) { return this.opsDaEmpresa(empId); },
    opcoesCalculo: function () { return { parametros: this.d.parametros, aliquotasUF: this.d.aliquotasUF }; },
    calcular: function () {
      var emp = this.empresa(), op = this.operacao(), it = this.item();
      this.cons = emp && op ? RTC.consolidar(emp, op, this.opcoesCalculo()) : null;
      var x = this.cons && it ? this.cons.itens.filter(function (i) { return i.item.id === it.id; })[0] : null;
      this.res = x ? x.r : RTC.engine.calcular(emp, it, this.opcoesCalculo());
      return this.res;
    },
    /** Resultado de um produto da operação (por id) */
    resultadoItem: function (itemId) {
      var x = this.cons ? this.cons.itens.filter(function (i) { return i.item.id === itemId; })[0] : null;
      return x || null;
    },
    paramsValores: function () { return RTC.params.valores(this.d.parametros); },
    ultimaAtualizacaoParams: function () { return this.d.paramsAtualizadoEm || RTC.params.DATA_BASE + 'T00:00:00'; }
  };

  // ------------------------------------------------------------------ migração e consistência
  function migrar() {
    var d = A.d;
    var mudou = false;
    d.simulacoes = d.simulacoes.map(function (s) {
      if (Array.isArray(s.itens)) return s;
      mudou = true;
      return RTC.model.migrarOperacao(s);
    });
    d.simulacoes.forEach(function (s) { s.itens.forEach(function (it) {
      if (RTC.model.migrarAntecipacao(it)) mudou = true;
      if (RTC.model.migrarBasePreco(it)) mudou = true;
    }); });
    if (d.versao !== 2) { d.versao = 2; mudou = true; }
    if (mudou) store.save();
  }

  function garantirSelecao() {
    migrar();
    var d = A.d;
    if (d.ui.empresaId && !A.empresa()) d.ui.empresaId = null;
    if (!d.ui.empresaId && d.empresas.length) d.ui.empresaId = d.empresas[0].id;
    var emp = A.empresa();
    if (emp) {
      var ops = A.opsDaEmpresa(emp.id);
      if (!ops.some(function (s) { return s.id === d.ui.simulacaoId; })) {
        d.ui.simulacaoId = ops.length ? ops[ops.length - 1].id : null;
      }
    } else {
      d.ui.simulacaoId = null;
    }
    var op = A.operacao();
    if (op && op.itens.length && !op.itens.some(function (it) { return it.id === op.itemAtivoId; })) {
      op.itemAtivoId = op.itens[0].id;
    }
    if (d.ui.produtoAberto && !(op && op.itens.some(function (it) { return it.id === d.ui.produtoAberto; }))) d.ui.produtoAberto = null;
    if (d.ui.visao && d.ui.visao !== 'consolidado' && !(op && op.itens.some(function (it) { return it.id === d.ui.visao; }))) {
      d.ui.visao = 'consolidado';
    }
  }

  function novaOperacao(nome) {
    var emp = A.empresa();
    if (!emp) return null;
    var op = RTC.model.novaOperacao(emp, nome || ('Operação ' + (A.opsDaEmpresa(emp.id).length + 1)));
    A.d.simulacoes.push(op);
    A.d.ui.simulacaoId = op.id;
    store.save();
    return op;
  }

  function tocar(op) { if (op) op.atualizadoEm = new Date().toISOString(); }
  /** Produtos excluídos: o vínculo fica guardado para a integração com a Lucratividade não trazê-los de volta */
  function excluidos(itens) { if (N.integracao) N.integracao.registrarExclusao(A.d, itens); }

  /** Seleção de produtos para exclusão em lote (por operação; não é gravada); ativo: caixas visíveis ("Selecionar produtos") */
  A.selecao = { opId: null, ids: {}, ativo: false };
  function selecao() {
    var op = A.operacao();
    if (!op || A.selecao.opId !== op.id) A.selecao = { opId: op ? op.id : null, ids: {}, ativo: false };
    return A.selecao;
  }
  A.selecionados = function () {
    var op = A.operacao(), s = selecao();
    return op ? op.itens.filter(function (it) { return s.ids[it.id]; }) : [];
  };

  // ------------------------------------------------------------------ escrita de valores
  function set(scope, id, path, val) {
    var d = A.d;
    var agora = new Date().toISOString();
    if (scope === 'sim') {
      var s = A.item();
      if (!s) return;
      var opAt = A.operacao();
      if (RTC.model.CAMPOS_OPERACAO.indexOf(path) >= 0 && opAt) {
        var ajustados = RTC.model.aplicarCampoOperacao(opAt, path, val, A.empresa());
        if (opAt.itens.length > 1 || ajustados) {
          D.toast('Natureza da operação aplicada a ' + opAt.itens.length + ' produto(s)' + (ajustados ? '; ' + ajustados + ' CFOP(s) ajustado(s)' : '') + '.');
        }
      } else if (path === 'venda.basePreco') {
        RTC.model.aplicarBasePreco(s, val);
      } else if (path === 'venda.precoUnitarioAtual') {
        // mantém o preço total coerente com o unitário (quantidade × unitário)
        s.venda.precoUnitarioAtual = val;
        var qtdU = Number(s.produto.quantidade);
        s.venda.precoAtual = val != null && qtdU > 0 ? Math.round(val * qtdU * 100) / 100 : null;
      } else {
        N.store.setPath(s, path, val);
      }
      s.origens = s.origens || {};
      s.origens[path] = 'usuario';
      s.atualizadoEm = agora;
      tocar(opAt);
      if (path === 'perfil.resumo') {
        var regra = RTC.rules.porId(RTC.rules.REGRA_DO_RESUMO[val], d.regras);
        if (regra) { RTC.rules.aplicar(s, regra); D.toast('Regra aplicada: ' + regra.nome); }
      }
    } else if (scope === 'itens') {
      // campo aplicado a todos os produtos da operação (visão "Operação completa")
      var opI = A.operacao();
      if (!opI) return;
      opI.itens.forEach(function (it) {
        if (path === 'venda.basePreco') RTC.model.aplicarBasePreco(it, val);
        else N.store.setPath(it, path, val);
        it.origens = it.origens || {};
        it.origens[path] = 'usuario';
        it.atualizadoEm = agora;
      });
      tocar(opI);
    } else if (scope === 'op') {
      var op = A.operacao();
      if (!op) return;
      N.store.setPath(op, path, val);
      if (path !== 'itemAtivoId') tocar(op);
    } else if (scope === 'emp') {
      var e = A.empresa(id);
      if (!e) return;
      N.store.setPath(e, path, val);
      if (e.origens && e.origens[path]) e.origens[path] = 'usuario';
      e.atualizadoEm = agora;
      if (path === 'uf') {
        // completa as UFs dos produtos que ainda estavam vazias
        A.opsDaEmpresa(e.id).forEach(function (o) {
          o.itens.forEach(function (it) {
            if (!it.operacao.ufOrigem) it.operacao.ufOrigem = val;
            if (!it.operacao.ufDestino) it.operacao.ufDestino = val;
          });
        });
      }
    } else if (scope === 'param') {
      var p = d.parametros[id] = d.parametros[id] || {};
      p[path] = val;
      if (path === 'valor' && !p.status) p.status = 'informado';
      p.atualizadoEm = agora;
      d.paramsAtualizadoEm = agora;
    } else if (scope === 'uf') {
      var u = d.aliquotasUF[id] = d.aliquotasUF[id] || {};
      u[path] = val;
      u.atualizadoEm = agora;
      d.paramsAtualizadoEm = agora;
    } else if (scope === 'ui') {
      N.store.setPath(d.ui, path, val);
      if (path === 'detalhes') A.abertos = {}; // a escolha geral vale para todas as linhas
      if (path === 'visao' && val && val !== 'consolidado' && A.operacao()) A.operacao().itemAtivoId = val;
    } else if (scope === 'ctx') {
      if (path === 'empresaId') { d.ui.empresaId = val; d.ui.simulacaoId = null; d.ui.visao = 'consolidado'; garantirSelecao(); }
      if (path === 'simulacaoId') { d.ui.simulacaoId = val; d.ui.visao = 'consolidado'; }
    }
    store.save();
  }

  var NUMERICOS = ['money', 'pct', 'num', 'int', 'unit'];

  function lerValor(t) {
    var tipo = t.dataset.type;
    var val;
    if (t.type === 'checkbox') val = t.checked;
    else if (NUMERICOS.indexOf(tipo) >= 0) {
      val = N.fmt.parse(t.value);
      if (val !== null && isNaN(val)) return { invalido: true };
      if (tipo === 'int' && val !== null) val = Math.round(val);
    } else val = t.value;
    if (t.dataset.cast === 'bool') val = val === true || val === 'true';
    if (t.dataset.cast === 'num') val = val === '' || val == null ? null : Number(val);
    return { valor: val };
  }

  function marcarInvalido(t, msg) {
    var f = t.closest('.nx-field');
    if (!f) return;
    f.classList.toggle('is-invalid', !!msg);
    var e = f.querySelector('.nx-err');
    if (e && msg) e.textContent = msg;
  }

  var timerVivo = null;
  function agendarVivo() {
    clearTimeout(timerVivo);
    timerVivo = setTimeout(atualizarVivo, 90);
  }

  function atualizarVivo() {
    A.calcular();
    var v = RTC.views[A.rota] || {};
    D.$$('[data-live]').forEach(function (node) {
      var k = node.getAttribute('data-live');
      var fn = (v.live && v.live[k]) || LIVE_GLOBAL[k];
      if (fn) node.innerHTML = fn(A);
    });
    if (v.depoisVivo) v.depoisVivo(A.el, A);
    marcarCampos();
  }

  /** Mostra erros e avisos do motor junto aos campos do produto ativo. */
  function marcarCampos() {
    var r = A.res || { erros: [], avisos: [] };
    var mapa = {};
    (r.erros || []).forEach(function (e) { if (e.campo) mapa[e.campo] = mapa[e.campo] || { tipo: 'erro', msg: e.msg }; });
    (r.avisos || []).forEach(function (a) { if (a.campo && !mapa[a.campo] && a.nivel !== 'info') mapa[a.campo] = { tipo: 'aviso', msg: a.msg }; });
    D.$$('.nx-field[data-field^="sim:"]').forEach(function (f) {
      if (f.classList.contains('is-invalid')) return;
      var path = f.getAttribute('data-field').slice(4);
      var m = mapa[path];
      f.classList.toggle('has-error', !!(m && m.tipo === 'erro'));
      f.classList.toggle('has-warn', !!(m && m.tipo === 'aviso'));
      var e = f.querySelector('.nx-err');
      if (e) e.textContent = m ? m.msg : '';
    });
  }

  /** CFOP fora da natureza da operação é recusado (não é gravado) */
  function cfopBloqueado(t) {
    var path = t.dataset.path;
    if (t.dataset.scope !== 'sim' || (path !== 'produto.cfopEntrada' && path !== 'produto.cfopSaida')) return null;
    var it = A.item();
    if (!it) return null;
    var dig = N.fmt.onlyDigits(t.value);
    if (!dig) return null;
    var esp = RTC.model.cfopEsperado(it, A.empresa());
    var alvo = path === 'produto.cfopEntrada' ? esp.entrada : esp.saida;
    if (!alvo || dig[0] === alvo) return null;
    var op = A.operacao();
    var ref = op && op.itens.length > 1 ? ' (mesma natureza dos demais produtos)' : '';
    return path === 'produto.cfopEntrada'
      ? 'Bloqueado: esta operação é ' + esp.natureza.toLowerCase() + ref + ' — o CFOP de entrada deve iniciar por ' + alvo + ' (ex.: ' + alvo + '.102).'
      : 'Bloqueado: a venda é ' + (esp.vendaInter ? 'interestadual' : 'interna') + ref + ' — o CFOP de saída deve iniciar por ' + alvo + ' (ex.: ' + alvo + '.102).';
  }

  /** Os eventos só valem com este módulo na tela (a área de conteúdo é compartilhada com os demais módulos) */
  function moduloAtivo() { return N.shell.atual.modulo === 'rtc'; }

  function onInput(ev) {
    if (!moduloAtivo()) return;
    var t = ev.target;
    // caixa de seleção de produto (exclusão em lote)
    if (t.dataset && t.dataset.rtcSel && ev.type === 'change') {
      var s = selecao();
      if (t.checked) s.ids[t.dataset.rtcSel] = true; else delete s.ids[t.dataset.rtcSel];
      rerender();
      return;
    }
    if (!t.dataset || !t.dataset.path) return;
    var estrutural = t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'radio';
    if (ev.type === 'input' && estrutural) return;
    if (ev.type === 'change' && !estrutural && !t.dataset.rerender) return;
    if (t.type === 'radio' && !t.checked) return;
    var bloq = cfopBloqueado(t);
    if (bloq) { marcarInvalido(t, bloq); t.dataset.bloqueado = '1'; return; }
    if (t.dataset.bloqueado) delete t.dataset.bloqueado;
    var lv = lerValor(t);
    if (lv.invalido) { marcarInvalido(t, 'Número inválido. Use o formato 1.234,56.'); return; }
    marcarInvalido(t, null);
    set(t.dataset.scope, t.dataset.id, t.dataset.path, lv.valor);
    if (estrutural || t.dataset.rerender) rerender();
    else agendarVivo();
  }

  function onBlur(ev) {
    if (!moduloAtivo()) return;
    var t = ev.target;
    if (t.dataset && t.dataset.bloqueado) {
      // restaura o último CFOP válido e mantém a mensagem de bloqueio visível
      var atual = A.item() ? N.store.getPath(A.item(), t.dataset.path) : '';
      t.value = atual || '';
      delete t.dataset.bloqueado;
      D.toast('CFOP recusado: incompatível com a natureza da operação.', 'erro');
      return;
    }
    if (t.dataset && t.dataset.scope === 'emp' && t.dataset.path === 'cnpj') {
      var emp = fichaEmpresa();
      var dig = N.fmt.onlyDigits(t.value);
      if (emp && !emp.razaoSocial && dig.length === 14 && N.fmt.cnpjValido(dig) && !A.consultandoCnpj) ACOES['buscar-cnpj']({ auto: '1' });
      return;
    }
    var tipo = t.dataset && t.dataset.type;
    if (!tipo || NUMERICOS.indexOf(tipo) < 0) return;
    var v = N.fmt.parse(t.value);
    if (v === null || isNaN(v)) return;
    t.value = N.fmt.inputValue(v, tipo);
  }

  /** Re-renderiza a rota atual preservando rolagem e foco. */
  function rerender() {
    var ativo = document.activeElement;
    var chave = ativo && ativo.dataset && ativo.dataset.path ? (ativo.dataset.scope + '|' + (ativo.dataset.id || '') + '|' + ativo.dataset.path + '|' + (ativo.type === 'radio' ? ativo.value : '')) : null;
    var y = window.scrollY;
    N.shell.render();
    window.scrollTo(0, y);
    if (chave) {
      var p = chave.split('|');
      var sel = '[data-scope="' + p[0] + '"][data-path="' + p[2] + '"]' + (p[1] ? '[data-id="' + p[1] + '"]' : '') + (p[3] ? '[value="' + p[3] + '"]' : '');
      var novo = document.querySelector(sel);
      if (novo) novo.focus({ preventScroll: true });
    }
  }
  A.rerender = rerender;

  function focar(seletor, rolar) {
    setTimeout(function () {
      var el = document.querySelector(seletor);
      if (!el) return;
      if (rolar) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var campo = el.matches('input,select,textarea') ? el : el.querySelector('input,select,textarea');
      if (campo) campo.focus({ preventScroll: !!rolar });
    }, 40);
  }

  function validarEmpresa(e) {
    var faltas = [];
    if (!e.razaoSocial || !String(e.razaoSocial).trim()) faltas.push('razão social');
    if (!e.uf) faltas.push('UF');
    return faltas;
  }

  /** Empresa com a ficha aberta: rascunho de nova empresa ou empresa em edição */
  function fichaEmpresa() {
    if (A.d.ui.rascunhoEmpresa) return A.d.ui.rascunhoEmpresa;
    return A.d.ui.empresaEditando ? A.empresa(A.d.ui.empresaEditando) : null;
  }

  // ------------------------------------------------------------------ ações
  var ACOES = {
    'ir': function (ds) { N.shell.navegar('rtc', ds.rota); },

    // ----- empresas
    'nova-empresa': function () {
      A.d.ui.rascunhoEmpresa = RTC.model.novaEmpresa();
      A.d.ui.empresaEditando = null;
      store.save();
      if (A.rota !== 'empresas') N.shell.navegar('rtc', 'empresas'); else rerender();
      focar('[data-scope="emp"][data-path="razaoSocial"]', true);
    },
    'salvar-empresa': function () {
      var r = A.d.ui.rascunhoEmpresa;
      if (!r) return;
      var faltas = validarEmpresa(r);
      if (faltas.length) { D.toast('Para salvar, informe: ' + faltas.join(' e ') + '.', 'erro'); return; }
      r.criadoEm = r.atualizadoEm = new Date().toISOString();
      A.d.empresas.push(r);
      A.d.ui.empresaId = r.id;
      A.d.ui.simulacaoId = null;
      A.d.ui.rascunhoEmpresa = null;
      A.d.ui.empresaEditando = null;
      store.save();
      D.toast('Empresa cadastrada.');
      rerender();
    },
    'cancelar-empresa': function () {
      var r = A.d.ui.rascunhoEmpresa;
      function descartar() { A.d.ui.rascunhoEmpresa = null; store.save(); rerender(); }
      if (r && r.razaoSocial) {
        D.confirmar('Descartar cadastro', 'Descartar o cadastro de "' + r.razaoSocial + '"? Os dados digitados não serão salvos.', 'Descartar', true).then(function (ok) { if (ok) descartar(); });
      } else descartar();
    },
    'editar-empresa': function (ds) {
      function abrir() {
        A.d.ui.rascunhoEmpresa = null;
        A.d.ui.empresaEditando = ds.id; A.d.ui.empresaId = ds.id; A.d.ui.simulacaoId = null;
        garantirSelecao(); store.save(); rerender();
        focar('[data-scope="emp"][data-path="razaoSocial"]', true);
      }
      var r = A.d.ui.rascunhoEmpresa;
      if (r && r.razaoSocial) {
        D.confirmar('Cadastro em andamento', 'Descartar o cadastro de "' + r.razaoSocial + '" para editar outra empresa?', 'Descartar e editar', true).then(function (ok) { if (ok) abrir(); });
      } else abrir();
    },
    // consulta o CNPJ na API pública da CNPJá e preenche a ficha com os dados da Receita Federal
    'buscar-cnpj': function (ds) {
      var e = fichaEmpresa();
      if (!e) return;
      var dig = N.fmt.onlyDigits(e.cnpj);
      if (dig.length !== 14 || !N.fmt.cnpjValido(dig)) { D.toast('Informe um CNPJ válido (14 dígitos) para buscar na Receita.', 'erro'); focar('[data-scope="emp"][data-path="cnpj"]'); return; }
      if (A.consultandoCnpj) return;
      A.consultandoCnpj = true;
      rerender();
      N.cnpja.consultar(dig, { forcar: ds && ds.forcar === '1' }).then(function (dados) {
        A.consultandoCnpj = false;
        function aplicar() {
          var r = RTC.model.aplicarReceita(e, dados);
          store.save();
          rerender();
          D.toast('Dados da Receita Federal aplicados: ' + dados.razaoSocial + '.');
          r.avisos.forEach(function (m, i) { setTimeout(function () { D.toast(m, /não é optante|Situação|SIMEI/.test(m) ? 'erro' : 'ok'); }, 400 * (i + 1)); });
        }
        var atual = (e.razaoSocial || '').trim().toLowerCase();
        if (atual && atual !== String(dados.razaoSocial || '').trim().toLowerCase()) {
          rerender();
          D.confirmar('Substituir dados cadastrais', 'A Receita informa a razão social "' + dados.razaoSocial + '" para este CNPJ, diferente de "' + e.razaoSocial + '". Substituir razão social, nome fantasia, UF, município e enquadramento pelos dados da Receita?', 'Substituir').then(function (ok) { if (ok) aplicar(); });
        } else aplicar();
      }, function (err) {
        A.consultandoCnpj = false;
        rerender();
        D.toast(err.message, 'erro');
      });
    },
    'concluir-empresa': function () {
      var e = A.empresa(A.d.ui.empresaEditando);
      if (e) {
        var faltas = validarEmpresa(e);
        if (faltas.length) { D.toast('Informe: ' + faltas.join(' e ') + '.', 'erro'); return; }
      }
      A.d.ui.empresaEditando = null;
      store.save();
      D.toast('Cadastro da empresa atualizado.');
      rerender();
    },
    'usar-empresa': function (ds) {
      A.d.ui.empresaId = ds.id; A.d.ui.simulacaoId = null; A.d.ui.visao = 'consolidado'; garantirSelecao();
      if (!A.operacao()) novaOperacao();
      store.save();
      N.shell.navegar('rtc', 'operacao');
    },
    'excluir-empresa': function (ds) {
      var e = A.d.empresas.filter(function (x) { return x.id === ds.id; })[0];
      if (!e) return;
      var n = A.opsDaEmpresa(e.id).length;
      D.confirmar('Excluir empresa', 'Excluir o cadastro de "' + (e.razaoSocial || 'Empresa sem nome') + '"' + (n ? ' e suas ' + n + ' operação(ões)' : '') + '? Esta ação não pode ser desfeita.', 'Excluir empresa', true).then(function (ok) {
        if (!ok) return;
        A.opsDaEmpresa(e.id).forEach(function (op) { excluidos(op.itens); });
        A.d.empresas = A.d.empresas.filter(function (x) { return x.id !== e.id; });
        A.d.simulacoes = A.d.simulacoes.filter(function (x) { return x.empresaId !== e.id; });
        if (A.d.ui.empresaEditando === e.id) A.d.ui.empresaEditando = null;
        garantirSelecao();
        store.save();
        D.toast('Empresa excluída.');
        rerender();
      });
    },

    // ----- operações
    'nova-operacao': function () {
      if (!A.empresa()) { D.toast('Cadastre ou selecione uma empresa primeiro.', 'erro'); return; }
      novaOperacao();
      A.d.ui.visao = 'consolidado';
      A.d.ui.produtoAberto = null;
      store.save();
      D.toast('Nova operação criada. Cadastre os produtos.');
      if (A.rota !== 'operacao') N.shell.navegar('rtc', 'operacao'); else rerender();
    },
    'abrir-operacao': function (ds) {
      var s = A.d.simulacoes.filter(function (x) { return x.id === ds.id; })[0];
      if (!s) return;
      A.d.ui.empresaId = s.empresaId; A.d.ui.simulacaoId = s.id; A.d.ui.visao = 'consolidado'; A.d.ui.produtoAberto = null; store.save();
      if (A.rota !== 'operacao') N.shell.navegar('rtc', 'operacao'); else rerender();
    },
    'duplicar-operacao': function () {
      var s = A.operacao();
      if (!s) return;
      var c = N.store.clone(s);
      c.id = N.store.uid('sim');
      c.nome = s.nome + ' (cópia)';
      c.criadoEm = c.atualizadoEm = new Date().toISOString();
      delete c.sync;
      c.itens.forEach(function (it) { var antigo = it.id; it.id = N.store.uid('item'); delete it.sync; delete it.origemModulo; if (c.itemAtivoId === antigo) c.itemAtivoId = it.id; });
      A.d.simulacoes.push(c);
      A.d.ui.simulacaoId = c.id;
      store.save();
      D.toast('Operação duplicada.');
      rerender();
    },
    'renomear-operacao': function (ds) {
      var s = ds && ds.id ? A.d.simulacoes.filter(function (x) { return x.id === ds.id; })[0] : A.operacao();
      if (!s) return;
      D.dialogo({ titulo: 'Renomear operação', campos: [{ rotulo: 'Nome da operação', valor: s.nome }], botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Salvar', valor: true, tipo: 'primary' }] }).then(function (v) {
        if (!v || !v[0].trim()) return;
        s.nome = v[0].trim(); tocar(s); store.save(); rerender();
      });
    },
    'excluir-operacao': function (ds) {
      var id = ds && ds.id ? ds.id : (A.operacao() && A.operacao().id);
      var s = A.d.simulacoes.filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      D.confirmar('Excluir operação', 'Excluir a operação "' + s.nome + '"' + (s.itens.length ? ' e seus ' + s.itens.length + ' produto(s)' : '') + '? Esta ação não pode ser desfeita.', 'Excluir operação', true).then(function (ok) {
        if (!ok) return;
        excluidos(s.itens);
        A.d.simulacoes = A.d.simulacoes.filter(function (x) { return x.id !== s.id; });
        if (A.d.ui.simulacaoId === s.id) A.d.ui.simulacaoId = null;
        garantirSelecao(); store.save(); D.toast('Operação excluída.'); rerender();
      });
    },

    // ----- produtos da operação
    'cadastrar-produto': function () {
      var op = A.operacao();
      if (!op) { novaOperacao(); op = A.operacao(); }
      if (!op) return;
      var it = RTC.model.novoItemNaOperacao(op, A.empresa());
      op.itens.push(it);
      op.itemAtivoId = it.id;
      A.d.ui.produtoAberto = it.id;
      tocar(op);
      if (op.itens.length > 1) D.toast('Novo produto com a natureza da operação: ' + RTC.model.naturezaTexto(op, A.empresa()) + '.');
      store.save();
      if (A.rota !== 'operacao') N.shell.navegar('rtc', 'operacao'); else rerender();
      focar('#nx-produto-ativo', true);
    },
    'selecionar-produto': function (ds) {
      var op = A.operacao();
      if (!op) return;
      op.itemAtivoId = ds.id;
      if (A.rota === 'operacao') A.d.ui.produtoAberto = ds.id;
      else A.d.ui.visao = ds.id; // custo, preço e comparativo passam a analisar este produto
      store.save();
      rerender();
      if (A.rota === 'operacao') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    'duplicar-produto': function (ds) {
      var op = A.operacao();
      if (!op) return;
      var orig = op.itens.filter(function (x) { return x.id === ds.id; })[0];
      if (!orig) return;
      var c = RTC.model.duplicarItem(orig);
      op.itens.splice(op.itens.indexOf(orig) + 1, 0, c);
      op.itemAtivoId = c.id;
      if (A.rota === 'operacao') A.d.ui.produtoAberto = c.id;
      tocar(op);
      store.save();
      D.toast('Produto duplicado: revise descrição, quantidade e valores.');
      rerender();
      focar('#nx-produto-ativo', true);
    },
    'excluir-produto': function (ds) {
      var op = A.operacao();
      if (!op) return;
      var idx = -1;
      op.itens.forEach(function (x, i) { if (x.id === ds.id) idx = i; });
      if (idx < 0) return;
      var nome = RTC.model.nomeItem(op.itens[idx], idx);
      D.confirmar('Excluir produto', 'Excluir "' + nome + '" desta operação?', 'Excluir produto', true).then(function (ok) {
        if (!ok) return;
        excluidos([op.itens[idx]]);
        op.itens.splice(idx, 1);
        if (op.itemAtivoId === ds.id) op.itemAtivoId = op.itens.length ? op.itens[Math.max(0, idx - 1)].id : null;
        if (A.d.ui.produtoAberto === ds.id) A.d.ui.produtoAberto = null;
        if (A.d.ui.visao === ds.id) A.d.ui.visao = 'consolidado';
        tocar(op);
        store.save();
        D.toast('Produto excluído.');
        rerender();
      });
    },
    // ----- exclusão de produtos em lote (as caixas aparecem ao clicar em "Selecionar produtos"; Cancelar esconde e desmarca)
    'sel-modo-produtos': function () {
      var s = selecao();
      s.ativo = !s.ativo;
      s.ids = {};
      rerender();
    },
    'sel-todos-produtos': function () {
      var op = A.operacao(), s = selecao();
      if (!op) return;
      var todos = op.itens.length && op.itens.every(function (it) { return s.ids[it.id]; });
      s.ids = {};
      if (!todos) op.itens.forEach(function (it) { s.ids[it.id] = true; });
      rerender();
    },
    'sel-produtos-origem': function () {
      var op = A.operacao(), s = selecao();
      if (!op) return;
      s.ids = {};
      op.itens.forEach(function (it) { if (it.origemModulo === 'lucro') s.ids[it.id] = true; });
      rerender();
    },
    'excluir-produtos-lote': function () {
      var op = A.operacao(), lista = A.selecionados();
      if (!op || !lista.length) return;
      D.confirmar('Excluir produtos', 'Excluir ' + lista.length + ' produto(s) da operação "' + op.nome + '"? Esta ação não pode ser desfeita.' +
        (lista.some(function (it) { return it.origemModulo === 'lucro'; }) ? ' Os produtos vindos da Lucratividade por Item continuam lá e não voltam para cá.' : ''), 'Excluir ' + lista.length + ' produto(s)', true).then(function (ok) {
        if (!ok) return;
        var ids = {};
        lista.forEach(function (it) { ids[it.id] = true; });
        excluidos(lista);
        op.itens = op.itens.filter(function (it) { return !ids[it.id]; });
        if (ids[op.itemAtivoId]) op.itemAtivoId = op.itens.length ? op.itens[0].id : null;
        if (ids[A.d.ui.produtoAberto]) A.d.ui.produtoAberto = null;
        if (ids[A.d.ui.visao]) A.d.ui.visao = 'consolidado';
        A.selecao.ids = {}; A.selecao.ativo = false;
        tocar(op); store.save();
        D.toast(lista.length + ' produto(s) excluído(s).');
        rerender();
      });
    },
    'fechar-produto': function () {
      A.d.ui.produtoAberto = null;
      store.save();
      rerender();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ----- perfil tributário do produto
    'aplicar-regra': function () {
      var s = A.item();
      var regra = RTC.rules.porId(A.d.ui.regraSelecionada, A.d.regras);
      if (!s || !regra) { D.toast('Selecione uma regra cadastrada.', 'erro'); return; }
      RTC.rules.aplicar(s, regra);
      s.atualizadoEm = new Date().toISOString();
      store.save();
      D.toast('Regra aplicada: ' + regra.nome);
      rerender();
    },
    'salvar-regra': function () {
      var s = A.item();
      if (!s) return;
      D.dialogo({ titulo: 'Salvar perfil tributário como regra', texto: 'A regra guarda os tratamentos e alíquotas informados neste perfil para reutilização em outros produtos.', campos: [{ rotulo: 'Nome da regra', valor: s.produto.ncm ? 'NCM ' + s.produto.ncm : '' }, { rotulo: 'Descrição / fundamento legal', valor: '', multilinha: true }], botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Salvar regra', valor: true, tipo: 'primary' }] }).then(function (v) {
        if (!v || !v[0].trim()) return;
        var r = RTC.rules.criarDoPerfil(s, v[0].trim(), v[1]);
        A.d.regras.push(r);
        s.perfil.regraId = r.id;
        A.d.ui.regraSelecionada = r.id;
        store.save();
        D.toast('Regra salva.');
        rerender();
      });
    },
    'excluir-regra': function (ds) {
      D.confirmar('Excluir regra', 'Excluir a regra cadastrada?', 'Excluir', true).then(function (ok) {
        if (!ok) return;
        A.d.regras = A.d.regras.filter(function (r) { return r.id !== ds.id; });
        store.save(); rerender();
      });
    },
    'add-despesa': function () {
      var s = A.item(); if (!s) return;
      s.venda.despesas.push({ descricao: '', pct: null });
      store.save(); rerender();
    },
    'rm-despesa': function (ds) {
      var s = A.item(); if (!s) return;
      s.venda.despesas.splice(+ds.idx, 1);
      store.save(); rerender();
    },

    // ----- parâmetros e dados
    'restaurar-param': function (ds) {
      delete A.d.parametros[ds.id];
      A.d.paramsAtualizadoEm = new Date().toISOString();
      store.save(); D.toast('Parâmetro restaurado ao padrão.'); rerender();
    },
    'restaurar-params': function () {
      D.confirmar('Restaurar parâmetros', 'Restaurar todas as alíquotas e limites aos valores padrão da base ' + RTC.params.VERSAO_BASE + '? As alíquotas internas por UF e as regras não são afetadas.', 'Restaurar').then(function (ok) {
        if (!ok) return;
        A.d.parametros = {}; A.d.paramsAtualizadoEm = new Date().toISOString(); store.save(); rerender();
      });
    },
    'limpar-uf': function (ds) { delete A.d.aliquotasUF[ds.id]; A.d.paramsAtualizadoEm = new Date().toISOString(); store.save(); rerender(); },
    'carregar-exemplo': function () {
      var ex = RTC.model.exemplo();
      A.d.empresas.push(ex.empresa);
      A.d.simulacoes.push(ex.simulacao);
      A.d.ui.empresaId = ex.empresa.id;
      A.d.ui.simulacaoId = ex.simulacao.id;
      A.d.ui.visao = 'consolidado';
      store.save();
      D.toast('Exemplo ilustrativo carregado.');
      N.shell.navegar('rtc', 'comparativo');
    },
    'exportar-backup': function () {
      store.saveNow();
      D.baixar(new Blob([store.exportar()], { type: 'application/json' }), 'nexus-rtc-backup-' + new Date().toISOString().slice(0, 10) + '.json');
    },
    'importar-backup': function () {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      inp.onchange = function () {
        var f = inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          D.confirmar('Importar backup', 'Os dados atuais deste navegador serão substituídos pelo conteúdo de "' + f.name + '". Continuar?', 'Importar', true).then(function (ok) {
            if (!ok) return;
            try { store.importar(fr.result); garantirSelecao(); D.toast('Backup importado.'); rerender(); }
            catch (e) { D.toast(e.message, 'erro'); }
          });
        };
        fr.readAsText(f);
      };
      inp.click();
    },
    'apagar-tudo': function () {
      D.confirmar('Apagar todos os dados', 'Remove empresas, operações, parâmetros personalizados, alíquotas por UF e regras deste navegador. Recomenda-se exportar um backup antes.', 'Apagar tudo', true).then(function (ok) {
        if (!ok) return;
        // os produtos vindos da Lucratividade continuam excluídos daqui depois de apagar tudo
        var vinculos = (A.d.syncExcluidos || []).slice();
        A.d.simulacoes.forEach(function (op) { op.itens.forEach(function (it) { if (it.sync && vinculos.indexOf(it.sync) < 0) vinculos.push(it.sync); }); });
        store.reset(); A.d.syncExcluidos = vinculos; store.saveNow();
        D.toast('Dados apagados.'); N.shell.navegar('rtc', 'empresas');
      });
    },
    // ----- detalhamento por linha (custo e preço): abre/fecha sem recalcular a tela
    'alternar-detalhe': function (ds, ev) {
      var b = ev && ev.target ? ev.target.closest('[data-acao="alternar-detalhe"]') : null;
      var aberto = !(b && b.getAttribute('aria-expanded') === 'true');
      A.abertos = A.abertos || {};
      A.abertos[ds.chave] = aberto;
      D.$$('[data-acao="alternar-detalhe"]').forEach(function (x) { if (x.getAttribute('data-chave') === ds.chave) x.setAttribute('aria-expanded', aberto ? 'true' : 'false'); });
      D.$$('[data-det]').forEach(function (x) { if (x.getAttribute('data-det') === ds.chave) x.hidden = !aberto; });
    },

    // ----- "Quanto devo cobrar em 2027": revelado só quando o usuário quiser apresentar ao cliente
    'mostrar-cobrar': function () {
      A.cobrarVisivel = true;
      rerender();
      focar('#nx-cobrar', true);
    },
    'ocultar-cobrar': function () {
      A.cobrarVisivel = false;
      rerender();
    },

    // ----- planilha modelo e importação de operações/produtos
    'baixar-modelo': function () {
      try {
        var emp = A.empresa();
        D.baixar(RTC.planilha.modelo(emp), 'planilha-de-compras' + (emp ? '-' + D.slug(emp.nomeFantasia || emp.razaoSocial || '') : '') + '.xlsx');
        D.toast('Planilha de compras baixada. Envie ao cliente; depois use Importar planilha.');
      } catch (e) { D.toast('Não foi possível gerar o modelo: ' + e.message, 'erro'); }
    },
    'importar-planilha': function () {
      if (!A.d.empresas.length) { D.toast('Cadastre a empresa antes de importar operações.', 'erro'); return; }
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
      inp.onchange = function () {
        var f = inp.files[0];
        if (!f) return;
        D.toast('Lendo “' + f.name + '”…');
        RTC.planilha.lerArquivo(f).then(function (abas) {
          A.importacao = RTC.planilha.processar(abas, {
            arquivo: f.name, empresas: A.d.empresas, empresaAtual: A.empresa(), regras: A.d.regras,
            nomesExistentes: function (empId) { return A.opsDaEmpresa(empId).map(function (o) { return o.nome; }); }
          });
          A.d.ui.produtoAberto = null;
          if (A.rota !== 'operacao') N.shell.navegar('rtc', 'operacao'); else rerender();
          focar('#nx-importacao', true);
        }).catch(function (e) {
          D.toast(e && e.message ? e.message : 'Não foi possível ler a planilha.', 'erro');
        });
      };
      inp.click();
    },
    'confirmar-importacao': function () {
      var imp = A.importacao;
      if (!imp || !imp.operacoes.length) return;
      var criadas = [];
      var nProd = 0;
      imp.operacoes.forEach(function (o) {
        var emp = A.empresa(o.empId);
        if (!emp) return;
        var existentes = A.opsDaEmpresa(emp.id).map(function (x) { return x.nome.toLowerCase(); });
        var nome = o.nomeFinal, i = 2;
        while (existentes.indexOf(nome.toLowerCase()) >= 0) nome = o.nome + ' (' + i++ + ')';
        var op = RTC.model.novaOperacao(emp, nome);
        op.itens = o.itens;
        op.itemAtivoId = o.itens[0].id;
        A.d.simulacoes.push(op);
        criadas.push(op);
        nProd += o.itens.length;
      });
      if (!criadas.length) return;
      A.d.ui.empresaId = criadas[0].empresaId;
      A.d.ui.simulacaoId = criadas[0].id;
      A.d.ui.visao = 'consolidado';
      A.d.ui.produtoAberto = null;
      A.importacao = null;
      store.save();
      D.toast(criadas.length + ' operação(ões) e ' + nProd + ' produto(s) importados.');
      rerender();
    },
    'cancelar-importacao': function () { A.importacao = null; rerender(); },

    'exportar-pdf': function () { RTC.exportar.pdf(A); },
    'exportar-xlsx': function () { RTC.exportar.xlsx(A); },
    'imprimir': function () { window.print(); }
  };
  // nomes anteriores (compatibilidade)
  ACOES['nova-simulacao'] = ACOES['nova-operacao'];
  ACOES['abrir-simulacao'] = ACOES['abrir-operacao'];
  ACOES['duplicar-simulacao'] = ACOES['duplicar-operacao'];
  ACOES['renomear-simulacao'] = ACOES['renomear-operacao'];
  ACOES['excluir-simulacao'] = ACOES['excluir-operacao'];
  A.acoes = ACOES;

  function onClick(ev) {
    if (!moduloAtivo()) return;
    var b = ev.target.closest('[data-acao]');
    if (!b || b.disabled) return;
    var fn = ACOES[b.getAttribute('data-acao')];
    if (fn) { ev.preventDefault(); fn(b.dataset, ev); }
  }

  // ------------------------------------------------------------------ áreas vivas globais (barra de contexto)
  var LIVE_GLOBAL = {
    'ctx-resumo': function (A) {
      var c = A.cons;
      if (!c || !c.n) return '<span class="nx-muted">Cadastre os produtos da operação para ver o resultado.</span>';
      var a1 = c.a1 && !c.a1.incompleto ? c.a1 : null;
      var a2 = c.a2 && !c.a2.incompleto ? c.a2 : null;
      if (c.modo !== 'B' && a1) {
        var dTot = a1.v26.total ? (a1.v27.total - a1.v26.total) / a1.v26.total * 100 : 0;
        return '<span class="nx-ctx-k"><small>Total ao cliente 2026</small><strong>' + N.fmt.brl(a1.v26.total) + '</strong></span>' +
          '<span class="nx-ctx-arrow" aria-hidden="true">→</span>' +
          '<span class="nx-ctx-k is-27"><small>2027</small><strong>' + N.fmt.brl(a1.v27.total) + '</strong></span>' +
          '<span class="nx-ctx-delta">' + N.fmt.signedPct(dTot) + '</span>';
      }
      if (a2) {
        return '<span class="nx-ctx-k"><small>Margem 2026</small><strong>' + N.fmt.pct(a2.v26.pct.margemContrib) + '</strong></span>' +
          '<span class="nx-ctx-arrow" aria-hidden="true">→</span>' +
          '<span class="nx-ctx-k is-27"><small>2027</small><strong>' + N.fmt.pct(a2.v27.pct.margemContrib) + '</strong></span>' +
          '<span class="nx-ctx-delta">' + N.fmt.signedPp(a2.v27.pct.margemContrib - a2.v26.pct.margemContrib) + '</span>';
      }
      var nErr = c.erros.length;
      return '<span class="nx-muted">' + (nErr ? nErr + ' pendência(s) nos produtos' : 'Informe margem ou preço dos produtos') + '</span>';
    }
  };

  function regimeRotulo(r) { return { SN: 'Simples Nacional', LP: 'Lucro Presumido', LR: 'Lucro Real' }[r] || '—'; }
  A.regimeRotulo = regimeRotulo;

  function contexto(rota) {
    garantirSelecao();
    var d = A.d;
    if (!d.empresas.length) return '';
    var emp = A.empresa();
    var ops = emp ? A.opsDaEmpresa(emp.id) : [];
    var op = A.operacao();
    var semOp = rota === 'empresas' || rota === 'parametros' || rota === 'operacao';
    return '<div class="nx-ctx">' +
      '<label class="nx-ctx-field"><span>Empresa</span><span class="nx-input-wrap is-select"><select class="nx-input" data-scope="ctx" data-path="empresaId" aria-label="Empresa ativa">' +
      d.empresas.map(function (e) { return '<option value="' + esc(e.id) + '"' + (emp && e.id === emp.id ? ' selected' : '') + '>' + esc(e.razaoSocial || 'Empresa sem nome') + '</option>'; }).join('') +
      '</select></span></label>' +
      (emp ? '<span class="nx-chip">' + esc(regimeRotulo(emp.regime)) + (emp.uf ? ' · ' + esc(emp.uf) : '') + '</span>' : '') +
      (semOp ? '' :
        '<label class="nx-ctx-field"><span>Operação</span><span class="nx-input-wrap is-select"><select class="nx-input" data-scope="ctx" data-path="simulacaoId" aria-label="Operação ativa">' +
        (ops.length ? ops.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === d.ui.simulacaoId ? ' selected' : '') + '>' + esc(s.nome) + ' (' + s.itens.length + ' produto' + (s.itens.length === 1 ? '' : 's') + ')</option>'; }).join('') : '<option value="">Nenhuma operação</option>') +
        '</select></span></label>' +
        '<div class="nx-ctx-actions">' +
          U.botao('Nova operação', 'nova-operacao', { titulo: 'Nova operação para esta empresa', classe: 'sm' }) +
          (op ? U.botao('Duplicar', 'duplicar-operacao', { classe: 'sm' }) + U.botao('Renomear', 'renomear-operacao', { classe: 'sm' }) + U.botao('Excluir operação', 'excluir-operacao', { classe: 'sm danger' }) : '') +
        '</div>' +
        '<div class="nx-ctx-summary" data-live="ctx-resumo">' + LIVE_GLOBAL['ctx-resumo'](A) + '</div>') +
      '</div>';
  }

  function render(rota, el, info) {
    // integração: ao entrar numa tela, traz os produtos novos cadastrados na Lucratividade por Item
    if (info && info.trocouRota && N.integracao) {
      var sync = N.integracao.puxar('rtc');
      if (sync && sync.novos) setTimeout(function () { D.toast(N.integracao.mensagem(sync)); }, 50);
    }
    garantirSelecao();
    if (info && info.trocouRota && rota === 'empresas') A.d.ui.empresaEditando = null; // ficha só abre ao clicar em Nova/Editar
    if (info && info.trocouRota && rota === 'operacao') A.d.ui.produtoAberto = null; // fichas só abrem ao clicar no produto
    if (info && info.trocouRota && rota === 'preco') A.cobrarVisivel = false; // "quanto cobrar em 2027" começa oculto
    if (rota === 'operacao' && A.d.ui.produtoAberto) {
      var opx = A.operacao();
      if (opx && opx.itens.some(function (it) { return it.id === A.d.ui.produtoAberto; })) opx.itemAtivoId = A.d.ui.produtoAberto;
    }
    // nas telas de análise, o produto escolhido em "Analisar" é o produto ativo
    if (rota !== 'operacao' && A.d.ui.visao && A.d.ui.visao !== 'consolidado') {
      var opv = A.operacao();
      if (opv && opv.itens.some(function (it) { return it.id === A.d.ui.visao; })) opv.itemAtivoId = A.d.ui.visao;
    }
    A.rota = rota;
    A.el = el;
    A.calcular();
    var v = RTC.views[rota];
    el.innerHTML = v ? v.render(A) : '';
    if (v && v.depois) v.depois(el, A);
    marcarCampos();
    var persist = document.getElementById('nx-persist');
    if (persist) persist.textContent = N.sync && N.sync.ativo() ? N.sync.rotulo() : (store.persistente ? 'Dados salvos neste navegador' : 'Armazenamento local indisponível');
  }

  function iniciar(shell) {
    var content = shell.els.content;
    var ctx = shell.els.context;
    [content, ctx].forEach(function (el) {
      el.addEventListener('input', onInput);
      el.addEventListener('change', onInput);
      el.addEventListener('click', onClick);
      el.addEventListener('focusout', onBlur);
    });
    garantirSelecao();
  }

  N.shell.registrar({
    id: 'rtc',
    nome: 'RTC Comparativo',
    descricao: 'Reforma Tributária · 2026 × 2027',
    icone: 'rtc',
    rotas: [
      { id: 'empresas', nome: 'Empresas', titulo: 'Cadastro de empresas', icone: 'empresas', tag: 'Cadastro', desc: 'Regime, UF, atividade e RBT12 do Simples' },
      { id: 'operacao', nome: 'Cadastro da operação', titulo: 'Cadastro da operação', icone: 'operacao', passo: '1', desc: 'Operações, produtos, NF, CFOP e perfil tributário' },
      { id: 'custo', nome: 'Custo de aquisição', titulo: 'Custo líquido de aquisição', icone: 'custo', passo: '2', desc: 'Quanto a mercadoria custa, já descontados os créditos' },
      { id: 'preco', nome: 'Formação do preço', titulo: 'Formação do preço de venda', icone: 'preco', passo: '3', desc: 'Por quanto vender: preço pela margem ou margem pelo preço' },
      { id: 'comparativo', nome: 'Comparativo', titulo: 'Comparativo 2026 × janeiro de 2027', icone: 'comparativo', passo: '4', desc: 'O que muda em 2027: preço, margem e lucro' },
      { id: 'relatorio', nome: 'Relatório', titulo: 'Relatório detalhado e memória de cálculo', icone: 'relatorio', passo: '5', desc: 'Memória de cálculo, PDF e Excel' },
      { id: 'parametros', nome: 'Parâmetros e regras', titulo: 'Parâmetros tributários e regras cadastradas', icone: 'parametros', tag: 'Configuração', desc: 'Alíquotas com fonte, vigência e regras por NCM' }
    ],
    rotaPadrao: function () { return A.d.empresas.length ? 'operacao' : 'empresas'; },
    entrada: 'empresas',
    resumo: 'Simula a formação do preço de venda e compara 2026 (ICMS + PIS/Cofins) com janeiro de 2027 (CBS e IBS), com custo líquido de aquisição, memória de cálculo e base legal.',
    resumoInicio: function () {
      var prods = A.d.simulacoes.reduce(function (t, op) { return t + ((op.itens || []).length); }, 0);
      return [
        { rotulo: 'Empresas', valor: String(A.d.empresas.length) },
        { rotulo: 'Operações', valor: String(A.d.simulacoes.length) },
        { rotulo: 'Produtos', valor: String(prods) },
        { rotulo: 'Parâmetros em', valor: N.fmt.date(A.ultimaAtualizacaoParams()) }
      ];
    },
    iniciar: iniciar,
    render: render,
    contexto: contexto
  });

  A.garantirSelecao = garantirSelecao;
  A.novaOperacao = novaOperacao;
  A.marcarCampos = marcarCampos;
})(typeof window !== 'undefined' ? window : globalThis);

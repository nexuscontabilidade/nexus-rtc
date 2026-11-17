/* RTC Comparativo — tela 1: cadastro da operação (produtos com identificação, valores, fornecedor, perfil tributário e venda) */
(function (root) {
  'use strict';
  var N = root.Nexus, RTC = N.rtc, U = RTC.ui, F = N.fmt, esc = F.esc;

  function r2(v) { return Math.round(v * 100) / 100; }
  function has(v) { return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }

  /** Estado vazio comum: sem empresa, sem operação ou (se exigeProduto) sem produto */
  function semEmpresaOuSim(A, exigeProduto) {
    if (!A.d.empresas.length || !A.empresa()) {
      return U.vazio('Nenhuma empresa selecionada', 'Cadastre a empresa (regime, UF e, no Simples Nacional, anexo e RBT12) para iniciar a simulação.',
        U.botao('Cadastrar empresa', 'nova-empresa', { tipo: 'primary' }) + U.botao('Carregar exemplo ilustrativo', 'carregar-exemplo'));
    }
    var op = A.operacao();
    if (!op) {
      return U.vazio('Nenhuma operação para ' + (A.empresa().razaoSocial || 'esta empresa'), 'Crie uma operação e cadastre os produtos de compra e venda que deseja simular.',
        U.botao('Nova operação', 'nova-operacao', { tipo: 'primary' }));
    }
    if (exigeProduto !== false && !op.itens.length) {
      return U.vazio('Nenhum produto em \u201c' + op.nome + '\u201d', 'Cadastre ao menos um produto na operação para calcular custo, preço e comparativo.',
        U.botao('Cadastrar produto', 'cadastrar-produto', { tipo: 'primary' }) + U.botao('Ir para o cadastro da operação', 'ir', { dados: { rota: 'operacao' } }));
    }
    return null;
  }
  RTC.views.semEmpresaOuSim = semEmpresaOuSim;

  /** Seletor do produto exibido nas telas de custo e preço */
  function seletorProduto(A) {
    var op = A.operacao();
    if (!op || op.itens.length < 2) return '';
    return '<div class="nx-prod-seletor"><span class="nx-label">Produto exibido</span><div class="nx-chips-sel">' +
      op.itens.map(function (it, i) {
        var ativo = it.id === op.itemAtivoId;
        return '<button type="button" class="nx-chip-sel' + (ativo ? ' is-on' : '') + '" data-acao="selecionar-produto" data-id="' + esc(it.id) + '"' + (ativo ? ' aria-pressed="true"' : '') + '><em>' + (i + 1) + '</em>' + esc(it.produto.descricao || 'Produto sem descrição') + '</button>';
      }).join('') + '</div></div>';
  }
  RTC.views.seletorProduto = seletorProduto;

  function qtdTexto(q, un) { return F.num(q, q % 1 ? 4 : 0) + ' ' + (un || 'UN'); }

  /** Análise da operação completa (soma dos produtos) — quando há 2 ou mais produtos e a visão é "Operação completa" */
  function visaoOperacao(A) {
    var op = A.operacao();
    return !!(op && op.itens.length > 1 && (A.d.ui.visao || 'consolidado') === 'consolidado');
  }
  RTC.views.visaoOperacao = visaoOperacao;

  /**
   * Base de cálculo exibida em custo e preço: quantidade total ou por unidade.
   * Produto: segue o cadastro do produto (venda.basePreco). Operação: "por unidade" quando todos os produtos
   * estão por unidade; a média por unidade exige a mesma unidade de medida em todos os produtos.
   */
  function baseCalculo(A) {
    var op = A.operacao();
    if (visaoOperacao(A)) {
      var pedido = op.itens.every(function (it) { return it.venda.basePreco === 'unitario'; });
      var qc = A.cons && A.cons.qtdComum;
      var un = pedido && !!qc;
      return { operacao: true, pedido: pedido, unidade: un, q: qc ? qc.quantidade : 0, un: qc ? qc.unidade : '', semComum: pedido && !qc,
        m: un ? F.unit : F.brl, rotulo: un ? 'média por unidade (1 ' + qc.unidade + ')' : 'quantidade total da operação' };
    }
    var it = A.item();
    var q = it ? Number(it.produto.quantidade) || 0 : 0;
    var u = (it && it.produto.unidade) || 'UN';
    var ped = !!(it && it.venda.basePreco === 'unitario');
    var ok = ped && q > 0;
    return { operacao: false, pedido: ped, unidade: ok, q: q, un: u, semQtd: ped && !(q > 0),
      m: ok ? F.unit : F.brl, rotulo: ok ? 'por unidade (1 ' + u + ')' : (q > 0 ? 'quantidade total (' + qtdTexto(q, u) + ')' : 'quantidade total') };
  }
  RTC.views.baseCalculo = baseCalculo;

  /** Escolha da visão: operação completa ou um produto (pílulas de uma linha; lista quando há mais de 6 produtos) */
  function seletorVisao(A) {
    var op = A.operacao();
    if (!op || op.itens.length < 2) return '';
    var valor = A.d.ui.visao || 'consolidado';
    if (op.itens.length > 6) {
      return U.selecao({ scope: 'ui', path: 'visao', valor: valor, rotulo: 'Analisar', largura: 'lg', opcoes: [['consolidado', 'Operação completa (' + op.itens.length + ' produtos somados)']].concat(op.itens.map(function (it, i) { return [it.id, 'Produto ' + (i + 1) + ' · ' + (it.produto.descricao || 'sem descrição')]; })) });
    }
    var opcoes = [['consolidado', 'Operação completa', op.itens.length + ' produtos somados']].concat(op.itens.map(function (it, i) {
      var d = it.produto.descricao || 'sem descrição';
      return [it.id, (i + 1) + ' · ' + d, 'Produto ' + (i + 1) + ': ' + d];
    }));
    return U.segmento({ compacto: true, scope: 'ui', path: 'visao', valor: valor, rotulo: 'Analisar', opcoes: opcoes });
  }
  RTC.views.seletorVisao = seletorVisao;

  /** Barra de filtros compacta: grupos lado a lado numa linha e, abaixo, os avisos que pedem ação */
  function barraAnalise(grupos, avisos) {
    var g = grupos.filter(Boolean);
    if (!g.length && !avisos) return '';
    return '<section class="nx-card nx-filtro" aria-label="O que analisar">' + (g.length ? '<div class="nx-filtro-linha">' + g.join('') + '</div>' : '') + (avisos || '') + '</section>';
  }
  RTC.views.barraAnalise = barraAnalise;

  /** "O que analisar": visão (operação × produto), base (quantidade total × unidade) e detalhamento, numa linha */
  function seletorAnalise(A, rotuloBase) {
    var b = baseCalculo(A);
    var qc = A.cons && A.cons.qtdComum;
    var qtd = b.operacao ? (qc ? qtdTexto(qc.quantidade, qc.unidade) : '') : (b.q > 0 ? qtdTexto(b.q, b.un) : '');
    var seg = U.segmento({ compacto: true, scope: b.operacao ? 'itens' : 'sim', path: 'venda.basePreco', valor: b.pedido ? 'unitario' : 'total', rotulo: rotuloBase,
      dica: b.operacao ? 'Soma de todos os produtos da operação. A escolha entre quantidade total e unidade é aplicada a todos os produtos.' : 'A escolha entre quantidade total e unidade vale para este produto nas telas de custo e de preço.',
      opcoes: [['total', 'Quantidade total' + (qtd ? ' (' + qtd + ')' : ''), b.operacao ? 'soma dos produtos' : (qtd ? 'toda a quantidade comprada' : 'quantidade não informada')],
        ['unitario', 'Por unidade', b.operacao ? 'média por unidade da operação' : '1 ' + b.un + ' (valores ÷ quantidade)']] });
    var nota = '';
    if (b.semComum) nota = '<p class="nx-auto is-missing">Os produtos têm unidades de medida diferentes: a operação completa é exibida pela quantidade total. Os valores por unidade de cada produto aparecem na tabela por produto.</p>';
    else if (b.semQtd) nota = '<p class="nx-auto is-missing">Informe a quantidade do produto no cadastro da operação para calcular por unidade.</p>';
    var det = U.segmento({ compacto: true, scope: 'ui', path: 'detalhes', valor: A.d.ui.detalhes === 'mais' ? 'mais' : 'menos', rotulo: 'Detalhes',
      opcoes: [['menos', 'Menos', 'Menos detalhes: só os valores; clique na seta de uma linha para abri-la'], ['mais', 'Mais', 'Mais detalhes: fórmulas, bases, alíquotas e fundamentos legais']] });
    return barraAnalise([seletorVisao(A), seg, det], nota);
  }
  RTC.views.seletorAnalise = seletorAnalise;

  /** Célula com os dois períodos, um embaixo do outro: 2026 e 2027 (em destaque) */
  function par(v26, v27, fmt, forte) {
    function lado(ano, v, cls) { return '<span class="' + cls + '"><small>' + ano + '</small>' + (v == null || !isFinite(v) ? '—' : fmt(v)) + '</span>'; }
    return '<span class="nx-par' + (forte ? ' is-forte' : '') + '">' + lado('2026', v26, 'is-26') + lado('2027', v27, 'is-27') + '</span>';
  }
  RTC.views.par = par;

  /** Variação de 2027 sobre 2026: seta, percentual e diferença em R$; a cor diz se é bom (bomQuando 'sobe'/'desce') */
  function variacao(abs, pct, bomQuando, fmt) {
    if (abs == null || !isFinite(abs)) return '—';
    var zero = Math.abs(abs) < 0.005;
    var tom = zero || !bomQuando ? '' : ((abs > 0) === (bomQuando === 'sobe') ? ' is-bom' : ' is-ruim');
    return '<span class="nx-var' + tom + '"><b>' + (zero ? '' : abs > 0 ? '▲ ' : '▼ ') + (pct == null ? '—' : F.signedPct(pct)) + '</b><small>' + (fmt ? (abs > 0.004 ? '+' : abs < -0.004 ? '−' : '') + fmt(Math.abs(abs)) : F.signedBrl(abs)) + '</small></span>';
  }
  RTC.views.variacao = variacao;

  /** Natureza do tributo em palavras simples; o termo técnico fica na dica do mouse */
  var NATUREZA = {
    'Por dentro': ['Embutido no preço', 'Por dentro: o tributo já está dentro do valor da mercadoria.'],
    'Por dentro — base específica': ['Embutido no preço', 'Por dentro, com base própria: o tributo está dentro do valor da mercadoria, mas é calculado sobre uma base diferente do preço (ex.: PIS/Cofins sem o ICMS na base).'],
    'Por fora': ['Somado ao preço', 'Por fora: o tributo é somado ao valor da mercadoria e cobrado do cliente à parte.'],
    'Informativo': ['Só informativo', 'Destacado na nota sem custo para a empresa: não altera preço nem margem.'],
    'Despesa': ['Despesa', 'Despesa variável sobre a venda (comissão, cartão, frete etc.).'],
    'No DAS': ['No DAS', 'Já incluído na alíquota do Simples Nacional (DAS).'],
    'Sobre receita presumida': ['Sobre a receita presumida', 'Calculado sobre a receita presumida (Lucro Presumido).']
  };
  function natureza(l) {
    var n = l.natureza || '';
    var t = NATUREZA[n] || [n, n];
    return n ? '<span class="nx-nat n-' + esc(l.tipo) + '" title="' + esc(t[1]) + '">' + esc(t[0]) + '</span>' : '';
  }
  RTC.views.natureza = natureza;

  function totalItem(it) {
    var q = it.produto.quantidade, u = it.valores.valorUnitario;
    if (has(q) && has(u)) return r2(Number(q) * Number(u));
    return has(it.valores.produtos) && !('valorUnitario' in it.valores) ? Number(it.valores.produtos) : null;
  }
  RTC.views.totalItem = totalItem;

  /** Tabela de produtos da operação (com resultados por produto) */
  function tabelaProdutos(A) {
    var op = A.operacao();
    if (!op) return '';
    if (!op.itens.length) {
      return '<div class="nx-prod-vazio"><strong>Nenhum produto cadastrado</strong><p>Clique em <b>Cadastrar produto</b> para liberar os campos de identificação, origem, destino e CFOP, valores, fornecedor, tributação e venda.</p></div>';
    }
    var somaTotal = 0;
    var sel = A.selecao && A.selecao.opId === op.id ? A.selecao.ids : {};
    // as caixas de seleção só aparecem depois de clicar em "Selecionar produtos"
    var modoSel = !!(A.selecao && A.selecao.opId === op.id && A.selecao.ativo);
    var rows = op.itens.map(function (it, i) {
      var x = A.resultadoItem(it.id);
      var r = x && x.r;
      var ativo = false;
      var total = totalItem(it);
      if (total != null) somaTotal += total;
      var q = Number(it.produto.quantidade);
      var qtd = has(it.produto.quantidade) ? F.num(q, q % 1 ? 4 : 0) + ' ' + esc(it.produto.unidade || 'un') : '—';
      var unit = has(it.valores.valorUnitario) ? F.unit(Number(it.valores.valorUnitario)) : '—';
      var custo = r && r.custo26 ? par(r.custo26.liquido, r.custo27.liquido, F.brl) : '—';
      var a1 = r && r.a1 && r.a1.v26 && !r.a1.v26.erro && r.a1.v27 && !r.a1.v27.erro ? r.a1 : null;
      var cliente = a1 ? par(a1.v26.total, a1.v27.total, F.brl) + '<small class="nx-obs">' + F.signedPct((a1.v27.total - a1.v26.total) / a1.v26.total * 100) + '</small>' : '—';
      var nErr = r ? r.erros.length : 0;
      var nAv = r ? r.avisos.filter(function (a) { return a.nivel !== 'info'; }).length : 0;
      var situacao = nErr ? '<span class="nx-count is-erro">' + nErr + ' pendência(s)</span>' : nAv ? '<span class="nx-count is-alerta">' + nAv + ' alerta(s)</span>' : '<span class="nx-count is-ok">OK</span>';
      var marcado = !!sel[it.id];
      return '<tr' + (marcado ? ' class="is-sel"' : '') + '>' +
        (modoSel ? '<td class="c-sel"><input type="checkbox" class="nx-sel-caixa" data-rtc-sel="' + esc(it.id) + '"' + (marcado ? ' checked' : '') + ' aria-label="Selecionar ' + esc(it.produto.descricao || 'produto ' + (i + 1)) + '"></td>' : '') + '<td class="c-n">' + (i + 1) + '</td>' +
        '<td class="c-prod"><button type="button" class="nx-link-btn" data-acao="selecionar-produto" data-id="' + esc(it.id) + '" title="Abrir as fichas deste produto"><strong>' + esc((it.produto.codigo ? it.produto.codigo + ' — ' : '') + (it.produto.descricao || 'Produto sem descrição')) + '</strong></button>' +
          (it.origemModulo === 'lucro' ? ' <span class="nx-origem-tag" title="Trazido do módulo Lucratividade por Item">da Lucratividade</span>' : '') +
          '<small class="nx-obs">' + (it.produto.ncm ? 'NCM ' + esc(it.produto.ncm) : 'NCM não informado') + (it.produto.cfopEntrada ? ' · CFOP ' + esc(it.produto.cfopEntrada) + '/' + esc(it.produto.cfopSaida || '—') : '') + '</small></td>' +
        '<td class="num">' + qtd + ' × ' + unit + '</td>' +
        '<td class="num"><b>' + (total != null ? F.brl(total) : '—') + '</b></td>' +
        '<td class="num">' + custo + '</td><td class="num">' + cliente + '</td>' +
        '<td>' + situacao + '</td>' +
        '<td class="c-acoes">' + U.botao('Abrir ficha', 'selecionar-produto', { dados: { id: it.id }, classe: 'sm', tipo: 'primary' }) +
          U.botao('Duplicar', 'duplicar-produto', { dados: { id: it.id }, classe: 'sm' }) +
          U.botao('Excluir', 'excluir-produto', { dados: { id: it.id }, classe: 'sm danger-ghost', titulo: 'Excluir este produto da operação' }) + '</td></tr>';
    }).join('');
    var c = A.cons;
    var ca1 = c && c.a1 && !c.a1.incompleto ? c.a1 : null;
    var totalRow = '<tr class="is-total">' + (modoSel ? '<td></td>' : '') + '<td></td><td>Total da operação · ' + op.itens.length + ' produto(s)</td><td></td>' +
      '<td class="num">' + F.brl(r2(somaTotal)) + '</td>' +
      '<td class="num">' + (c && c.custo26 ? par(c.custo26.liquido, c.custo27.liquido, F.brl, true) : '—') + '</td>' +
      '<td class="num">' + (ca1 ? par(ca1.v26.total, ca1.v27.total, F.brl, true) + '<small class="nx-obs">' + F.signedPct((ca1.v27.total - ca1.v26.total) / ca1.v26.total * 100) + '</small>' : '—') + '</td><td colspan="2"></td></tr>';
    var nSel = op.itens.filter(function (it) { return sel[it.id]; }).length;
    var todos = nSel && nSel === op.itens.length;
    var vindos = op.itens.filter(function (it) { return it.origemModulo === 'lucro'; }).length;
    var barra = !modoSel
      ? '<div class="nx-lote is-off">' + U.botao('Selecionar produtos', 'sel-modo-produtos', { classe: 'sm', titulo: 'Mostra as caixas para marcar vários produtos e excluir de uma vez' }) + '</div>'
      : '<div class="nx-lote">' +
        '<span class="nx-lote-conta">' + (nSel ? '<b>' + nSel + '</b> selecionado(s)' : 'Marque os produtos para excluir em lote') + '</span>' +
        U.botao(todos ? 'Desmarcar todos' : 'Selecionar todos', 'sel-todos-produtos', { classe: 'sm' }) +
        (vindos ? U.botao('Selecionar vindos da Lucratividade (' + vindos + ')', 'sel-produtos-origem', { classe: 'sm', titulo: 'Marca os produtos trazidos do módulo Lucratividade por Item' }) : '') +
        U.botao(nSel ? 'Excluir ' + nSel + ' selecionado(s)' : 'Excluir selecionados', 'excluir-produtos-lote', { classe: 'sm danger-ghost', desabilitado: !nSel }) +
        U.botao('Cancelar', 'sel-modo-produtos', { classe: 'sm', titulo: 'Esconde as caixas de seleção' }) + '</div>';
    return barra + '<div class="nx-table-wrap"><table class="nx-table nx-prod-table"><thead><tr>' + (modoSel ? '<th class="c-sel"><span class="sr">Selecionar</span></th>' : '') + '<th>#</th><th>Produto</th><th class="num">Qtd × valor unitário</th><th class="num">Valor total</th><th class="num">Custo líquido<small class="nx-th-dica">2026 e 2027</small></th><th class="num">Total ao cliente<small class="nx-th-dica">2026, 2027 e variação</small></th><th>Situação</th><th>Ações</th></tr></thead><tbody>' + rows + totalRow + '</tbody></table></div>';
  }
  RTC.views.tabelaProdutos = tabelaProdutos;

  function totalProdutosAtivo(A) {
    var it = A.item();
    if (!it) return '—';
    var t = totalItem(it);
    return t != null ? F.brl(t) : '<span class="nx-muted">Informe quantidade e valor unitário</span>';
  }

  function autoTexto(info) {
    if (!info) return '';
    return '<span class="nx-auto' + (info.ok === false ? ' is-missing' : '') + '"><b>' + (info.ok === false ? 'Não cadastrada' : F.pct(info.aliq)) + '</b> ' + esc(info.desc) + (info.ok === false ? ' — <a href="#/rtc/parametros" data-acao="ir" data-rota="parametros">cadastrar em Parâmetros</a>' : '') + '</span>';
  }

  /** Totais da NF de entrada (2026), com o IPI destacado por fora */
  function resumoNF(A) {
    var r = A.res;
    if (!r || !r.custo26) return '';
    var c = r.custo26;
    function box(rot, val, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><span>' + rot + '</span><b>' + F.brl(val) + '</b></div>'; }
    var total = Math.round((c.vop + c.ipi + c.st) * 100) / 100;
    var html = '<div class="nx-totais">' + box('Valor da operação', c.vop) + box('IPI destacado', c.ipi) + (c.st ? box('ICMS-ST retido', c.st) : '') + box('Total da NF', total, 'is-total') + '</div>';
    if (c.ipi > 0) {
      html += '<p class="nx-note">IPI ' + (c.cred.ipi > 0 ? 'recuperável como crédito (estabelecimento industrial ou equiparado).' : 'não recuperável: integra o custo de aquisição, fora da base do crédito de PIS/Cofins.') + '</p>';
    }
    return html;
  }

  function blocoResultado(titulo, a1, a2, c26, c27) {
    var html = '<h4>' + titulo + '</h4><dl class="nx-dl">';
    html += '<dt>Custo líquido</dt><dd><span>2026 <b>' + F.brl(c26.liquido) + '</b></span><span class="is-27">2027 <b>' + F.brl(c27.liquido) + '</b></span></dd>';
    if (a1) {
      html += '<dt>Preço sugerido (mercadoria)</dt><dd><span>2026 <b>' + F.brl(a1.v26.X) + '</b></span><span class="is-27">2027 <b>' + F.brl(a1.v27.X) + '</b></span></dd>';
      html += '<dt>Total ao cliente · mesma margem</dt><dd><span>2026 <b>' + F.brl(a1.v26.total) + '</b></span><span class="is-27">2027 <b>' + F.brl(a1.v27.total) + '</b></span><em>' + F.signedPct((a1.v27.total - a1.v26.total) / a1.v26.total * 100) + '</em></dd>';
    }
    if (a2) {
      html += '<dt>Margem efetiva · mesmo preço</dt><dd><span>2026 <b>' + F.pct(a2.v26.pct.margemContrib) + '</b></span><span class="is-27">2027 <b>' + F.pct(a2.v27.pct.margemContrib) + '</b></span><em>' + F.signedPp(a2.v27.pct.margemContrib - a2.v26.pct.margemContrib) + '</em></dd>';
    }
    return html + '</dl>';
  }

  function resumoLateral(A) {
    var html = '<div class="nx-side-sum"><h3>Resultado ao vivo</h3>';
    var it = A.item(), r = A.res;
    if (it && r) {
      var idx = A.operacao().itens.indexOf(it);
      if (r.custo26) {
        var a1 = r.a1 && r.a1.v26 && !r.a1.v26.erro && r.a1.v27 && !r.a1.v27.erro ? r.a1 : null;
        var a2 = r.a2 && r.a2.v26 && r.a2.v27 ? r.a2 : null;
        html += blocoResultado('Produto ' + (idx + 1) + ' (em edição)', a1, a2, r.custo26, r.custo27);
      } else {
        html += '<h4>Produto ' + (idx + 1) + ' (em edição)</h4>' + U.alertas(r.erros.slice(0, 3), [], { vazio: 'Preencha os campos obrigatórios.' });
      }
    }
    var c = A.cons;
    if (c && c.n && c.custo26) {
      var ca1 = c.a1 && !c.a1.incompleto ? c.a1 : null;
      var ca2 = c.a2 && !c.a2.incompleto ? c.a2 : null;
      html += '<div class="nx-side-op">' + blocoResultado('Operação · ' + c.n + ' produto(s)', ca1, ca2, c.custo26, c.custo27) +
        (!c.completoCusto || !ca1 ? '<p class="nx-note">Totais parciais: há produtos com pendências.</p>' : '') + '</div>';
    } else if (!it) {
      html += '<p class="nx-muted">Cadastre um produto para ver o resultado.</p>';
    }
    html += '<div class="nx-side-links">' + U.botao('Custo', 'ir', { dados: { rota: 'custo' }, classe: 'sm' }) + U.botao('Preço', 'ir', { dados: { rota: 'preco' }, classe: 'sm' }) + U.botao('Comparativo', 'ir', { dados: { rota: 'comparativo' }, tipo: 'primary', classe: 'sm' }) + '</div>';
    return html + '</div>';
  }

  function alertasLateral(A) {
    var it = A.item();
    var r = it ? (A.res || { erros: [], avisos: [] }) : (A.cons || { erros: [], avisos: [] });
    var n = r.erros.length, m = r.avisos.filter(function (a) { return a.nivel !== 'info'; }).length;
    return '<div class="nx-side-alerts"><h3>Validações' + (it ? ' do produto' : ' da operação') + ' <span class="nx-count' + (n ? ' is-erro' : m ? ' is-alerta' : ' is-ok') + '">' + (n ? n + ' erro(s)' : m ? m + ' alerta(s)' : 'OK') + '</span></h3>' +
      U.alertas(r.erros, r.avisos, { vazio: 'Nenhuma pendência para uma conclusão tributária confiável.' }) + '</div>';
  }

  function cardOperacoes(A) {
    var emp = A.empresa();
    var ops = A.opsDaEmpresa(emp.id);
    var atual = A.operacao();
    var corpo;
    if (!ops.length) {
      corpo = '<div class="nx-prod-vazio"><strong>Nenhuma operação cadastrada</strong><p>Crie uma operação para reunir os produtos de uma mesma compra — mesma natureza (interna, interestadual ou importação) e mesmo grupo de CFOP.</p></div>';
    } else {
      corpo = '<div class="nx-table-wrap"><table class="nx-table nx-ops-table"><thead><tr><th>Operação</th><th class="num">Produtos</th><th class="num">Total ao cliente 2026 → 2027</th><th>Situação</th><th>Atualizada</th><th>Ações</th></tr></thead><tbody>' +
        ops.map(function (op) {
          var sel = atual && op.id === atual.id;
          var c = sel ? A.cons : RTC.consolidar(emp, op, A.opcoesCalculo());
          var a1 = c && c.a1 && !c.a1.incompleto ? c.a1 : null;
          var nErr = c ? c.erros.length : 0;
          var situacao = !op.itens.length ? '<span class="nx-count is-alerta">Sem produtos</span>' : nErr ? '<span class="nx-count is-erro">' + nErr + ' pendência(s)</span>' : '<span class="nx-count is-ok">OK</span>';
          return '<tr' + (sel ? ' class="is-ativo"' : '') + '><td><button type="button" class="nx-link-btn" data-acao="abrir-operacao" data-id="' + esc(op.id) + '"><strong>' + esc(op.nome) + '</strong></button><small class="nx-obs">' + esc(RTC.model.naturezaTexto(op, emp)) + '</small></td>' +
            '<td class="num">' + op.itens.length + '</td>' +
            '<td class="num">' + (a1 ? F.brl(a1.v26.total) + ' <span class="nx-arrow">→</span> <b class="is-27">' + F.brl(a1.v27.total) + '</b> <small>' + F.signedPct((a1.v27.total - a1.v26.total) / a1.v26.total * 100) + '</small>' : '—') + '</td>' +
            '<td>' + situacao + '</td><td>' + F.dateTime(op.atualizadoEm) + '</td>' +
            '<td class="c-acoes">' + (sel ? '<span class="nx-chip is-on">Selecionada</span>' : U.botao('Ver produtos', 'abrir-operacao', { dados: { id: op.id }, classe: 'sm' })) +
              U.botao('Renomear', 'renomear-operacao', { dados: { id: op.id }, classe: 'sm' }) +
              U.botao('Excluir', 'excluir-operacao', { dados: { id: op.id }, classe: 'sm danger-ghost', titulo: 'Excluir esta operação e seus produtos' }) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return U.cartao({
      classe: 'nx-op-card', eyebrow: 'Operações', titulo: 'Operações cadastradas · ' + esc(emp.razaoSocial || 'empresa'),
      sub: 'Selecione uma operação para ver a lista de produtos. Cada operação reúne produtos de mesma natureza e mesmo grupo de CFOP.',
      acoes: U.botao('Baixar planilha do cliente', 'baixar-modelo', { classe: 'sm', titulo: 'Planilha de compras simples (Excel) para o cliente preencher com as notas fiscais' }) +
        U.botao('Importar planilha', 'importar-planilha', { classe: 'sm', titulo: 'Importar operações e produtos de uma planilha preenchida (.xlsx ou .csv)' }) +
        U.botao('Nova operação', 'nova-operacao', { tipo: 'primary', classe: 'sm' }),
      corpo: corpo
    });
  }

  /** Pré-visualização da importação da planilha: confirma antes de gravar */
  function cardImportacao(A) {
    var imp = A.importacao;
    if (!imp) return '';
    var nProd = imp.operacoes.reduce(function (t, o) { return t + o.itens.length; }, 0);
    var nErrLinhas = imp.linhasComErro.length;
    var kpis = '<div class="nx-kpis k4">' +
      U.kpi({ rotulo: 'Operações a criar', valor: String(imp.operacoes.length) }) +
      U.kpi({ rotulo: 'Produtos válidos', valor: String(nProd), destaque: true }) +
      U.kpi({ rotulo: 'Linhas com erro (não importadas)', valor: String(nErrLinhas) }) +
      U.kpi({ rotulo: 'Avisos', valor: String(imp.avisos.length) }) + '</div>';
    var tabela = imp.operacoes.length ? '<div class="nx-table-wrap"><table class="nx-table compact"><thead><tr><th>Operação</th><th>Empresa</th><th>Natureza</th><th class="num">Produtos</th><th class="num">Valor dos produtos</th><th>Linhas</th></tr></thead><tbody>' +
      imp.operacoes.map(function (o) {
        var tot = o.itens.reduce(function (t, it) { var v = totalItem(it); return t + (v || 0); }, 0);
        return '<tr><td><strong>' + esc(o.nomeFinal) + '</strong>' + (o.nomeFinal !== o.nome ? '<small class="nx-obs">Já existe “' + esc(o.nome) + '” nesta empresa: será criada com outro nome.</small>' : '') + '</td>' +
          '<td>' + esc(o.empresaNome) + '</td><td>' + esc(o.natureza) + '</td><td class="num">' + o.itens.length + '</td><td class="num">' + F.brl(tot) + '</td>' +
          '<td>' + esc(o.linhas.join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="nx-muted">Nenhuma linha válida para importar.</p>';
    function lista(itens, cls, titulo) {
      if (!itens.length) return '';
      var max = 60;
      return '<div class="nx-import-msgs ' + cls + '"><h4>' + titulo + ' (' + itens.length + ')</h4><ul>' + itens.slice(0, max).map(function (e) {
        return '<li><b>Linha ' + e.linha + '</b>' + (e.coluna ? ' · ' + esc(e.coluna) : '') + ': ' + esc(e.msg) + '</li>';
      }).join('') + (itens.length > max ? '<li>… e mais ' + (itens.length - max) + '.</li>' : '') + '</ul></div>';
    }
    return U.cartao({
      classe: 'nx-import', id: 'nx-importacao', eyebrow: 'Importação de planilha · aba “' + esc(imp.aba) + '”', titulo: esc(imp.arquivo),
      sub: imp.linhasLidas + ' linha(s) preenchida(s) lida(s). Confira antes de importar: linhas com erro não são importadas e as operações são criadas como novas.',
      acoes: U.botao('Importar ' + imp.operacoes.length + ' operação(ões) e ' + nProd + ' produto(s)', 'confirmar-importacao', { tipo: 'primary', classe: 'sm', desabilitado: !nProd }) +
        U.botao('Cancelar', 'cancelar-importacao', { classe: 'sm' }),
      corpo: kpis + tabela + lista(imp.erros, 'is-erro', 'Erros') + lista(imp.avisos, 'is-alerta', 'Avisos')
    });
  }

  function cardProdutos(A) {
    var op = A.operacao();
    if (!op) return '';
    return U.cartao({
      eyebrow: 'Produtos da operação', titulo: esc(op.nome),
      sub: (op.itens.length ? 'Natureza: <b>' + esc(RTC.model.naturezaTexto(op, A.empresa())) + '</b> · ' : '') + op.itens.length + ' produto(s). Clique em um produto para abrir as fichas.',
      acoes: U.botao('Cadastrar produto', 'cadastrar-produto', { tipo: 'primary', classe: 'sm' }),
      corpo: '<div data-live="op-produtos">' + tabelaProdutos(A) + '</div>'
    });
  }

  RTC.views.operacao = {
    render: function (A) {
      if (!A.d.empresas.length || !A.empresa()) return semEmpresaOuSim(A, false);
      var emp = A.empresa(), op = A.operacao();
      var aberto = A.produtoAberto();
      // ---------- ao entrar na aba: apenas as operações cadastradas e a lista de produtos
      if (!aberto) return '<div class="nx-stack">' + cardImportacao(A) + cardOperacoes(A) + cardProdutos(A) + '</div>';

      // ---------- produto aberto: fichas de edição
      var s = aberto, r = A.res, ctx = (r && r.ctx) || {};
      var lateral = '<aside class="nx-work-side"><div class="nx-sticky"><div data-live="op-resumo">' + resumoLateral(A) + '</div><div data-live="op-alertas">' + alertasLateral(A) + '</div></div></aside>';
      var idxAtivo = op.itens.indexOf(s);
      var natureza = RTC.model.naturezaTexto(op, emp);
      var esp = RTC.model.cfopEsperado(s, emp);
      var trocaProduto = op.itens.length > 1 ? '<div class="nx-chips-sel nx-prod-troca">' + op.itens.map(function (it, i) {
        var on = it.id === s.id;
        return '<button type="button" class="nx-chip-sel' + (on ? ' is-on' : '') + '" data-acao="selecionar-produto" data-id="' + esc(it.id) + '"' + (on ? ' aria-pressed="true"' : '') + '><em>' + (i + 1) + '</em>' + esc(it.produto.descricao || 'Produto sem descrição') + '</button>';
      }).join('') + '</div>' : '';
      var cabProduto = '<div class="nx-prod-head" id="nx-produto-ativo"><div><span class="nx-eyebrow">' + esc(op.nome) + ' · Produto ' + (idxAtivo + 1) + ' de ' + op.itens.length + '</span>' +
        '<h2 data-live="op-prod-titulo">' + esc(s.produto.descricao || 'Novo produto') + '</h2><p>Natureza da operação: <b>' + esc(natureza) + '</b>. Tipo de operação, UFs e destinatário valem para todos os produtos da operação, e os CFOPs devem seguir o mesmo grupo.</p></div>' +
        '<div class="nx-card-actions">' + U.botao('Voltar às operações', 'fechar-produto', { classe: 'sm' }) + U.botao('Cadastrar outro produto', 'cadastrar-produto', { classe: 'sm' }) + U.botao('Excluir produto', 'excluir-produto', { dados: { id: s.id }, classe: 'sm danger' }) + '</div>' + trocaProduto + '</div>';
      var pf = s.perfil, pr = s.premissas;
      function o(path) { return (s.origens || {})[path]; }
      function f(opts) { opts.scope = 'sim'; opts.origem = o(opts.path); opts.valor = opts.valor !== undefined ? opts.valor : N.store.getPath(s, opts.path); return U.campo(opts); }
      function sel(opts) { opts.scope = 'sim'; opts.origem = o(opts.path); opts.valor = N.store.getPath(s, opts.path); return U.selecao(opts); }
      function sw(opts) { opts.scope = 'sim'; opts.origem = o(opts.path); opts.marcado = N.store.getPath(s, opts.path); return U.chave(opts); }
      function seg(opts) { opts.scope = 'sim'; opts.origem = o(opts.path); opts.valor = N.store.getPath(s, opts.path); return U.segmento(opts); }

      // ---------- 1. Mercadoria
      var cMerc = U.cartao({
        eyebrow: 'Mercadoria', titulo: 'Identificação do produto',
        corpo: '<div class="nx-form-grid">' +
          f({ rotulo: 'Código do produto', path: 'produto.codigo', largura: 'sm', dica: 'Código do item no seu cadastro. Liga o produto ao módulo Lucratividade por Item.' }) +
          f({ rotulo: 'Descrição da mercadoria', path: 'produto.descricao', largura: 'lg', obrigatorio: true }) +
          f({ rotulo: 'NCM', path: 'produto.ncm', largura: 'sm', maxlength: 10, placeholder: '0000.00.00', dica: 'Nomenclatura Comum do Mercosul — 8 dígitos. Define ST, monofasia e tratamentos de IBS/CBS.' }) +
          f({ rotulo: 'CEST', path: 'produto.cest', largura: 'sm', maxlength: 9, placeholder: '00.000.00', dica: 'Código Especificador da ST, quando aplicável (7 dígitos).' }) +
          '</div>'
      });

      // ---------- 2. Operação
      var cOp = U.cartao({
        eyebrow: 'Operação', titulo: 'Origem, destino e CFOP',
        sub: op.itens.length > 1 ? 'Tipo de operação, UF de origem, UF de destino e destinatário são da operação: ao alterar aqui, a mudança vale para os ' + op.itens.length + ' produtos e os CFOPs são ajustados ao novo grupo.' : 'Estes dados definem a natureza da operação; os próximos produtos herdam a mesma natureza.',
        corpo: '<div class="nx-form-grid">' +
          sel({ rotulo: 'Tipo de operação (entrada)', path: 'operacao.tipo', largura: 'md', opcoes: [['interna', 'Interna'], ['interestadual', 'Interestadual'], ['importacao', 'Importação direta'], ['outra', 'Outra operação']] }) +
          sel({ rotulo: 'UF de origem (fornecedor)', path: 'operacao.ufOrigem', largura: 'sm', opcoes: U.UF_OPCOES }) +
          '<div class="nx-field w-sm"><span class="nx-label">UF da empresa</span><span class="nx-static">' + esc(emp.uf || '—') + '</span></div>' +
          sel({ rotulo: 'UF de destino (venda)', path: 'operacao.ufDestino', largura: 'sm', opcoes: U.UF_OPCOES }) +
          sel({ rotulo: 'Destinatário da venda', path: 'operacao.destinatario', largura: 'md', opcoes: [['contribuinte', 'Contribuinte do ICMS (revenda/industrialização)'], ['nao_contribuinte', 'Consumidor final não contribuinte']] }) +
          f({ rotulo: 'CFOP de entrada', path: 'produto.cfopEntrada', largura: 'sm', maxlength: 5, placeholder: (esp.entrada || '1') + '.102', ajuda: esp.entrada ? 'Deve iniciar por <b>' + esp.entrada + '</b> (' + esc(esp.natureza.toLowerCase()) + ').' : 'Informe o CFOP da entrada.' }) +
          f({ rotulo: 'CFOP de saída', path: 'produto.cfopSaida', largura: 'sm', maxlength: 5, placeholder: (esp.saida || '5') + '.102', ajuda: esp.saida ? 'Deve iniciar por <b>' + esp.saida + '</b> (venda ' + (esp.vendaInter ? 'interestadual' : 'interna') + ').' : '' }) +
          '</div>' +
          sw({ path: 'operacao.importado', rotulo: 'Mercadoria importada (alíquota interestadual de 4%)', ajuda: 'Resolução do Senado 13/2012 — conteúdo de importação acima de 40%.' })
      });

      // ---------- 3. Valores
      var cVal = U.cartao({
        eyebrow: 'Nota fiscal de entrada', titulo: 'Valores da aquisição',
        sub: 'Valores deste produto na NF de compra. O valor total é calculado (quantidade × valor unitário). O ICMS próprio já está embutido no valor (cálculo por dentro); o IPI é destacado por fora. Em frete, seguro, despesas e descontos, informe a parcela deste produto.',
        corpo: '<div class="nx-form-grid">' +
          f({ rotulo: 'Quantidade', path: 'produto.quantidade', tipo: 'num', largura: 'sm', obrigatorio: true }) +
          f({ rotulo: 'Unidade', path: 'produto.unidade', largura: 'xs', maxlength: 6 }) +
          f({ rotulo: 'Valor unitário', path: 'valores.valorUnitario', tipo: 'unit', largura: 'sm', obrigatorio: true, dica: 'Valor unitário da NF de compra. Aparece com 2 casas decimais; casas a mais digitadas continuam no cálculo.' }) +
          '<div class="nx-field w-md"><span class="nx-label">Valor total dos produtos</span><span class="nx-static is-calc" data-live="op-total-prod">' + totalProdutosAtivo(A) + '</span><span class="nx-help">Quantidade × valor unitário (calculado automaticamente)</span></div>' +
          '</div><div class="nx-form-grid">' +
          f({ rotulo: 'Frete', path: 'valores.frete', tipo: 'money', largura: 'sm' }) +
          f({ rotulo: 'Seguro', path: 'valores.seguro', tipo: 'money', largura: 'sm' }) +
          f({ rotulo: 'Outras despesas acessórias', path: 'valores.despesas', tipo: 'money', largura: 'sm' }) +
          f({ rotulo: 'Descontos incondicionais', path: 'valores.desconto', tipo: 'money', largura: 'sm', dica: 'Descontos destacados na NF e não condicionados a evento futuro reduzem a base dos tributos.' }) +
          f({ rotulo: 'IPI destacado na NF', path: 'valores.ipi', tipo: 'money', largura: 'sm', dica: 'IPI cobrado por fora pelo fornecedor industrial ou equiparado. Quando informado, prevalece sobre o cálculo pela alíquota.' }) +
          f({ rotulo: 'Alíquota do IPI (TIPI)', path: 'perfil.ipi.aliqEntrada', tipo: 'pct', largura: 'sm', dica: 'Usada para calcular o IPI apenas quando o valor destacado na NF não for informado.' }) +
          '</div>' +
          '<div data-live="op-nf">' + resumoNF(A) + '</div>' +
          sw({ path: 'valores.freteNaNota', rotulo: 'Frete cobrado pelo fornecedor na própria NF', ajuda: 'Desmarque se o frete for contratado à parte (CT-e): ele entra no custo, fora da base dos tributos da NF.' }) +
          (s.valores.freteNaNota === false ? '<div class="nx-form-grid">' + f({ rotulo: 'ICMS destacado no CT-e', path: 'valores.icmsFrete', tipo: 'money', largura: 'sm', dica: 'ICMS embutido no frete contratado à parte. É creditado quando o ICMS da compra é recuperável. O frete fica fora da base do crédito de PIS/Cofins.' }) + '</div>' : '')
      });

      // ---------- 4. Fornecedor e hipótese de 2027
      var cForn = U.cartao({
        eyebrow: 'Fornecedor', titulo: 'Regime do fornecedor e preço em 2027',
        sub: 'O direito a crédito depende do regime do fornecedor. Em 2027, informe a hipótese de preço do fornecedor: o simulador não presume aumento nem redução.',
        corpo: '<div class="nx-form-grid">' +
          sel({ rotulo: 'Fornecedor em 2026', path: 'fornecedor.regime26', largura: 'md', opcoes: [['regular', 'Regime normal (LP/LR/indústria)'], ['simples', 'Optante pelo Simples Nacional']] }) +
          (s.fornecedor.regime26 === 'simples' || s.fornecedor.regime27 !== 'regular' ? f({ rotulo: '% de crédito de ICMS informado na NF', path: 'fornecedor.icmsSimplesPct', tipo: 'pct', largura: 'sm', dica: 'LC 123/2006, art. 23, § 1º: percentual do ICMS do optante, informado no documento fiscal.' }) : '') +
          sel({ rotulo: 'Fornecedor em 2027', path: 'fornecedor.regime27', largura: 'md', opcoes: [['regular', 'Regime regular de IBS/CBS'], ['simples', 'Simples Nacional — IBS/CBS no DAS'], ['simples_regular', 'Simples Nacional — IBS/CBS fora do DAS']] }) +
          (s.fornecedor.regime27 === 'simples' ? f({ rotulo: 'CBS paga no DAS (% do valor)', path: 'fornecedor.cbsSimplesPct', tipo: 'pct', largura: 'sm', dica: 'Limite do crédito do adquirente (LC 214, art. 47, § 9º).' }) + f({ rotulo: 'IBS pago no DAS (% do valor)', path: 'fornecedor.ibsSimplesPct', tipo: 'pct', largura: 'sm' }) : '') +
          '</div>' +
          seg({ rotulo: 'Hipótese: valor dos produtos em 2027', path: 'premissas.valorProdutos2027', opcoes: [['mesmo', 'Mesmo valor', 'CBS/IBS acrescidos por fora'], ['sem_pis_cofins', 'Sem PIS/Cofins embutidos', 'fornecedor repassa a extinção'], ['manual', 'Informar valor', 'cotação ou acordo comercial']] }) +
          (pr.valorProdutos2027 === 'sem_pis_cofins' ? '<div class="nx-form-grid">' + f({ rotulo: 'PIS/Cofins embutidos no preço do fornecedor', path: 'fornecedor.pisCofinsEmbutidoPct', tipo: 'pct', largura: 'sm', ajuda: 'Referência: Lucro Real 9,25% × (1 − alíq. ICMS); Lucro Presumido 3,65% × (1 − alíq. ICMS); Simples: parcelas de PIS/Cofins do DAS.' }) + '</div>' : '') +
          (pr.valorProdutos2027 === 'manual' ? '<div class="nx-form-grid">' + f({ rotulo: 'Valor unitário em 2027', path: 'premissas.valorUnitario2027Manual', tipo: 'unit', largura: 'sm', ajuda: 'Total em 2027 = quantidade × este valor unitário.' }) + '</div>' : '')
      });

      // ---------- 5. Perfil tributário
      var regras = RTC.rules.todas(A.d.regras);
      var regraAtual = pf.regraId ? RTC.rules.porId(pf.regraId, A.d.regras) : null;
      var trat = pf.icms.tratamento;
      var icmsBloco =
        '<div class="nx-subsec"><h3>ICMS</h3><div class="nx-form-grid">' +
          sel({ rotulo: 'Tratamento do ICMS', path: 'perfil.icms.tratamento', largura: 'md', opcoes: [['tributado', 'Tributado (normal)'], ['reducao_base', 'Redução de base de cálculo'], ['st', 'Substituição tributária'], ['isento', 'Isento / não tributado na saída'], ['diferido', 'Diferimento na saída'], ['outro', 'Outro (alíquotas manuais)']] }) +
          f({ rotulo: 'Fundamento estadual', path: 'perfil.icms.fundamento', largura: 'lg', placeholder: 'Ex.: RICMS-UF, art. …' }) +
        '</div>' +
        '<div class="nx-form-grid">' +
          '<div class="nx-field w-lg"><span class="nx-label">Alíquota na entrada</span>' + sw({ path: 'perfil.icms.aliqEntradaAuto', rotulo: 'Automática pela operação', classe: 'compact' }) +
            (pf.icms.aliqEntradaAuto !== false ? autoTexto(ctx.icmsEnt) : '') + '</div>' +
          (pf.icms.aliqEntradaAuto === false ? f({ rotulo: 'Alíquota de entrada', path: 'perfil.icms.aliqEntrada', tipo: 'pct', largura: 'sm' }) : '') +
          f({ rotulo: 'Redução de base na entrada', path: 'perfil.icms.reducaoEntrada', tipo: 'pct', largura: 'sm' }) +
          f({ rotulo: 'ICMS destacado na NF (opcional)', path: 'perfil.icms.valorEntradaInformado', tipo: 'money', largura: 'sm', dica: 'Se informado, substitui o cálculo automático do ICMS de entrada.' }) +
        '</div>' +
        '<div class="nx-form-grid">' +
          '<div class="nx-field w-lg"><span class="nx-label">Alíquota na saída</span>' + sw({ path: 'perfil.icms.aliqSaidaAuto', rotulo: 'Automática pela operação', classe: 'compact' }) +
            (pf.icms.aliqSaidaAuto !== false ? autoTexto(ctx.icmsSai) : '') + '</div>' +
          (pf.icms.aliqSaidaAuto === false ? f({ rotulo: 'Alíquota de saída', path: 'perfil.icms.aliqSaida', tipo: 'pct', largura: 'sm' }) : '') +
          (trat === 'reducao_base' ? f({ rotulo: 'Redução de base na saída', path: 'perfil.icms.reducaoSaida', tipo: 'pct', largura: 'sm' }) : '') +
        '</div>' +
        (trat === 'reducao_base' ? sw({ path: 'perfil.icms.estornoProporcional', rotulo: 'Estornar o crédito proporcionalmente à redução da saída', ajuda: 'STF, Tema 299. Desmarque se a legislação estadual autorizar a manutenção integral do crédito.' }) : '') +
        '</div>';

      var stBloco = trat === 'st' ? '<div class="nx-subsec"><h3>Substituição tributária</h3><div class="nx-form-grid">' +
          sel({ rotulo: 'Papel da empresa', path: 'perfil.st.papel', largura: 'md', opcoes: [['substituido', 'Substituído (compra com ICMS retido)'], ['substituto', 'Substituto (retém na venda)']] }) +
          sel({ rotulo: 'ICMS-ST', path: 'perfil.st.modo', largura: 'sm', opcoes: [['calculado', 'Calcular pela MVA'], ['informado', 'Informar valor da NF']] }) +
          (pf.st.modo === 'informado' && pf.st.papel === 'substituido' ? f({ rotulo: 'ICMS-ST retido na NF', path: 'perfil.st.valorInformado', tipo: 'money', largura: 'sm' }) : '') +
          (pf.st.modo !== 'informado' || pf.st.papel === 'substituto' ? f({ rotulo: 'MVA original', path: 'perfil.st.mva', tipo: 'pct', largura: 'sm', dica: 'Margem de valor agregado do convênio/protocolo ou do RICMS.' }) : '') +
        '</div>' +
        (pf.st.modo !== 'informado' || pf.st.papel === 'substituto' ? '<div class="nx-form-grid"><div class="nx-field w-lg"><span class="nx-label">Alíquota interna para a ST</span>' + sw({ path: 'perfil.st.aliqInternaAuto', rotulo: 'Usar alíquota interna cadastrada', classe: 'compact' }) + (pf.st.aliqInternaAuto !== false ? autoTexto(ctx.stInterna) : '') + '</div>' +
          (pf.st.aliqInternaAuto === false ? f({ rotulo: 'Alíquota interna (ST)', path: 'perfil.st.aliqInterna', tipo: 'pct', largura: 'sm' }) : '') + '</div>' +
          sw({ path: 'perfil.st.ajustarMva', rotulo: 'Ajustar a MVA em operações interestaduais (Convênio ICMS 142/2018)' }) : '') +
        '</div>' : '';

      var antTipo = RTC.model.tipoAntecipacao(pf.antecipado);
      var regimeNormalIcms = ctx.icmsRegular != null ? ctx.icmsRegular : emp.regime !== 'SN';
      var stRetido = trat === 'st' && pf.st.papel === 'substituido';
      var antInfo = '';
      if (antTipo === 'antecipado') {
        antInfo = regimeNormalIcms
          ? '<p class="nx-auto"><b>Crédito.</b> Empresa do regime normal: o ICMS antecipado é aproveitado como crédito fiscal após o efetivo recolhimento' + (emp.uf === 'CE' ? ' — Decreto 33.327/2019 (RICMS-CE), art. 61, § 5º.' : ' (confira a legislação da UF).') + '</p>'
          : '<p class="nx-auto is-missing"><b>Custo.</b> Empresa do Simples Nacional: o ICMS antecipado não gera crédito e integra o custo de aquisição (LC 123/2006, art. 13, § 1º, XIII, “g”, e art. 23).</p>';
      } else if (antTipo === 'st') {
        antInfo = '<p class="nx-auto is-missing"><b>Custo.</b> O ICMS-ST pago na entrada não gera crédito e encerra a cobrança até o consumidor final: a venda sai sem débito de ICMS.</p>';
      }
      var antModo = pf.antecipado.modo;
      var antCampos = '';
      if (antTipo === 'antecipado') {
        antCampos = '<div class="nx-form-grid">' +
          U.selecao({ scope: 'sim', path: 'perfil.antecipado.modo', valor: antModo === 'informado' ? 'informado' : 'diferencial', rotulo: 'Cálculo', largura: 'md', opcoes: [['diferencial', 'Diferencial (alíq. interna − alíq. da entrada)'], ['informado', 'Informar valor pago (DAE)']] }) +
          (antModo === 'informado' ? f({ rotulo: 'ICMS antecipado pago', path: 'perfil.antecipado.valor', tipo: 'money', largura: 'sm' }) : '') + '</div>';
      } else if (antTipo === 'st') {
        antCampos = '<div class="nx-form-grid">' +
          U.selecao({ scope: 'sim', path: 'perfil.antecipado.modo', valor: antModo === 'informado' ? 'informado' : 'mva', rotulo: 'Cálculo', largura: 'md', opcoes: [['mva', 'Calcular pela MVA'], ['informado', 'Informar valor pago (DAE)']] }) +
          (antModo === 'informado' ? f({ rotulo: 'ICMS-ST pago na entrada', path: 'perfil.antecipado.valor', tipo: 'money', largura: 'sm' })
            : f({ rotulo: 'MVA original', path: 'perfil.antecipado.mva', tipo: 'pct', largura: 'sm', dica: 'Margem de valor agregado do convênio/protocolo ou do RICMS.' })) + '</div>' +
          (antModo !== 'informado' ? autoTexto(ctx.interna ? ctx.interna(emp.uf) : null) + (s.operacao.tipo === 'interestadual' ? sw({ path: 'perfil.antecipado.ajustarMva', rotulo: 'Ajustar a MVA em operação interestadual (Convênio ICMS 142/2018)' }) : '') : '');
      }
      var antBloco = '<div class="nx-subsec"><h3>Antecipação do ICMS</h3>' +
        (stRetido
          ? '<p class="nx-muted">Mercadoria com ICMS-ST retido pelo fornecedor na NF (tratamento “Substituição tributária”): não há ICMS antecipado nem ICMS-ST a recolher na entrada.</p>' +
            (antTipo !== 'nenhum' ? seg({ rotulo: 'Recolhimento do ICMS na entrada', path: 'perfil.antecipado.tipo', opcoes: [['nenhum', 'Não há', 'sem antecipação']] }) : '')
          : seg({ rotulo: 'Recolhimento do ICMS na entrada', path: 'perfil.antecipado.tipo', opcoes: [
              ['nenhum', 'Não há', 'sem antecipação'],
              ['antecipado', 'ICMS antecipado', regimeNormalIcms ? 'regime normal: vira crédito após o pagamento' : 'Simples Nacional: vira custo'],
              ['st', 'ICMS-ST na entrada', 'vira custo e encerra a tributação']
            ] }) + antInfo + antCampos) +
        '</div>';

      var ipiBloco = '<div class="nx-subsec"><h3>IPI</h3><p class="nx-muted">O IPI da compra é informado em “Valores da aquisição”.</p>' +
        (emp.atividade === 'industria' ? '<div class="nx-form-grid">' + f({ rotulo: 'IPI na saída', path: 'perfil.ipi.aliqSaida', tipo: 'pct', largura: 'sm' }) + '</div>' : '') + sw({ path: 'perfil.ipi.mantido2027', rotulo: 'Manter o IPI em 2027 (produto com industrialização incentivada na ZFM)', ajuda: 'Regra geral: IPI reduzido a zero a partir de 2027 (ADCT, art. 126, III; LC 214, art. 454).' }) + '</div>';

      var pcBloco = '<div class="nx-subsec"><h3>PIS/Cofins — 2026</h3><div class="nx-form-grid">' +
          sel({ rotulo: 'Tratamento de PIS/Cofins', path: 'perfil.pisCofins.tratamento', largura: 'md', opcoes: [['normal', 'Tributação normal do regime'], ['monofasico', 'Monofásico (revenda a alíquota zero)'], ['aliquota_zero', 'Alíquota zero'], ['isento', 'Isenção'], ['suspensao', 'Suspensão'], ['outro', 'Outro (alíquotas manuais)']] }) +
          (pf.pisCofins.tratamento === 'outro' ? f({ rotulo: 'PIS', path: 'perfil.pisCofins.pisManual', tipo: 'pct', largura: 'xs' }) + f({ rotulo: 'Cofins', path: 'perfil.pisCofins.cofinsManual', tipo: 'pct', largura: 'xs' }) : '') +
          f({ rotulo: 'Fundamento', path: 'perfil.pisCofins.fundamento', largura: 'md', placeholder: 'Lei / dispositivo' }) +
        '</div>' + (pf.pisCofins.tratamento === 'outro' ? sw({ path: 'perfil.pisCofins.creditoManual', rotulo: 'Gera crédito na aquisição (Lucro Real)' }) : '') + '</div>';

      var a27 = ctx.a27 || {};
      var cbBloco = '<div class="nx-subsec"><h3>CBS/IBS — 2027</h3><div class="nx-form-grid">' +
          sel({ rotulo: 'Tratamento de IBS/CBS', path: 'perfil.cbsIbs.tratamento', largura: 'md', opcoes: [['padrao', 'Alíquota de referência'], ['reducao', 'Redução de alíquota (%)'], ['aliquota_zero', 'Alíquota zero'], ['isento', 'Isenção'], ['outro', 'Outro (alíquotas manuais)']] }) +
          (pf.cbsIbs.tratamento === 'reducao' ? f({ rotulo: 'Redução', path: 'perfil.cbsIbs.reducaoPct', tipo: 'pct', largura: 'xs' }) : '') +
          (pf.cbsIbs.tratamento === 'outro' ? f({ rotulo: 'CBS', path: 'perfil.cbsIbs.aliqCbsManual', tipo: 'pct', largura: 'xs' }) + f({ rotulo: 'IBS', path: 'perfil.cbsIbs.aliqIbsManual', tipo: 'pct', largura: 'xs' }) : '') +
          f({ rotulo: 'Fundamento (LC 214/2025)', path: 'perfil.cbsIbs.fundamento', largura: 'md', placeholder: 'Artigo / anexo aplicável ao NCM' }) +
        '</div>' +
        '<p class="nx-auto">Aplicado em 2027: <b>CBS ' + F.pct((a27.cbs || 0) * 100) + '</b> · <b>IBS ' + F.pct((a27.ibs || 0) * 100) + '</b> ' + (r.statusCbs ? U.status(r.statusCbs) : '') + ' <a href="#/rtc/parametros">alíquota de referência em Parâmetros</a></p>' +
        '</div>';

      var cPerfil = U.cartao({
        eyebrow: 'Perfil tributário', titulo: 'Tratamento fiscal da mercadoria',
        sub: 'Não se presume a mesma tributação para todas as mercadorias. Aplique uma regra cadastrada ou configure cada tributo manualmente.',
        corpo: '<div class="nx-form-grid">' +
          sel({ rotulo: 'Perfil tributário do produto', path: 'perfil.resumo', largura: 'md', opcoes: RTC.rules.RESUMOS, dica: 'Ao trocar o perfil, a regra correspondente é aplicada aos tratamentos abaixo.' }) +
          U.selecao({ scope: 'ui', path: 'regraSelecionada', rotulo: 'Regras cadastradas', valor: A.d.ui.regraSelecionada, largura: 'md', opcoes: [['', 'Selecione…']].concat(regras.map(function (rg) { return [rg.id, (rg.usuario ? '★ ' : '') + rg.nome]; })) }) +
          '<div class="nx-field w-md nx-field-actions">' + U.botao('Aplicar regra', 'aplicar-regra', { classe: 'sm' }) + U.botao('Salvar perfil como regra', 'salvar-regra', { classe: 'sm' }) + '</div>' +
        '</div>' +
        (regraAtual ? '<p class="nx-regra-info"><span class="nx-orig is-regra">regra</span> <b>' + esc(regraAtual.nome) + '</b> — ' + esc(regraAtual.desc || '') + (regraAtual.fund && regraAtual.fund.length ? ' <span class="nx-fonte">' + U.fundamentos(regraAtual.fund) + '</span>' : '') + '</p>' : '') +
        icmsBloco + stBloco + antBloco + ipiBloco + (emp.regime !== 'SN' ? pcBloco : '<div class="nx-subsec"><h3>PIS/Cofins — 2026</h3><p class="nx-muted">Incluídos no DAS. O tratamento abaixo é usado para segregar receitas (monofásico, ST).</p><div class="nx-form-grid">' + sel({ rotulo: 'Tratamento de PIS/Cofins', path: 'perfil.pisCofins.tratamento', largura: 'md', opcoes: [['normal', 'Tributação normal'], ['monofasico', 'Monofásico (segregar)'], ['aliquota_zero', 'Alíquota zero (segregar)'], ['isento', 'Isenção (segregar)']] }) + '</div></div>') + cbBloco
      });

      // ---------- 6. Venda
      var despesas = (s.venda.despesas || []).map(function (dv, i) {
        return '<div class="nx-despesa">' +
          U.campo({ scope: 'sim', path: 'venda.despesas.' + i + '.descricao', valor: dv.descricao, largura: 'lg', placeholder: 'Descrição (comissão, cartão, frete de venda…)', rotulo: i === 0 ? 'Despesa variável' : '' }) +
          U.campo({ scope: 'sim', path: 'venda.despesas.' + i + '.pct', tipo: 'pct', valor: dv.pct, largura: 'sm', rotulo: i === 0 ? '% sobre a venda' : '' }) +
          '<button type="button" class="nx-icon-btn" data-acao="rm-despesa" data-idx="' + i + '" aria-label="Remover despesa">×</button>' +
          '</div>';
      }).join('');
      var porUnidade = s.venda.basePreco === 'unitario';
      var qV = Number(s.produto.quantidade) || 0, unV = s.produto.unidade || 'UN';
      var cVenda = U.cartao({
        eyebrow: 'Venda', titulo: 'Margem, despesas e preço',
        corpo: seg({ rotulo: 'Forma de cálculo', path: 'venda.modo', opcoes: [['A', 'A · Margem → preço', 'markup divisor'], ['B', 'B · Preço → margem', 'margem efetiva do preço informado']] }) +
          U.segmento({ scope: 'sim', path: 'venda.basePreco', valor: porUnidade ? 'unitario' : 'total', rotulo: 'Calcular o preço por', opcoes: [['total', 'Quantidade total', qV ? qtdTexto(qV, unV) : 'quantidade cadastrada'], ['unitario', 'Por unidade', '1 ' + unV]] }) +
          '<div class="nx-form-grid">' +
            f({ rotulo: 'Margem de lucro desejada', path: 'venda.margem', tipo: 'pct', largura: 'sm', obrigatorio: s.venda.modo !== 'B', dica: 'Margem sobre o preço de venda (não é acréscimo sobre o custo).' }) +
            (porUnidade
              ? f({ rotulo: 'Preço de venda atual por unidade', path: 'venda.precoUnitarioAtual', tipo: 'unit', largura: 'md', obrigatorio: s.venda.modo === 'B', dica: 'Preço de 1 ' + unV + ' (com ICMS e PIS/Cofins embutidos). O total é quantidade × este preço. Usado no modo B e na análise “mesmo preço”.' })
              : f({ rotulo: 'Preço de venda atual (quantidade total)', path: 'venda.precoAtual', tipo: 'money', largura: 'md', obrigatorio: s.venda.modo === 'B', dica: 'Valor da mercadoria praticado hoje para toda a quantidade (com ICMS e PIS/Cofins embutidos). Usado no modo B e na análise “mesmo preço”.' })) +
          '</div>' +
          seg({ rotulo: 'A margem desejada é medida', path: 'premissas.baseMargem', opcoes: [['operacional', 'Antes de IRPJ/CSLL', 'margem de contribuição'], ['liquida', 'Após IRPJ/CSLL', 'lucro líquido da operação']] }) +
          '<div class="nx-despesas">' + despesas + '</div>' +
          U.botao('Adicionar despesa variável', 'add-despesa', { classe: 'sm' }) +
          '<div class="nx-form-grid">' + sel({ rotulo: 'Base das despesas variáveis', path: 'premissas.baseDespesas', largura: 'lg', opcoes: [['total', 'Total cobrado do cliente (com tributos por fora)'], ['mercadoria', 'Valor da mercadoria']] }) + '</div>'
      });

      // ---------- 7. Premissas avançadas
      var cPrem = '<details class="nx-card nx-details"><summary><span class="nx-eyebrow">Metodologia</span><strong>Premissas de base de cálculo</strong><small>Temas controvertidos e escolhas metodológicas — visíveis no relatório</small></summary><div class="nx-card-body">' +
        '<p class="nx-note">O ICMS fica sempre fora da base de PIS/Cofins: na venda (STF, Tema 69) e no crédito da compra (Lei 14.592/2023). Base do crédito: valor dos produtos − descontos − ICMS destacado na NF; frete, seguro, despesas e IPI ficam fora.</p>' +
        sw({ path: 'premissas.excluirStBasePisCofins', rotulo: 'Excluir o ICMS-ST da base de PIS/Cofins do substituído (STJ, Tema 1125)', ajuda: 'Avalie o risco e a situação processual da empresa.' }) +
        sw({ path: 'premissas.excluirStBaseCbs', rotulo: 'Excluir o ICMS-ST da base da CBS/IBS em 2027', ajuda: 'Interpretação do art. 12, § 2º, V, da LC 214/2025 — não pacificada.' }) +
        sw({ path: 'premissas.ipiNaBaseIcms', rotulo: 'Incluir o IPI na base do ICMS da entrada', ajuda: 'Regra geral: fora da base entre contribuintes para comercialização (LC 87, art. 13, § 2º).' }) +
        sw({ path: 'premissas.ibsCbsNaBaseIcms2027', rotulo: 'IBS/CBS integram a base do ICMS em 2027', ajuda: 'Entendimento de SEFAZ (SP, MG) a partir da exigibilidade; tema judicializado. Desmarque para simular a tese contrária.' }) +
        '<div class="nx-form-grid">' + sel({ rotulo: 'Na análise “mesmo preço”, manter', path: 'premissas.manterPreco', largura: 'lg', opcoes: [['total', 'O total cobrado do cliente'], ['mercadoria', 'O valor da mercadoria (IBS/CBS acrescidos)']] }) + '</div>' +
        '</div></details>';

      return '<div class="nx-work">' +
        '<div class="nx-work-main"><div class="nx-prod-form">' + cabProduto + cMerc + cOp + cVal + cForn + cPerfil + cVenda + cPrem + '</div></div>' +
        lateral +
        '</div>';
    },
    live: {
      'op-produtos': tabelaProdutos,
      'op-total-prod': totalProdutosAtivo,
      'op-prod-titulo': function (A) { var it = A.item(); return esc(it && it.produto.descricao ? it.produto.descricao : 'Novo produto'); },
      'op-nf': resumoNF,
      'op-resumo': resumoLateral,
      'op-alertas': alertasLateral
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* RTC Comparativo — tela 2: custo líquido de aquisição (2026 × 2027),
   da operação completa ou de um produto, pela quantidade total ou por unidade */
(function (root) {
  'use strict';
  var N = root.Nexus, RTC = N.rtc, U = RTC.ui, F = N.fmt, esc = F.esc;

  var TOGGLE = { icms: 'creditos.icms', ipi: 'creditos.ipi', pis: 'creditos.pisCofins', cofins: 'creditos.pisCofins', cbs: 'creditos.cbs', ibs: 'creditos.ibs', antecipado: 'creditos.antecipado' };

  function pendencias(erros) {
    return U.cartao({ titulo: 'Complete o cadastro da operação', corpo: U.alertas(erros, []) + U.botao('Ir para o cadastro da operação', 'ir', { dados: { rota: 'operacao' }, tipo: 'primary' }) });
  }

  /** Custos exibidos (2026 e 2027) conforme a visão e a base de cálculo */
  function custos(A, b) {
    var c26, c27;
    if (b.operacao) { c26 = A.cons && A.cons.custo26; c27 = A.cons && A.cons.custo27; }
    else { c26 = A.res.custo26; c27 = A.res.custo27; }
    if (!c26) return null;
    if (b.unidade) { c26 = RTC.engine.custoPorUnidade(c26, b.q); c27 = RTC.engine.custoPorUnidade(c27, b.q); }
    return { c26: c26, c27: c27 };
  }

  /** Linha da memória do custo: valor sempre visível; seta abre cálculo, fórmula, observação, origem e fundamento */
  function linhaHtml(l, A, b, prefixo) {
    var cls = l.destaque ? 'is-total' : (l.info ? 'is-info' : '');
    var credito = l.grupo === 'Créditos (tributos recuperáveis)';
    var toggle = '';
    if (credito && TOGGLE[l.id] && !b.operacao) {
      var s = A.item();
      var on = N.store.getPath(s, TOGGLE[l.id]) !== false;
      toggle = '<label class="nx-mini-switch" title="' + (l.elegivel ? 'Habilitar/desabilitar este crédito' : 'Não elegível') + '"><input type="checkbox" data-scope="sim" data-path="' + TOGGLE[l.id] + '"' + (on ? ' checked' : '') + (l.elegivel ? '' : ' disabled') + '><span aria-hidden="true"></span><em class="sr">' + esc(l.item) + '</em></label>';
    }
    var badge = credito ? (l.elegivel ? '<span class="nx-elig is-yes">Elegível</span>' : '<span class="nx-elig is-no">Não recuperável</span>') : '';
    var valor = l.info ? '<span class="nx-muted" title="Informativo — já embutido no valor">(' + b.m(l.valor) + ')</span>'
      : (l.item === 'Custo líquido unitário' ? F.unit(l.valor) : b.m(l.valor));
    var nome = (toggle ? '<div class="nx-cred-cell">' + toggle + '<div>' : '<div>') + '<span class="nx-item">' + esc(l.item) + '</span> ' + badge + '</div>' + (toggle ? '</div>' : '');
    return U.linhaComDetalhe(A, {
      chave: prefixo + '|' + l.grupo + '|' + (l.id || l.item), classe: cls, nome: nome,
      celulas: '<td class="num' + (l.valor < 0 ? ' is-neg' : '') + '">' + valor + '</td>',
      detalhe: U.conteudoDetalhe(l, b.m), colunas: 2
    });
  }

  function tabela(c, A, b, titulo, sub, classe) {
    var grupos = ['Aquisição', 'Créditos (tributos recuperáveis)', 'Resultado do custo'];
    var prefixo = 'custo|' + (b.operacao ? 'op' : 'prod') + '|' + classe;
    var corpo = grupos.map(function (g) {
      var ls = c.linhas.filter(function (l) { return l.grupo === g; });
      if (!ls.length) return '';
      return '<tbody><tr class="nx-group"><th colspan="2">' + esc(g) + '</th></tr>' + ls.map(function (l) { return linhaHtml(l, A, b, prefixo); }).join('') + '</tbody>';
    }).join('');
    var naoRec = c.naoRecuperaveis.length ? '<div class="nx-naorec"><h4>Tributos não recuperáveis incorporados ao custo</h4><ul>' +
      c.naoRecuperaveis.map(function (x) { return '<li><span>' + esc(x.item) + '</span><b>' + b.m(x.valor) + '</b></li>'; }).join('') +
      '<li class="is-total"><span>Total</span><b>' + b.m(c.totalNaoRecuperaveis) + '</b></li></ul></div>' : '<p class="nx-muted">Nenhum tributo não recuperável incorporado ao custo.</p>';
    var info = A.d.ui.detalhes === 'mais' ? c.linhas.filter(function (l) { return l.grupo === 'Informativo'; }).map(function (l) { return '<p class="nx-note"><b>' + esc(l.item) + ':</b> ' + esc(l.formula) + '</p>'; }).join('') : '';
    return U.cartao({
      classe: 'nx-period ' + classe, eyebrow: sub, titulo: titulo + ' · ' + esc(b.rotulo),
      corpo: '<div class="nx-table-wrap"><table class="nx-table nx-det-table"><thead><tr><th>Componente <small class="nx-th-dica">clique na seta para ver o detalhamento</small></th><th class="num">Valor' + (b.unidade ? ' por unidade' : '') + '</th></tr></thead>' + corpo + '</table></div>' + naoRec + info
    });
  }

  /** A resposta da tela numa frase: quanto o custo líquido muda de 2026 para 2027 */
  function frase(b, c26, c27) {
    var l26 = Math.round(c26.liquido * 100) / 100, l27 = Math.round(c27.liquido * 100) / 100;
    var dl = Math.round((l27 - l26) * 100) / 100;
    var pct = l26 ? dl / l26 * 100 : 0;
    var quem = b.operacao ? (b.unidade ? 'médio por unidade desta operação' : 'desta operação') : (b.unidade ? 'por unidade deste produto' : 'deste produto');
    var txt = Math.abs(dl) < 0.005
      ? 'Em janeiro de 2027, o custo líquido ' + quem + ' fica igual ao de 2026: <b>' + b.m(c27.liquido) + '</b>.'
      : 'Em janeiro de 2027, o custo líquido ' + quem + (dl > 0 ? ' sobe' : ' cai') + ' de <b>' + b.m(c26.liquido) + '</b> para <b>' + b.m(c27.liquido) + '</b>: ' +
        b.m(Math.abs(dl)) + (dl > 0 ? ' a mais' : ' a menos') + ' (' + F.signedPct(pct) + ').';
    return U.resposta(txt, 'Custo líquido é o que a mercadoria realmente custa: o valor pago na compra menos os tributos que voltam como crédito.', Math.abs(dl) < 0.005 ? '' : dl > 0 ? 'ruim' : 'bom');
  }

  function kpis(A) {
    var b = RTC.views.baseCalculo(A);
    var cc = custos(A, b);
    if (!cc) return '';
    var c26 = cc.c26, c27 = cc.c27;
    var dl = c27.liquido - c26.liquido;
    var sufixo = b.unidade ? ' por unidade' : '';
    // 4º indicador: a outra base (total quando por unidade; unitário quando pela quantidade total)
    var tot26 = b.operacao ? A.cons.custo26 : A.res.custo26, tot27 = b.operacao ? A.cons.custo27 : A.res.custo27;
    var quarto = b.unidade
      ? U.kpi({ rotulo: 'Custo líquido total 2027' + (b.operacao ? ' · operação' : ''), valor: F.brl(tot27.liquido), sub: '2026: ' + F.brl(tot26.liquido) + ' · ' + F.num(b.q, b.q % 1 ? 4 : 0) + ' ' + b.un })
      : U.kpi({ rotulo: (b.operacao ? 'Custo médio por unidade 2027' : 'Custo líquido unitário 2027'), valor: tot27.unitario != null ? F.unit(tot27.unitario) : '—', sub: tot26.unitario != null ? '2026: ' + F.unit(tot26.unitario) : (b.operacao ? 'Produtos com unidades diferentes' : 'Informe a quantidade na operação') });
    return frase(b, c26, c27) + '<div class="nx-kpis k4">' +
      U.kpi({ rotulo: 'Custo bruto de aquisição 2027' + sufixo, valor: b.m(c27.bruto), sub: '2026: ' + b.m(c26.bruto), dica: 'Tudo o que se paga na compra: mercadoria, frete, seguro e despesas (menos descontos), mais IPI, ICMS-ST e antecipação e, em 2027, CBS e IBS.' }) +
      U.kpi({ rotulo: 'Créditos recuperáveis 2027' + sufixo, valor: b.m(c27.totalCreditos), sub: '2026: ' + b.m(c26.totalCreditos), dica: 'Tributos pagos na compra que a empresa recupera: viram crédito para abater dos tributos da venda.' }) +
      U.kpi({ rotulo: 'Custo líquido 2027' + sufixo, valor: b.m(c27.liquido), deltaTexto: F.signedBrl(dl) + ' (' + F.signedPct(c26.liquido ? dl / c26.liquido * 100 : 0) + ') vs 2026', sub: '2026: ' + b.m(c26.liquido), delta: dl, bomQuando: 'desce', destaque: true, dica: 'Custo bruto menos os créditos: o quanto a mercadoria realmente custa para a empresa.' }) +
      quarto +
      '</div>';
  }

  function colunas(A) {
    var b = RTC.views.baseCalculo(A);
    var cc = custos(A, b);
    if (!cc) return '';
    return '<div class="nx-cols-2">' +
      tabela(cc.c26, A, b, '2026', 'Regras atuais · ICMS, IPI e PIS/Cofins', 'p26') +
      tabela(cc.c27, A, b, 'Janeiro de 2027', 'Reforma · CBS no lugar de PIS/Cofins e IBS de transição', 'p27') +
      '</div>';
  }

  /** Custo de aquisição por produto (total e por unidade de cada produto) e total da operação */
  function tabelaOperacao(A) {
    var c = A.cons;
    if (!c || c.n < 2 || !RTC.views.visaoOperacao(A)) return '';
    var V = RTC.views;
    var rows = c.itens.map(function (x) {
      var r = x.r;
      var q = Number(x.item.produto.quantidade) || 0;
      var un = x.item.produto.unidade || 'UN';
      if (!r.custo26 || x.inconsistente) return '<tr><td class="c-prod">' + esc(x.nome) + '</td><td colspan="5"><span class="nx-count is-erro">' + (r.erros.length || 1) + ' pendência(s)</span> <button type="button" class="nx-link-btn" data-acao="ir" data-rota="operacao">corrigir no cadastro</button></td></tr>';
      var dl = r.custo27.liquido - r.custo26.liquido;
      return '<tr><td class="c-prod"><button type="button" class="nx-link-btn" data-acao="selecionar-produto" data-id="' + esc(x.item.id) + '" title="Analisar só este produto"><strong>' + esc(x.nome) + '</strong></button>' + (q ? '<small class="nx-obs">' + F.num(q, q % 1 ? 4 : 0) + ' ' + esc(un) + '</small>' : '') + '</td>' +
        '<td class="num">' + V.par(r.custo26.bruto, r.custo27.bruto, F.brl) + '</td>' +
        '<td class="num">' + V.par(r.custo26.totalCreditos, r.custo27.totalCreditos, F.brl) + '</td>' +
        '<td class="num">' + V.par(r.custo26.liquido, r.custo27.liquido, F.brl, true) + '</td>' +
        '<td class="num">' + (q ? V.par(r.custo26.liquido / q, r.custo27.liquido / q, F.unit) : '—') + '</td>' +
        '<td class="num">' + V.variacao(dl, r.custo26.liquido ? dl / r.custo26.liquido * 100 : 0, 'desce') + '</td></tr>';
    }).join('');
    var qc = c.qtdComum;
    var t = c.custo26 ? '<tr class="is-total"><td class="c-prod">Total da operação' + (c.completoCusto ? '' : ' (parcial)') + (qc ? '<small class="nx-obs">' + F.num(qc.quantidade, qc.quantidade % 1 ? 4 : 0) + ' ' + esc(qc.unidade) + '</small>' : '') + '</td>' +
      '<td class="num">' + V.par(c.custo26.bruto, c.custo27.bruto, F.brl) + '</td>' +
      '<td class="num">' + V.par(c.custo26.totalCreditos, c.custo27.totalCreditos, F.brl) + '</td>' +
      '<td class="num">' + V.par(c.custo26.liquido, c.custo27.liquido, F.brl, true) + '</td>' +
      '<td class="num">' + (qc ? V.par(c.custo26.unitario, c.custo27.unitario, F.unit) : '—') + '</td>' +
      '<td class="num">' + V.variacao(c.custo27.liquido - c.custo26.liquido, c.custo26.liquido ? (c.custo27.liquido - c.custo26.liquido) / c.custo26.liquido * 100 : 0, 'desce') + '</td></tr>' : '';
    return U.cartao({ eyebrow: 'Operação completa', titulo: 'Custo de aquisição por produto',
      sub: 'Em cada célula, 2026 em cima e janeiro de 2027 embaixo, em laranja. Valores pela quantidade de cada produto e por unidade.' + (qc ? '' : ' A média por unidade da operação exige a mesma unidade de medida em todos os produtos.') + ' Clique em um produto para analisá-lo sozinho.',
      corpo: '<div class="nx-table-wrap"><table class="nx-table compact nx-tab-par"><thead><tr><th>Produto</th><th class="num">Custo bruto</th><th class="num">Créditos<small class="nx-th-dica">tributos recuperáveis</small></th><th class="num">Custo líquido</th><th class="num">Por unidade<small class="nx-th-dica">custo líquido</small></th><th class="num">Variação<small class="nx-th-dica">do custo líquido</small></th></tr></thead><tbody>' + rows + t + '</tbody></table></div>' });
  }

  function renderOperacao(A) {
    var c = A.cons;
    var topo = RTC.views.seletorAnalise(A, 'Calcular o custo por');
    if (!c || !c.custo26) return '<div class="nx-stack">' + topo + pendencias(c ? c.erros : []) + '</div>';
    var parcial = !c.completoCusto ? U.alertas([], [{ msg: 'Totais parciais: ' + c.itens.filter(function (x) { return !x.r.custo26 || x.inconsistente; }).map(function (x) { return x.nome; }).join('; ') + ' — com pendências, fora da soma.' }]) : '';
    return '<div class="nx-stack">' + topo + parcial +
      '<div data-live="custo-kpis">' + kpis(A) + '</div>' +
      U.explica('Como o custo é calculado?', '<p>Custo líquido de aquisição da operação completa: soma dos produtos (valor dos produtos + frete + seguro + despesas acessórias − descontos − tributos recuperáveis).</p><p>Créditos e hipóteses de preço do fornecedor são definidos por produto: escolha um produto em “Analisar” para alterá-los.</p>') +
      '<div data-live="custo-operacao">' + tabelaOperacao(A) + '</div>' +
      '<div data-live="custo-colunas">' + colunas(A) + '</div>' +
      '</div>';
  }

  function renderProduto(A) {
    var r = A.res;
    var s = A.item(), pr = s.premissas;
    var topo = RTC.views.seletorAnalise(A, 'Calcular o custo por');
    if (!r.custo26) return '<div class="nx-stack">' + topo + pendencias(r.erros) + '</div>';
    var hip = U.cartao({
      eyebrow: 'Premissa explícita · ' + esc(s.produto.descricao || 'produto'), titulo: 'Valor dos produtos em 2027',
      sub: 'A troca de PIS/Cofins pela CBS só altera o custo conforme o comportamento do preço do fornecedor. Escolha a hipótese a simular.',
      corpo: U.segmento({ scope: 'sim', path: 'premissas.valorProdutos2027', valor: pr.valorProdutos2027, opcoes: [['mesmo', 'Mesmo valor', 'CBS/IBS acrescidos por fora'], ['sem_pis_cofins', 'Sem PIS/Cofins embutidos', 'fornecedor repassa a extinção'], ['manual', 'Informar valor', 'cotação ou acordo comercial']] }) +
        (pr.valorProdutos2027 === 'sem_pis_cofins' ? '<div class="nx-form-grid">' + U.campo({ scope: 'sim', path: 'fornecedor.pisCofinsEmbutidoPct', tipo: 'pct', valor: s.fornecedor.pisCofinsEmbutidoPct, rotulo: 'PIS/Cofins embutidos no preço do fornecedor', largura: 'sm', ajuda: 'Lucro Real: 9,25% × (1 − alíq. ICMS). Lucro Presumido: 3,65% × (1 − alíq. ICMS).' }) + '</div>' : '') +
        (pr.valorProdutos2027 === 'manual' ? '<div class="nx-form-grid">' + U.campo({ scope: 'sim', path: 'premissas.valorUnitario2027Manual', tipo: 'unit', valor: pr.valorUnitario2027Manual, rotulo: 'Valor unitário em 2027', largura: 'sm', ajuda: 'Total em 2027 = quantidade × este valor unitário.' }) + '</div>' : '')
    });
    var outros = U.cartao({
      eyebrow: 'Ajustes', titulo: 'Outros tributos recuperáveis',
      sub: 'Créditos não modelados automaticamente (ex.: ICMS do CT-e, créditos presumidos), pelo valor total do produto. Documente o fundamento nas observações da empresa.',
      corpo: '<div class="nx-form-grid">' +
        U.campo({ scope: 'sim', path: 'creditos.outros26', tipo: 'money', valor: s.creditos.outros26, rotulo: 'Outros créditos 2026 (total)', largura: 'sm' }) +
        U.campo({ scope: 'sim', path: 'creditos.outros27', tipo: 'money', valor: s.creditos.outros27, rotulo: 'Outros créditos 2027 (total)', largura: 'sm' }) +
        '</div>'
    });
    return '<div class="nx-stack">' + topo +
      '<div data-live="custo-kpis">' + kpis(A) + '</div>' +
      U.explica('Como o custo é calculado?', '<p>Custo líquido de aquisição = valor dos produtos + frete + seguro + despesas acessórias − descontos − tributos recuperáveis.</p><p>Cada crédito depende do regime, da natureza da operação e da regra legal; use as chaves nas tabelas abaixo para habilitar ou desabilitar componentes elegíveis.</p>') + hip +
      '<div data-live="custo-colunas">' + colunas(A) + '</div>' + outros +
      '</div>';
  }

  RTC.views.custo = {
    render: function (A) {
      var vazio = RTC.views.semEmpresaOuSim(A);
      if (vazio) return vazio;
      return RTC.views.visaoOperacao(A) ? renderOperacao(A) : renderProduto(A);
    },
    live: {
      'custo-kpis': function (A) { return (RTC.views.visaoOperacao(A) ? A.cons && A.cons.custo26 : A.res.custo26) ? kpis(A) : U.alertas((RTC.views.visaoOperacao(A) ? A.cons : A.res).erros, []); },
      'custo-colunas': colunas,
      'custo-operacao': tabelaOperacao
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

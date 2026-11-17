/* Lucratividade por Item — etapa 1: parâmetros da empresa (regime, UF, alíquotas padrão) e cenário da simulação (2026 ou 2027) */
(function (root) {
  'use strict';
  var N = root.Nexus, LC = N.lucro, M = LC.motor, U = N.rtc.ui, F = N.fmt, esc = F.esc;

  /** Seletor do cenário (o mesmo do menu de etapas e da barra do topo) */
  function seletorCenario(L) {
    return U.segmento({ scope: 'mod', path: 'cenario', valor: L.cenario(), rotulo: 'Cenário da simulação', opcoes: [
      ['2026', '2026 · regras atuais', 'ICMS + PIS e Cofins (ou DAS)'],
      ['2027', '2027 · reforma tributária', 'ICMS + CBS e IBS por fora (LC 214/2025)']] });
  }

  /** Cartão do cenário 2027: alíquotas de CBS e IBS (as do RTC) e premissas ligáveis */
  function cartao2027(L, p, sw) {
    var ref = p.ref2027 || M.referencia2027();
    var st = N.rtc.params && N.rtc.params.STATUS[ref.status];
    var estimado = ref.status !== 'oficial';
    var aliq = '<dl class="lc-aliq27">' +
      '<div><dt>CBS</dt><dd>' + F.pct(ref.cbs) + '</dd><small>referência ' + F.pct(ref.cbsRef) + ' − ' + F.num(ref.reducao, 1) + ' ponto percentual (LC 214/2025, arts. 347 e 349)' +
        (st ? ' · <span class="lc-status is-' + esc(ref.status) + '" title="' + esc(st.desc) + '">' + esc(st.rotulo) + '</span>' : '') + '</small></div>' +
      '<div><dt>IBS</dt><dd>' + F.pct(ref.ibs) + '</dd><small>' + F.pct(ref.ibsUf) + ' estadual + ' + F.pct(ref.ibsMun) + ' municipal (art. 344)</small></div>' +
      '</dl>' +
      (estimado ? '<p class="nx-auto is-missing"><b>Alíquota da CBS ainda não oficial.</b> A alíquota de referência será fixada por Resolução do Senado (LC 214/2025, art. 349). O valor vem de Parâmetros e regras do RTC Comparativo e muda aqui quando for atualizado lá.</p>' : '');
    var simples = p.regime === 'SIMPLES';
    var premissas = (simples ? '' :
        sw({ path: 'ibsCbsNaBaseIcms', rotulo: 'CBS e IBS na base do ICMS da venda', padrao: true, ajuda: 'Entendimento da SEFAZ-SP e da SEFAZ-MG em respostas a consultas: a partir de 2027, a CBS e o IBS integram a base do ICMS. Tema judicializado.' })) +
      sw({ path: 'despesasSobreTotal', rotulo: 'Comissão e cartão sobre o total cobrado do cliente', padrao: true, ajuda: 'O cartão e a comissão incidem sobre o que o cliente paga, já com a CBS e o IBS. Desligado: sobre o preço da mercadoria.' }) +
      sw({ path: 'manterIpi2027', rotulo: 'Manter o IPI da compra em 2027', ajuda: 'Só para produto com industrialização incentivada na Zona Franca de Manaus. Nos demais, o IPI é zero a partir de 2027 (EC 132/2023, ADCT, art. 126, III; LC 214/2025, art. 454).' });
    var regras = simples
      ? '<p>No <b>Simples Nacional</b>, a CBS e o IBS ficam dentro do DAS: informe abaixo a alíquota efetiva do DAS de 2027. Na compra, a CBS e o IBS cobrados pelo fornecedor ficam no custo, sem crédito (LC 214/2025, art. 47, § 9º).</p>'
      : '<p><b>Na venda:</b> a CBS e o IBS são cobrados <b>por fora</b>: somados ao preço da mercadoria e pagos pelo cliente, sem reduzir o lucro (CF, art. 156-A, § 1º, IX). A base deles não tem o ICMS (LC 214/2025, art. 12, § 2º, V).</p>' +
        '<p><b>Na compra:</b> a CBS e o IBS destacados na nota entram no custo bruto e voltam integralmente como crédito (LC 214/2025, art. 47). PIS e Cofins deixam de existir (EC 132/2023, ADCT, art. 126, II).</p>';
    return U.cartao({ classe: 'lc-card-2027', eyebrow: 'Cenário 2027 · reforma tributária', titulo: 'CBS e IBS',
      sub: 'Mesmas regras e alíquotas do RTC Comparativo.',
      corpo: '<div class="lc-27-grid"><div>' + aliq + U.explica('O que muda em 2027?', regras + '<p>Premissa da compra: o fornecedor mantém o valor da mercadoria e acrescenta a CBS e o IBS por fora (a mesma premissa padrão do RTC).</p>') + '</div>' +
        '<div class="lc-27-premissas"><span class="nx-label">Premissas</span>' + premissas + '</div></div>' });
  }

  LC.views.parametros = {
    render: function (L) {
      var vazio = LC.views.semDados(L, false);
      if (vazio) return vazio;
      var emp = L.empresa(), an = L.analise(), p = L.params(an), pe = emp.params;
      var c27 = p.cenario === '2027';
      function c(o) { o.scope = 'param'; o.valor = N.store.getPath(pe, o.path); return U.campo(o); }
      function sw(o) { o.scope = 'param'; var v = N.store.getPath(pe, o.path); o.marcado = o.padrao ? v !== false : !!v; delete o.padrao; return U.chave(o); }

      var regimeEmp = M.REGIMES[emp.regime];
      var cAnalise = U.cartao({
        eyebrow: 'Análise · ' + esc(an.nome), titulo: 'Regime tributário',
        sub: 'Vem do cadastro da empresa (' + esc(regimeEmp) + '). Troque aqui para simular: "e se eu fosse Lucro Real?".',
        corpo: U.segmento({ compacto: true, scope: 'ana', path: 'regime', valor: an.regime || '', rotulo: 'Regime nesta análise', dica: 'O regime decide as regras de crédito da compra e os tributos da venda. A troca vale só para esta análise.', opcoes: [
          ['', 'Igual ao da empresa (' + regimeEmp + ')', 'regime do cadastro'], ['SIMPLES', 'Simples Nacional', 'simulação'], ['PRESUMIDO', 'Lucro Presumido', 'simulação'], ['REAL', 'Lucro Real', 'simulação']] }) +
          '<p class="nx-note">UF da empresa: <b>' + esc(emp.uf || '—') + '</b>' + (emp.uf === 'CE' ? ' — regras do DAE 1023/1031 habilitadas (Decreto 33.327/2019).' : ' — as regras do DAE 1023/1031 são do Ceará: fora dele, o valor de DAE entra no custo, sem crédito.') + ' <a href="#/lucro/empresas">Alterar no cadastro</a>.</p>'
      });

      var cCenario = U.cartao({ eyebrow: 'Cenário', titulo: 'Ano da simulação',
        sub: 'Vale para todas as empresas e análises do módulo. Também pode ser trocado no menu de etapas e na barra do topo.',
        corpo: seletorCenario(L) + (c27 ? '' : '<p class="nx-note">A partir de 2027, PIS e Cofins dão lugar à CBS e ao IBS (EC 132/2023 e LC 214/2025). Escolha 2027 para ver o efeito nos seus itens.</p>') });

      var aliq;
      if (p.regime === 'SIMPLES') {
        aliq = '<div class="nx-form-grid">' + c({ rotulo: 'Alíquota efetiva do DAS' + (c27 ? ' em 2027' : ''), path: 'dasAliquotaEfetiva', tipo: 'pct', largura: 'sm', dica: 'Calculada fora do módulo (RBT12 × alíquota − parcela a deduzir) ÷ RBT12, ou digitada.' + (c27 ? ' Em 2027, a CBS e o IBS ficam dentro do DAS.' : '') }) + '</div>' +
          '<p class="nx-fonte">LC 123/2006, art. 18. Para item com ICMS-ST ou antecipado, informe na planilha de tributação a alíquota do DAS sem a parcela do ICMS (art. 18, § 4º-A, I).</p>';
      } else if (c27) {
        var real = p.regime === 'REAL';
        aliq = '<p class="nx-note">Em 2027 o PIS e a Cofins deixam de existir (EC 132/2023, ADCT, art. 126, II): no lugar deles, a CBS e o IBS do cartão acima.</p>' +
          '<div class="nx-form-grid">' + c({ rotulo: 'PIS de hoje', path: real ? 'aliqPisReal' : 'aliqPisPresumido', tipo: 'pct', largura: 'sm' }) + c({ rotulo: 'Cofins de hoje', path: real ? 'aliqCofinsReal' : 'aliqCofinsPresumido', tipo: 'pct', largura: 'sm' }) + '</div>' +
          '<p class="nx-fonte">Usadas só no modo "Preço sem PIS/Cofins" da tela Venda, para retirar do preço de hoje o PIS e a Cofins embutidos nele.</p>';
      } else if (p.regime === 'REAL') {
        aliq = '<div class="nx-form-grid">' + c({ rotulo: 'PIS (não cumulativo)', path: 'aliqPisReal', tipo: 'pct', largura: 'sm' }) + c({ rotulo: 'Cofins (não cumulativa)', path: 'aliqCofinsReal', tipo: 'pct', largura: 'sm' }) + '</div>' +
          '<p class="nx-fonte">Lei 10.637/2002, art. 2º, e Lei 10.833/2003, art. 2º. Débito na venda e crédito na compra.</p>';
      } else {
        aliq = '<div class="nx-form-grid">' + c({ rotulo: 'PIS (cumulativo)', path: 'aliqPisPresumido', tipo: 'pct', largura: 'sm' }) + c({ rotulo: 'Cofins (cumulativa)', path: 'aliqCofinsPresumido', tipo: 'pct', largura: 'sm' }) + '</div>' +
          '<p class="nx-fonte">Lei 9.715/1998, art. 8º, I, e Lei 9.718/1998, art. 8º. Sem crédito na compra: o Presumido fica fora da não cumulatividade (Lei 10.637/2002, art. 8º, II; Lei 10.833/2003, art. 10, II).</p>';
      }
      var cAliq = U.cartao({ eyebrow: 'Alíquotas padrão · ' + esc(M.REGIMES[p.regime]) + ' · ' + p.cenario, titulo: 'Tributos sobre a venda',
        corpo: aliq + '<div class="nx-form-grid">' + c({ rotulo: 'ICMS interno padrão', path: 'aliqIcmsInternaPadrao', tipo: 'pct', largura: 'sm', dica: 'Usado nos itens sem tributação própria.' }) + '</div>' +
          (p.regime !== 'SIMPLES' ? '<p class="nx-note">' + (c27 ? 'A CBS e o IBS da venda incidem sobre (PLD − ICMS): LC 214/2025, art. 12, § 2º, V.' : 'PIS e Cofins da venda incidem sobre (PLD − ICMS): STF, Tema 69 (RE 574.706).') + '</p>' : '') });

      var ir = '';
      if (p.regime === 'SIMPLES') ir = '<p class="nx-muted">No Simples Nacional, IRPJ e CSLL estão incluídos no DAS.</p>';
      else {
        ir = sw({ path: 'considerarIrpjCsll', rotulo: p.regime === 'PRESUMIDO' ? 'Incluir IRPJ e CSLL presumidos nas deduções da venda' : 'Mostrar o lucro depois do IRPJ e da CSLL (estimativa)', ajuda: p.regime === 'PRESUMIDO' ? 'Presunção × alíquota sobre o PLD, sem o adicional de 10%, que depende do trimestre.' + (c27 ? ' Em 2027, a CBS e o IBS ficam fora da receita bruta (DL 1.598/1977, art. 12, § 4º).' : '') : 'Estimativa sobre o lucro do item. A apuração do Lucro Real depende do resultado do período, e não do item isolado.' });
        if (pe.considerarIrpjCsll) {
          if (p.regime === 'PRESUMIDO') {
            ir += '<div class="nx-form-grid">' + c({ rotulo: 'Presunção IRPJ', path: 'presuncaoIrpj', tipo: 'pct', largura: 'xs' }) + c({ rotulo: 'Alíquota IRPJ', path: 'aliqIrpj', tipo: 'pct', largura: 'xs' }) +
              c({ rotulo: 'Presunção CSLL', path: 'presuncaoCsll', tipo: 'pct', largura: 'xs' }) + c({ rotulo: 'Alíquota CSLL', path: 'aliqCsll', tipo: 'pct', largura: 'xs' }) + '</div>' +
              '<p class="nx-note">Padrão para revenda de mercadorias: 8% × 15% + 12% × 9% = <b>' + F.pct((Number(pe.presuncaoIrpj) * Number(pe.aliqIrpj) + Number(pe.presuncaoCsll) * Number(pe.aliqCsll)) / 100) + '</b> do PLD. Lei 9.249/1995, arts. 15 e 20 (editável para outras atividades).</p>';
          } else {
            ir += '<div class="nx-form-grid">' + c({ rotulo: 'Alíquota IRPJ', path: 'aliqIrpj', tipo: 'pct', largura: 'xs' }) + c({ rotulo: 'Alíquota CSLL', path: 'aliqCsll', tipo: 'pct', largura: 'xs' }) + c({ rotulo: 'Adicional IRPJ', path: 'adicionalIrpj', tipo: 'pct', largura: 'xs' }) + '</div>' +
              sw({ path: 'aplicarAdicional', rotulo: 'Considerar o adicional de 10% do IRPJ', ajuda: 'Aplica-se à parcela do lucro acima de R$ 20.000 por mês.' });
          }
        }
      }
      var cIr = U.cartao({ eyebrow: 'Resultado', titulo: 'IRPJ e CSLL', corpo: ir });

      var cMargem = U.cartao({ eyebrow: 'Meta', titulo: 'Margem-alvo da empresa',
        sub: 'Pinta o resultado (vermelho: prejuízo; amarelo: abaixo da meta; verde: na meta ou acima) e define o preço sugerido para a meta.',
        corpo: '<div class="nx-form-grid">' + c({ rotulo: 'Margem-alvo sobre o PLD', path: 'margemAlvo', tipo: 'pct', largura: 'sm', dica: 'PLD = preço líquido de desconto: o preço de venda menos o desconto incondicional.' }) + '</div>' });

      return '<div class="nx-stack">' + '<div class="nx-cols-2">' + cCenario + cAnalise + '</div>' + (c27 ? cartao2027(L, p, sw) : '') +
        '<div class="nx-cols-2">' + cAliq + cIr + '</div>' + cMargem +
        '<div class="nx-btn-row">' + U.botao('Ir para a compra', 'lc-ir', { dados: { rota: 'compra' }, tipo: 'primary' }) + '</div></div>';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * Lucratividade por Item — motor de cálculo (funções puras, sem dependência de interface).
 * Especificação: docs/modulo-lucratividade.md
 *
 * Todo o resultado sai de duas grandezas:
 *  - custo líquido (CL): custo bruto de aquisição menos os créditos que o regime recupera — fixo enquanto a compra não muda;
 *  - Σ: soma das deduções percentuais sobre o preço líquido de desconto (PLD) — fixa enquanto tributação e despesas não mudam.
 * Lucro = PLD·(1 − Σ) − CL · Margem = Lucro ÷ PLD · PV_alvo(m) = CL ÷ ((1 − d)(1 − Σ − m)).
 *
 * Valores de compra: total da linha (quantidade inteira); preço de venda: unitário.
 * Precisão total nos cálculos; arredondamento só na exibição.
 * Tributos sobre a venda vêm de uma lista configurável por cenário (CENARIOS): 2026 = ICMS + PIS/Cofins (ou DAS);
 * 2027 = ICMS + CBS e IBS por fora (ou DAS), com as mesmas regras e alíquotas do RTC Comparativo (LC 214/2025):
 *  - CBS e IBS por fora: não entram em Σ nem na receita; são somados ao preço e cobrados do cliente (CF, art. 156-A, § 1º, IX);
 *  - base da CBS e do IBS sem o ICMS (art. 12, § 2º, V); ICMS com CBS e IBS na base (entendimento da SEFAZ, premissa ligável);
 *  - compra: CBS e IBS por fora na nota, com crédito integral no regime regular (art. 47); IPI zero (ADCT, art. 126, III);
 *  - PIS e Cofins extintos (ADCT, art. 126, II).
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var LC = N.lucro = N.lucro || {};

  var REGIMES = { SIMPLES: 'Simples Nacional', PRESUMIDO: 'Lucro Presumido', REAL: 'Lucro Real' };
  var REGIMES_PIS_COFINS = { NORMAL: 'Tributação normal', MONOFASICO: 'Monofásico', ALIQ_ZERO: 'Alíquota zero', ISENTO: 'Isento', SUSPENSO: 'Suspenso' };
  var MODOS = {
    MARKUP_COM_DESPESAS: 'Markup que já contempla as despesas',
    MARKUP_SEM_DESPESAS: 'Markup que não contempla as despesas',
    PRECO_INFORMADO: 'Preço informado',
    PRECO_SEM_PIS_COFINS: 'Preço atual sem PIS/Cofins'
  };
  var CODIGOS_DAE = { '1023': 'ICMS Antecipado', '1031': 'ICMS-ST (entrada interestadual)' };
  var CENARIOS_INFO = { '2026': 'ICMS + PIS/Cofins (ou DAS)', '2027': 'ICMS + CBS e IBS por fora (ou DAS)' };
  /** Tratamento de CBS e IBS do item (vale para a compra e para a venda, como no RTC) */
  var REGIMES_CBS_IBS = { NORMAL: 'Alíquota de referência', REDUCAO: 'Redução de alíquota (%)', ALIQ_ZERO: 'Alíquota zero', ISENTO: 'Isenção' };

  // contadores de execução: permitem verificar que mudar o preço não recalcula CL nem Σ
  var contagem = { compra: 0, sigma: 0 };

  function n(v) { var x = Number(v); return v === null || v === undefined || v === '' || !isFinite(x) ? 0 : x; }
  function informado(v) { return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }
  function fr(pct) { return n(pct) / 100; }

  /** Parâmetros padrão da empresa (percentuais em %, como digitados) */
  function parametrosPadrao() {
    return {
      regime: 'REAL', uf: 'CE', cenario: '2026',
      aliqPisReal: 1.65, aliqCofinsReal: 7.6,          // Lei 10.637/2002, art. 2º; Lei 10.833/2003, art. 2º
      aliqPisPresumido: 0.65, aliqCofinsPresumido: 3,  // Lei 9.715/1998, art. 8º, I; Lei 9.718/1998, art. 8º
      aliqIcmsInternaPadrao: null,
      dasAliquotaEfetiva: null,
      presuncaoIrpj: 8, presuncaoCsll: 12,             // Lei 9.249/1995, arts. 15 e 20 (revenda de mercadorias)
      aliqIrpj: 15, adicionalIrpj: 10, aplicarAdicional: false, aliqCsll: 9,
      considerarIrpjCsll: false,
      margemAlvo: 15,
      // cenário 2027 (premissas iguais às do RTC)
      ibsCbsNaBaseIcms: true,     // IBS e CBS na base do ICMS (SEFAZ-SP e SEFAZ-MG; tema judicializado)
      despesasSobreTotal: true,   // comissão e cartão sobre o total cobrado do cliente (com CBS e IBS)
      manterIpi2027: false        // IPI zero em 2027, exceto produtos com industrialização incentivada na ZFM
    };
  }

  /**
   * Alíquotas de 2027 (em %), as do RTC: CBS = referência − redução de 0,1 p.p. (LC 214/2025, arts. 347 e 349);
   * IBS = 0,05% estadual + 0,05% municipal (art. 344). Vêm de Parâmetros e regras do RTC, inclusive valores ajustados lá.
   */
  function referencia2027() {
    var P = N.rtc && N.rtc.params;
    if (P && P.valores) {
      var ov = N.rtc.app && N.rtc.app.d ? N.rtc.app.d.parametros : null;
      var v = P.valores(ov), m = P.meta('cbsRef2027', ov);
      return { cbs: Math.max(0, v.cbsRef2027 - v.cbsReducao2027), ibs: v.ibsUf2027 + v.ibsMun2027, cbsRef: v.cbsRef2027, reducao: v.cbsReducao2027,
        ibsUf: v.ibsUf2027, ibsMun: v.ibsMun2027, status: m ? m.status : 'estimado' };
    }
    return { cbs: 8.7, ibs: 0.1, cbsRef: 8.8, reducao: 0.1, ibsUf: 0.05, ibsMun: 0.05, status: 'estimado' };
  }

  /** CBS e IBS do item em 2027 (frações), já com o tratamento do item (redução proporcional, como no art. 347, § 1º) */
  function aliquotas2027(p, item) {
    var ref = (p && p.ref2027) || referencia2027();
    var cb = (item && item.cbsIbs) || {};
    var regime = REGIMES_CBS_IBS[cb.regime] ? cb.regime : 'NORMAL';
    var fator = regime === 'ALIQ_ZERO' || regime === 'ISENTO' ? 0 : regime === 'REDUCAO' ? Math.max(0, 1 - fr(cb.reducao)) : 1;
    return { cbs: fr(ref.cbs) * fator, ibs: fr(ref.ibs) * fator, regime: regime, fator: fator, ref: ref };
  }

  /** Alíquotas de PIS e Cofins do regime (em %) */
  function aliquotasPisCofins(p) {
    if (p.regime === 'REAL') return { pis: n(p.aliqPisReal), cofins: n(p.aliqCofinsReal) };
    if (p.regime === 'PRESUMIDO') return { pis: n(p.aliqPisPresumido), cofins: n(p.aliqCofinsPresumido) };
    return { pis: 0, cofins: 0 };
  }

  // ------------------------------------------------------------------ 1. compra: créditos e custo líquido
  /**
   * CB = V_merc − D_compra + Frete + IPI + Seg + DAE.
   * Créditos: Simples nenhum; Presumido ICMS; Real ICMS + PIS/Cofins sobre
   * BC = V_merc − D_compra − ICMS_dest (frete, seguro, IPI e DAE fora da base — regra do escritório).
   * Item com DAE 1031 (ICMS-ST): nenhum crédito de ICMS (nem o destacado nem o do frete) — decisão do escritório;
   * a base de PIS/Cofins continua sem o ICMS destacado.
   */
  function calcularCompra(item, p) {
    contagem.compra++;
    var c = (item && item.compra) || {};
    var q = n(item && item.quantidade);
    var vm = n(c.valorMercadoria), dc = n(c.descontoCompra), frete = n(c.frete), icmsFrete = n(c.icmsFrete);
    var ipi = n(c.ipi), seg = n(c.seguroOutros), icmsDest = n(c.icmsDestacado), dae = n(c.daeValor);
    var codigo = dae > 0 ? String(c.daeCodigo || '') : '';
    var alertas = [];
    var regrasCE = String(p.uf || '').toUpperCase() === 'CE';

    var c27 = p.cenario === '2027';
    // 2027: IPI reduzido a zero (exceto ZFM); CBS e IBS por fora na nota, sobre (valor da operação − ICMS destacado)
    var ipiCusto = c27 && !p.manterIpi2027 ? 0 : ipi;
    var vop = vm - dc + (icmsFrete > 0 ? 0 : frete) + seg; // frete com ICMS do CT-e é contratado fora da NF
    var a27 = c27 ? aliquotas2027(p, item) : null;
    var baseCbsIbs = c27 ? Math.max(0, vop - icmsDest) : 0;
    var cbsIn = c27 ? baseCbsIbs * a27.cbs : 0, ibsIn = c27 ? baseCbsIbs * a27.ibs : 0;
    var creditoCbsIbs = 0, motivoCbsIbs = '';
    var motivoIpi = c27 && ipi > 0 ? (p.manterIpi2027 ? 'IPI mantido em 2027 (produto com industrialização incentivada na Zona Franca de Manaus).' : 'IPI reduzido a zero a partir de 2027 (EC 132/2023, ADCT, art. 126, III; LC 214/2025, art. 454): o IPI da nota (' + (N.fmt ? N.fmt.brl(ipi) : ipi.toFixed(2)) + ') sai do custo.') : '';

    var cb = vm - dc + frete + ipiCusto + seg + dae + cbsIn + ibsIn;
    var creditoIcms = 0, pendente = 0, creditoPC = 0, basePC = 0;
    var detalheIcms = [], motivoPC = '', motivoIcms = '';

    if (dae > 0 && !CODIGOS_DAE[codigo]) alertas.push({ tipo: 'dae-codigo', msg: 'DAE sem código válido: informe 1023 (ICMS Antecipado) ou 1031 (ICMS-ST). O valor ficou no custo, sem crédito.' });

    if (p.regime === 'SIMPLES') {
      motivoPC = 'Simples Nacional: nenhum crédito é apropriado (LC 123/2006, art. 23).';
    } else {
      if (codigo === '1031') {
        motivoIcms = 'Item com ICMS-ST (DAE 1031): a substituição tributária encerra a tributação, sem débito na venda e sem crédito na compra. ' +
          'O ICMS destacado na NF' + (icmsFrete ? ' e o ICMS do frete ficam' : ' fica') + ' no custo.';
      } else {
        creditoIcms = icmsDest + icmsFrete;
        if (icmsDest) detalheIcms.push(['ICMS destacado na NF', icmsDest]);
        if (icmsFrete) detalheIcms.push(['ICMS do frete (CT-e)', icmsFrete]);
      }
      if (codigo === '1023') {
        if (!regrasCE) {
          alertas.push({ tipo: 'dae-uf', msg: 'DAE 1023 com empresa fora do Ceará: as regras do DAE 1023/1031 são do Decreto 33.327/2019 (CE). O valor ficou no custo, sem crédito.' });
        } else if (c.daePago === false) {
          pendente = dae;
          alertas.push({ tipo: 'dae-1023-pendente', msg: 'DAE 1023 não pago: crédito de ICMS a apropriar após o recolhimento (Decreto 33.327/2019, art. 61, § 5º). Ele não reduz o custo líquido até o pagamento.' });
        } else {
          creditoIcms += dae;
          detalheIcms.push(['DAE 1023 — ICMS Antecipado (pago)', dae]);
        }
      }
      if (c27) {
        motivoPC = 'Em 2027 o PIS e a Cofins deixam de existir; no lugar deles entram a CBS e o IBS (EC 132/2023, ADCT, art. 126, II).';
      } else if (p.regime === 'REAL') {
        var ap = aliquotasPisCofins(p);
        var regPC = c.regimePisCofins || 'NORMAL';
        // regra do escritório: mercadoria − desconto − ICMS destacado na NF (inclusive o ICMS sobre o frete da NF).
        // Frete, seguro, IPI e DAE (1023 ou 1031) ficam fora; o ICMS do CT-e, que é do frete, também.
        basePC = Math.max(0, vm - dc - icmsDest);
        if (regPC !== 'NORMAL') motivoPC = 'Item ' + (REGIMES_PIS_COFINS[regPC] || regPC).toLowerCase() + ': sem crédito de PIS/Cofins (Leis 10.637/2002 e 10.833/2003, art. 3º, I, "b", e § 2º, II).';
        else if (c.fornecedorPjBrasil === false) motivoPC = 'Fornecedor que não é pessoa jurídica domiciliada no Brasil: sem crédito de PIS/Cofins (art. 3º, § 3º, I).';
        else creditoPC = basePC * (fr(ap.pis) + fr(ap.cofins));
      } else {
        motivoPC = 'Lucro Presumido: PIS/Cofins cumulativos, sem crédito (Lei 10.637/2002, art. 8º, II; Lei 10.833/2003, art. 10, II).';
      }
    }

    if (c27) {
      if (p.regime === 'SIMPLES') motivoCbsIbs = 'Simples Nacional: a CBS e o IBS pagos na compra ficam no custo, sem crédito (LC 214/2025, art. 47, § 9º).';
      else if (!(a27.cbs + a27.ibs > 0)) motivoCbsIbs = 'Item com ' + (a27.regime === 'ISENTO' ? 'isenção' : 'alíquota zero') + ' de CBS e IBS: nada a creditar.';
      else creditoCbsIbs = cbsIn + ibsIn; // não cumulatividade: crédito do valor destacado, quando pago (LC 214/2025, art. 47)
    }

    var cl = cb - creditoIcms - creditoPC - creditoCbsIbs;
    return {
      cenario: c27 ? '2027' : '2026',
      quantidade: q,
      custoBruto: cb, creditoIcms: creditoIcms, creditoIcmsPendente: pendente,
      basePisCofins: basePC, creditoPisCofins: creditoPC,
      baseCbsIbs: baseCbsIbs, cbsEntrada: cbsIn, ibsEntrada: ibsIn, creditoCbsIbs: creditoCbsIbs,
      aliqCbs: a27 ? a27.cbs : 0, aliqIbs: a27 ? a27.ibs : 0,
      custoLiquido: cl, custoLiquidoUnit: q > 0 ? cl / q : null,
      composicao: {
        valorMercadoria: vm, descontoCompra: dc, frete: frete, ipi: ipiCusto, ipiNota: ipi, seguroOutros: seg, dae: dae, daeCodigo: codigo,
        icmsDestacado: icmsDest, icmsFrete: icmsFrete, valorOperacao: vop
      },
      detalheIcms: detalheIcms, motivoIcms: motivoIcms, motivoPisCofins: motivoPC, motivoCbsIbs: motivoCbsIbs, motivoIpi: motivoIpi,
      alertas: alertas
    };
  }

  // ------------------------------------------------------------------ 2. venda: lista configurável de tributos e Σ
  /** Tributação padrão do regime para item sem tributação própria: ICMS de Parâmetros; com DAE 1031, ICMS-ST (sem ICMS na venda) */
  function tributacaoPadrao(item, p) {
    var c = (item && item.compra) || {};
    return { icmsSt: c.daeCodigo === '1031', aliqIcms: p.aliqIcmsInternaPadrao, reducaoBcIcms: 0, regimePisCofins: c.regimePisCofins || 'NORMAL', dasAliquota: null, padrao: true };
  }

  /** IRPJ e CSLL presumidos sobre o PLD (sem o adicional de 10%, que depende do trimestre) */
  function irPresumido(p, nota) {
    return [
      { id: 'irpj', nome: 'IRPJ presumido', aliq: fr(p.presuncaoIrpj) * fr(p.aliqIrpj), formula: 'PLD × presunção × alíquota do IRPJ', fund: 'Lei 9.249/1995, art. 15' + (nota || '') },
      { id: 'csll', nome: 'CSLL presumida', aliq: fr(p.presuncaoCsll) * fr(p.aliqCsll), formula: 'PLD × presunção × alíquota da CSLL', fund: 'Lei 9.249/1995, art. 20' + (nota || '') }
    ];
  }

  /**
   * Tributos sobre o PLD, por cenário. Cada entrada: { id, nome, aliq (fração do PLD), formula, fund }.
   * 2027 (CBS/IBS) é ponto de extensão: basta registrar outra configuração em CENARIOS.
   */
  var CENARIOS = {
    '2026': function (p, t) {
      if (p.regime === 'SIMPLES') {
        var das = informado(t.dasAliquota) ? n(t.dasAliquota) : n(p.dasAliquotaEfetiva);
        return [{ id: 'das', nome: 'Simples Nacional (DAS)', aliq: fr(das), formula: 'PLD × alíquota do DAS do item', fund: 'LC 123/2006, art. 18' }];
      }
      var aliqIcms = informado(t.aliqIcms) ? n(t.aliqIcms) : n(p.aliqIcmsInternaPadrao);
      var aIcms = t.icmsSt ? 0 : fr(aliqIcms) * (1 - fr(t.reducaoBcIcms));
      var ap = aliquotasPisCofins(p);
      var incide = (t.regimePisCofins || 'NORMAL') === 'NORMAL';
      var lista = [
        { id: 'icms', nome: t.icmsSt ? 'ICMS (item com ST: sem débito na venda)' : 'ICMS próprio', aliq: aIcms,
          formula: t.icmsSt ? 'Tributação encerrada pela substituição tributária' : 'PLD × alíquota × (1 − redução da base)', fund: 'LC 87/1996, art. 13, § 1º' },
        { id: 'pis', nome: 'PIS', aliq: incide ? fr(ap.pis) * (1 - aIcms) : 0,
          formula: incide ? 'Alíquota × (PLD − ICMS)' : 'Item sem incidência na venda', fund: 'STF, Tema 69 (RE 574.706)' },
        { id: 'cofins', nome: 'Cofins', aliq: incide ? fr(ap.cofins) * (1 - aIcms) : 0,
          formula: incide ? 'Alíquota × (PLD − ICMS)' : 'Item sem incidência na venda', fund: 'STF, Tema 69 (RE 574.706)' }
      ];
      if (p.regime === 'PRESUMIDO' && p.considerarIrpjCsll) lista = lista.concat(irPresumido(p));
      return lista;
    },
    /**
     * 2027: ICMS por dentro e CBS/IBS por fora (fora: true — ficam fora de Σ e são somados ao preço).
     * Com CBS e IBS na base do ICMS: ICMS = t × (PLD + CBS + IBS) e CBS + IBS = k × (PLD − ICMS) ⇒ ICMS = PLD × t(1 + k) ÷ (1 + t·k).
     */
    '2027': function (p, t, item) {
      if (p.regime === 'SIMPLES') {
        var das = informado(t.dasAliquota) ? n(t.dasAliquota) : n(p.dasAliquotaEfetiva);
        return [{ id: 'das', nome: 'Simples Nacional (DAS)', aliq: fr(das), formula: 'PLD × alíquota do DAS do item (CBS e IBS dentro do DAS)', fund: 'LC 123/2006, art. 18; LC 214/2025, art. 47, § 9º' }];
      }
      var a = aliquotas2027(p, item);
      var k = a.cbs + a.ibs;
      var aliqIcms = informado(t.aliqIcms) ? n(t.aliqIcms) : n(p.aliqIcmsInternaPadrao);
      var ti = t.icmsSt ? 0 : fr(aliqIcms) * (1 - fr(t.reducaoBcIcms));
      var grossUp = p.ibsCbsNaBaseIcms !== false && k > 0 && ti > 0;
      var aIcms = grossUp ? ti * (1 + k) / (1 + ti * k) : ti;
      var lista = [
        { id: 'icms', nome: t.icmsSt ? 'ICMS (item com ST: sem débito na venda)' : 'ICMS próprio', aliq: aIcms,
          formula: t.icmsSt ? 'Tributação encerrada pela substituição tributária' : grossUp ? 'Alíquota × (PLD + CBS + IBS) = PLD × t(1 + k) ÷ (1 + t·k)' : 'PLD × alíquota × (1 − redução da base)',
          fund: 'LC 87/1996, art. 13, § 1º' + (grossUp ? '; SEFAZ-SP e SEFAZ-MG (consultas): CBS e IBS na base do ICMS a partir de 2027 — tema judicializado' : '') },
        { id: 'cbs', nome: 'CBS', fora: true, aliq: a.cbs * (1 - aIcms),
          formula: a.cbs ? '(PLD − ICMS) × ' + (a.cbs * 100).toFixed(2).replace('.', ',') + '%' : 'Item sem CBS (' + REGIMES_CBS_IBS[a.regime].toLowerCase() + ')',
          fund: 'LC 214/2025, art. 12, § 2º, V, e arts. 347 e 349; CF, art. 195, § 17' },
        { id: 'ibs', nome: 'IBS', fora: true, aliq: a.ibs * (1 - aIcms),
          formula: a.ibs ? '(PLD − ICMS) × ' + (a.ibs * 100).toFixed(2).replace('.', ',') + '%' : 'Item sem IBS (' + REGIMES_CBS_IBS[a.regime].toLowerCase() + ')',
          fund: 'LC 214/2025, art. 12, § 2º, V, e art. 344; CF, art. 156-A, § 1º, IX' }
      ];
      if (p.regime === 'PRESUMIDO' && p.considerarIrpjCsll) lista = lista.concat(irPresumido(p, '; CBS e IBS fora da receita bruta (DL 1.598/1977, art. 12, § 4º)'));
      return lista;
    }
  };

  /**
   * Σ = Σ tributos (fração do PLD) + comissão + taxa de cartão.
   * Real: Σ = a_ICMS + (a_PIS + a_COF)(1 − a_ICMS) + a_com + a_cartão. Simples: DAS + comissão + cartão.
   */
  function calcularSigma(p, trib, venda, item) {
    contagem.sigma++;
    var cfg = CENARIOS[p.cenario || '2026'];
    if (!cfg) return { erro: 'Cenário ' + p.cenario + ' não disponível neste módulo.', sigma: null, componentes: [] };
    var t = trib || {};
    var v = venda || {};
    var lista = cfg(p, t, item || {});
    var tributos = lista.filter(function (x) { return !x.fora; }).map(function (x) { return Object.assign({ tipo: 'tributo' }, x); });
    // tributos por fora (CBS e IBS em 2027): somados ao preço e cobrados do cliente; não reduzem o lucro
    var fora = lista.filter(function (x) { return x.fora; }).map(function (x) { return Object.assign({ tipo: 'fora' }, x); });
    var somaF = fora.reduce(function (s, x) { return s + x.aliq; }, 0);
    // comissão e cartão sobre o total cobrado do cliente (PLD + CBS + IBS), como na premissa padrão do RTC
    var fd = fora.length && p.despesasSobreTotal !== false ? 1 + somaF : 1;
    var sobre = fd > 1 ? '(PLD + CBS + IBS)' : 'PLD';
    var despesas = [
      { id: 'comissao', nome: 'Comissão', tipo: 'despesa', aliq: fr(v.comissao) * fd, formula: sobre + ' × comissão' },
      { id: 'cartao', nome: 'Taxa de cartão', tipo: 'despesa', aliq: fr(v.taxaCartao) * fd, formula: sobre + ' × taxa de cartão' }
    ];
    var somaT = tributos.reduce(function (s, x) { return s + x.aliq; }, 0);
    var somaD = despesas.reduce(function (s, x) { return s + x.aliq; }, 0);
    // Lucro Real: IRPJ/CSLL só como estimativa sobre o lucro do item (não entram em Σ)
    var irReal = p.regime === 'REAL' && p.considerarIrpjCsll ? fr(p.aliqIrpj) + (p.aplicarAdicional ? fr(p.adicionalIrpj) : 0) + fr(p.aliqCsll) : 0;
    return { sigma: somaT + somaD, tributos: somaT, despesas: somaD, componentes: tributos.concat(despesas), fora: fora, foraSoma: somaF, irRealEstimado: irReal };
  }

  // ------------------------------------------------------------------ 3. resultado e preços derivados
  function fracaoDesconto(venda, pv) {
    var v = venda || {};
    if (v.descontoTipo === 'valor') return pv > 0 ? n(v.desconto) / pv : 0;
    return fr(v.desconto);
  }

  /** Preço que atinge a margem m (fração) sobre o PLD; m = 0 → preço mínimo (lucro zero) */
  function precoParaMargem(cl, venda, sigma, m) {
    if (!(sigma + m < 1)) return { erro: 'Σ + margem chega a 100% ou mais (' + ((sigma + m) * 100).toFixed(2).replace('.', ',') + '%): não existe preço que atinja essa margem.' };
    var v = venda || {};
    if (v.descontoTipo === 'valor') return { pv: cl / (1 - sigma - m) + n(v.desconto) };
    var d = fr(v.desconto);
    if (!(d < 1)) return { erro: 'Desconto de 100% ou mais: não há preço líquido.' };
    return { pv: cl / ((1 - d) * (1 - sigma - m)) };
  }

  /**
   * Parte do PLD que é PIS + Cofins no preço de hoje, pelas regras de 2026: (alíquota do PIS + da Cofins) × (1 − ICMS),
   * a mesma conta do débito da venda (STF, Tema 69). Zero no Simples (PIS e Cofins dentro do DAS) e no item sem incidência.
   */
  function fracaoPisCofins(p, t) {
    t = t || {};
    if (!p || p.regime === 'SIMPLES' || (t.regimePisCofins || 'NORMAL') !== 'NORMAL') return 0;
    var ap = aliquotasPisCofins(p);
    var aliqIcms = informado(t.aliqIcms) ? n(t.aliqIcms) : n(p.aliqIcmsInternaPadrao);
    var aIcms = t.icmsSt ? 0 : fr(aliqIcms) * (1 - fr(t.reducaoBcIcms));
    return (fr(ap.pis) + fr(ap.cofins)) * (1 - aIcms);
  }

  /**
   * Preço de venda pelo modo escolhido (o preço resultante pode ser editado e passa a valer como informado).
   * Modo "preço atual sem PIS/Cofins": o preço de hoje menos o PIS e a Cofins embutidos nele (descontaminação).
   * opc.fracaoPisCofins: parte do PLD que é PIS + Cofins (fracaoPisCofins); só se informa no cenário 2027, em que o PIS e a
   * Cofins deixam de existir (ADCT, art. 126, II). Em 2026 o preço atual vale como está. O PLD cai exatamente o valor retirado.
   */
  function precoPorModo(venda, cl, sigma, opc) {
    var v = venda || {};
    if (v.modo === 'PRECO_SEM_PIS_COFINS') {
      if (!informado(v.precoAtual) || !(n(v.precoAtual) > 0)) return { erro: 'Informe o preço atual (com PIS e Cofins).' };
      var pa = n(v.precoAtual), f = n(opc && opc.fracaoPisCofins);
      var dv = v.descontoTipo === 'valor';
      var pldAtual = dv ? Math.max(0, pa - n(v.desconto)) : pa * Math.max(0, 1 - fr(v.desconto));
      var retirado = pldAtual * f;                     // PIS + Cofins embutidos no PLD de hoje
      var pv = dv ? pa - retirado : pa * (1 - f);       // com desconto em %, PV × (1 − f) tira o mesmo valor do PLD
      return { pv: pv, descontaminacao: { precoAtual: pa, fracao: f, retiradoPld: retirado, retiradoPreco: pa - pv, aplicada: !!(opc && opc.cenario2027) } };
    }
    if (v.modo === 'MARKUP_COM_DESPESAS') {
      if (!informado(v.markup)) return { erro: 'Informe o markup.' };
      return { pv: cl * n(v.markup) };
    }
    if (v.modo === 'MARKUP_SEM_DESPESAS') {
      if (!informado(v.markup)) return { erro: 'Informe o markup.' };
      if (!(sigma < 1)) return { erro: 'Tributos e despesas somam 100% ou mais do preço.' };
      var base = cl * n(v.markup);
      if (v.descontoTipo === 'valor') return { pv: base / (1 - sigma) + n(v.desconto) };
      var d = fr(v.desconto);
      if (!(d < 1)) return { erro: 'Desconto de 100% ou mais.' };
      return { pv: base / ((1 - d) * (1 - sigma)) };
    }
    if (!informado(v.precoVenda) || !(n(v.precoVenda) > 0)) return { erro: 'Informe o preço de venda.' };
    return { pv: n(v.precoVenda) };
  }

  /**
   * Resultado unitário para um preço PV (só a etapa 3: usa CL e Σ já calculados).
   * PLD = PV·(1 − d) · Lucro = PLD·(1 − Σ) − CL · Margem = Lucro ÷ PLD.
   */
  function calcularResultado(compra, sig, venda, pv, p) {
    var cl = compra.custoLiquidoUnit;
    var q = compra.quantidade;
    var d = fracaoDesconto(venda, pv);
    var pld = pv * (1 - d);
    var tributos = pld * sig.tributos;
    var despesas = pld * sig.despesas;
    var lucro = pld * (1 - sig.sigma) - cl;
    var margem = pld ? lucro / pld : null;
    var ir = sig.irRealEstimado ? Math.max(0, lucro) * sig.irRealEstimado : 0;
    var alvo = p && informado(p.margemAlvo) ? fr(p.margemAlvo) : null;
    // por fora (2027): CBS e IBS somados ao PLD no total cobrado do cliente
    var fora = (sig.fora || []).map(function (x) { return { id: x.id, nome: x.nome, valor: pld * x.aliq, aliq: x.aliq, formula: x.formula, fund: x.fund }; });
    var tribFora = pld * (sig.foraSoma || 0);
    var pvMin = precoParaMargem(cl, venda, sig.sigma, 0);
    var pvAlvo = alvo != null ? precoParaMargem(cl, venda, sig.sigma, alvo) : null;
    return {
      pv: pv, descontoFracao: d, desconto: pv - pld, pld: pld,
      tributosVenda: tributos, despesasVenda: despesas, custoUnitario: cl,
      lucro: lucro, margem: margem,
      irEstimado: ir, lucroAposIr: lucro - ir,
      pvMinimo: pvMin.erro ? null : pvMin.pv, pvMinimoErro: pvMin.erro || null,
      pvAlvo: pvAlvo && !pvAlvo.erro ? pvAlvo.pv : null, pvAlvoErro: pvAlvo && pvAlvo.erro ? pvAlvo.erro : null,
      faixa: margem == null ? null : lucro < 0 ? 'negativa' : (alvo != null && margem < alvo - 1e-12 ? 'abaixo' : 'ok'),
      tributosFora: tribFora, totalCliente: pld + tribFora, fora: fora,
      quantidade: q,
      pldTotal: pld * q, lucroTotal: lucro * q, tributosTotal: tributos * q, despesasTotal: despesas * q, custoLiquidoTotal: compra.custoLiquido,
      tributosForaTotal: tribFora * q, totalClienteTotal: (pld + tribFora) * q,
      faturamentoTotal: pv * q,
      cascata: [
        { id: 'pv', nome: 'Preço de venda', valor: pv },
        { id: 'desconto', nome: '(−) Desconto incondicional', valor: -(pv - pld) },
        { id: 'pld', nome: '= Preço líquido de desconto (PLD)', valor: pld, total: true }
      ].concat(sig.componentes.filter(function (x) { return x.aliq; }).map(function (x) {
        return { id: x.id, nome: '(−) ' + x.nome, valor: -pld * x.aliq, aliq: x.aliq, tipo: x.tipo, formula: x.formula, fund: x.fund };
      })).concat([
        { id: 'cl', nome: '(−) Custo líquido de aquisição', valor: -cl },
        { id: 'lucro', nome: '= Lucro do item', valor: lucro, total: true, lucro: true }
      ])
    };
  }

  /**
   * DRE do item (Lei 6.404/1976, art. 187), por unidade, a partir do resultado: receita bruta → deduções (descontos
   * incondicionais e tributos sobre a venda) → receita líquida → CMV (custo líquido de aquisição) → lucro bruto →
   * despesas com vendas (comissão e cartão) → resultado antes do IRPJ/CSLL → IRPJ/CSLL (presumidos, ou estimativa no
   * Real) → lucro líquido. Linhas: { id, nome, valor, nivel: total|grupo|sub|final, aliq?, fund?, nota? }.
   */
  function dre(r) {
    var pv = r.pv, pld = r.pld, desc = pv - pld;
    var comps = r.cascata.filter(function (x) { return x.aliq; });
    var ehIr = function (x) { return x.id === 'irpj' || x.id === 'csll'; };
    var tributos = comps.filter(function (x) { return x.tipo === 'tributo' && !ehIr(x); });
    var ir = comps.filter(ehIr);
    var despesas = comps.filter(function (x) { return x.tipo === 'despesa'; });
    function soma(xs) { return xs.reduce(function (a, x) { return a - x.valor; }, 0); }
    function sub(x) { return { id: x.id, nome: x.nome.replace(/^\(−\)\s*/, ''), valor: x.valor, nivel: 'sub', aliq: x.aliq, fund: x.fund }; }
    var rl = pld - soma(tributos), lb = rl - r.custoUnitario, antesIr = lb - soma(despesas);
    var out = [{ id: 'rb', nome: 'Receita bruta de vendas', valor: pv, nivel: 'total' },
      { id: 'deducoes', nome: '(−) Deduções da receita bruta', valor: -(desc + soma(tributos)), nivel: 'grupo' }];
    if (desc > 1e-9) out.push({ id: 'desconto', nome: 'Descontos incondicionais', valor: -desc, nivel: 'sub' });
    out = out.concat(tributos.map(sub));
    out.push({ id: 'rl', nome: '= Receita líquida', valor: rl, nivel: 'total' });
    out.push({ id: 'cmv', nome: '(−) Custo das mercadorias vendidas', valor: -r.custoUnitario, nivel: 'grupo', nota: 'custo líquido, sem os créditos' });
    out.push({ id: 'lb', nome: '= Lucro bruto', valor: lb, nivel: 'total' });
    if (despesas.length) {
      out.push({ id: 'despesas', nome: '(−) Despesas com vendas', valor: -soma(despesas), nivel: 'grupo' });
      out = out.concat(despesas.map(sub));
    }
    if (ir.length) {
      out.push({ id: 'antesIr', nome: '= Resultado antes do IRPJ e da CSLL', valor: antesIr, nivel: 'total' });
      out.push({ id: 'ir', nome: '(−) IRPJ e CSLL presumidos', valor: -soma(ir), nivel: 'grupo' });
      out = out.concat(ir.map(sub));
      out.push({ id: 'll', nome: '= Lucro líquido do item', valor: r.lucro, nivel: 'final' });
    } else if (r.irEstimado) {
      out.push({ id: 'antesIr', nome: '= Resultado antes do IRPJ e da CSLL', valor: antesIr, nivel: 'total' });
      out.push({ id: 'ir', nome: '(−) IRPJ e CSLL (estimativa)', valor: -r.irEstimado, nivel: 'grupo', nota: 'a apuração do Lucro Real é do período, não do item' });
      out.push({ id: 'll', nome: '= Lucro líquido do item (estimado)', valor: r.lucroAposIr, nivel: 'final' });
    } else {
      out.push({ id: 'll', nome: '= Lucro do item (antes do IRPJ e da CSLL)', valor: antesIr, nivel: 'final' });
    }
    // sem "−0": linha zerada (item sem dedução) sai como 0,00
    out.forEach(function (l) { if (Math.abs(l.valor) < 1e-9) l.valor = 0; });
    return out;
  }

  /**
   * Calculadora do item: CL e Σ calculados uma vez; resultado(venda) refaz só a etapa 3.
   * Use calculadora(...).resultado(vendaComOutroPreco) para recálculo instantâneo.
   */
  function calculadora(item, p) {
    var compra = calcularCompra(item, p);
    var trib = item.trib || tributacaoPadrao(item, p);
    var sig = calcularSigma(p, trib, item.venda, item);
    // preço atual sem PIS/Cofins: a retirada só vale em 2027 (em 2026 o PIS e a Cofins continuam no preço)
    var c27 = p.cenario === '2027';
    var fpc = c27 ? fracaoPisCofins(p, trib) : 0;
    return {
      compra: compra, sigma: sig, trib: trib, fracaoPisCofins: fracaoPisCofins(p, trib),
      resultado: function (venda) {
        if (sig.erro) return { erro: sig.erro };
        if (!(compra.quantidade > 0)) return { erro: 'Informe a quantidade do item.' };
        var pv = precoPorModo(venda, compra.custoLiquidoUnit, sig.sigma, { fracaoPisCofins: fpc, cenario2027: c27 });
        if (pv.erro) return { erro: pv.erro };
        var r = calcularResultado(compra, sig, venda, pv.pv, p);
        if (pv.descontaminacao) r.descontaminacao = pv.descontaminacao;
        return r;
      }
    };
  }

  /** Resultado completo do item (ResultadoItem) com os alertas da compra, da tributação e da venda */
  function calcularItem(item, p, calc) {
    calc = calc || calculadora(item, p);
    var r = calc.resultado(item.venda);
    var alertas = calc.compra.alertas.slice();
    var t = calc.trib;
    // tributação padrão é o caminho normal da importação; só avisa quando falta a alíquota da venda
    if (p.regime === 'SIMPLES' ? !informado(t.dasAliquota) && !informado(p.dasAliquotaEfetiva) : !t.icmsSt && !informado(t.aliqIcms) && !informado(p.aliqIcmsInternaPadrao)) {
      alertas.push({ tipo: 'sem-aliquota-venda', msg: p.regime === 'SIMPLES'
        ? 'Sem alíquota do DAS: informe a alíquota efetiva em Parâmetros ou a do item na tela Venda.'
        : 'Sem alíquota de ICMS na venda: informe o ICMS interno padrão em Parâmetros ou a alíquota do item na tela Venda.' });
    }
    if (t.icmsSt && p.regime !== 'SIMPLES' && calc.compra.composicao.daeCodigo !== '1031') {
      alertas.push({ tipo: 'st-inconsistente', msg: 'Item com ICMS-ST na venda, mas a compra não tem DAE 1031: confirme se o ICMS-ST veio retido na nota de compra.' });
    }
    if (p.regime === 'SIMPLES' && t.icmsSt && !informado(t.dasAliquota)) {
      alertas.push({ tipo: 'das-st', msg: 'Item com ST no Simples: use a alíquota do DAS sem a parcela do ICMS (LC 123/2006, art. 18, § 4º-A, I).' });
    }
    if (r && !r.erro && r.lucro < 0) alertas.push({ tipo: 'margem-negativa', msg: 'Margem negativa: o preço não cobre o custo e as deduções da venda.' });
    return Object.assign({
      custoBruto: calc.compra.custoBruto, creditoIcms: calc.compra.creditoIcms, creditoIcmsPendente: calc.compra.creditoIcmsPendente,
      creditoPisCofins: calc.compra.creditoPisCofins, creditoCbsIbs: calc.compra.creditoCbsIbs, custoLiquido: calc.compra.custoLiquido, custoLiquidoUnit: calc.compra.custoLiquidoUnit,
      sigma: calc.sigma.sigma, compra: calc.compra, sigmaDetalhe: calc.sigma
    }, r && !r.erro ? r : { erro: r ? r.erro : 'Sem resultado' }, { alertas: alertas });
  }

  /** Totais da planilha: margem total = Σ lucros ÷ Σ PLD (ponderada pelo faturamento), não a média das margens */
  function totais(resultados) {
    var t = { itens: resultados.length, calculados: 0, custoBruto: 0, custoLiquido: 0, creditos: 0, faturamento: 0, pld: 0, tributos: 0, tributosFora: 0, totalCliente: 0, despesas: 0, lucro: 0, lucroAposIr: 0, margem: null };
    resultados.forEach(function (r) {
      t.custoBruto += r.custoBruto || 0;
      t.custoLiquido += r.custoLiquido || 0;
      t.creditos += (r.creditoIcms || 0) + (r.creditoPisCofins || 0) + (r.creditoCbsIbs || 0);
      if (r.erro) return;
      t.calculados++;
      t.faturamento += r.faturamentoTotal;
      t.pld += r.pldTotal;
      t.tributos += r.tributosTotal;
      t.tributosFora += r.tributosForaTotal || 0;
      t.totalCliente += r.totalClienteTotal != null ? r.totalClienteTotal : r.pldTotal;
      t.despesas += r.despesasTotal;
      t.lucro += r.lucroTotal;
      t.lucroAposIr += r.lucroAposIr * r.quantidade;
    });
    t.margem = t.pld ? t.lucro / t.pld : null;
    return t;
  }

  LC.motor = {
    REGIMES: REGIMES, REGIMES_PIS_COFINS: REGIMES_PIS_COFINS, REGIMES_CBS_IBS: REGIMES_CBS_IBS, MODOS: MODOS, CODIGOS_DAE: CODIGOS_DAE,
    CENARIOS: CENARIOS, CENARIOS_INFO: CENARIOS_INFO, referencia2027: referencia2027, aliquotas2027: aliquotas2027,
    contagem: contagem, parametrosPadrao: parametrosPadrao, aliquotasPisCofins: aliquotasPisCofins, tributacaoPadrao: tributacaoPadrao,
    calcularCompra: calcularCompra, calcularSigma: calcularSigma, calcularResultado: calcularResultado, fracaoPisCofins: fracaoPisCofins,
    precoParaMargem: precoParaMargem, precoPorModo: precoPorModo, calculadora: calculadora, calcularItem: calcularItem, totais: totais, dre: dre
  };
})(typeof window !== 'undefined' ? window : globalThis);

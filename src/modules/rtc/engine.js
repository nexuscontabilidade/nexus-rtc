/*
 * RTC Comparativo — MOTOR DE CÁLCULO (funções puras, sem DOM).
 *
 * Custo de aquisição → modelo linear de venda (cada tributo/despesa = a·X + b sobre o preço X)
 * → preço por markup divisor (X = (C + Σb) / (1 − m − Σa)) ou margem efetiva para um preço dado.
 * Todos os resultados carregam memória de cálculo (base, alíquota, fórmula, valor, origem, fundamento, vigência).
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};

  // ------------------------------------------------------------------ utilidades
  function n(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function d(v) { return n(v) / 100; }
  function has(v) { return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }
  function r2(v) { return Math.round((v + (v >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
  function sum(arr, fn) { return arr.reduce(function (s, x) { return s + (fn ? fn(x) : x); }, 0); }
  function F() { return N.fmt; }

  var VIG = {
    v2026: 'Vigente em 2026',
    pc: 'Até 31/12/2026 (extinção em 2027)',
    t2026: '01/01/2026 a 31/12/2026 (teste)',
    t2027: '01/01/2027 a 31/12/2028 (transição)',
    icms: 'Vigente (redução gradual de 2029 a 2032)',
    ipi27: 'A partir de 01/01/2027',
    ir: 'Vigente',
    sn: 'Vigente'
  };

  var S_SE_SEM_ES = { SP: 1, RJ: 1, MG: 1, PR: 1, SC: 1, RS: 1 };

  /** Alíquota interestadual (Res. SF 22/1989; 4% importados — Res. SF 13/2012) */
  function aliqInterestadual(ufOrig, ufDest, importado, pv) {
    if (importado) return { aliq: pv.icmsInter4, fund: ['rsf13'], desc: 'Importado — 4%' };
    if (S_SE_SEM_ES[ufOrig] && !S_SE_SEM_ES[ufDest]) return { aliq: pv.icmsInter7, fund: ['rsf22'], desc: ufOrig + ' → ' + ufDest + ' (S/SE → N/NE/CO/ES)' };
    return { aliq: pv.icmsInter12, fund: ['rsf22'], desc: ufOrig + ' → ' + ufDest };
  }

  function origemDe(sim, path, padrao) {
    var o = sim.origens && sim.origens[path];
    if (!o) return padrao || 'Informado';
    if (o === 'usuario') return 'Informado';
    if (o.indexOf('regra:') === 0) return 'Regra cadastrada';
    return o;
  }

  // ------------------------------------------------------------------ validação
  function validar(emp, sim, pv, ufTab) {
    var erros = [];
    var avisos = [];
    function erro(campo, msg) { erros.push({ campo: campo, msg: msg }); }
    function aviso(msg, campo, nivel) { avisos.push({ msg: msg, campo: campo || null, nivel: nivel || 'alerta' }); }

    if (!emp.uf) erro('empresa.uf', 'Informe a UF da empresa no cadastro.');
    if (['SN', 'LP', 'LR'].indexOf(emp.regime) < 0) erro('empresa.regime', 'Informe o regime tributário da empresa.');

    var v = sim.valores;
    if (sim.__unitario) {
      if (!has(sim.produto.quantidade) || n(sim.produto.quantidade) <= 0) erro('produto.quantidade', 'Informe a quantidade (maior que zero).');
      if (!has(v.valorUnitario) || n(v.valorUnitario) <= 0) erro('valores.valorUnitario', 'Informe o valor unitário (maior que zero).');
    } else if (!has(v.produtos) || n(v.produtos) <= 0) erro('valores.produtos', 'Informe o valor total dos produtos (maior que zero).');
    ['frete', 'seguro', 'despesas', 'desconto', 'ipi'].forEach(function (k) {
      if (has(v[k]) && n(v[k]) < 0) erro('valores.' + k, 'O valor não pode ser negativo.');
    });
    var bruto = n(v.produtos) + n(v.frete) + n(v.seguro) + n(v.despesas);
    if (n(v.desconto) > 0 && n(v.desconto) >= bruto) erro('valores.desconto', 'O desconto não pode ser igual ou maior que o valor dos produtos e acessórios.');

    function pctOk(path, valor, max) {
      if (!has(valor)) return;
      if (n(valor) < 0 || n(valor) >= (max || 100)) erro(path, 'Percentual deve estar entre 0% e ' + (max || 100) + '% (exclusive).');
    }
    var pf = sim.perfil;
    pctOk('perfil.icms.aliqEntrada', pf.icms.aliqEntrada);
    pctOk('perfil.icms.aliqSaida', pf.icms.aliqSaida);
    pctOk('perfil.icms.reducaoEntrada', pf.icms.reducaoEntrada);
    pctOk('perfil.icms.reducaoSaida', pf.icms.reducaoSaida);
    pctOk('perfil.ipi.aliqEntrada', pf.ipi.aliqEntrada, 400);
    pctOk('perfil.ipi.aliqSaida', pf.ipi.aliqSaida, 400);
    pctOk('perfil.cbsIbs.reducaoPct', pf.cbsIbs.reducaoPct, 100.0001);
    if (has(pf.st.mva) && n(pf.st.mva) < 0) erro('perfil.st.mva', 'MVA não pode ser negativa.');
    pctOk('fornecedor.icmsSimplesPct', sim.fornecedor.icmsSimplesPct);
    pctOk('fornecedor.pisCofinsEmbutidoPct', sim.fornecedor.pisCofinsEmbutidoPct);

    var vd = sim.venda;
    if (vd.modo === 'B') {
      if (!has(vd.precoAtual) || n(vd.precoAtual) <= 0) erro(vd.basePreco === 'unitario' ? 'venda.precoUnitarioAtual' : 'venda.precoAtual', vd.basePreco === 'unitario' ? 'No modo B, informe o preço de venda por unidade (maior que zero) e a quantidade do produto.' : 'No modo B, informe o preço de venda (maior que zero).');
    } else if (!has(vd.margem)) {
      erro('venda.margem', 'Informe a margem de lucro desejada (%).');
    }
    pctOk('venda.margem', vd.margem);
    (vd.despesas || []).forEach(function (dv, i) { pctOk('venda.despesas.' + i + '.pct', dv.pct); });

    if (sim.premissas.valorProdutos2027 === 'manual' && (!has(sim.premissas.valorProdutos2027Manual) || n(sim.premissas.valorProdutos2027Manual) <= 0)) {
      if (sim.__unitario) erro('premissas.valorUnitario2027Manual', 'Informe o valor unitário para 2027 (hipótese manual).');
      else erro('premissas.valorProdutos2027Manual', 'Informe o valor dos produtos para 2027 (hipótese manual).');
    }

    // ----- avisos de conclusão tributária
    var p = sim.produto;
    if (!p.ncm) aviso('NCM não informado: o enquadramento tributário (ST, monofasia, reduções de IBS/CBS) não pode ser confirmado.', 'produto.ncm');
    else if (!/^\d{8}$/.test(N.fmt.onlyDigits(p.ncm)) || N.fmt.onlyDigits(p.ncm).length !== String(p.ncm).replace(/[.\s]/g, '').length) aviso('NCM deve conter 8 dígitos numéricos.', 'produto.ncm');
    if (p.cest && !/^\d{7}$/.test(N.fmt.onlyDigits(p.cest))) aviso('CEST deve conter 7 dígitos.', 'produto.cest');
    if (pf.icms.tratamento === 'st' && !p.cest) aviso('Produto em substituição tributária sem CEST informado.', 'produto.cest');

    var op = sim.operacao;
    var ce = N.fmt.onlyDigits(p.cfopEntrada);
    var cs = N.fmt.onlyDigits(p.cfopSaida);
    var espCfop = RTC.model.cfopEsperado(sim, emp);
    if (ce) {
      if (ce.length !== 4) erro('produto.cfopEntrada', 'CFOP de entrada deve ter 4 dígitos.');
      else if (espCfop.entrada && ce[0] !== espCfop.entrada) erro('produto.cfopEntrada', 'CFOP de entrada ' + ce + ' bloqueado: a operação é ' + espCfop.natureza.toLowerCase() + ' e exige CFOP iniciado por ' + espCfop.entrada + ' (ex.: ' + espCfop.entrada + '.102).');
    }
    if (cs) {
      if (cs.length !== 4) erro('produto.cfopSaida', 'CFOP de saída deve ter 4 dígitos.');
      else if (espCfop.saida && cs[0] !== espCfop.saida) erro('produto.cfopSaida', 'CFOP de saída ' + cs + ' bloqueado: a venda é ' + (espCfop.vendaInter ? 'interestadual' : 'interna') + ' e exige CFOP iniciado por ' + espCfop.saida + ' (ex.: ' + espCfop.saida + '.102).');
    }
    if (op.tipo === 'interna' && op.ufOrigem && emp.uf && op.ufOrigem !== emp.uf) erro('operacao.tipo', 'Operação interna com fornecedor de outra UF (' + op.ufOrigem + '): para fornecedor de outro Estado, a operação é interestadual.');
    if (op.tipo === 'interestadual' && op.ufOrigem && op.ufOrigem === emp.uf) erro('operacao.tipo', 'Operação interestadual com fornecedor da mesma UF da empresa (' + emp.uf + '): a operação é interna.');
    if (op.tipo === 'interestadual' && !op.ufOrigem) erro('operacao.ufOrigem', 'Informe a UF de origem (fornecedor).');
    if (op.tipo === 'importacao') aviso('Importação direta: a base aduaneira (II, IPI, PIS/Cofins-Importação, ICMS-Importação) não é modelada automaticamente — informe os valores do ICMS e do IPI manualmente.', 'operacao.tipo');
    if (op.tipo === 'outra') aviso('Operação "outra": informe manualmente as alíquotas de ICMS aplicáveis.', 'operacao.tipo');

    if ((sim.fornecedor.regime26 === 'simples' || (sim.fornecedor.regime27 && sim.fornecedor.regime27 !== 'regular')) && !has(sim.fornecedor.icmsSimplesPct) && emp.regime !== 'SN') {
      aviso('Fornecedor do Simples Nacional: informe o percentual de crédito de ICMS destacado na NF (LC 123, art. 23, § 1º). Sem ele, o crédito é zero.', 'fornecedor.icmsSimplesPct');
    }
    var regular27 = emp.regime !== 'SN' || (emp.simples && emp.simples.ibsCbsForaDas2027);
    if (sim.fornecedor.regime27 === 'simples' && regular27 && !has(sim.fornecedor.cbsSimplesPct)) {
      aviso('Fornecedor no Simples (IBS/CBS no DAS) em 2027: informe a CBS/IBS paga no DAS para o crédito (LC 214, art. 47, § 9º). Sem ela, o crédito é zero.', 'fornecedor.cbsSimplesPct');
    }

    if (pf.icms.tratamento === 'st' && pf.st.papel === 'substituido') {
      if (pf.st.modo === 'informado' && !has(pf.st.valorInformado)) aviso('ICMS-ST informado manualmente, mas sem valor.', 'perfil.st.valorInformado');
      if (pf.st.modo === 'calculado' && !has(pf.st.mva)) aviso('ICMS-ST calculado sem MVA: informe a MVA do protocolo/convênio ou do RICMS.', 'perfil.st.mva');
    }
    var antTipoV = RTC.model.tipoAntecipacao(pf.antecipado);
    if (antTipoV !== 'nenhum' && pf.icms.tratamento === 'st' && pf.st.papel === 'substituido') {
      erro('perfil.antecipado.tipo', 'Mercadoria com ICMS-ST retido pelo fornecedor na NF: não há ICMS antecipado nem ICMS-ST a recolher na entrada (dupla contagem). Selecione "Não há".');
    }
    if (antTipoV !== 'nenhum' && pf.antecipado.modo === 'informado' && !has(pf.antecipado.valor)) aviso('Informe o valor pago na entrada (DAE) da ' + (antTipoV === 'st' ? 'ICMS-ST' : 'antecipação') + '.', 'perfil.antecipado.valor');
    if (antTipoV === 'st' && pf.antecipado.modo !== 'informado' && !has(pf.antecipado.mva)) aviso('ICMS-ST na entrada calculado sem MVA: informe a MVA do protocolo/convênio ou do RICMS.', 'perfil.antecipado.mva');
    if (pf.icms.tratamento === 'reducao_base' && !has(pf.icms.reducaoSaida)) aviso('Redução de base do ICMS sem percentual informado.', 'perfil.icms.reducaoSaida');
    if (pf.cbsIbs.tratamento === 'reducao' && !has(pf.cbsIbs.reducaoPct)) aviso('Tratamento com redução de IBS/CBS sem percentual informado.', 'perfil.cbsIbs.reducaoPct');
    if (pf.cbsIbs.tratamento === 'outro' && (!has(pf.cbsIbs.aliqCbsManual))) aviso('IBS/CBS "outro tratamento": informe as alíquotas manuais.', 'perfil.cbsIbs.aliqCbsManual');
    if (pf.pisCofins.tratamento === 'outro' && emp.regime !== 'SN' && !has(pf.pisCofins.pisManual)) aviso('PIS/Cofins "outro tratamento": informe as alíquotas manuais.', 'perfil.pisCofins.pisManual');
    if (['reducao', 'aliquota_zero', 'isento', 'outro'].indexOf(pf.cbsIbs.tratamento) >= 0 && !pf.cbsIbs.fundamento) {
      aviso('Tratamento diferenciado de IBS/CBS sem fundamento legal específico informado (dispositivo/anexo da LC 214/2025).', 'perfil.cbsIbs.fundamento');
    }

    if (emp.regime === 'LP' && !has(emp.presumido && emp.presumido.receitaAnual)) aviso('Lucro Presumido sem receita anual estimada: adotados, de forma conservadora, o adicional de IRPJ e o acréscimo da LC 224/2025 (marginais).', 'empresa.presumido');
    if (emp.regime === 'LR' && !has(emp.real && emp.real.lucroAnual)) aviso('Lucro Real sem lucro anual estimado: adotada alíquota marginal de 34% (IRPJ 15% + adicional 10% + CSLL 9%).', 'empresa.real');

    return { erros: erros, avisos: avisos };
  }

  // ------------------------------------------------------------------ contexto derivado
  function contexto(emp, sim, pv, ufTab, avisos) {
    var op = sim.operacao;
    var pf = sim.perfil;
    var ctx = { emp: emp, sim: sim, pv: pv, regime: emp.regime, ufEmp: emp.uf };

    ctx.industrial = emp.atividade === 'industria';
    ctx.sn26 = emp.regime === 'SN' ? RTC.simples.calcular(emp.simples.anexo, emp.simples.rbt12, 2026) : null;
    ctx.sn27 = emp.regime === 'SN' ? RTC.simples.calcular(emp.simples.anexo, emp.simples.rbt12, 2027) : null;
    ctx.snAcimaSub = !!(ctx.sn26 && ctx.sn26.acimaSublimite);
    ctx.icmsRegular = emp.contribuinteIcms !== false && (emp.regime !== 'SN' || ctx.snAcimaSub);
    ctx.regular27 = emp.regime !== 'SN' || !!emp.simples.ibsCbsForaDas2027;

    function interna(uf) {
      var r = ufTab[uf];
      if (r && has(r.interna)) return { aliq: n(r.interna) + n(r.fcp), ok: true, desc: 'Alíquota interna ' + uf + (n(r.fcp) ? ' (inclui FCP ' + F().pct(n(r.fcp)) + ')' : ''), fund: ['icms_uf'], origem: 'Parâmetro (UF)' };
      return { aliq: 0, ok: false, desc: 'Alíquota interna ' + uf + ' não cadastrada', fund: ['icms_uf'], origem: 'Parâmetro (UF)' };
    }
    ctx.interna = interna;

    // --- alíquota de ICMS na entrada
    var ent;
    if (pf.icms.aliqEntradaAuto !== false) {
      if (op.tipo === 'interna') ent = interna(emp.uf);
      else if (op.tipo === 'interestadual') {
        var ie = aliqInterestadual(op.ufOrigem, emp.uf, op.importado, pv);
        ent = { aliq: ie.aliq, ok: true, desc: 'Interestadual ' + ie.desc, fund: ie.fund, origem: 'Parâmetro legal' };
      } else ent = { aliq: 0, ok: false, desc: 'Operação ' + op.tipo + ': informe a alíquota', fund: [], origem: 'Informado' };
      if (!ent.ok && ctx.icmsRegular) avisos.push({ msg: 'Alíquota de ICMS da entrada indisponível (' + ent.desc + '). Cadastre a alíquota interna da UF em Parâmetros ou informe manualmente.', campo: 'perfil.icms.aliqEntrada', nivel: 'alerta' });
    } else {
      ent = { aliq: n(pf.icms.aliqEntrada), ok: true, desc: 'Informada', fund: ['icms_uf'], origem: origemDe(sim, 'perfil.icms.aliqEntrada') };
    }
    ctx.icmsEnt = ent;

    // --- alíquota de ICMS na saída
    var vendaInter = !!(op.ufDestino && op.ufDestino !== emp.uf);
    ctx.vendaInter = vendaInter;
    var sai;
    if (pf.icms.aliqSaidaAuto !== false) {
      if (!vendaInter) sai = interna(emp.uf);
      else if (op.destinatario === 'contribuinte') {
        var is = aliqInterestadual(emp.uf, op.ufDestino, op.importado, pv);
        sai = { aliq: is.aliq, ok: true, desc: 'Interestadual ' + is.desc, fund: is.fund, origem: 'Parâmetro legal' };
      } else {
        var dest = interna(op.ufDestino);
        sai = { aliq: dest.aliq, ok: dest.ok, desc: 'Interestadual a não contribuinte: alíquota interestadual + DIFAL = interna de ' + op.ufDestino + ' (base única)', fund: ['difal', 'icms_uf'], origem: 'Parâmetro (UF)' };
        avisos.push({ msg: 'Venda a não contribuinte de outra UF: o DIFAL foi aproximado pela alíquota interna do destino com base única. Estados com base dupla podem resultar em valor diferente.', campo: 'operacao.destinatario', nivel: 'info' });
      }
      if (!sai.ok && ctx.icmsRegular && pf.icms.tratamento !== 'st' && pf.icms.tratamento !== 'isento') {
        avisos.push({ msg: 'Alíquota de ICMS da saída indisponível (' + sai.desc + '). Cadastre em Parâmetros › Alíquotas internas por UF ou informe manualmente.', campo: 'perfil.icms.aliqSaida', nivel: 'alerta' });
      }
    } else {
      sai = { aliq: n(pf.icms.aliqSaida), ok: true, desc: 'Informada', fund: ['icms_uf'], origem: origemDe(sim, 'perfil.icms.aliqSaida') };
    }
    ctx.icmsSai = sai;

    // --- alíquota interna para ST
    if (pf.st.aliqInternaAuto !== false) {
      ctx.stInterna = pf.st.papel === 'substituto' ? interna(op.ufDestino || emp.uf) : interna(emp.uf);
    } else {
      ctx.stInterna = { aliq: n(pf.st.aliqInterna), ok: true, desc: 'Informada', fund: ['icms_uf'], origem: 'Informado' };
    }

    // --- CBS/IBS 2027
    var cb = pf.cbsIbs;
    var a27 = { cbs: 0, ibs: 0, red: 0, fund: ['lc214_a347', 'lc214_a344'], origem: 'Parâmetro legal' };
    if (cb.tratamento === 'aliquota_zero' || cb.tratamento === 'isento') {
      a27.desc = cb.tratamento === 'isento' ? 'Isenção de IBS/CBS' : 'Alíquota zero de IBS/CBS';
      a27.fund = ['lc214_reducoes'];
      a27.origem = origemDe(sim, 'perfil.cbsIbs.tratamento', 'Informado');
    } else if (cb.tratamento === 'outro') {
      a27.cbs = d(cb.aliqCbsManual);
      a27.ibs = d(cb.aliqIbsManual);
      a27.desc = 'Alíquotas informadas manualmente';
      a27.fund = [];
      a27.origem = 'Informado';
    } else {
      a27.red = cb.tratamento === 'reducao' ? d(cb.reducaoPct) : 0;
      var cheia = Math.max(0, pv.cbsRef2027 - pv.cbsReducao2027);
      a27.cbs = cheia / 100 * (1 - a27.red);
      a27.ibs = (pv.ibsUf2027 + pv.ibsMun2027) / 100 * (1 - a27.red);
      a27.desc = '(' + F().pct(pv.cbsRef2027) + ' − ' + F().num(pv.cbsReducao2027) + ' p.p.)' + (a27.red ? ' × (1 − ' + F().pct(a27.red * 100) + ')' : '');
      a27.descIbs = '(' + F().pct(pv.ibsUf2027) + ' + ' + F().pct(pv.ibsMun2027) + ')' + (a27.red ? ' × (1 − ' + F().pct(a27.red * 100) + ')' : '');
      if (a27.red) a27.fund = a27.fund.concat(['lc214_reducoes']);
      a27.origem = 'Parâmetro';
    }
    ctx.a27 = a27;

    // --- IRPJ/CSLL
    if (emp.regime === 'LP') {
      var rec = emp.presumido && has(emp.presumido.receitaAnual) ? n(emp.presumido.receitaAnual) : null;
      var lc224 = (emp.presumido.aplicarLC224 !== false) && (rec === null || rec > pv.lc224Limite);
      var presI = pv.presIrpj * (lc224 ? 1 + pv.lc224Acrescimo / 100 : 1);
      var presC = pv.presCsll * (lc224 ? 1 + pv.lc224Acrescimo / 100 : 1);
      var adic = rec === null || rec * pv.presIrpj / 100 > pv.irpjLimiteAnual;
      ctx.lp = { rec: rec, lc224: lc224, presI: presI, presC: presC, adicional: adic };
      if (lc224) avisos.push({ msg: 'LC 224/2025 aplicada à margem (percentuais de presunção +' + F().pct(pv.lc224Acrescimo) + ' sobre a receita que excede ' + F().brl(pv.lc224Limite) + '/ano). Dispositivo questionado no STF (ADI 7936) — confirme a situação da empresa.', campo: 'empresa.presumido', nivel: 'info' });
    }
    if (emp.regime === 'LR') {
      var lucro = emp.real && has(emp.real.lucroAnual) ? n(emp.real.lucroAnual) : null;
      var temAdic = lucro === null || lucro > pv.irpjLimiteAnual;
      ctx.lr = { lucro: lucro, adicional: temAdic, tau: (pv.irpj + pv.csll + (temAdic ? pv.irpjAdicional : 0)) / 100 };
    }
    return ctx;
  }

  // ------------------------------------------------------------------ custo de aquisição
  function custo(ano, ctx) {
    var sim = ctx.sim, pv = ctx.pv, emp = ctx.emp;
    var pf = sim.perfil, pr = sim.premissas, forn = sim.fornecedor, cr = sim.creditos, v = sim.valores;
    var fm = F();
    var L = [];
    var avisos = [];
    function linha(o) { o.ano = ano; L.push(o); return o; }

    // ----- valor dos produtos
    var prodInf = n(v.produtos);
    var prod = prodInf;
    var qtd = n(sim.produto.quantidade);
    var un = sim.produto.unidade || 'un';
    var prodEntrada = sim.__unitario ? fm.num(qtd, qtd % 1 ? 4 : 0) + ' ' + un + ' × ' + fm.unit(n(v.valorUnitario)) : fm.brl(prodInf);
    var prodFormula = sim.__unitario ? 'Quantidade × valor unitário' : 'Valor informado';
    var prodOrigem = 'Informado';
    if (ano === 2027) {
      if (pr.valorProdutos2027 === 'sem_pis_cofins') {
        prod = prodInf * (1 - d(forn.pisCofinsEmbutidoPct));
        prodFormula = 'Produtos 2026 × (1 − PIS/Cofins embutidos do fornecedor ' + fm.pct(n(forn.pisCofinsEmbutidoPct)) + ')';
        prodOrigem = 'Premissa (fornecedor retira PIS/Cofins)';
      } else if (pr.valorProdutos2027 === 'manual') {
        prod = n(pr.valorProdutos2027Manual);
        prodFormula = sim.__unitario ? 'Quantidade × valor unitário informado para 2027 (' + fm.unit(n(pr.valorUnitario2027Manual)) + ')' : 'Valor informado para 2027';
      } else {
        prodFormula = 'Premissa: mesmo valor de 2026 (CBS/IBS acrescidos por fora)';
        prodOrigem = 'Premissa (mesmo valor)';
      }
    }
    prod = r2(prod);
    var frete = n(v.frete);
    var freteNF = v.freteNaNota !== false ? frete : 0;
    var freteFora = frete - freteNF;
    // ICMS destacado no CT-e (frete contratado à parte): embutido no frete, creditável e fora da base de PIS/Cofins
    var icmsFrete = freteFora > 0 ? r2(Math.min(n(v.icmsFrete), freteFora)) : 0;
    var seg = n(v.seguro), desp = n(v.despesas), desc = n(v.desconto);
    var vop = r2(prod + freteNF + seg + desp - desc);

    linha({ grupo: 'Aquisição', item: 'Valor bruto dos produtos', entrada: ano === 2027 && pr.valorProdutos2027 !== 'mesmo' ? fm.brl(prodInf) + ' (2026)' : prodEntrada, base: null, aliq: null, formula: prodFormula, valor: prod, origem: prodOrigem, fund: [], vig: ano === 2026 ? VIG.v2026 : VIG.t2027 });
    var fundAcess = ano === 2027 ? ['lc87_a13_p1_ii', 'lc214_a12'] : ['lc87_a13_p1_ii'];
    if (freteNF) linha({ grupo: 'Aquisição', item: 'Frete (cobrado na NF)', valor: freteNF, formula: 'Valor informado', origem: 'Informado', fund: fundAcess, obs: 'Integra a base dos tributos da NF.' });
    if (seg) linha({ grupo: 'Aquisição', item: 'Seguro', valor: seg, formula: 'Valor informado', origem: 'Informado', fund: fundAcess });
    if (desp) linha({ grupo: 'Aquisição', item: 'Outras despesas acessórias', valor: desp, formula: 'Valor informado', origem: 'Informado', fund: fundAcess });
    if (desc) linha({ grupo: 'Aquisição', item: '(−) Descontos incondicionais', valor: -desc, formula: 'Valor informado', origem: 'Informado', obs: 'Descontos condicionais não reduzem a base dos tributos.' });
    linha({ grupo: 'Aquisição', item: 'Valor da operação (NF)', valor: vop, formula: 'Produtos + frete na NF + seguro + despesas − descontos', origem: 'Calculado', destaque: true });
    if (freteFora) {
      linha({ grupo: 'Aquisição', item: 'Frete contratado fora da NF', valor: freteFora, formula: 'Valor informado', origem: 'Informado', obs: icmsFrete ? 'Inclui o ICMS destacado no CT-e.' : 'Informe o ICMS destacado no CT-e para creditá-lo e retirá-lo da base do crédito de PIS/Cofins.' });
      if (icmsFrete) linha({ grupo: 'Aquisição', item: 'ICMS destacado no CT-e (embutido no frete)', valor: icmsFrete, formula: 'Valor informado (CT-e)', origem: 'Informado', fund: ['lc87_a19_20'], vig: VIG.icms, info: true, obs: 'Já incluído no valor do frete.' });
    }

    var fornReg = ano === 2026 ? (forn.regime26 || 'regular') : (forn.regime27 || 'regular');
    var fornSN = fornReg === 'simples';
    var fornSNicms = fornSN || fornReg === 'simples_regular'; // optante: ICMS e IPI seguem no DAS (sem destaque)

    // ----- IPI (por fora): o valor destacado na NF prevalece sobre o cálculo pela alíquota da TIPI
    var ipiInformado = has(v.ipi);
    var temIpi = ipiInformado || n(pf.ipi.aliqEntrada) > 0;
    var ipiZero27 = ano === 2027 && !pf.ipi.mantido2027;
    var ipiAliq, ipi, ipiFormula, ipiOrigem;
    if (ipiZero27 || fornSNicms) {
      ipiAliq = 0;
      ipi = 0;
      ipiFormula = ipiZero27 ? 'IPI reduzido a zero a partir de 2027' : 'Fornecedor optante: sem destaque de IPI';
      ipiOrigem = ipiZero27 ? 'Parâmetro legal' : 'Calculado';
      if (fornSNicms && ipiInformado) avisos.push({ msg: ano + ': fornecedor optante pelo Simples Nacional não destaca IPI (recolhido no DAS) — o IPI informado na NF foi desconsiderado. Confira o documento fiscal.', campo: 'valores.ipi', nivel: 'alerta' });
    } else if (ipiInformado) {
      var vop26 = r2(prodInf + freteNF + seg + desp - desc);
      ipiAliq = vop26 > 0 ? n(v.ipi) / vop26 * 100 : 0;
      if (ano === 2027) {
        ipi = r2(vop * ipiAliq / 100);
        ipiFormula = 'Alíquota efetiva do IPI destacado na NF (' + fm.pct(ipiAliq, 4) + ') × valor da operação de 2027';
        ipiOrigem = 'Calculado';
      } else {
        ipi = r2(n(v.ipi));
        ipiFormula = 'Valor destacado na NF (alíquota efetiva ' + fm.pct(ipiAliq, 4) + ' sobre o valor da operação)';
        ipiOrigem = 'Informado';
      }
      if (ano === 2026 && n(pf.ipi.aliqEntrada) > 0 && Math.abs(ipiAliq - n(pf.ipi.aliqEntrada)) > 0.01) {
        avisos.push({ msg: 'O IPI destacado na NF corresponde a ' + fm.pct(ipiAliq) + ' do valor da operação, diferente da alíquota informada (' + fm.pct(n(pf.ipi.aliqEntrada)) + '). Prevalece o valor da NF.', campo: 'valores.ipi', nivel: 'info' });
      }
    } else {
      ipiAliq = n(pf.ipi.aliqEntrada);
      ipi = r2(vop * ipiAliq / 100);
      ipiFormula = 'Valor da operação × alíquota TIPI';
      ipiOrigem = origemDe(sim, 'perfil.ipi.aliqEntrada');
    }
    if (temIpi) {
      linha({ grupo: 'Aquisição', item: 'IPI destacado na NF (por fora)', entrada: ipiInformado ? fm.brl(n(v.ipi)) + ' (NF 2026)' : 'Alíquota ' + fm.pct(n(pf.ipi.aliqEntrada)), base: vop, aliq: ipiAliq, formula: ipiFormula, valor: ipi, origem: ipiOrigem, fund: ipiZero27 ? ['adct_126', 'lc214_a454'] : ['ripi', 'lc87_a13_p2'], vig: ipiZero27 ? VIG.ipi27 : VIG.v2026, obs: ipiZero27 ? 'IPI reduzido a zero a partir de 2027 (exceto ZFM).' : (fornSNicms ? 'Fornecedor optante: IPI recolhido no DAS, sem destaque.' : 'Somado ao total da NF; fora da base do ICMS entre contribuintes para comercialização (LC 87, art. 13, § 2º).') });
    }

    // ----- CBS/IBS na entrada (2027)
    var cbsInRate = 0, ibsInRate = 0;
    if (ano === 2027 && !fornSN) { cbsInRate = ctx.a27.cbs; ibsInRate = ctx.a27.ibs; }
    var k = cbsInRate + ibsInRate;

    // ----- ICMS próprio destacado
    var t = ctx.icmsEnt.aliq / 100 * (1 - d(pf.icms.reducaoEntrada));
    var baseIcms = vop + (pr.ipiNaBaseIcms ? ipi : 0);
    var icms, icmsFormula, icmsBase;
    var icmsInformado = has(pf.icms.valorEntradaInformado);
    if (fornSNicms) {
      icms = 0;
      icmsBase = null;
      icmsFormula = 'Fornecedor optante pelo Simples: ICMS recolhido no DAS, sem destaque';
    } else if (icmsInformado) {
      icms = n(pf.icms.valorEntradaInformado);
      icmsFormula = 'Valor informado (NF)';
      icmsBase = baseIcms;
      // 2027 com IBS/CBS na base do ICMS: a alíquota efetiva da NF (ICMS ÷ base de 2026) passa a incidir sobre (Vop + IBS + CBS)
      var base26 = r2(prodInf + freteNF + seg + desp - desc) + (pr.ipiNaBaseIcms && has(v.ipi) ? n(v.ipi) : 0);
      if (ano === 2027 && pr.ibsCbsNaBaseIcms2027 && k > 0 && icms > 0 && base26 > 0) {
        var tNf = icms / base26;
        icms = tNf * (baseIcms + k * vop) / (1 + tNf * k);
        icmsBase = baseIcms + k * (vop - icms);
        icmsFormula = 'ICMS da NF (' + fm.brl(n(pf.icms.valorEntradaInformado)) + ' = ' + fm.pct(tNf * 100, 4) + ' da base de 2026) recalculado com IBS/CBS na base: t·(Vop·(1+k)) ÷ (1 + t·k)';
        icmsInformado = 'recalculado';
      }
    } else if (ano === 2027 && pr.ibsCbsNaBaseIcms2027 && k > 0) {
      icms = t * (baseIcms + k * vop) / (1 + t * k);
      icmsBase = baseIcms + k * (vop - icms);
      icmsFormula = 'alíq × (Vop + IBS + CBS), com IBS/CBS = (' + fm.pct(k * 100) + ') × (Vop − ICMS) ⇒ ICMS = t·(Vop·(1+k)) ÷ (1 + t·k)';
    } else {
      icms = t * baseIcms;
      icmsBase = baseIcms;
      icmsFormula = 'Base × alíquota' + (n(pf.icms.reducaoEntrada) ? ' × (1 − redução ' + fm.pct(n(pf.icms.reducaoEntrada)) + ')' : '');
    }
    icms = r2(icms);
    if (!fornSNicms || icms) {
      linha({ grupo: 'Aquisição', item: 'ICMS próprio destacado (embutido no valor)', entrada: ctx.icmsEnt.desc, base: icmsBase != null ? r2(icmsBase) : null, aliq: ctx.icmsEnt.aliq, formula: icmsFormula, valor: icms, origem: icmsInformado === 'recalculado' ? 'Calculado (NF de 2026)' : icmsInformado ? 'Informado' : ctx.icmsEnt.origem, fund: ['lc87_a13_p1'].concat(ctx.icmsEnt.fund || []).concat(ano === 2027 && pr.ibsCbsNaBaseIcms2027 && k > 0 ? ['fisco_icms_ibscbs'] : []), vig: VIG.icms, info: true, obs: 'Já incluído no valor da operação (cálculo por dentro).' + (pr.ipiNaBaseIcms ? ' IPI incluído na base.' : ' IPI fora da base (LC 87, art. 13, § 2º).') });
    }

    var cbsIn = r2(cbsInRate * (vop - icms));
    var ibsIn = r2(ibsInRate * (vop - icms));
    if (ano === 2027) {
      if (fornSN) {
        linha({ grupo: 'Aquisição', item: 'CBS/IBS do fornecedor optante', valor: 0, formula: 'Recolhidos no DAS do fornecedor — não destacados por fora', origem: 'Calculado', fund: ['lc214_a47_p9'], vig: VIG.t2027 });
      } else {
        linha({ grupo: 'Aquisição', item: 'CBS na entrada (por fora)', base: r2(vop - icms), aliq: cbsInRate * 100, formula: '(Vop − ICMS) × ' + ctx.a27.desc, valor: cbsIn, origem: ctx.a27.origem, fund: ['lc214_a12_p2_v', 'cf_156a'].concat(ctx.a27.fund), vig: VIG.t2027, obs: 'Base sem ICMS (art. 12, § 2º, V).' });
        linha({ grupo: 'Aquisição', item: 'IBS na entrada (por fora)', base: r2(vop - icms), aliq: ibsInRate * 100, formula: '(Vop − ICMS) × ' + (ctx.a27.descIbs || 'alíquota informada'), valor: ibsIn, origem: ctx.a27.origem, fund: ['lc214_a12_p2_v', 'lc214_a344'], vig: VIG.t2027 });
      }
    }

    // ----- ICMS-ST (substituído)
    var st = 0;
    var ehSubstituido = pf.icms.tratamento === 'st' && pf.st.papel === 'substituido';
    if (ehSubstituido) {
      if (pf.st.modo === 'informado') {
        st = n(pf.st.valorInformado);
        linha({ grupo: 'Aquisição', item: 'ICMS-ST retido na NF', valor: r2(st), formula: 'Valor informado (NF)', origem: 'Informado', fund: ['lc87_st'], vig: VIG.icms, obs: 'Integra o custo. Não gera crédito.' });
      } else {
        var mva = d(pf.st.mva);
        var tIntra = ctx.stInterna.aliq / 100;
        var mvaAj = mva;
        var tInter = ctx.icmsEnt.aliq / 100;
        var ajustada = false;
        if (sim.operacao.tipo === 'interestadual' && pf.st.ajustarMva !== false && tInter < tIntra && tIntra < 1) {
          mvaAj = (1 + mva) * (1 - tInter) / (1 - tIntra) - 1;
          ajustada = true;
        }
        var icmsProp = fornSNicms ? r2(t * baseIcms) : icms;
        var baseST = (vop + ipi) * (1 + mvaAj);
        st = Math.max(0, baseST * tIntra - icmsProp);
        linha({ grupo: 'Aquisição', item: 'ICMS-ST (substituição tributária)', entrada: 'MVA ' + fm.pct(mva * 100) + (ajustada ? ' → ajustada ' + fm.pct(mvaAj * 100) : ''), base: r2(baseST), aliq: ctx.stInterna.aliq, formula: '[(Vop + IPI) × (1 + MVA' + (ajustada ? ' ajustada' : '') + ')] × alíq. interna − ICMS próprio (' + fm.brl(icmsProp) + ')', valor: r2(st), origem: 'Calculado', fund: ['lc87_st'].concat(ajustada ? ['conv142'] : []).concat(ctx.stInterna.fund || []), vig: VIG.icms, obs: 'Integra o custo do substituído. Não gera crédito.' + (ano === 2027 ? ' Efeito de IBS/CBS na base da ST não modelado.' : '') });
        if (!ctx.stInterna.ok) avisos.push({ msg: 'Alíquota interna para o ICMS-ST não cadastrada.', campo: 'perfil.st.aliqInterna', nivel: 'alerta' });
      }
      st = r2(st);
    }

    // ----- ICMS na entrada: antecipado (sem encerramento) ou ICMS-ST recolhido pelo destinatário (com encerramento)
    var antTipo = RTC.model.tipoAntecipacao(pf.antecipado);
    var antec = 0;
    var antecEncerra = antTipo === 'st';
    var ehCE = ctx.ufEmp === 'CE';
    var fundCredAntec = ehCE ? ['ce_ricms_a61_p5', 'lc87_a19_20'] : ['lc87_a19_20', 'icms_uf'];
    var obsAntec = ctx.icmsRegular
      ? 'Destinatário do regime normal: o ICMS antecipado vira crédito fiscal após o efetivo recolhimento' + (ehCE ? ' (Decreto 33.327/2019, art. 61, § 5º).' : ' — confira a legislação da UF.')
      : 'Destinatário do Simples Nacional: o ICMS antecipado integra o custo (sem crédito — LC 123/2006, art. 13, § 1º, XIII, "g", e art. 23).';
    var obsStEntrada = 'ICMS-ST pago na entrada: vira custo (o contribuinte não se credita) e encerra a tributação até o consumidor final — a venda sai sem débito de ICMS.';
    if (antTipo === 'antecipado') {
      if (pf.antecipado.modo === 'informado') {
        antec = n(pf.antecipado.valor);
        linha({ grupo: 'Aquisição', item: 'ICMS antecipado (sem encerramento)', valor: r2(antec), formula: 'Valor pago na entrada (DAE)', origem: 'Informado', fund: ctx.icmsRegular ? fundCredAntec : ['lc123_a13_g', 'lc123_a23'], vig: VIG.icms, obs: obsAntec });
      } else {
        var ti = ctx.interna(ctx.ufEmp);
        antec = Math.max(0, (ti.aliq - ctx.icmsEnt.aliq) / 100 * vop);
        linha({ grupo: 'Aquisição', item: 'ICMS antecipado (sem encerramento)', base: vop, aliq: Math.max(0, ti.aliq - ctx.icmsEnt.aliq), formula: 'Vop × (alíq. interna ' + fm.pct(ti.aliq) + ' − alíq. entrada ' + fm.pct(ctx.icmsEnt.aliq) + ')', valor: r2(antec), origem: 'Calculado', fund: (ctx.icmsRegular ? fundCredAntec : ['lc123_a13_g', 'lc123_a23']).concat(['icms_uf']), vig: VIG.icms, obs: obsAntec + ' Base simplificada (diferencial de alíquotas) — confira a regra estadual.' });
        if (!ti.ok) avisos.push({ msg: 'ICMS antecipado calculado sem alíquota interna cadastrada para ' + ctx.ufEmp + '.', campo: 'perfil.antecipado.tipo', nivel: 'alerta' });
      }
      antec = r2(antec);
    } else if (antTipo === 'st') {
      if (pf.antecipado.modo === 'informado') {
        antec = n(pf.antecipado.valor);
        linha({ grupo: 'Aquisição', item: 'ICMS-ST recolhido na entrada (com encerramento)', valor: r2(antec), formula: 'Valor pago na entrada (DAE)', origem: 'Informado', fund: ['icms_st_entrada'], vig: VIG.icms, obs: obsStEntrada });
      } else {
        var tiSt = ctx.interna(ctx.ufEmp);
        var mvaA = d(pf.antecipado.mva);
        var tIntraA = tiSt.aliq / 100;
        var tInterA = ctx.icmsEnt.aliq / 100;
        var mvaAjA = mvaA;
        var ajustadaA = false;
        if (sim.operacao.tipo === 'interestadual' && pf.antecipado.ajustarMva !== false && tInterA < tIntraA && tIntraA < 1) {
          mvaAjA = (1 + mvaA) * (1 - tInterA) / (1 - tIntraA) - 1;
          ajustadaA = true;
        }
        var icmsPropA = fornSNicms ? r2(t * baseIcms) : icms;
        var baseStA = (vop + ipi) * (1 + mvaAjA);
        antec = Math.max(0, baseStA * tIntraA - icmsPropA);
        linha({ grupo: 'Aquisição', item: 'ICMS-ST recolhido na entrada (com encerramento)', entrada: 'MVA ' + fm.pct(mvaA * 100) + (ajustadaA ? ' → ajustada ' + fm.pct(mvaAjA * 100) : ''), base: r2(baseStA), aliq: tiSt.aliq, formula: '[(Vop + IPI) × (1 + MVA' + (ajustadaA ? ' ajustada' : '') + ')] × alíq. interna − ICMS próprio (' + fm.brl(icmsPropA) + ')', valor: r2(antec), origem: 'Calculado', fund: ['icms_st_entrada'].concat(ajustadaA ? ['conv142'] : []).concat(['icms_uf']), vig: VIG.icms, obs: obsStEntrada });
        if (!tiSt.ok) avisos.push({ msg: 'ICMS-ST na entrada calculado sem alíquota interna cadastrada para ' + ctx.ufEmp + '.', campo: 'perfil.antecipado.tipo', nivel: 'alerta' });
      }
      antec = r2(antec);
    }

    var bruto = r2(vop + freteFora + ipi + st + antec + cbsIn + ibsIn);
    linha({ grupo: 'Aquisição', item: 'Custo bruto de aquisição', valor: bruto, formula: 'Vop + frete fora da NF + IPI + ICMS-ST + antecipação' + (ano === 2027 ? ' + CBS + IBS' : ''), origem: 'Calculado', destaque: true });

    // ================= CRÉDITOS =================
    var creditos = [];
    function credito(o) { creditos.push(o); linha(Object.assign({ grupo: 'Créditos (tributos recuperáveis)' }, o, { valor: -(o.valor || 0) })); }

    // ICMS
    var icmsElegivel = true, icmsMotivo = '';
    var trat = pf.icms.tratamento;
    if (!ctx.icmsRegular) { icmsElegivel = false; icmsMotivo = emp.regime === 'SN' ? 'Optante pelo Simples Nacional não apropria crédito de ICMS (LC 123, art. 23).' : 'Empresa não contribuinte do ICMS.'; }
    else if (ehSubstituido) { icmsElegivel = false; icmsMotivo = 'Mercadoria com ICMS retido por ST: a saída não gera débito, logo ICMS próprio e ST compõem o custo.'; }
    else if (antecEncerra) { icmsElegivel = false; icmsMotivo = 'ICMS-ST recolhido na entrada (encerramento): a saída não gera débito, logo o ICMS próprio da NF integra o custo.'; }
    else if (trat === 'isento') { icmsElegivel = false; icmsMotivo = 'Saída isenta/não tributada: estorno do crédito (LC 87, art. 21).'; }
    var icmsCredBruto = r2((fornSNicms ? r2(vop * d(forn.icmsSimplesPct)) : icms) + icmsFrete);
    var icmsCred = 0;
    var icmsObs = icmsMotivo;
    if (icmsElegivel) {
      icmsCred = icmsCredBruto;
      if (fornSNicms) icmsObs = 'Fornecedor optante: crédito limitado ao percentual informado na NF (' + fm.pct(n(forn.icmsSimplesPct)) + ').';
      if (icmsFrete) icmsObs = (icmsObs ? icmsObs + ' ' : '') + 'Inclui o ICMS do CT-e (' + fm.brl(icmsFrete) + ').';
      if (trat === 'reducao_base' && pf.icms.estornoProporcional !== false && n(pf.icms.reducaoSaida) > 0) {
        icmsCred = r2(icmsCred * (1 - d(pf.icms.reducaoSaida)));
        icmsObs = (icmsObs ? icmsObs + ' ' : '') + 'Estorno proporcional à redução de base da saída (' + fm.pct(n(pf.icms.reducaoSaida)) + ').';
      }
      if (cr.icms === false) { icmsObs = 'Crédito desabilitado pelo usuário. ' + (icmsObs || ''); icmsCred = 0; }
      else if (!icmsObs) icmsObs = 'Crédito do ICMS destacado (não cumulatividade).';
    }
    // com ICMS do CT-e, o crédito soma duas bases diferentes: base × alíquota deixa de valer para a linha
    credito({ id: 'icms', item: 'ICMS recuperável', base: icmsElegivel && !icmsFrete ? (fornSNicms ? vop : (icmsBase != null ? r2(icmsBase) : null)) : null, aliq: icmsElegivel && !icmsFrete ? (fornSNicms ? n(forn.icmsSimplesPct) : ctx.icmsEnt.aliq) : null, valor: icmsCred, elegivel: icmsElegivel, habilitado: cr.icms !== false, formula: icmsElegivel ? (fornSNicms ? 'Vop × % informado pelo optante' : 'ICMS destacado') + (icmsFrete ? ' + ICMS do CT-e' : '') : 'Não recuperável', origem: 'Calculado', fund: fornSNicms ? ['lc123_a23'] : (trat === 'reducao_base' ? ['lc87_a19_20', 'stf_tema299'] : ['lc87_a19_20'].concat(icmsElegivel ? [] : ['lc87_a21'])), vig: VIG.icms, obs: icmsObs });

    // IPI
    var ipiElegivel = ctx.industrial && emp.regime !== 'SN' && ipi > 0;
    var ipiCred = ipiElegivel && cr.ipi !== false ? ipi : 0;
    if (ipi > 0 || temIpi) {
      credito({ id: 'ipi', item: 'IPI recuperável', base: ipiElegivel ? vop : null, aliq: ipiElegivel ? ipiAliq : null, valor: ipiCred, elegivel: ipiElegivel, habilitado: cr.ipi !== false, formula: ipiElegivel ? 'IPI destacado' : 'Não recuperável', origem: 'Calculado', fund: ['ripi'], vig: ano === 2027 ? VIG.ipi27 : VIG.v2026, obs: ipiElegivel ? (cr.ipi === false ? 'Crédito desabilitado pelo usuário.' : 'Estabelecimento industrial/equiparado.') : (ipi > 0 ? (emp.regime === 'SN' ? 'Optante pelo Simples não credita IPI.' : 'Comércio não equiparado a industrial: IPI integra o custo.') : 'Sem IPI na entrada.') });
    }

    // PIS/Cofins (2026)
    var pisCred = 0, cofinsCred = 0;
    if (ano === 2026) {
      var pcTrat = pf.pisCofins.tratamento;
      var pcElegivel = emp.regime === 'LR' && (pcTrat === 'normal' || (pcTrat === 'outro' && pf.pisCofins.creditoManual));
      var pcMotivo = '';
      if (emp.regime === 'LP') pcMotivo = 'Lucro Presumido: regime cumulativo, sem créditos.';
      else if (emp.regime === 'SN') pcMotivo = 'Optante pelo Simples Nacional não apropria créditos (LC 123, art. 23).';
      else if (!pcElegivel) pcMotivo = 'Aquisição não sujeita ao pagamento (' + pcTrat.replace('_', ' ') + '): sem direito a crédito.';
      // regra do escritório: base = mercadoria − desconto − ICMS destacado na NF (inclusive o ICMS sobre o frete da NF).
      // Ficam fora: frete, seguro, despesas acessórias, IPI, ICMS-ST e antecipação (estes não entram nem saem).
      var basePC = r2(Math.max(0, prod - desc - icms));
      var rp = pcTrat === 'outro' ? n(pf.pisCofins.pisManual) : pv.pisLR;
      var rc = pcTrat === 'outro' ? n(pf.pisCofins.cofinsManual) : pv.cofinsLR;
      if (pcElegivel && cr.pisCofins !== false) {
        pisCred = r2(basePC * rp / 100);
        cofinsCred = r2(basePC * rc / 100);
      }
      var pcObs = pcElegivel ? (cr.pisCofins === false ? 'Crédito desabilitado pelo usuário.' : 'Base = valor dos produtos' + (desc ? ' − descontos' : '') + ' − ICMS destacado na NF (Lei 14.592/2023). Frete, seguro, despesas, IPI, ICMS-ST e antecipação fora da base.') : pcMotivo;
      credito({ id: 'pis', item: 'PIS recuperável (2026)', base: pcElegivel ? basePC : null, aliq: pcElegivel ? rp : null, valor: pisCred, elegivel: pcElegivel, habilitado: cr.pisCofins !== false, formula: pcElegivel ? 'Base de crédito × alíquota' : 'Não recuperável', origem: pcElegivel ? 'Parâmetro legal' : 'Calculado', fund: emp.regime === 'SN' ? ['lc123_a23'] : (emp.regime === 'LP' ? ['pc_cumulativo'] : ['pc_creditos', 'l10637_a2']), vig: VIG.pc, obs: pcObs });
      credito({ id: 'cofins', item: 'Cofins recuperável (2026)', base: pcElegivel ? basePC : null, aliq: pcElegivel ? rc : null, valor: cofinsCred, elegivel: pcElegivel, habilitado: cr.pisCofins !== false, formula: pcElegivel ? 'Base de crédito × alíquota' : 'Não recuperável', origem: pcElegivel ? 'Parâmetro legal' : 'Calculado', fund: emp.regime === 'SN' ? ['lc123_a23'] : (emp.regime === 'LP' ? ['pc_cumulativo'] : ['pc_creditos', 'l10833_a2']), vig: VIG.pc, obs: pcObs });
    }

    // CBS/IBS (2027)
    var cbsCred = 0, ibsCred = 0;
    if (ano === 2027) {
      var cbTrat = pf.cbsIbs.tratamento;
      var cbElegivel = ctx.regular27 && cbTrat !== 'aliquota_zero' && cbTrat !== 'isento';
      var cbMotivo = '';
      if (!ctx.regular27) cbMotivo = 'Optante pelo Simples com IBS/CBS no DAS não apropria créditos (LC 214, art. 47, § 9º).';
      else if (!cbElegivel) cbMotivo = 'Operação com alíquota zero/isenção: sem IBS/CBS a creditar.';
      var cbsDisp, ibsDisp, cbForm;
      if (fornSN) {
        cbsDisp = r2(vop * d(forn.cbsSimplesPct));
        ibsDisp = r2(vop * d(forn.ibsSimplesPct));
        cbForm = 'Vop × % pago no DAS pelo fornecedor (limite do art. 47, § 9º)';
      } else {
        cbsDisp = cbsIn;
        ibsDisp = ibsIn;
        cbForm = 'CBS/IBS destacados na NF';
      }
      if (cbElegivel) {
        cbsCred = cr.cbs !== false ? cbsDisp : 0;
        ibsCred = cr.ibs !== false ? ibsDisp : 0;
      }
      var condicao = ' Crédito condicionado à extinção do débito do fornecedor (art. 47).';
      credito({ id: 'cbs', item: 'CBS recuperável (2027)', base: cbElegivel && !fornSN ? r2(vop - icms) : (fornSN && cbElegivel ? vop : null), aliq: cbElegivel ? (fornSN ? n(forn.cbsSimplesPct) : cbsInRate * 100) : null, valor: cbsCred, elegivel: cbElegivel, habilitado: cr.cbs !== false, formula: cbElegivel ? cbForm : 'Não recuperável', origem: 'Calculado', fund: fornSN ? ['lc214_a47_p9'] : ['lc214_a47'], vig: VIG.t2027, obs: cbElegivel ? (cr.cbs === false ? 'Crédito desabilitado pelo usuário.' : (fornSN ? 'Fornecedor optante (IBS/CBS no DAS).' : 'Crédito integral do valor destacado.') + condicao) : cbMotivo });
      credito({ id: 'ibs', item: 'IBS recuperável (2027)', base: cbElegivel && !fornSN ? r2(vop - icms) : (fornSN && cbElegivel ? vop : null), aliq: cbElegivel ? (fornSN ? n(forn.ibsSimplesPct) : ibsInRate * 100) : null, valor: ibsCred, elegivel: cbElegivel, habilitado: cr.ibs !== false, formula: cbElegivel ? cbForm : 'Não recuperável', origem: 'Calculado', fund: fornSN ? ['lc214_a47_p9'] : ['lc214_a47'], vig: VIG.t2027, obs: cbElegivel ? (cr.ibs === false ? 'Crédito desabilitado pelo usuário.' : 'Crédito do IBS destacado.' + condicao) : cbMotivo });
    }

    // Antecipação parcial
    var antecCred = 0;
    if (antTipo !== 'nenhum') {
      var antElegivel = antTipo === 'antecipado' && ctx.icmsRegular;
      antecCred = antElegivel && cr.antecipado !== false ? antec : 0;
      credito({
        id: 'antecipado', item: antTipo === 'st' ? 'ICMS-ST pago na entrada' : 'ICMS antecipado recuperável', valor: antecCred, elegivel: antElegivel, habilitado: cr.antecipado !== false,
        formula: antElegivel ? 'ICMS antecipado efetivamente recolhido' : 'Não recuperável — integra o custo', origem: 'Calculado',
        fund: antTipo === 'st' ? ['icms_st_entrada'] : (antElegivel ? fundCredAntec : ['lc123_a13_g', 'lc123_a23']), vig: VIG.icms,
        obs: antTipo === 'st' ? obsStEntrada : (antElegivel && cr.antecipado === false ? 'Crédito desabilitado pelo usuário. ' + obsAntec : obsAntec)
      });
    }

    // Outros
    var outros = n(ano === 2026 ? cr.outros26 : cr.outros27);
    if (outros) credito({ id: 'outros', item: 'Outros tributos recuperáveis', valor: outros, elegivel: true, habilitado: true, formula: 'Valor informado', origem: 'Informado', fund: [], obs: 'Informado pelo usuário — documente o fundamento.' });

    var totalCred = r2(icmsCred + ipiCred + pisCred + cofinsCred + cbsCred + ibsCred + antecCred + outros);
    var liquido = r2(bruto - totalCred);

    // Tributos não recuperáveis incorporados ao custo
    var naoRec = [];
    if (icms - (fornSNicms ? 0 : icmsCred) > 0.004 && !fornSNicms) naoRec.push({ item: 'ICMS próprio não creditado', valor: r2(icms - icmsCred) });
    if (st > 0) naoRec.push({ item: 'ICMS-ST', valor: st });
    if (antec - antecCred > 0.004) naoRec.push({ item: antTipo === 'st' ? 'ICMS-ST pago na entrada' : 'ICMS antecipado', valor: r2(antec - antecCred) });
    if (ipi - ipiCred > 0.004) naoRec.push({ item: 'IPI não creditado', valor: r2(ipi - ipiCred) });
    if (cbsIn - cbsCred > 0.004) naoRec.push({ item: 'CBS não creditada', valor: r2(cbsIn - cbsCred) });
    if (ibsIn - ibsCred > 0.004) naoRec.push({ item: 'IBS não creditado', valor: r2(ibsIn - ibsCred) });

    linha({ grupo: 'Resultado do custo', item: 'Total de créditos recuperáveis', valor: totalCred, formula: 'Σ créditos elegíveis e habilitados', origem: 'Calculado', destaque: true });
    linha({ grupo: 'Resultado do custo', item: 'Custo líquido de aquisição', valor: liquido, formula: 'Custo bruto − créditos', origem: 'Calculado', destaque: true });
    var qtd = n(sim.produto.quantidade);
    var unit = qtd > 0 ? liquido / qtd : null;
    if (unit != null) linha({ grupo: 'Resultado do custo', item: 'Custo líquido unitário', entrada: fm.num(qtd, 0) + ' ' + (sim.produto.unidade || 'un'), valor: Math.round(unit * 10000) / 10000, formula: 'Custo líquido ÷ quantidade', origem: 'Calculado' });

    if (ano === 2026 && emp.regime !== 'SN') {
      linha({ grupo: 'Informativo', item: 'IBS/CBS-teste na aquisição (2026)', valor: 0, formula: 'Destaque informativo: sem crédito e sem custo (dispensa/compensação)', origem: 'Parâmetro legal', fund: ['lc214_a348', 'adct_125'], vig: VIG.t2026, info: true });
    }

    return {
      ano: ano, linhas: L, avisos: avisos,
      produtos: prod, vop: vop, freteFora: freteFora, frete: frete, seguro: seg, despesas: desp, desconto: desc,
      ipi: ipi, icms: icms, st: st, antecipado: antec, cbs: cbsIn, ibs: ibsIn,
      bruto: bruto, creditos: creditos, totalCreditos: totalCred, liquido: liquido, unitario: unit,
      cred: { icms: icmsCred, ipi: ipiCred, pis: pisCred, cofins: cofinsCred, cbs: cbsCred, ibs: ibsCred, antecipado: antecCred, outros: outros },
      naoRecuperaveis: naoRec, totalNaoRecuperaveis: r2(sum(naoRec, function (x) { return x.valor; })),
      fornecedor: fornReg
    };
  }

  // ------------------------------------------------------------------ Simples: alíquota do DAS ajustada
  function dasEfetivo(ano, ctx) {
    var sn = ano === 2026 ? ctx.sn26 : ctx.sn27;
    var pf = ctx.sim.perfil;
    var part = sn.partilha;
    var excl = 0;
    var ajustes = [];
    var fund = sn.fund.slice();
    var semIcms = (pf.icms.tratamento === 'st' && pf.st.papel === 'substituido') || RTC.model.tipoAntecipacao(pf.antecipado) === 'st' || pf.icms.tratamento === 'isento';
    if (part.ICMS && semIcms) {
      excl += part.ICMS;
      ajustes.push('ICMS excluído (' + F().pct(part.ICMS) + ' da partilha): ' + (pf.icms.tratamento === 'isento' ? 'saída isenta (confirme a previsão estadual para optantes)' : 'ICMS já recolhido por ST/antecipação com encerramento'));
      fund.push('lc123_a18_p4a');
    }
    if (ano === 2026) {
      var pc = pf.pisCofins.tratamento;
      if (['monofasico', 'aliquota_zero', 'isento', 'suspensao'].indexOf(pc) >= 0) {
        excl += n(part.PIS) + n(part.COFINS);
        ajustes.push('PIS/Cofins excluídos (' + F().pct(n(part.PIS) + n(part.COFINS)) + ' da partilha): receita ' + (pc === 'monofasico' ? 'monofásica' : 'com ' + pc.replace('_', ' ')) + (pc === 'monofasico' ? '' : ' — confirme a previsão legal de segregação'));
        fund.push('lc123_a18_p4a');
      }
    } else {
      var cb = pf.cbsIbs.tratamento;
      var cbsIbsPart = n(part.CBS) + n(part.IBS);
      if (ctx.emp.simples.ibsCbsForaDas2027) {
        excl += cbsIbsPart;
        ajustes.push('CBS/IBS excluídos do DAS (' + F().pct(cbsIbsPart) + ' da partilha): opção pelo regime regular (LC 214, art. 41, § 3º)');
        fund.push('lc214_a41_p3');
      } else if (cb === 'aliquota_zero' || cb === 'isento') {
        excl += cbsIbsPart;
        ajustes.push('CBS/IBS excluídos (' + F().pct(cbsIbsPart) + ' da partilha): operação com ' + (cb === 'isento' ? 'isenção' : 'alíquota zero') + ' — A CONFIRMAR na regulamentação do CGSN');
      } else if (cb === 'reducao' && n(pf.cbsIbs.reducaoPct) > 0) {
        excl += cbsIbsPart * d(pf.cbsIbs.reducaoPct);
        ajustes.push('CBS/IBS reduzidos proporcionalmente (' + F().pct(n(pf.cbsIbs.reducaoPct)) + ') — A CONFIRMAR na regulamentação do CGSN');
      }
    }
    return { aliq: sn.efetiva * (1 - excl / 100), efetiva: sn.efetiva, excl: excl, ajustes: ajustes, sn: sn, fund: fund };
  }

  // ------------------------------------------------------------------ modelo linear de venda
  function modeloVenda(ano, ctx, custoRes) {
    var sim = ctx.sim, pv = ctx.pv, emp = ctx.emp;
    var pf = sim.perfil, pr = sim.premissas;
    var fm = F();
    var items = [];
    var trat = pf.icms.tratamento;
    var ehSubstituido = trat === 'st' && pf.st.papel === 'substituido';

    // CBS/IBS (por fora, 2027, regime regular)
    var c = 0, i = 0;
    if (ano === 2027 && ctx.regular27) { c = ctx.a27.cbs; i = ctx.a27.ibs; }
    var k = c + i;

    // ----- ICMS
    var t = 0, icmsObs = '', icmsFund = ['lc87_a13_p1'];
    var semDebito = ehSubstituido || RTC.model.tipoAntecipacao(pf.antecipado) === 'st';
    if (ctx.icmsRegular) {
      if (semDebito) icmsObs = 'Saída sem débito: ICMS-ST retido pelo fornecedor ou recolhido na entrada (tributação encerrada até o consumidor final).';
      else if (trat === 'isento') icmsObs = 'Saída isenta ou não tributada.';
      else if (trat === 'diferido') icmsObs = 'ICMS diferido na saída (confirme a previsão estadual).';
      else {
        t = ctx.icmsSai.aliq / 100 * (trat === 'reducao_base' ? (1 - d(pf.icms.reducaoSaida)) : 1);
        icmsFund = icmsFund.concat(ctx.icmsSai.fund || []);
      }
      // na base do ICMS: IBS + CBS (SEFAZ); com liminar judicial da empresa, só o IBS (kb = parte por fora na base)
      var liminar = ano === 2027 && pr.ibsCbsNaBaseIcms2027 && !!pr.liminarCbsForaBaseIcms2027;
      var kb = liminar ? i : k;
      var grossUp = ano === 2027 && pr.ibsCbsNaBaseIcms2027 && kb > 0 && t > 0;
      var aIcms = grossUp ? t * (1 + kb) / (1 + t * kb) : t;
      items.push({
        id: 'icms', nome: 'ICMS próprio', tipo: 'dentro', a: aIcms, b: 0,
        aliq: ctx.icmsSai.aliq * (trat === 'reducao_base' ? (1 - d(pf.icms.reducaoSaida)) : 1),
        baseA: t > 0 ? aIcms / t : 1, baseB: 0,
        entrada: semDebito || trat === 'isento' || trat === 'diferido' ? '—' : ctx.icmsSai.desc,
        formula: grossUp ? (liminar ? 'alíq × (X + IBS), IBS = i·(X − ICMS) ⇒ ICMS = X · t(1+i)/(1+t·i) — liminar: CBS fora da base' : 'alíq × (X + CBS + IBS), CBS/IBS = k·(X − ICMS) ⇒ ICMS = X · t(1+k)/(1+t·k)') : (trat === 'reducao_base' ? 'X × alíq × (1 − redução ' + fm.pct(n(pf.icms.reducaoSaida)) + ')' : 'X × alíquota (por dentro)'),
        natureza: 'Por dentro', origem: ctx.icmsSai.origem, fund: icmsFund.concat(grossUp ? ['fisco_icms_ibscbs'] : []), vig: VIG.icms,
        obs: icmsObs || (grossUp ? 'Premissa: IBS/CBS integram a base do ICMS a partir de 2027 (entendimento de SEFAZ; tema judicializado).' + (liminar ? ' Por liminar judicial da empresa, a CBS fica fora da base.' : '') : '')
      });
    }
    var aIcmsVal = items.length && items[0].id === 'icms' ? items[0].a : 0;

    // valor do ICMS-ST retido a excluir das bases (opcional)
    var stExcl = (ehSubstituido ? custoRes.st : 0) + (RTC.model.tipoAntecipacao(pf.antecipado) === 'st' ? custoRes.antecipado : 0);

    // ----- PIS/Cofins (2026)
    var aPis = 0, bPis = 0, aCof = 0, bCof = 0;
    if (ano === 2026 && emp.regime !== 'SN') {
      var pcTrat = pf.pisCofins.tratamento;
      var rp, rc, pcFund, pcObs = '';
      if (pcTrat === 'outro') { rp = n(pf.pisCofins.pisManual); rc = n(pf.pisCofins.cofinsManual); pcFund = []; }
      else if (pcTrat !== 'normal') { rp = 0; rc = 0; pcFund = pcTrat === 'monofasico' ? ['pc_monofasico'] : ['pc_creditos']; pcObs = 'Receita com ' + (pcTrat === 'monofasico' ? 'tributação monofásica (revenda a alíquota zero)' : pcTrat.replace('_', ' ')) + '.'; }
      else if (emp.regime === 'LR') { rp = pv.pisLR; rc = pv.cofinsLR; pcFund = ['l10637_a2', 'l10833_a2']; }
      else { rp = pv.pisLP; rc = pv.cofinsLP; pcFund = ['pc_cumulativo']; }
      // ICMS sempre fora da base (STF, Tema 69): não é premissa opcional
      var fatorIcms = 1 - aIcmsVal;
      var bBase = pr.excluirStBasePisCofins && stExcl ? -stExcl : 0;
      aPis = rp / 100 * fatorIcms; bPis = rp / 100 * bBase;
      aCof = rc / 100 * fatorIcms; bCof = rc / 100 * bBase;
      var formPC = 'Alíq × (X' + (aIcmsVal > 0 ? ' − ICMS' : '') + (bBase ? ' − ICMS-ST' : '') + ')';
      var fundPC = pcFund.concat(aIcmsVal > 0 ? ['stf_tema69'] : []).concat(bBase ? ['stj_tema1125'] : []);
      items.push({ id: 'pis', nome: 'PIS/Pasep', tipo: 'dentro', a: aPis, b: bPis, aliq: rp, baseA: fatorIcms, baseB: bBase, formula: formPC, natureza: 'Por dentro — base específica', origem: pcTrat === 'outro' ? 'Informado' : 'Parâmetro legal', fund: fundPC, vig: VIG.pc, obs: pcObs || (emp.regime === 'LR' ? 'Regime não cumulativo.' : 'Regime cumulativo.') });
      items.push({ id: 'cofins', nome: 'Cofins', tipo: 'dentro', a: aCof, b: bCof, aliq: rc, baseA: fatorIcms, baseB: bBase, formula: formPC, natureza: 'Por dentro — base específica', origem: pcTrat === 'outro' ? 'Informado' : 'Parâmetro legal', fund: fundPC, vig: VIG.pc, obs: pcObs });
    }

    // ----- Simples Nacional (DAS)
    var das = null;
    if (emp.regime === 'SN') {
      das = dasEfetivo(ano, ctx);
      items.push({ id: 'das', nome: 'Simples Nacional (DAS)', tipo: 'dentro', a: das.aliq / 100, b: 0, aliq: das.aliq, baseA: 1, baseB: 0, entrada: RTC.simples.ANEXOS[emp.simples.anexo] + ' — ' + das.sn.faixa + 'ª faixa', formula: 'X × alíquota efetiva' + (das.excl ? ' × (1 − ' + fm.pct(das.excl) + ' segregados)' : ''), natureza: 'Por dentro', origem: ano === 2027 ? 'Tabela 2027 (a confirmar)' : 'Parâmetro legal (LC 123)', fund: das.fund, vig: ano === 2027 ? VIG.t2027 : VIG.sn, obs: 'Efetiva ' + fm.pct(das.efetiva, 4) + '. ' + (das.ajustes.join('; ') || 'Sem segregação de receitas.') + (ctx.snAcimaSub ? ' ICMS fora do DAS (sublimite).' : '') });
    }

    // ----- CBS/IBS teste 2026 (informativo)
    if (ano === 2026 && emp.regime !== 'SN') {
      var baseA26 = 1 - aIcmsVal - aPis - aCof;
      var baseB26 = -(bPis + bCof);
      items.push({ id: 'cbs_teste', nome: 'CBS-teste 2026 (informativo)', tipo: 'info', a: pv.cbsTeste2026 / 100 * baseA26, b: pv.cbsTeste2026 / 100 * baseB26, aliq: pv.cbsTeste2026, baseA: baseA26, baseB: baseB26, formula: '(X − ICMS − PIS − Cofins) × 0,9% — destaque sem ônus', natureza: 'Informativo', origem: 'Parâmetro legal', fund: ['lc214_a346', 'lc214_a348', 'lc214_a12_p2_v'], vig: VIG.t2026, obs: 'Compensável com PIS/Cofins ou dispensado (art. 348, § 1º). Não altera preço nem margem.' });
      items.push({ id: 'ibs_teste', nome: 'IBS-teste 2026 (informativo)', tipo: 'info', a: pv.ibsTeste2026 / 100 * baseA26, b: pv.ibsTeste2026 / 100 * baseB26, aliq: pv.ibsTeste2026, baseA: baseA26, baseB: baseB26, formula: '(X − ICMS − PIS − Cofins) × 0,1% — destaque sem ônus', natureza: 'Informativo', origem: 'Parâmetro legal', fund: ['lc214_a343', 'lc214_a348'], vig: VIG.t2026, obs: 'Idem.' });
    }

    // ----- CBS/IBS 2027 (por fora)
    if (ano === 2027 && ctx.regular27) {
      var fac = 1 - aIcmsVal;
      var bST = pr.excluirStBaseCbs && stExcl ? -stExcl : 0;
      var formC = '(X − ICMS' + (bST ? ' − ICMS-ST' : '') + ') × ';
      items.push({ id: 'cbs', nome: 'CBS', tipo: 'fora', a: c * fac, b: c * bST, aliq: c * 100, baseA: fac, baseB: bST, formula: formC + ctx.a27.desc, natureza: 'Por fora', origem: ctx.a27.origem, fund: ['lc214_a12_p2_v', 'cf_156a'].concat(ctx.a27.fund), vig: VIG.t2027, obs: 'Não integra o preço da mercadoria: cobrada do adquirente e compensada com créditos (não cumulatividade).' });
      items.push({ id: 'ibs', nome: 'IBS', tipo: 'fora', a: i * fac, b: i * bST, aliq: i * 100, baseA: fac, baseB: bST, formula: formC + (ctx.a27.descIbs || 'alíquota informada'), natureza: 'Por fora', origem: ctx.a27.origem, fund: ['lc214_a12_p2_v', 'lc214_a344'], vig: VIG.t2027, obs: 'IBS de transição (estadual + municipal).' });
    } else if (ano === 2027 && emp.regime === 'SN') {
      items.push({ id: 'cbs_das', nome: 'CBS/IBS no DAS', tipo: 'info', a: 0, b: 0, aliq: null, baseA: 0, baseB: 0, formula: 'Incluídos na alíquota do DAS (partilha 2027)', natureza: 'No DAS', origem: 'Tabela 2027 (a confirmar)', fund: ['lc123_anexos_2027', 'lc214_a47_p9'], vig: VIG.t2027, obs: 'O adquirente do regime regular credita apenas o valor pago no DAS.' });
    }

    // ----- IPI na saída (por fora)
    var ipiS = 0;
    if (ctx.industrial && emp.regime !== 'SN') {
      var ipiZero = ano === 2027 && !pf.ipi.mantido2027;
      ipiS = ipiZero ? 0 : d(pf.ipi.aliqSaida);
      if (n(pf.ipi.aliqSaida) > 0) {
        items.push({ id: 'ipi', nome: 'IPI', tipo: 'fora', a: ipiS, b: 0, aliq: ipiS * 100, baseA: 1, baseB: 0, formula: 'X × alíquota TIPI', natureza: 'Por fora', origem: ipiZero ? 'Parâmetro legal' : origemDe(sim, 'perfil.ipi.aliqSaida'), fund: ipiZero ? ['adct_126', 'lc214_a454'] : ['ripi'], vig: ipiZero ? VIG.ipi27 : VIG.v2026, obs: ipiZero ? 'Reduzido a zero a partir de 2027 (exceto ZFM).' : '' });
      }
    }

    // ----- ICMS-ST retido como substituto (por fora)
    if (trat === 'st' && pf.st.papel === 'substituto' && ctx.icmsRegular) {
      var mva = d(pf.st.mva);
      var tIntra = ctx.stInterna.aliq / 100;
      var aST = Math.max(0, (1 + ipiS) * (1 + mva) * tIntra - aIcmsVal);
      items.push({ id: 'st', nome: 'ICMS-ST retido (substituto)', tipo: 'fora', a: aST, b: 0, aliq: ctx.stInterna.aliq, baseA: (1 + ipiS) * (1 + mva), baseB: 0, formula: '[(X + IPI) × (1 + MVA ' + fm.pct(mva * 100) + ')] × alíq. interna − ICMS próprio', natureza: 'Por fora', origem: 'Calculado', fund: ['lc87_st'].concat(ctx.stInterna.fund || []), vig: VIG.icms, obs: 'Cobrado do adquirente e repassado ao Estado. Não altera a margem.' });
    }

    // ----- IRPJ/CSLL
    var tau = 0;
    if (emp.regime === 'LP') {
      var lp = ctx.lp;
      var aliqI = pv.irpj + (lp.adicional ? pv.irpjAdicional : 0);
      items.push({ id: 'irpj', nome: 'IRPJ (presumido)', tipo: 'ir', a: lp.presI / 100 * aliqI / 100, b: 0, aliq: aliqI, baseA: lp.presI / 100, baseB: 0, entrada: 'Presunção ' + fm.pct(lp.presI), formula: 'X × presunção × (15%' + (lp.adicional ? ' + adicional 10%' : '') + ')', natureza: 'Sobre receita presumida', origem: 'Parâmetro legal', fund: ['l9249_a15_20', 'l9249_a3'].concat(lp.lc224 ? ['lc224_a4'] : []).concat(ano === 2027 ? ['dl1598_a12'] : []), vig: VIG.ir, obs: (lp.adicional ? 'Adicional marginal considerado. ' : '') + (lp.lc224 ? 'Presunção majorada pela LC 224/2025 (marginal).' : '') });
      items.push({ id: 'csll', nome: 'CSLL (presumida)', tipo: 'ir', a: lp.presC / 100 * pv.csll / 100, b: 0, aliq: pv.csll, baseA: lp.presC / 100, baseB: 0, entrada: 'Presunção ' + fm.pct(lp.presC), formula: 'X × presunção × 9%', natureza: 'Sobre receita presumida', origem: 'Parâmetro legal', fund: ['l9249_a15_20', 'l7689_a3'].concat(lp.lc224 ? ['lc224_a4'] : []), vig: VIG.ir });
    }
    if (emp.regime === 'LR') tau = ctx.lr.tau;

    // ----- despesas variáveis
    var dvPct = sum(sim.venda.despesas || [], function (x) { return n(x.pct); });
    var fora = items.filter(function (it) { return it.tipo === 'fora'; });
    var sobreTotal = pr.baseDespesas !== 'mercadoria' && fora.length > 0;
    var aFora = sum(fora, function (it) { return it.a; });
    var bFora = sum(fora, function (it) { return it.b; });
    items.push({
      id: 'dv', nome: 'Despesas variáveis sobre a venda', tipo: 'despesa',
      a: dvPct / 100 * (sobreTotal ? 1 + aFora : 1), b: dvPct / 100 * (sobreTotal ? bFora : 0),
      aliq: dvPct, baseA: sobreTotal ? 1 + aFora : 1, baseB: sobreTotal ? bFora : 0,
      entrada: (sim.venda.despesas || []).filter(function (x) { return n(x.pct); }).map(function (x) { return (x.descricao || 'Despesa') + ' ' + fm.pct(n(x.pct)); }).join('; ') || '—',
      formula: sobreTotal ? '(X + tributos por fora) × Σ despesas %' : 'X × Σ despesas %', natureza: 'Despesa', origem: 'Informado', fund: [], vig: '—',
      obs: sobreTotal ? 'Incidem sobre o total cobrado do cliente (inclui tributos por fora).' : ''
    });

    return { ano: ano, C: custoRes.liquido, items: items, regime: emp.regime, tau: tau, das: das, k: k, ctx: ctx };
  }

  // ------------------------------------------------------------------ avaliação e solução
  function avaliar(M, X, meta) {
    X = r2(X);
    var linhas = M.items.map(function (it) {
      var base = it.baseA * X + it.baseB;
      var valor = r2(it.a * X + it.b);
      if (valor < 0) valor = 0;
      return Object.assign({}, it, { base: r2(base), valor: valor });
    });
    function tot(tipo) { return r2(sum(linhas.filter(function (l) { return l.tipo === tipo; }), function (l) { return l.valor; })); }
    var dentro = tot('dentro');
    var fora = tot('fora');
    var dv = tot('despesa');
    var irPres = tot('ir');
    var lucroBruto = r2(X - M.C - dentro);
    var margemContrib = r2(lucroBruto - dv);
    var irCs = 0;
    var irDesc = '';
    if (M.regime === 'LP') { irCs = irPres; irDesc = 'IRPJ/CSLL sobre a receita presumida'; }
    else if (M.regime === 'LR') { irCs = r2(Math.max(0, margemContrib) * M.tau); irDesc = 'Alíquota marginal ' + F().pct(M.tau * 100) + ' sobre o resultado da operação'; }
    else { irDesc = 'IRPJ/CSLL incluídos no DAS'; }
    var lucroLiquido = r2(margemContrib - irCs);
    var total = r2(X + fora);
    function p(v) { return X ? v / X * 100 : null; }
    return {
      X: X, total: total, C: M.C, linhas: linhas, ano: M.ano, regime: M.regime,
      tributosDentro: dentro, tributosFora: fora, despesas: dv, irCs: irCs, irDesc: irDesc,
      lucroBruto: lucroBruto, margemContrib: margemContrib, lucroLiquido: lucroLiquido,
      pct: { tributosDentro: p(dentro), despesas: p(dv), lucroBruto: p(lucroBruto), margemContrib: p(margemContrib), lucroLiquido: p(lucroLiquido), irCs: p(irCs), custo: p(M.C) },
      markup: M.C ? X / M.C : null,
      acrescimoCusto: M.C ? (X - M.C) / M.C * 100 : null,
      meta: meta || {}
    };
  }

  function precoPorMargem(M, margemPct, baseMargem) {
    var m = d(margemPct);
    var A = 0, B = 0;
    var compA = [];
    M.items.forEach(function (it) {
      if (it.tipo === 'dentro' || it.tipo === 'despesa') { A += it.a; B += it.b; compA.push({ nome: it.nome, a: it.a }); }
    });
    var mEff = m;
    var irNoDivisor = false;
    if (baseMargem === 'liquida') {
      if (M.regime === 'LP') {
        M.items.forEach(function (it) { if (it.tipo === 'ir') { A += it.a; B += it.b; compA.push({ nome: it.nome, a: it.a }); } });
        irNoDivisor = true;
      } else if (M.regime === 'LR') {
        mEff = m / (1 - M.tau);
      }
    }
    var den = 1 - mEff - A;
    var meta = { modo: 'A', m: m, mEff: mEff, A: A, B: B, den: den, compA: compA, irNoDivisor: irNoDivisor, baseMargem: baseMargem };
    if (!(den > 0.0001)) {
      return { erro: 'Denominador do markup igual ou menor que zero (1 − ' + F().pct(mEff * 100) + ' − ' + F().pct(A * 100) + ' = ' + F().pct(den * 100) + '). A soma de margem, tributos sobre a venda e despesas variáveis atinge ou supera 100% do preço: reduza a margem ou as despesas. Nenhum preço foi calculado.', meta: meta, ano: M.ano };
    }
    var X = (M.C + B) / den;
    var res = avaliar(M, X, meta);
    res.formula = 'X = (C' + (B ? ' + Σb' : '') + ') ÷ (1 − m' + (mEff !== m ? '/(1 − τ)' : '') + ' − Σ tributos e despesas)';
    res.formulaNum = 'X = (' + F().brl(M.C) + (B ? (B > 0 ? ' + ' : ' − ') + F().brl(Math.abs(B)) : '') + ') ÷ (1 − ' + F().num(mEff, 4) + ' − ' + F().num(A, 4) + ') = (' + F().brl(M.C + B) + ') ÷ ' + F().num(den, 6) + ' = ' + F().brl(res.X);
    return res;
  }

  function margemPorPreco(M, X) {
    var res = avaliar(M, X, { modo: 'B' });
    res.formula = 'Margem efetiva = (X − custo − tributos sobre a venda − despesas variáveis) ÷ X';
    res.formulaNum = '(' + F().brl(res.X) + ' − ' + F().brl(res.C) + ' − ' + F().brl(res.tributosDentro) + ' − ' + F().brl(res.despesas) + ') ÷ ' + F().brl(res.X) + ' = ' + F().pct(res.pct.margemContrib);
    return res;
  }

  /**
   * Preço (X) que gera determinado lucro em R$ — "quanto cobrar para lucrar o mesmo".
   * Margem de contribuição: X·(1 − ΣA) − C − ΣB = L  ⇒  X = (C + ΣB + L) ÷ (1 − ΣA).
   * Lucro líquido: Lucro Presumido inclui IRPJ/CSLL presumidos no divisor; Lucro Real usa L ÷ (1 − τ).
   */
  function precoPorLucro(M, lucro, baseMargem) {
    var A = 0, B = 0, compA = [];
    M.items.forEach(function (it) {
      if (it.tipo === 'dentro' || it.tipo === 'despesa') { A += it.a; B += it.b; compA.push({ nome: it.nome, a: it.a }); }
    });
    var alvo = lucro;
    if (baseMargem === 'liquida') {
      if (M.regime === 'LP') M.items.forEach(function (it) { if (it.tipo === 'ir') { A += it.a; B += it.b; compA.push({ nome: it.nome, a: it.a }); } });
      else if (M.regime === 'LR' && lucro > 0) alvo = lucro / (1 - M.tau);
    }
    var den = 1 - A;
    var meta = { modo: 'L', lucro: lucro, alvo: alvo, A: A, B: B, den: den, compA: compA, baseMargem: baseMargem };
    if (!(den > 0.0001)) return { erro: 'Tributos e despesas sobre a venda somam 100% ou mais do preço: não há preço que mantenha o lucro.', meta: meta, ano: M.ano };
    var X = (M.C + B + alvo) / den;
    if (!(X > 0)) return { erro: 'O lucro de referência é negativo e maior que o custo: não há preço positivo que o reproduza.', meta: meta, ano: M.ano };
    var res = avaliar(M, X, meta);
    res.formula = 'X = (custo líquido' + (B ? ' + Σb' : '') + ' + lucro de 2026' + (alvo !== lucro ? ' ÷ (1 − τ)' : '') + ') ÷ (1 − Σ tributos e despesas sobre a venda)';
    res.formulaNum = 'X = (' + F().brl(M.C) + (B ? (B > 0 ? ' + ' : ' − ') + F().brl(Math.abs(B)) : '') + ' + ' + F().brl(alvo) + ') ÷ (1 − ' + F().num(A, 4) + ') = ' + F().brl(M.C + B + alvo) + ' ÷ ' + F().num(den, 6) + ' = ' + F().brl(res.X);
    return res;
  }

  /** Valor da mercadoria (X) que resulta em determinado total cobrado do cliente */
  function precoPorTotal(M, total) {
    var aF = 0, bF = 0;
    M.items.forEach(function (it) { if (it.tipo === 'fora') { aF += it.a; bF += it.b; } });
    return (total - bF) / (1 + aF);
  }

  /**
   * Valor total dos produtos = quantidade × valor unitário (arredondado a 2 casas, como na NF-e).
   * Itens sem o campo valorUnitario (versão anterior) usam o valor total informado.
   */
  function normalizarItem(it) {
    var v = it.valores || {};
    var q = it.produto ? it.produto.quantidade : null;
    var c = Object.assign({}, it);
    // Preço de venda informado por unidade: total = quantidade × preço unitário
    if (it.venda && it.venda.basePreco === 'unitario') {
      var pu = it.venda.precoUnitarioAtual;
      c.venda = Object.assign({}, it.venda, { precoAtual: has(pu) && has(q) ? r2(n(q) * n(pu)) : null });
    }
    if (!('valorUnitario' in v)) return c;
    c.valores = Object.assign({}, v, { produtos: has(v.valorUnitario) && has(q) ? r2(n(q) * n(v.valorUnitario)) : null });
    if (it.premissas && 'valorUnitario2027Manual' in it.premissas) {
      var u27 = it.premissas.valorUnitario2027Manual;
      c.premissas = Object.assign({}, it.premissas, { valorProdutos2027Manual: has(u27) && has(q) ? r2(n(q) * n(u27)) : null });
    }
    c.__unitario = true;
    return c;
  }

  /**
   * Resultado de venda expresso por unidade: valores em R$ ÷ quantidade.
   * O modelo é linear no preço, logo percentuais, markup e denominador não mudam.
   */
  function porUnidade(v, q) {
    if (!v || v.erro || !(q > 0)) return v;
    var k = 1 / q;
    function d(x) { return typeof x === 'number' ? x * k : x; }
    var o = Object.assign({}, v);
    ['X', 'total', 'C', 'tributosDentro', 'tributosFora', 'despesas', 'irCs', 'lucroBruto', 'margemContrib', 'lucroLiquido'].forEach(function (f) { o[f] = d(v[f]); });
    o.linhas = (v.linhas || []).map(function (l) { return Object.assign({}, l, { valor: d(l.valor), base: d(l.base) }); });
    if (v.meta) o.meta = Object.assign({}, v.meta, { B: d(v.meta.B), alvo: d(v.meta.alvo), lucro: d(v.meta.lucro) });
    o.porUnidade = true;
    o.quantidade = q;
    return o;
  }

  /** Custo de aquisição expresso por unidade: valores em R$ ÷ quantidade (alíquotas não mudam) */
  function custoPorUnidade(c, q) {
    if (!c || !(q > 0)) return c;
    var k = 1 / q;
    function d(x) { return typeof x === 'number' ? x * k : x; }
    var o = Object.assign({}, c);
    ['produtos', 'vop', 'freteFora', 'frete', 'seguro', 'despesas', 'desconto', 'ipi', 'icms', 'st', 'antecipado', 'cbs', 'ibs', 'bruto', 'totalCreditos', 'liquido', 'totalNaoRecuperaveis'].forEach(function (f) { o[f] = d(c[f]); });
    // a linha "custo líquido unitário" deixa de fazer sentido: todos os valores já são por unidade
    o.linhas = (c.linhas || []).filter(function (l) { return l.item !== 'Custo líquido unitário'; }).map(function (l) { return Object.assign({}, l, { valor: d(l.valor), base: d(l.base) }); });
    o.naoRecuperaveis = (c.naoRecuperaveis || []).map(function (x) { return Object.assign({}, x, { valor: d(x.valor) }); });
    o.unitario = c.liquido * k;
    o.porUnidade = true;
    o.quantidade = q;
    return o;
  }

  // ------------------------------------------------------------------ cálculo completo
  function calcular(emp, sim, opts) {
    opts = opts || {};
    var pv = RTC.params.valores(opts.parametros);
    if (opts.override) Object.keys(opts.override).forEach(function (k) { pv[k] = opts.override[k]; });
    var ufTab = opts.aliquotasUF || {};
    var out = { erros: [], avisos: [], ok: false, pv: pv };

    if (!emp) { out.erros.push({ campo: 'empresa', msg: 'Selecione ou cadastre a empresa da simulação.' }); return out; }
    if (!sim) { out.erros.push({ campo: 'produto', msg: 'Cadastre um produto na operação.' }); return out; }
    sim = normalizarItem(sim);

    var val = validar(emp, sim, pv, ufTab);
    out.erros = val.erros;
    out.avisos = val.avisos;

    if (emp.regime === 'SN') {
      var snChk = RTC.simples.calcular(emp.simples.anexo, emp.simples.rbt12, 2026);
      if (snChk.erro) out.erros.push({ campo: 'empresa.simples.rbt12', msg: snChk.erro });
    }
    var metaCbs = RTC.params.meta('cbsRef2027', opts.parametros);
    out.statusCbs = metaCbs.status;
    if (out.erros.length) {
      // contexto parcial (alíquotas automáticas) para orientar o preenchimento
      try { out.ctx = contexto(emp, sim, pv, ufTab, []); } catch (e) { out.ctx = null; }
      return out;
    }

    var ctx = contexto(emp, sim, pv, ufTab, out.avisos);
    ctx.statusCbsRotulo = RTC.params.STATUS[metaCbs.status] ? RTC.params.STATUS[metaCbs.status].rotulo.toLowerCase() : metaCbs.status;
    // reconstrói rótulo de origem com o status atual
    if (ctx.a27 && /^Parâmetro/.test(ctx.a27.origem)) ctx.a27.origem = 'Parâmetro — CBS de referência ' + ctx.statusCbsRotulo;
    out.ctx = ctx;
    out.statusCbs = metaCbs.status;

    if (ctx.sn26) ctx.sn26.avisos.forEach(function (a) { out.avisos.push({ msg: 'Simples Nacional: ' + a, campo: 'empresa.simples', nivel: 'info' }); });
    if (ctx.sn27 && emp.regime === 'SN') out.avisos.push({ msg: 'Simples Nacional 2027: partilha do DAS (CBS/IBS) obtida de fonte secundária — conferir no texto oficial.', campo: 'empresa.simples', nivel: 'alerta' });

    out.custo26 = custo(2026, ctx);
    out.custo27 = custo(2027, ctx);
    out.custo26.avisos.concat(out.custo27.avisos).forEach(function (a) { out.avisos.push(a); });

    out.modelo26 = modeloVenda(2026, ctx, out.custo26);
    out.modelo27 = modeloVenda(2027, ctx, out.custo27);

    var pr = sim.premissas;
    var vd = sim.venda;
    var margem = n(vd.margem);
    var baseMargem = pr.baseMargem || 'operacional';

    // ----- Análise 1: mesma margem
    var a1 = { tipo: 'mesma_margem', margem: margem };
    if (has(vd.margem)) {
      a1.v26 = precoPorMargem(out.modelo26, margem, baseMargem);
      a1.v27 = precoPorMargem(out.modelo27, margem, baseMargem);
      [a1.v26, a1.v27].forEach(function (r) { if (r.erro) out.erros.push({ campo: 'venda.margem', msg: r.ano + ': ' + r.erro }); });
    }
    out.a1 = a1;

    // ----- Análise 2: mesmo preço
    var a2 = { tipo: 'mesmo_preco' };
    var p0 = has(vd.precoAtual) && n(vd.precoAtual) > 0 ? n(vd.precoAtual) : (a1.v26 && !a1.v26.erro ? a1.v26.X : null);
    a2.origemPreco = has(vd.precoAtual) && n(vd.precoAtual) > 0 ? 'Preço de venda atual informado' : 'Preço sugerido em 2026 (análise 1)';
    if (p0) {
      a2.v26 = margemPorPreco(out.modelo26, p0);
      var x27 = pr.manterPreco === 'mercadoria' ? p0 : precoPorTotal(out.modelo27, a2.v26.total);
      a2.v27 = margemPorPreco(out.modelo27, x27);
      a2.criterio = pr.manterPreco === 'mercadoria' ? 'Mantido o valor da mercadoria (IBS/CBS acrescidos por fora em 2027)' : 'Mantido o valor total cobrado do cliente (em 2027, IBS/CBS ficam contidos no mesmo total)';
    }
    out.a2 = a2;

    // ----- Resultado principal conforme modo
    out.modo = vd.modo === 'B' ? 'B' : 'A';
    out.principal = out.modo === 'A' ? a1 : a2;

    // ----- Análise 3: quanto cobrar em 2027 para lucrar, em R$, o mesmo que em 2026
    // referência de 2026: o preço atual informado; sem ele, o preço sugerido pela margem desejada
    var a3 = { tipo: 'mesmo_lucro', baseMargem: baseMargem };
    var precoAtualInf = has(vd.precoAtual) && n(vd.precoAtual) > 0;
    var ref26 = precoAtualInf ? a2.v26 : (a1.v26 && !a1.v26.erro ? a1.v26 : null);
    if (ref26 && !ref26.erro) {
      a3.v26 = ref26;
      a3.lucro26 = baseMargem === 'liquida' ? ref26.lucroLiquido : ref26.margemContrib;
      a3.medida = baseMargem === 'liquida' ? 'lucro líquido (após IRPJ/CSLL)' : 'margem de contribuição (antes de IRPJ/CSLL)';
      a3.origemPreco = precoAtualInf ? 'Preço de venda atual informado' : 'Preço sugerido em 2026 pela margem desejada';
      a3.v27 = precoPorLucro(out.modelo27, a3.lucro26, baseMargem);
      if (a3.v27.erro) out.avisos.push({ campo: 'venda.margem', msg: 'Quanto cobrar em 2027: ' + a3.v27.erro, nivel: 'alerta' });
    }
    out.a3 = a3;

    // ----- Comparativo
    out.comparativo = comparar(out);

    // ----- Sensibilidade à CBS de referência
    if (!opts.semSensibilidade) out.sensibilidade = sensibilidade(emp, sim, opts, pv);

    // ----- Fundamentos utilizados
    var ids = [];
    [out.custo26, out.custo27].forEach(function (c) { c.linhas.forEach(function (l) { ids.push(l.fund); }); });
    [a1.v26, a1.v27, a2.v26, a2.v27].forEach(function (r) { if (r && r.linhas) r.linhas.forEach(function (l) { ids.push(l.fund); }); });
    if (emp.regime === 'SN') ids.push(['lc123_a18_p1a', 'lc123_anexos']);
    ids.push(['adct_126', 'lc214_a349']);
    out.fundamentos = RTC.legal.unicos(ids);

    out.premissas = premissas(emp, sim, ctx, pv, metaCbs);
    out.ok = !out.erros.length;
    return out;
  }

  function delta(a, b) {
    if (a == null || b == null) return { abs: null, pct: null };
    return { abs: r2(b - a), pct: a ? (b - a) / Math.abs(a) * 100 : null };
  }

  function comparar(out) {
    var c26 = out.custo26, c27 = out.custo27;
    var a1 = out.a1, a2 = out.a2;
    var ok1 = a1.v26 && !a1.v26.erro && a1.v27 && !a1.v27.erro;
    var ok2 = a2.v26 && a2.v27;
    var cmp = {
      custoBruto: { v26: c26.bruto, v27: c27.bruto, d: delta(c26.bruto, c27.bruto) },
      creditos: { v26: c26.totalCreditos, v27: c27.totalCreditos, d: delta(c26.totalCreditos, c27.totalCreditos) },
      custoLiquido: { v26: c26.liquido, v27: c27.liquido, d: delta(c26.liquido, c27.liquido) },
      naoRecuperaveis: { v26: c26.totalNaoRecuperaveis, v27: c27.totalNaoRecuperaveis, d: delta(c26.totalNaoRecuperaveis, c27.totalNaoRecuperaveis) }
    };
    if (ok1) {
      cmp.a1 = {
        preco: { v26: a1.v26.X, v27: a1.v27.X, d: delta(a1.v26.X, a1.v27.X) },
        total: { v26: a1.v26.total, v27: a1.v27.total, d: delta(a1.v26.total, a1.v27.total) },
        tributosDentro: { v26: a1.v26.tributosDentro, v27: a1.v27.tributosDentro, d: delta(a1.v26.tributosDentro, a1.v27.tributosDentro) },
        tributosFora: { v26: a1.v26.tributosFora, v27: a1.v27.tributosFora, d: delta(a1.v26.tributosFora, a1.v27.tributosFora) },
        lucroBruto: { v26: a1.v26.lucroBruto, v27: a1.v27.lucroBruto, d: delta(a1.v26.lucroBruto, a1.v27.lucroBruto) },
        margemContrib: { v26: a1.v26.margemContrib, v27: a1.v27.margemContrib, d: delta(a1.v26.margemContrib, a1.v27.margemContrib) },
        lucroLiquido: { v26: a1.v26.lucroLiquido, v27: a1.v27.lucroLiquido, d: delta(a1.v26.lucroLiquido, a1.v27.lucroLiquido) }
      };
      cmp.impactoPreco = cmp.a1.total.d;
    }
    if (ok2) {
      cmp.a2 = {
        preco: { v26: a2.v26.X, v27: a2.v27.X, d: delta(a2.v26.X, a2.v27.X) },
        total: { v26: a2.v26.total, v27: a2.v27.total, d: delta(a2.v26.total, a2.v27.total) },
        tributosDentro: { v26: a2.v26.tributosDentro, v27: a2.v27.tributosDentro, d: delta(a2.v26.tributosDentro, a2.v27.tributosDentro) },
        tributosFora: { v26: a2.v26.tributosFora, v27: a2.v27.tributosFora, d: delta(a2.v26.tributosFora, a2.v27.tributosFora) },
        lucroBruto: { v26: a2.v26.lucroBruto, v27: a2.v27.lucroBruto, d: delta(a2.v26.lucroBruto, a2.v27.lucroBruto) },
        margemContrib: { v26: a2.v26.margemContrib, v27: a2.v27.margemContrib, d: delta(a2.v26.margemContrib, a2.v27.margemContrib) },
        margemPct: { v26: a2.v26.pct.margemContrib, v27: a2.v27.pct.margemContrib, dpp: a2.v27.pct.margemContrib - a2.v26.pct.margemContrib },
        lucroLiquido: { v26: a2.v26.lucroLiquido, v27: a2.v27.lucroLiquido, d: delta(a2.v26.lucroLiquido, a2.v27.lucroLiquido) }
      };
      cmp.impactoResultado = cmp.a2.lucroLiquido.d;
    }
    return cmp;
  }

  function sensibilidade(emp, sim, opts, pv) {
    var ref = pv.cbsRef2027;
    var passos = [-1, -0.5, 0, 0.5, 1];
    return passos.map(function (dlt) {
      var alt = Math.max(0, Math.round((ref + dlt) * 100) / 100);
      var o = Object.assign({}, opts, { semSensibilidade: true, override: Object.assign({}, opts.override || {}, { cbsRef2027: alt }) });
      var r = calcular(emp, sim, o);
      var linha = { cbsRef: alt, atual: dlt === 0 };
      if (r.a1 && r.a1.v27 && !r.a1.v27.erro && r.a1.v26 && !r.a1.v26.erro) {
        linha.preco27 = r.a1.v27.X;
        linha.total27 = r.a1.v27.total;
        linha.varTotal = (r.a1.v27.total - r.a1.v26.total) / r.a1.v26.total * 100;
        linha.total26 = r.a1.v26.total;
      }
      if (r.a2 && r.a2.v27) {
        linha.margem27 = r.a2.v27.pct.margemContrib;
        linha.lucro27 = r.a2.v27.lucroLiquido;
        linha.x27b = r.a2.v27.X;
        linha.mc27 = r.a2.v27.margemContrib;
      }
      return linha;
    });
  }

  function premissas(emp, sim, ctx, pv, metaCbs) {
    var pr = sim.premissas;
    var fm = F();
    var L = [];
    L.push('Alíquota de referência da CBS 2027: ' + fm.pct(pv.cbsRef2027) + ' — status ' + RTC.params.STATUS[metaCbs.status].rotulo.toUpperCase() + '; aplicada com redução de ' + fm.num(pv.cbsReducao2027) + ' p.p. (LC 214, art. 347).');
    L.push('IBS 2027: ' + fm.pct(pv.ibsUf2027) + ' estadual + ' + fm.pct(pv.ibsMun2027) + ' municipal (LC 214, art. 344).');
    L.push('Alíquotas-teste de 2026 (CBS 0,9% e IBS 0,1%) tratadas como informativas, sem ônus (LC 214, art. 348).');
    L.push('Valor dos produtos em 2027: ' + ({ mesmo: 'mesmo valor de 2026, com CBS/IBS acrescidos por fora pelo fornecedor', sem_pis_cofins: 'valor de 2026 sem os PIS/Cofins embutidos do fornecedor (' + fm.pct(n(sim.fornecedor.pisCofinsEmbutidoPct)) + ')', manual: 'informado manualmente (' + fm.brl(n(pr.valorProdutos2027Manual)) + ')' }[pr.valorProdutos2027] || '—') + '.');
    if (ctx.icmsRegular) L.push('IBS/CBS ' + (pr.ibsCbsNaBaseIcms2027 ? 'INTEGRAM' : 'NÃO integram') + ' a base do ICMS em 2027 (tema controvertido — entendimento das SEFAZ vs. decisões judiciais)' + (pr.ibsCbsNaBaseIcms2027 ? ', na venda e no ICMS da NF de compra' + (pr.liminarCbsForaBaseIcms2027 ? '; por LIMINAR judicial da empresa, a CBS fica fora da base do ICMS da venda' : '') : '') + '.');
    L.push('IBS/CBS 2027 sem o ICMS e o ISS na base (LC 214, art. 12, § 2º, V, de 2026 a 2032).');
    if (emp.regime !== 'SN') L.push('PIS/Cofins 2026 sem o ICMS na base: na venda (STF, Tema 69)' + (emp.regime === 'LR' ? '; crédito da compra sobre produtos − descontos − ICMS destacado na NF (Lei 14.592/2023), sem frete, seguro, despesas e IPI' : '') + (pr.excluirStBasePisCofins ? '; na venda, também sem o ICMS-ST (STJ, Tema 1125)' : '') + '.');
    L.push('Margem desejada medida ' + (pr.baseMargem === 'liquida' ? 'APÓS IRPJ/CSLL (lucro líquido)' : 'ANTES de IRPJ/CSLL (margem de contribuição)') + ', sobre o valor da mercadoria (sem tributos por fora).');
    L.push('Despesas variáveis incidentes sobre ' + (pr.baseDespesas === 'mercadoria' ? 'o valor da mercadoria' : 'o total cobrado do cliente (com tributos por fora)') + '.');
    L.push('Análise de preço mantido: ' + (pr.manterPreco === 'mercadoria' ? 'mantém o valor da mercadoria' : 'mantém o valor total cobrado do cliente') + '.');
    if (emp.regime === 'LR') L.push('IRPJ/CSLL do Lucro Real estimados pela alíquota marginal de ' + fm.pct(ctx.lr.tau * 100) + ' sobre o resultado da operação.');
    if (emp.regime === 'LP') L.push('IRPJ/CSLL do Lucro Presumido: presunção ' + fm.pct(ctx.lp.presI) + ' / ' + fm.pct(ctx.lp.presC) + (ctx.lp.adicional ? ', com adicional de IRPJ' : '') + (ctx.lp.lc224 ? ', com acréscimo da LC 224/2025' : '') + '.');
    if (emp.regime === 'SN') L.push('Simples Nacional: ' + RTC.simples.ANEXOS[emp.simples.anexo] + ', RBT12 ' + fm.brl(n(emp.simples.rbt12)) + '; IBS/CBS em 2027 ' + (emp.simples.ibsCbsForaDas2027 ? 'FORA do DAS (regime regular)' : 'no DAS') + '.');
    L.push('Resultados dependem dos dados e parâmetros informados; não há integração com base fiscal oficial.');
    return L;
  }

  RTC.engine = {
    calcular: calcular,
    custo: custo,
    modeloVenda: modeloVenda,
    precoPorMargem: precoPorMargem,
    margemPorPreco: margemPorPreco,
    precoPorTotal: precoPorTotal,
    precoPorLucro: precoPorLucro,
    aliqInterestadual: aliqInterestadual,
    validar: validar,
    comparar: comparar,
    normalizarItem: normalizarItem,
    porUnidade: porUnidade,
    custoPorUnidade: custoPorUnidade,
    r2: r2
  };
})(typeof window !== 'undefined' ? window : globalThis);

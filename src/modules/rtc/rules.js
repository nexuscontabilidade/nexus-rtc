/*
 * RTC Comparativo — regras cadastradas (perfis tributários de produto).
 * Uma regra define TRATAMENTOS — nunca alíquotas estaduais presumidas.
 * Ao aplicar, os campos recebem a origem "Regra cadastrada" na memória de cálculo.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};

  var BASE = {
    'perfil.icms.tratamento': 'tributado',
    'perfil.pisCofins.tratamento': 'normal',
    'perfil.cbsIbs.tratamento': 'padrao',
    'perfil.cbsIbs.reducaoPct': null,
    'perfil.antecipado.tipo': 'nenhum'
  };
  function com(extra) {
    var o = {};
    Object.keys(BASE).forEach(function (k) { o[k] = BASE[k]; });
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }

  var EMBUTIDAS = [
    {
      id: 'r_normal', resumo: 'normal', nome: 'Tributação normal',
      desc: 'ICMS tributado, PIS/Cofins pela regra do regime e IBS/CBS pela alíquota de referência.',
      fund: ['lc87_a19_20', 'pc_creditos', 'lc214_a347'], campos: com({})
    },
    {
      id: 'r_reducao_base', resumo: 'reducao_base', nome: 'Redução de base do ICMS',
      desc: 'ICMS com base reduzida. Informe o percentual e o dispositivo do RICMS. Estorno proporcional do crédito, salvo previsão estadual de manutenção.',
      fund: ['icms_uf', 'stf_tema299'], campos: com({ 'perfil.icms.tratamento': 'reducao_base' })
    },
    {
      id: 'r_aliquota_zero', resumo: 'aliquota_zero', nome: 'Alíquota zero (PIS/Cofins e IBS/CBS)',
      desc: 'PIS/Cofins com alíquota zero em 2026 e IBS/CBS com alíquota zero em 2027 (ex.: itens da Cesta Básica Nacional). Confirme o enquadramento do NCM.',
      fund: ['pc_creditos', 'lc214_reducoes'], campos: com({ 'perfil.pisCofins.tratamento': 'aliquota_zero', 'perfil.cbsIbs.tratamento': 'aliquota_zero' })
    },
    {
      id: 'r_isencao', resumo: 'isencao', nome: 'Isenção do ICMS na saída',
      desc: 'Saída isenta de ICMS, com estorno do crédito da entrada (LC 87, art. 21). PIS/Cofins e IBS/CBS pela regra geral — ajuste se também forem isentos.',
      fund: ['lc87_a21', 'icms_uf'], campos: com({ 'perfil.icms.tratamento': 'isento' })
    },
    {
      id: 'r_monofasico', resumo: 'monofasico', nome: 'PIS/Cofins monofásico (revenda)',
      desc: 'Revenda com alíquota zero de PIS/Cofins e sem crédito em 2026. Em 2027 a monofasia de PIS/Cofins deixa de existir: IBS/CBS pela regra geral (o regime específico de IBS/CBS alcança combustíveis).',
      fund: ['pc_monofasico', 'lc123_a18_p4a', 'lc214_a172'], campos: com({ 'perfil.pisCofins.tratamento': 'monofasico' })
    },
    {
      id: 'r_st', resumo: 'st', nome: 'Substituição tributária — revenda (substituído)',
      desc: 'ICMS-ST retido pelo fornecedor na NF: ICMS próprio e ICMS-ST compõem o custo, sem crédito, e a saída não gera débito. Informe a MVA e a alíquota interna, ou o valor do ICMS-ST da NF. (ICMS-ST recolhido pelo destinatário na entrada: use “Antecipação do ICMS”.)',
      fund: ['lc87_st', 'conv142', 'lc123_a18_p4a'], campos: com({ 'perfil.icms.tratamento': 'st', 'perfil.st.papel': 'substituido' })
    },
    {
      id: 'r_regime_especial', resumo: 'regime_especial', nome: 'Regime especial / tratamento diferenciado de IBS/CBS',
      desc: 'Informe o percentual de redução das alíquotas de IBS/CBS e o fundamento legal específico (dispositivo e anexo da LC 214/2025).',
      fund: ['lc214_reducoes'], campos: com({ 'perfil.cbsIbs.tratamento': 'reducao', 'perfil.cbsIbs.reducaoPct': null })
    },
    {
      id: 'r_reducao60', resumo: 'regime_especial', nome: 'IBS/CBS com redução de 60%',
      desc: 'Tratamento diferenciado de IBS/CBS com redução de 60% das alíquotas (conforme anexo e NCM). Em 2027, a redução de 0,1 p.p. da CBS é proporcional (art. 347, § 1º).',
      fund: ['lc214_reducoes', 'lc214_a347'], campos: com({ 'perfil.cbsIbs.tratamento': 'reducao', 'perfil.cbsIbs.reducaoPct': 60 })
    },
    {
      id: 'r_reducao30', resumo: 'regime_especial', nome: 'IBS/CBS com redução de 30%',
      desc: 'Tratamento diferenciado de IBS/CBS com redução de 30% das alíquotas.',
      fund: ['lc214_reducoes', 'lc214_a347'], campos: com({ 'perfil.cbsIbs.tratamento': 'reducao', 'perfil.cbsIbs.reducaoPct': 30 })
    },
    {
      id: 'r_outro', resumo: 'outro', nome: 'Outro tratamento (parametrização manual)',
      desc: 'Informe manualmente as alíquotas de PIS/Cofins (2026) e de CBS/IBS (2027) e o fundamento legal específico.',
      fund: [], campos: com({ 'perfil.pisCofins.tratamento': 'outro', 'perfil.cbsIbs.tratamento': 'outro' })
    }
  ];

  var RESUMOS = [
    ['normal', 'Tributação normal'],
    ['reducao_base', 'Redução de base'],
    ['aliquota_zero', 'Alíquota zero'],
    ['isencao', 'Isenção'],
    ['monofasico', 'Monofásico'],
    ['st', 'Substituição tributária'],
    ['regime_especial', 'Regime especial / redução IBS-CBS'],
    ['outro', 'Outro tratamento']
  ];

  var REGRA_DO_RESUMO = {
    normal: 'r_normal', reducao_base: 'r_reducao_base', aliquota_zero: 'r_aliquota_zero', isencao: 'r_isencao',
    monofasico: 'r_monofasico', st: 'r_st', regime_especial: 'r_regime_especial', outro: 'r_outro'
  };

  function todas(doUsuario) { return EMBUTIDAS.concat(doUsuario || []); }

  function porId(id, doUsuario) {
    var lista = todas(doUsuario);
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  /** Aplica a regra à simulação, registrando a origem de cada campo */
  function aplicar(sim, regra) {
    sim.origens = sim.origens || {};
    Object.keys(regra.campos).forEach(function (path) {
      N.store.setPath(sim, path, N.store.clone(regra.campos[path]));
      sim.origens[path] = 'regra:' + regra.id;
    });
    sim.perfil.regraId = regra.id;
    if (regra.resumo) sim.perfil.resumo = regra.resumo;
  }

  /** Campos do perfil que podem ser salvos como regra do usuário */
  var CAMPOS_SALVAVEIS = [
    'perfil.icms.tratamento', 'perfil.icms.reducaoEntrada', 'perfil.icms.reducaoSaida', 'perfil.icms.estornoProporcional', 'perfil.icms.fundamento',
    'perfil.icms.aliqSaidaAuto', 'perfil.icms.aliqSaida', 'perfil.icms.aliqEntradaAuto', 'perfil.icms.aliqEntrada',
    'perfil.st.papel', 'perfil.st.modo', 'perfil.st.mva', 'perfil.st.ajustarMva', 'perfil.st.aliqInternaAuto', 'perfil.st.aliqInterna',
    'perfil.antecipado.tipo', 'perfil.antecipado.modo', 'perfil.antecipado.mva', 'perfil.antecipado.ajustarMva',
    'perfil.ipi.aliqEntrada', 'perfil.ipi.aliqSaida', 'perfil.ipi.mantido2027',
    'perfil.pisCofins.tratamento', 'perfil.pisCofins.pisManual', 'perfil.pisCofins.cofinsManual', 'perfil.pisCofins.creditoManual', 'perfil.pisCofins.fundamento',
    'perfil.cbsIbs.tratamento', 'perfil.cbsIbs.reducaoPct', 'perfil.cbsIbs.aliqCbsManual', 'perfil.cbsIbs.aliqIbsManual', 'perfil.cbsIbs.fundamento'
  ];

  function criarDoPerfil(sim, nome, desc) {
    var campos = {};
    CAMPOS_SALVAVEIS.forEach(function (p) { campos[p] = N.store.clone(N.store.getPath(sim, p)); });
    return {
      id: N.store.uid('regra'), nome: nome, desc: desc || '', resumo: sim.perfil.resumo,
      fund: [], campos: campos, usuario: true, ncm: sim.produto.ncm || '', criadoEm: new Date().toISOString()
    };
  }

  RTC.rules = { EMBUTIDAS: EMBUTIDAS, RESUMOS: RESUMOS, REGRA_DO_RESUMO: REGRA_DO_RESUMO, todas: todas, porId: porId, aplicar: aplicar, criarDoPerfil: criarDoPerfil };
})(typeof window !== 'undefined' ? window : globalThis);

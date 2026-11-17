/*
 * RTC Comparativo — parâmetros tributários editáveis.
 * status: 'oficial' (texto legal vigente) | 'estimado' (projeção de fonte identificada) | 'ilustrativo' |
 *         'a_confirmar' (fonte secundária) | 'informado' (definido pelo usuário)
 * Percentuais em pontos percentuais (1,65 = 1,65%).
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};

  var VERSAO_BASE = '2026.10';
  var DATA_BASE = '2026-10-10';

  var DEF = [
    // ---------- PIS/Cofins (vigentes até 31/12/2026) ----------
    { id: 'pisLR', grupo: 'PIS/Cofins — 2026', nome: 'PIS/Pasep não cumulativo (Lucro Real)', valor: 1.65, un: '%', status: 'oficial', fund: ['l10637_a2'], vig: 'até 31/12/2026' },
    { id: 'cofinsLR', grupo: 'PIS/Cofins — 2026', nome: 'Cofins não cumulativa (Lucro Real)', valor: 7.6, un: '%', status: 'oficial', fund: ['l10833_a2'], vig: 'até 31/12/2026' },
    { id: 'pisLP', grupo: 'PIS/Cofins — 2026', nome: 'PIS/Pasep cumulativo (Lucro Presumido)', valor: 0.65, un: '%', status: 'oficial', fund: ['pc_cumulativo'], vig: 'até 31/12/2026' },
    { id: 'cofinsLP', grupo: 'PIS/Cofins — 2026', nome: 'Cofins cumulativa (Lucro Presumido)', valor: 3, un: '%', status: 'oficial', fund: ['pc_cumulativo'], vig: 'até 31/12/2026' },

    // ---------- Teste 2026 ----------
    { id: 'cbsTeste2026', grupo: 'IBS/CBS — teste 2026', nome: 'CBS — alíquota-teste 2026', valor: 0.9, un: '%', status: 'oficial', fund: ['lc214_a346', 'lc214_a348'], vig: '01/01/2026 a 31/12/2026', nota: 'Compensável com PIS/Cofins; recolhimento dispensado a quem cumpre as obrigações acessórias. Sem impacto no custo ou no preço.' },
    { id: 'ibsTeste2026', grupo: 'IBS/CBS — teste 2026', nome: 'IBS — alíquota-teste 2026 (estadual)', valor: 0.1, un: '%', status: 'oficial', fund: ['lc214_a343', 'lc214_a348'], vig: '01/01/2026 a 31/12/2026', nota: 'Idem: informativo.' },

    // ---------- Transição 2027 ----------
    { id: 'cbsRef2027', grupo: 'IBS/CBS — 2027', nome: 'CBS — alíquota de referência 2027', valor: 8.8, un: '%', status: 'estimado', fund: ['lc214_a349', 'mf_2024'], vig: 'a partir de 01/01/2027', nota: 'NÃO OFICIAL. Estimativa do Ministério da Fazenda (abr/2024). A alíquota oficial será fixada por Resolução do Senado (LC 214, art. 349) a partir do cálculo validado pelo TCU — previsão: até dez/2026. Atualize este parâmetro e altere o status quando publicada.' },
    { id: 'cbsReducao2027', grupo: 'IBS/CBS — 2027', nome: 'Redução da CBS em 2027–2028', valor: 0.1, un: 'p.p.', status: 'oficial', fund: ['lc214_a347'], vig: '01/01/2027 a 31/12/2028', nota: 'Redução proporcional nas operações com alíquota reduzida (art. 347, § 1º).' },
    { id: 'ibsUf2027', grupo: 'IBS/CBS — 2027', nome: 'IBS estadual 2027–2028', valor: 0.05, un: '%', status: 'oficial', fund: ['lc214_a344'], vig: '01/01/2027 a 31/12/2028' },
    { id: 'ibsMun2027', grupo: 'IBS/CBS — 2027', nome: 'IBS municipal 2027–2028', valor: 0.05, un: '%', status: 'oficial', fund: ['lc214_a344'], vig: '01/01/2027 a 31/12/2028' },

    // ---------- IRPJ/CSLL ----------
    { id: 'irpj', grupo: 'IRPJ/CSLL', nome: 'IRPJ — alíquota', valor: 15, un: '%', status: 'oficial', fund: ['l9249_a3'], vig: 'vigente' },
    { id: 'irpjAdicional', grupo: 'IRPJ/CSLL', nome: 'IRPJ — adicional', valor: 10, un: '%', status: 'oficial', fund: ['l9249_a3'], vig: 'vigente', nota: 'Sobre o lucro que exceder R$ 20.000,00/mês (R$ 240.000,00/ano).' },
    { id: 'irpjLimiteAnual', grupo: 'IRPJ/CSLL', nome: 'Limite anual sem adicional do IRPJ', valor: 240000, un: 'R$', status: 'oficial', fund: ['l9249_a3'], vig: 'vigente' },
    { id: 'csll', grupo: 'IRPJ/CSLL', nome: 'CSLL — alíquota', valor: 9, un: '%', status: 'oficial', fund: ['l7689_a3'], vig: 'vigente' },
    { id: 'presIrpj', grupo: 'IRPJ/CSLL', nome: 'Presunção IRPJ — venda de mercadorias', valor: 8, un: '%', status: 'oficial', fund: ['l9249_a15_20'], vig: 'vigente' },
    { id: 'presCsll', grupo: 'IRPJ/CSLL', nome: 'Presunção CSLL — venda de mercadorias', valor: 12, un: '%', status: 'oficial', fund: ['l9249_a15_20'], vig: 'vigente' },
    { id: 'lc224Acrescimo', grupo: 'IRPJ/CSLL', nome: 'LC 224/2025 — acréscimo nos percentuais de presunção', valor: 10, un: '%', status: 'oficial', fund: ['lc224_a4'], vig: 'a partir do ano-calendário 2026', nota: 'Aplica-se à parcela da receita anual acima do limite abaixo. Constitucionalidade questionada (ADI 7936) — verifique se a empresa tem decisão judicial.' },
    { id: 'lc224Limite', grupo: 'IRPJ/CSLL', nome: 'LC 224/2025 — limite de receita anual', valor: 5000000, un: 'R$', status: 'oficial', fund: ['lc224_a4'], vig: 'a partir do ano-calendário 2026' },

    // ---------- ICMS ----------
    { id: 'icmsInter12', grupo: 'ICMS interestadual', nome: 'Alíquota interestadual geral', valor: 12, un: '%', status: 'oficial', fund: ['rsf22'], vig: 'vigente' },
    { id: 'icmsInter7', grupo: 'ICMS interestadual', nome: 'Alíquota interestadual S/SE (exceto ES) → N/NE/CO/ES', valor: 7, un: '%', status: 'oficial', fund: ['rsf22'], vig: 'vigente' },
    { id: 'icmsInter4', grupo: 'ICMS interestadual', nome: 'Alíquota interestadual de importados', valor: 4, un: '%', status: 'oficial', fund: ['rsf13'], vig: 'vigente' },

    // ---------- Simples Nacional ----------
    { id: 'snSublimite', grupo: 'Simples Nacional', nome: 'Sublimite estadual (ICMS fora do DAS)', valor: 3600000, un: 'R$', status: 'oficial', fund: ['lc123_a13a'], vig: 'vigente' },
    { id: 'snLimite', grupo: 'Simples Nacional', nome: 'Limite de receita bruta anual (EPP)', valor: 4800000, un: 'R$', status: 'oficial', fund: ['lc123_a3'], vig: 'vigente' }
  ];

  var POR_ID = {};
  DEF.forEach(function (p) { POR_ID[p.id] = p; });

  var UFS = [
    ['AC', 'Acre', 'N'], ['AL', 'Alagoas', 'NE'], ['AP', 'Amapá', 'N'], ['AM', 'Amazonas', 'N'], ['BA', 'Bahia', 'NE'],
    ['CE', 'Ceará', 'NE'], ['DF', 'Distrito Federal', 'CO'], ['ES', 'Espírito Santo', 'SE'], ['GO', 'Goiás', 'CO'],
    ['MA', 'Maranhão', 'NE'], ['MT', 'Mato Grosso', 'CO'], ['MS', 'Mato Grosso do Sul', 'CO'], ['MG', 'Minas Gerais', 'SE'],
    ['PA', 'Pará', 'N'], ['PB', 'Paraíba', 'NE'], ['PR', 'Paraná', 'S'], ['PE', 'Pernambuco', 'NE'], ['PI', 'Piauí', 'NE'],
    ['RJ', 'Rio de Janeiro', 'SE'], ['RN', 'Rio Grande do Norte', 'NE'], ['RS', 'Rio Grande do Sul', 'S'], ['RO', 'Rondônia', 'N'],
    ['RR', 'Roraima', 'N'], ['SC', 'Santa Catarina', 'S'], ['SP', 'São Paulo', 'SE'], ['SE', 'Sergipe', 'NE'], ['TO', 'Tocantins', 'N']
  ];

  var STATUS = {
    oficial: { rotulo: 'Oficial', desc: 'Previsto em texto legal vigente' },
    estimado: { rotulo: 'Estimado', desc: 'Projeção de fonte identificada — não oficial' },
    ilustrativo: { rotulo: 'Ilustrativo', desc: 'Valor apenas para demonstração' },
    a_confirmar: { rotulo: 'A confirmar', desc: 'Obtido de fonte secundária — conferir o texto oficial' },
    informado: { rotulo: 'Informado', desc: 'Definido pelo usuário' }
  };

  /** Valores efetivos: padrão + sobrescritas do usuário */
  function valores(overrides) {
    var out = {};
    DEF.forEach(function (p) {
      var o = overrides && overrides[p.id];
      out[p.id] = (o && typeof o.valor === 'number' && isFinite(o.valor)) ? o.valor : p.valor;
    });
    return out;
  }

  /** Metadados efetivos de um parâmetro (status pode ser alterado pelo usuário) */
  function meta(id, overrides) {
    var p = POR_ID[id];
    if (!p) return null;
    var o = (overrides && overrides[id]) || {};
    return {
      id: id, grupo: p.grupo, nome: p.nome, un: p.un, fund: p.fund, vig: o.vig || p.vig,
      valor: (typeof o.valor === 'number' && isFinite(o.valor)) ? o.valor : p.valor,
      valorPadrao: p.valor,
      status: o.status || p.status,
      statusPadrao: p.status,
      nota: o.nota != null ? o.nota : (p.nota || ''),
      alterado: typeof o.valor === 'number' && o.valor !== p.valor,
      atualizadoEm: o.atualizadoEm || DATA_BASE
    };
  }

  RTC.params = {
    VERSAO_BASE: VERSAO_BASE,
    DATA_BASE: DATA_BASE,
    lista: DEF,
    porId: POR_ID,
    valores: valores,
    meta: meta,
    UFS: UFS,
    UF_REGIAO: UFS.reduce(function (m, u) { m[u[0]] = u[2]; return m; }, {}),
    UF_NOME: UFS.reduce(function (m, u) { m[u[0]] = u[1]; return m; }, {}),
    STATUS: STATUS
  };
})(typeof window !== 'undefined' ? window : globalThis);

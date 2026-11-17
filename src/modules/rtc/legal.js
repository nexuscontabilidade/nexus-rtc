/*
 * RTC Comparativo — catálogo de fundamentos legais.
 * Cada cálculo da memória referencia estes IDs. Os textos são resumos — consulte sempre a redação oficial vigente.
 * Natureza: 'norma' (texto legal), 'jurisprudencia', 'administrativo' (entendimento de fisco), 'estimativa' (fonte não normativa).
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};

  var PL = 'https://www.planalto.gov.br/ccivil_03/';
  var U = {
    lc214: PL + 'leis/lcp/lcp214.htm',
    lc123: PL + 'leis/lcp/lcp123.htm',
    lc87: PL + 'leis/lcp/lcp87.htm',
    lc224: PL + 'leis/lcp/lcp224.htm',
    ec132: PL + 'constituicao/emendas/emc/emc132.htm',
    cf: PL + 'constituicao/constituicao.htm',
    l10637: PL + 'leis/2002/l10637.htm',
    l10833: PL + 'leis/2003/l10.833.htm',
    l9715: PL + 'leis/l9715.htm',
    l9718: PL + 'leis/l9718.htm',
    l9249: PL + 'leis/l9249.htm',
    l7689: PL + 'leis/l7689.htm',
    dl1598: PL + 'decreto-lei/del1598.htm',
    ripi: PL + '_ato2007-2010/2010/decreto/d7212.htm'
  };

  var L = {
    /* ===================== Reforma Tributária — EC 132/2023 e LC 214/2025 ===================== */
    adct_125: { norma: 'EC 132/2023 — ADCT, art. 125', resumo: 'Em 2026, cobrança-teste do IBS (0,1%) e da CBS (0,9%), com compensação dos valores recolhidos.', url: U.ec132, natureza: 'norma' },
    adct_126: { norma: 'EC 132/2023 — ADCT, art. 126', resumo: 'A partir de 2027: cobrança da CBS; extinção do PIS/Pasep e da Cofins (inciso II); IPI com alíquotas reduzidas a zero, exceto produtos com industrialização incentivada na ZFM (inciso III).', url: U.ec132, natureza: 'norma' },
    cf_156a: { norma: 'CF, art. 156-A, § 1º, IX, e art. 195, § 17', resumo: 'IBS e CBS não integram sua própria base de cálculo nem a do IS, do PIS e da Cofins (tributos “por fora”).', url: U.cf, natureza: 'norma' },
    lc214_a12: { norma: 'LC 214/2025, art. 12', resumo: 'A base de cálculo do IBS e da CBS é o valor da operação (inclui acréscimos cobrados do adquirente; excluídos descontos incondicionais).', url: U.lc214, natureza: 'norma' },
    lc214_a12_p2_v: { norma: 'LC 214/2025, art. 12, § 2º, V', resumo: 'De 01/01/2026 a 31/12/2032 não integram a base do IBS/CBS os montantes de ICMS, ISS, PIS/Pasep e Cofins incidentes sobre a operação.', url: U.lc214, natureza: 'norma' },
    lc214_a41_p3: { norma: 'LC 214/2025, art. 41, § 3º', resumo: 'O optante pelo Simples Nacional pode apurar e recolher IBS e CBS pelo regime regular (fora do DAS), mantendo os demais tributos no regime unificado.', url: U.lc214, natureza: 'norma' },
    lc214_a47: { norma: 'LC 214/2025, art. 47', resumo: 'Não cumulatividade: o contribuinte do regime regular apropria créditos de IBS e CBS das aquisições quando extintos os respectivos débitos (pagamento).', url: U.lc214, natureza: 'norma' },
    lc214_a47_p9: { norma: 'LC 214/2025, art. 47, § 9º', resumo: 'Optante do Simples (no regime unificado) não apropria créditos de IBS/CBS; o adquirente do regime regular credita o IBS/CBS pago pelo optante, limitado ao montante devido no Simples Nacional.', url: U.lc214, natureza: 'norma' },
    lc214_a343: { norma: 'LC 214/2025, art. 343', resumo: 'Em 2026, o IBS é cobrado à alíquota estadual de 0,1%.', url: U.lc214, natureza: 'norma' },
    lc214_a344: { norma: 'LC 214/2025, art. 344', resumo: 'De 2027 a 2028, o IBS é cobrado às alíquotas de 0,05% (estadual) e 0,05% (municipal).', url: U.lc214, natureza: 'norma' },
    lc214_a346: { norma: 'LC 214/2025, art. 346', resumo: 'Em 2026, a CBS é cobrada à alíquota de 0,9%.', url: U.lc214, natureza: 'norma' },
    lc214_a347: { norma: 'LC 214/2025, art. 347', resumo: 'Em 2027 e 2028, a alíquota da CBS é a de referência reduzida em 0,1 ponto percentual; nas operações com alíquota reduzida a redução é proporcional (§ 1º). Exceção: combustíveis do regime específico.', url: U.lc214, natureza: 'norma' },
    lc214_a348: { norma: 'LC 214/2025, art. 348', resumo: 'Regras de 2026: valores de IBS/CBS compensáveis com PIS/Cofins; dispensa de recolhimento para quem cumprir as obrigações acessórias (§ 1º); optantes do Simples Nacional não se sujeitam às alíquotas-teste.', url: U.lc214, natureza: 'norma' },
    lc214_a349: { norma: 'LC 214/2025, art. 349', resumo: 'Resolução do Senado Federal fixa a alíquota de referência da CBS de 2027 a 2033, a partir de cálculo do Executivo validado pelo TCU.', url: U.lc214, natureza: 'norma' },
    lc214_a454: { norma: 'LC 214/2025, art. 454', resumo: 'A partir de 2027, alíquotas do IPI reduzidas a zero, ressalvados os produtos com industrialização incentivada na Zona Franca de Manaus.', url: U.lc214, natureza: 'norma' },
    lc214_a172: { norma: 'LC 214/2025, arts. 172 a 180', resumo: 'Regime específico (monofásico) de IBS/CBS para combustíveis.', url: U.lc214, natureza: 'norma' },
    lc214_reducoes: { norma: 'LC 214/2025 — regimes diferenciados', resumo: 'Reduções de 30% e de 60%, alíquota zero (ex.: Cesta Básica Nacional) e demais tratamentos diferenciados, conforme NCM e anexos da lei. Informe o dispositivo específico na regra do produto.', url: U.lc214, natureza: 'norma' },
    mf_2024: { norma: 'Ministério da Fazenda — apresentação de abr/2024', resumo: 'Estimativa (não oficial) de alíquota de referência de 26,5%: CBS 8,8% e IBS 17,7%. A alíquota oficial da CBS 2027 depende de Resolução do Senado (art. 349).', url: 'https://www.gov.br/fazenda/pt-br/central-de-conteudo/publicacoes/apresentacoes/2024/abril/2024-04-24_Regulamentacao-da-Reforma-Tributaria.pdf', natureza: 'estimativa' },
    fisco_icms_ibscbs: { norma: 'SEFAZ-SP e SEFAZ-MG — respostas a consultas (2025/2026)', resumo: 'Entendimento administrativo: IBS/CBS não integram a base do ICMS em 2026 e passam a integrá-la quando efetivamente exigíveis (2027). Tema judicializado (há liminar contrária no TJSP); a LC 227/2026 tratou apenas do IS na base do ICMS.', url: '', natureza: 'administrativo' },
    dl1598_a12: { norma: 'Decreto-Lei 1.598/1977, art. 12, § 4º', resumo: 'Tributos não cumulativos cobrados destacadamente do comprador não integram a receita bruta (IBS/CBS fora da base do IRPJ/CSLL presumidos).', url: U.dl1598, natureza: 'norma' },

    /* ===================== Simples Nacional — LC 123/2006 ===================== */
    lc123_a18_p1a: { norma: 'LC 123/2006, art. 18, §§ 1º e 1º-A', resumo: 'Alíquota efetiva = (RBT12 × Alíq. nominal − Parcela a deduzir) / RBT12, sendo RBT12 a receita bruta acumulada nos 12 meses anteriores ao período de apuração.', url: U.lc123, natureza: 'norma' },
    lc123_anexos: { norma: 'LC 123/2006, Anexos I e II (redação da LC 155/2016)', resumo: 'Faixas de receita, alíquotas nominais, parcelas a deduzir e percentuais de repartição dos tributos.', url: U.lc123, natureza: 'norma' },
    lc123_anexos_2027: { norma: 'LC 123/2006, Anexos — partilha 2027/2028 (LC 214/2025 e LC 227/2026)', resumo: 'CBS e IBS substituem PIS/Cofins na repartição do DAS. Percentuais obtidos de publicações especializadas — CONFERIR no texto oficial e nas resoluções do CGSN.', url: U.lc123, natureza: 'norma' },
    lc123_a18_p4a: { norma: 'LC 123/2006, art. 18, § 4º-A, I, e § 12', resumo: 'Segregação de receitas sujeitas à tributação monofásica e ao ICMS já recolhido por substituição tributária ou antecipação com encerramento, com redução dos respectivos percentuais no DAS.', url: U.lc123, natureza: 'norma' },
    lc123_a23: { norma: 'LC 123/2006, art. 23, caput e § 1º', resumo: 'O optante não apropria nem transfere créditos dos tributos do Simples; o adquirente não optante pode creditar o ICMS correspondente ao percentual informado no documento fiscal.', url: U.lc123, natureza: 'norma' },
    lc123_a13a: { norma: 'LC 123/2006, art. 13-A', resumo: 'Sublimite de R$ 3.600.000,00: acima dele, ICMS e ISS são recolhidos fora do Simples, pelas regras normais.', url: U.lc123, natureza: 'norma' },
    lc123_a3: { norma: 'LC 123/2006, art. 3º, II', resumo: 'Limite de receita bruta anual de R$ 4.800.000,00 para a empresa de pequeno porte.', url: U.lc123, natureza: 'norma' },

    /* ===================== ICMS ===================== */
    lc87_a13_p1: { norma: 'LC 87/1996, art. 13, § 1º, I', resumo: 'O ICMS integra a sua própria base de cálculo (cálculo “por dentro”).', url: U.lc87, natureza: 'norma' },
    lc87_a13_p1_ii: { norma: 'LC 87/1996, art. 13, § 1º, II', resumo: 'Integram a base do ICMS os seguros, juros e demais importâncias pagas ou debitadas, os descontos condicionais e o frete cobrado pelo remetente.', url: U.lc87, natureza: 'norma' },
    lc87_a13_p2: { norma: 'LC 87/1996, art. 13, § 2º', resumo: 'O IPI não integra a base do ICMS na operação entre contribuintes com produto destinado à industrialização ou comercialização.', url: U.lc87, natureza: 'norma' },
    lc87_a19_20: { norma: 'LC 87/1996, arts. 19 e 20', resumo: 'Não cumulatividade: crédito do ICMS cobrado nas entradas de mercadorias.', url: U.lc87, natureza: 'norma' },
    lc87_a21: { norma: 'LC 87/1996, art. 21', resumo: 'Estorno do crédito quando a saída subsequente é isenta ou não tributada.', url: U.lc87, natureza: 'norma' },
    stf_tema299: { norma: 'STF, RE 635.688 (Tema 299)', resumo: 'Redução de base de cálculo equivale a isenção parcial: estorno proporcional do crédito, salvo disposição em contrário da legislação estadual.', url: '', natureza: 'jurisprudencia' },
    lc87_st: { norma: 'LC 87/1996, arts. 6º a 10 (art. 8º, II)', resumo: 'Substituição tributária: base presumida com MVA; ICMS-ST = base ST × alíquota interna − ICMS próprio. Para o substituído, o ICMS-ST compõe o custo (não gera crédito).', url: U.lc87, natureza: 'norma' },
    conv142: { norma: 'Convênio ICMS 142/2018', resumo: 'Regras gerais de ST; MVA ajustada nas operações interestaduais: [(1 + MVA) × (1 − ALQ inter) / (1 − ALQ intra)] − 1.', url: 'https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18', natureza: 'norma' },
    rsf22: { norma: 'Resolução do Senado Federal 22/1989', resumo: 'Alíquotas interestaduais: 12%; 7% nas saídas do Sul e Sudeste (exceto ES) para Norte, Nordeste, Centro-Oeste e ES.', url: '', natureza: 'norma' },
    rsf13: { norma: 'Resolução do Senado Federal 13/2012', resumo: 'Alíquota interestadual de 4% para bens e mercadorias importados (conteúdo de importação acima de 40%).', url: '', natureza: 'norma' },
    difal: { norma: 'CF, art. 155, § 2º, VII e VIII (EC 87/2015); LC 190/2022', resumo: 'Venda interestadual a consumidor final não contribuinte: diferencial de alíquotas devido ao Estado de destino, a cargo do remetente.', url: U.cf, natureza: 'norma' },
    ce_ricms_a61_p5: { norma: 'Decreto 33.327/2019 (RICMS-CE), art. 61, § 5º', resumo: 'A apropriação do crédito do imposto relativo ao ICMS Antecipado só é permitida após o seu efetivo recolhimento (contribuinte do regime normal).', url: '', natureza: 'norma' },
    lc123_a13_g: { norma: 'LC 123/2006, art. 13, § 1º, XIII, "g"', resumo: 'O optante pelo Simples recolhe fora do DAS o ICMS devido por antecipação nas aquisições interestaduais (com ou sem encerramento da tributação); sem direito a crédito (art. 23), o valor integra o custo.', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm', natureza: 'norma' },
    icms_st_entrada: { norma: 'LC 87/1996, arts. 6º a 10, e legislação estadual (ICMS-ST na entrada)', resumo: 'ICMS-ST recolhido pelo destinatário na entrada: encerra a tributação até o consumidor final; o contribuinte não se credita e o valor integra o custo; a saída ocorre sem débito do imposto.', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm', natureza: 'norma' },
    icms_uf: { norma: 'Legislação estadual (RICMS da UF)', resumo: 'Alíquota interna, FCP/FECOP, reduções de base, isenções, antecipação e ST conforme a legislação de cada Estado. Valores informados pelo usuário.', url: '', natureza: 'norma' },

    /* ===================== PIS/Cofins (até 31/12/2026) ===================== */
    l10637_a2: { norma: 'Lei 10.637/2002, art. 2º', resumo: 'PIS/Pasep não cumulativo: alíquota de 1,65%.', url: U.l10637, natureza: 'norma' },
    l10833_a2: { norma: 'Lei 10.833/2003, art. 2º', resumo: 'Cofins não cumulativa: alíquota de 7,6%.', url: U.l10833, natureza: 'norma' },
    pc_creditos: { norma: 'Leis 10.637/2002 e 10.833/2003, art. 3º, I, e § 2º, II e III', resumo: 'Crédito sobre bens adquiridos para revenda; sem crédito em aquisições não sujeitas ao pagamento (alíquota zero, monofásico, isenção); o ICMS da aquisição não integra a base do crédito (redação da Lei 14.592/2023).', url: U.l10833, natureza: 'norma' },
    pc_cumulativo: { norma: 'Lei 9.715/1998, art. 8º, I; Lei 9.718/1998, art. 8º', resumo: 'Regime cumulativo (lucro presumido): PIS 0,65% e Cofins 3%, sem créditos (Lei 10.637, art. 8º, II; Lei 10.833, art. 10, II).', url: U.l9718, natureza: 'norma' },
    pc_monofasico: { norma: 'Regime monofásico de PIS/Cofins (ex.: Lei 10.147/2000; Lei 10.485/2002; Lei 13.097/2015)', resumo: 'Tributação concentrada no fabricante/importador; revenda com alíquota zero e sem direito a crédito para o revendedor.', url: '', natureza: 'norma' },
    stf_tema69: { norma: 'STF, RE 574.706 (Tema 69)', resumo: 'O ICMS destacado não compõe a base de cálculo do PIS e da Cofins.', url: '', natureza: 'jurisprudencia' },
    stj_tema1125: { norma: 'STJ, Tema Repetitivo 1125', resumo: 'O ICMS-ST não compõe a base de cálculo do PIS e da Cofins devidos pelo contribuinte substituído (aplicação opcional — avalie o risco e a situação processual da empresa).', url: '', natureza: 'jurisprudencia' },

    /* ===================== IPI ===================== */
    ripi: { norma: 'Decreto 7.212/2010 (RIPI), arts. 225 e 226', resumo: 'Não cumulatividade do IPI: crédito do imposto nas entradas pelo estabelecimento industrial ou equiparado.', url: U.ripi, natureza: 'norma' },

    /* ===================== IRPJ / CSLL ===================== */
    l9249_a3: { norma: 'Lei 9.249/1995, art. 3º, caput e § 1º', resumo: 'IRPJ à alíquota de 15%, com adicional de 10% sobre a parcela do lucro que exceder R$ 20.000,00 por mês.', url: U.l9249, natureza: 'norma' },
    l9249_a15_20: { norma: 'Lei 9.249/1995, arts. 15 e 20', resumo: 'Lucro presumido: presunção de 8% (IRPJ) e 12% (CSLL) sobre a receita bruta na venda de mercadorias.', url: U.l9249, natureza: 'norma' },
    l7689_a3: { norma: 'Lei 7.689/1988, art. 3º, III', resumo: 'CSLL à alíquota de 9% (demais pessoas jurídicas).', url: U.l7689, natureza: 'norma' },
    lc224_a4: { norma: 'LC 224/2025, art. 4º', resumo: 'A partir de 2026, acréscimo de 10% nos percentuais de presunção do IRPJ/CSLL sobre a parcela da receita bruta anual que exceder R$ 5.000.000,00 (questionado na ADI 7936).', url: U.lc224, natureza: 'norma' }
  };

  RTC.legal = {
    catalogo: L,
    get: function (id) { return L[id] || null; },
    /** Lista textual curta "Norma; Norma" para tabelas */
    curto: function (ids) {
      return (ids || []).map(function (id) { return L[id] ? L[id].norma : id; }).join('; ');
    },
    /** Coleta e ordena IDs únicos de várias listas */
    unicos: function (listas) {
      var vistos = {};
      var out = [];
      listas.forEach(function (ids) {
        (ids || []).forEach(function (id) { if (L[id] && !vistos[id]) { vistos[id] = 1; out.push(id); } });
      });
      return out;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * RTC Comparativo — Simples Nacional (LC 123/2006).
 * Anexos I (comércio) e II (indústria). Alíquota efetiva: art. 18, § 1º-A.
 * Partilha 2027/2028: percentuais de fonte secundária (status "a confirmar").
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};

  // [limite superior da faixa, alíquota nominal %, parcela a deduzir R$, partilha % da alíquota efetiva]
  var TABELAS = {
    2026: {
      status: 'oficial',
      fund: ['lc123_anexos', 'lc123_a18_p1a'],
      I: [
        [180000, 4.0, 0, { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 41.5, ICMS: 34.0 }],
        [360000, 7.3, 5940, { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 41.5, ICMS: 34.0 }],
        [720000, 9.5, 13860, { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 42.0, ICMS: 33.5 }],
        [1800000, 10.7, 22500, { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 42.0, ICMS: 33.5 }],
        [3600000, 14.3, 87300, { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 42.0, ICMS: 33.5 }],
        [4800000, 19.0, 378000, { IRPJ: 13.5, CSLL: 10.0, COFINS: 28.27, PIS: 6.13, CPP: 42.1, ICMS: 0 }]
      ],
      II: [
        [180000, 4.5, 0, { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [360000, 7.8, 5940, { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [720000, 10.0, 13860, { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [1800000, 11.2, 22500, { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [3600000, 14.7, 85500, { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [4800000, 30.0, 720000, { IRPJ: 8.5, CSLL: 7.5, COFINS: 20.96, PIS: 4.54, CPP: 23.5, IPI: 35.0, ICMS: 0 }]
      ]
    },
    2027: {
      status: 'a_confirmar',
      fund: ['lc123_anexos_2027', 'lc123_a18_p1a'],
      I: [
        [180000, 4.0, 0, { IRPJ: 5.5, CSLL: 3.5, CBS: 15.33, IBS: 0.17, CPP: 41.5, ICMS: 34.0 }],
        [360000, 7.3, 5940, { IRPJ: 5.5, CSLL: 3.5, CBS: 15.33, IBS: 0.17, CPP: 41.5, ICMS: 34.0 }],
        [720000, 9.5, 13860, { IRPJ: 5.5, CSLL: 3.5, CBS: 15.33, IBS: 0.17, CPP: 42.0, ICMS: 33.5 }],
        [1800000, 10.7, 22500, { IRPJ: 5.5, CSLL: 3.5, CBS: 15.33, IBS: 0.17, CPP: 42.0, ICMS: 33.5 }],
        [3600000, 14.3, 87300, { IRPJ: 5.5, CSLL: 3.5, CBS: 15.33, IBS: 0.17, CPP: 42.0, ICMS: 33.5 }],
        [4800000, 18.9, 378000, { IRPJ: 13.58, CSLL: 10.06, CBS: 34.02, IBS: 0, CPP: 42.34, ICMS: 0 }]
      ],
      II: [
        [180000, 4.5, 0, { IRPJ: 5.5, CSLL: 3.5, CBS: 13.85, IBS: 0.15, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [360000, 7.8, 5940, { IRPJ: 5.5, CSLL: 3.5, CBS: 13.85, IBS: 0.15, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [720000, 10.0, 13860, { IRPJ: 5.5, CSLL: 3.5, CBS: 13.85, IBS: 0.15, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [1800000, 11.2, 22500, { IRPJ: 5.5, CSLL: 3.5, CBS: 13.85, IBS: 0.15, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [3600000, 14.7, 85500, { IRPJ: 5.5, CSLL: 3.5, CBS: 13.85, IBS: 0.15, CPP: 37.5, IPI: 7.5, ICMS: 32.0 }],
        [4800000, 29.9, 720000, { IRPJ: 8.53, CSLL: 7.53, CBS: 25.22, IBS: 0, CPP: 23.59, IPI: 35.13, ICMS: 0 }]
      ]
    }
  };

  var ANEXOS = {
    I: 'Anexo I — Comércio',
    II: 'Anexo II — Indústria'
  };

  /**
   * Calcula enquadramento e alíquota efetiva.
   * @param {'I'|'II'} anexo
   * @param {number} rbt12 receita bruta acumulada nos 12 meses anteriores
   * @param {2026|2027} ano tabela de partilha
   */
  function calcular(anexo, rbt12, ano) {
    var tab = TABELAS[ano] || TABELAS[2026];
    var faixas = tab[anexo] || tab.I;
    var res = { anexo: anexo, ano: ano, status: tab.status, fund: tab.fund.slice(), avisos: [], erro: null };
    var r = Number(rbt12) || 0;

    if (r > faixas[faixas.length - 1][0]) {
      res.erro = 'RBT12 de ' + N.fmt.brl(r) + ' excede o limite de R$ 4.800.000,00 do Simples Nacional (LC 123/2006, art. 3º, II).';
      res.fund.push('lc123_a3');
      return res;
    }
    var idx = 0;
    if (r > 0) {
      for (var i = 0; i < faixas.length; i++) { if (r <= faixas[i][0] + 1e-9) { idx = i; break; } }
    }
    var f = faixas[idx];
    res.faixa = idx + 1;
    res.limiteInf = idx === 0 ? 0 : faixas[idx - 1][0] + 0.01;
    res.limiteSup = f[0];
    res.nominal = f[1];
    res.pd = f[2];
    res.partilha = f[3];

    if (r <= 0) {
      res.efetiva = f[1];
      res.formula = 'RBT12 não informada: adotada a alíquota nominal da 1ª faixa (' + N.fmt.pct(f[1]) + ').';
      res.avisos.push('RBT12 não informada ou igual a zero. Para empresa em início de atividade, a LC 123/2006 (art. 18, § 2º) determina a proporcionalização da receita — informe a RBT12 proporcional.');
    } else {
      res.efetiva = ((r * f[1] / 100) - f[2]) / r * 100;
      res.formula = '((' + N.fmt.brl(r) + ' × ' + N.fmt.pct(f[1]) + ') − ' + N.fmt.brl(f[2]) + ') ÷ ' + N.fmt.brl(r) + ' = ' + N.fmt.pct(res.efetiva, 4);
    }
    res.efetivaPorTributo = {};
    Object.keys(f[3]).forEach(function (t) { res.efetivaPorTributo[t] = res.efetiva * f[3][t] / 100; });

    if (r > 3600000) {
      res.acimaSublimite = true;
      res.avisos.push('RBT12 acima do sublimite de R$ 3.600.000,00: ICMS recolhido fora do DAS, pelas regras normais (LC 123/2006, art. 13-A). O simulador trata o ICMS no regime de débito e crédito.');
      res.fund.push('lc123_a13a');
    }
    if (tab.status === 'a_confirmar') {
      res.avisos.push('Partilha do DAS para 2027/2028 obtida de fonte secundária — conferir no texto oficial (LC 123/2006 com alterações da LC 214/2025 e LC 227/2026) e nas resoluções do CGSN.');
      if (idx === 5) res.avisos.push('6ª faixa em 2027: alíquota nominal e partilha divergem entre fontes. Revise antes de concluir.');
    }
    return res;
  }

  RTC.simples = { TABELAS: TABELAS, ANEXOS: ANEXOS, calcular: calcular };
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * RTC Comparativo — consolidação da operação (vários produtos).
 * Calcula cada produto com o motor e soma custos, preços, tributos e resultados.
 * Percentuais consolidados são recalculados sobre as somas (média ponderada pelo preço).
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};

  function r2(v) { return Math.round((v + (v >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
  function soma(lista, fn) { return lista.reduce(function (s, x) { return s + (fn(x) || 0); }, 0); }

  var CAMPOS_CUSTO = ['bruto', 'totalCreditos', 'liquido', 'totalNaoRecuperaveis', 'vop', 'ipi', 'st', 'produtos'];
  var CAMPOS_VENDA = ['X', 'total', 'C', 'tributosDentro', 'tributosFora', 'despesas', 'irCs', 'lucroBruto', 'margemContrib', 'lucroLiquido'];

  /** Soma os custos dos produtos, inclusive as linhas da memória (por componente) e os tributos não recuperáveis */
  function somaCusto(lista) {
    var c = { linhas: [], naoRecuperaveis: [] };
    CAMPOS_CUSTO.forEach(function (k) { c[k] = r2(soma(lista, function (x) { return x[k]; })); });
    var porChave = {};
    lista.forEach(function (x) {
      (x.linhas || []).forEach(function (l) {
        if (l.item === 'Custo líquido unitário') return; // unidades podem diferir entre produtos
        var k = l.grupo + '|' + (l.id || l.item);
        var a = porChave[k];
        if (!a) {
          a = porChave[k] = { grupo: l.grupo, id: l.id, item: l.item, valor: 0, base: null, aliq: l.aliq, elegivel: false, info: l.info, destaque: l.destaque, formula: l.formula, n: 0 };
          c.linhas.push(a);
        }
        a.valor = r2(a.valor + (l.valor || 0));
        if (l.base != null) a.base = r2((a.base || 0) + l.base);
        if (a.aliq !== l.aliq) a.aliq = null;          // alíquotas diferentes entre produtos: não exibe
        if (a.formula !== l.formula) a.formula = '';
        a.elegivel = a.elegivel || !!l.elegivel;
        a.n++;
      });
      (x.naoRecuperaveis || []).forEach(function (nr) {
        var a = c.naoRecuperaveis.filter(function (y) { return y.item === nr.item; })[0];
        if (!a) { a = { item: nr.item, valor: 0 }; c.naoRecuperaveis.push(a); }
        a.valor = r2(a.valor + nr.valor);
      });
    });
    c.linhas.forEach(function (a) {
      if (a.n < lista.length && a.grupo === 'Créditos (tributos recuperáveis)') a.obs = 'Componente presente em ' + a.n + ' de ' + lista.length + ' produtos.';
      delete a.n;
    });
    return c;
  }

  /** Quantidade total quando todos os produtos usam a mesma unidade (permite custo e preço médios por unidade) */
  function quantidadeComum(itens) {
    if (!itens.length) return null;
    var un = String(itens[0].produto.unidade || 'UN').trim().toUpperCase();
    var q = 0;
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i];
      var qi = Number(it.produto.quantidade);
      if (!(qi > 0) || String(it.produto.unidade || 'UN').trim().toUpperCase() !== un) return null;
      q += qi;
    }
    return { quantidade: q, unidade: itens[0].produto.unidade || 'UN' };
  }

  function somaVenda(lista, regime) {
    var v = { regime: regime, linhas: [] };
    CAMPOS_VENDA.forEach(function (k) { v[k] = r2(soma(lista, function (x) { return x[k]; })); });
    var porId = {};
    lista.forEach(function (x) {
      x.linhas.forEach(function (l) {
        var a = porId[l.id];
        if (!a) { a = porId[l.id] = { id: l.id, nome: l.nome, tipo: l.tipo, natureza: l.natureza, valor: 0 }; v.linhas.push(a); }
        a.valor = r2(a.valor + l.valor);
      });
    });
    function p(x) { return v.X ? x / v.X * 100 : null; }
    v.pct = { tributosDentro: p(v.tributosDentro), despesas: p(v.despesas), lucroBruto: p(v.lucroBruto), margemContrib: p(v.margemContrib), lucroLiquido: p(v.lucroLiquido), irCs: p(v.irCs), custo: p(v.C) };
    v.markup = v.C ? v.X / v.C : null;
    v.acrescimoCusto = v.C ? (v.X - v.C) / v.C * 100 : null;
    v.irDesc = regime === 'SN' ? 'IRPJ/CSLL incluídos no DAS' : 'Soma dos IRPJ/CSLL estimados por produto';
    return v;
  }

  function analiseOk(r, an) {
    var a = r[an];
    return !!(a && a.v26 && a.v27 && !a.v26.erro && !a.v27.erro);
  }

  /**
   * @param emp empresa
   * @param op operação { itens: [...] }
   * @param opts mesmas opções do motor (parâmetros, alíquotas por UF)
   */
  function consolidar(emp, op, opts) {
    var itens = (op && op.itens) || [];
    var lista = itens.map(function (it, i) {
      return { item: it, idx: i, nome: RTC.model.nomeItem(it, i), r: RTC.engine.calcular(emp, it, opts) };
    });
    var out = { consolidado: true, itens: lista, n: lista.length, erros: [], avisos: [] };
    // natureza única por operação: produto divergente do produto 1 fica bloqueado (fora dos totais)
    RTC.model.inconsistencias(op, emp).forEach(function (inc) {
      var x = lista[inc.idx];
      x.inconsistente = true;
      x.r.erros.push({ campo: inc.campo, msg: inc.msg });
    });
    lista.forEach(function (x) {
      x.r.erros.forEach(function (e) { out.erros.push({ campo: e.campo, msg: x.nome + ': ' + e.msg, itemId: x.item.id }); });
      x.r.avisos.forEach(function (a) { out.avisos.push({ campo: a.campo, msg: x.nome + ': ' + a.msg, nivel: a.nivel, itemId: x.item.id }); });
    });
    if (!lista.length) return out;

    var validos = lista.filter(function (x) { return x.r.custo26 && !x.inconsistente; });
    out.completoCusto = validos.length === lista.length;
    out.statusCbs = (lista[0].r.statusCbs) || 'estimado';
    out.pv = lista[0].r.pv;
    if (!validos.length) return out;

    out.custo26 = somaCusto(validos.map(function (x) { return x.r.custo26; }));
    out.custo27 = somaCusto(validos.map(function (x) { return x.r.custo27; }));
    var qc = quantidadeComum(validos.map(function (x) { return x.item; }));
    out.qtdComum = qc;
    if (qc) { out.custo26.unitario = out.custo26.liquido / qc.quantidade; out.custo27.unitario = out.custo27.liquido / qc.quantidade; }

    ['a1', 'a2', 'a3'].forEach(function (an) {
      var pend = lista.filter(function (x) { return x.inconsistente || !analiseOk(x.r, an); });
      if (pend.length) {
        out[an] = { incompleto: true, pendentes: pend.map(function (x) { return x.nome; }) };
        return;
      }
      out[an] = {
        v26: somaVenda(lista.map(function (x) { return x.r[an].v26; }), emp.regime),
        v27: somaVenda(lista.map(function (x) { return x.r[an].v27; }), emp.regime)
      };
    });
    if (out.a1 && !out.a1.incompleto) {
      var margens = lista.map(function (x) { return x.r.a1.margem; });
      out.a1.margem = margens.every(function (m) { return m === margens[0]; }) ? margens[0] : null;
    }
    if (out.a3 && !out.a3.incompleto) {
      out.a3.lucro26 = r2(soma(lista, function (x) { return x.r.a3.lucro26; }));
      var medidas = lista.map(function (x) { return x.r.a3.baseMargem; });
      out.a3.baseMargem = medidas.every(function (m) { return m === medidas[0]; }) ? medidas[0] : 'misto';
      out.a3.medida = out.a3.baseMargem === 'liquida' ? 'lucro líquido (após IRPJ/CSLL)' : out.a3.baseMargem === 'misto' ? 'lucro conforme a medida de cada produto' : 'margem de contribuição (antes de IRPJ/CSLL)';
    }
    if (out.a2 && !out.a2.incompleto) {
      out.a2.origemPreco = 'Preço atual informado por produto (ou o sugerido em 2026)';
      var crit = lista.map(function (x) { return x.r.a2.criterio; });
      out.a2.criterio = crit.every(function (c) { return c === crit[0]; }) ? crit[0] : 'Critério de preço mantido definido por produto';
    }

    var modos = lista.map(function (x) { return x.r.modo; });
    out.modo = modos.every(function (m) { return m === modos[0]; }) ? modos[0] : 'misto';
    if (out.modo !== 'misto') out.principal = out.modo === 'B' ? out.a2 : out.a1;
    else {
      // métodos diferentes entre os produtos: soma cada produto no seu próprio método (A: margem → preço; B: preço → margem)
      var proprio = function (x) { return x.r.modo === 'B' ? 'a2' : 'a1'; };
      var pendM = lista.filter(function (x) { return x.inconsistente || !analiseOk(x.r, proprio(x)); });
      out.principal = pendM.length ? { incompleto: true, pendentes: pendM.map(function (x) { return x.nome; }) } : {
        v26: somaVenda(lista.map(function (x) { return x.r[proprio(x)].v26; }), emp.regime),
        v27: somaVenda(lista.map(function (x) { return x.r[proprio(x)].v27; }), emp.regime)
      };
    }

    // o comparativo usa a mesma rotina do produto individual
    var baseCmp = { custo26: out.custo26, custo27: out.custo27, a1: out.a1 && !out.a1.incompleto ? out.a1 : {}, a2: out.a2 && !out.a2.incompleto ? out.a2 : {} };
    out.comparativo = RTC.engine.comparar(baseCmp);

    // sensibilidade: soma, em cada alíquota da CBS, os totais de todos os produtos
    if (lista.every(function (x) { return !x.inconsistente && x.r.sensibilidade && x.r.sensibilidade.length; })) {
      out.sensibilidade = lista[0].r.sensibilidade.map(function (s0, i) {
        var linhas = lista.map(function (x) { return x.r.sensibilidade[i]; });
        var linha = { cbsRef: s0.cbsRef, atual: s0.atual };
        if (linhas.every(function (l) { return l.total27 != null; })) {
          linha.preco27 = r2(soma(linhas, function (l) { return l.preco27; }));
          linha.total27 = r2(soma(linhas, function (l) { return l.total27; }));
          var t26 = soma(linhas, function (l) { return l.total26; });
          linha.varTotal = t26 ? (linha.total27 - t26) / t26 * 100 : null;
        }
        if (linhas.every(function (l) { return l.x27b != null; })) {
          var x = soma(linhas, function (l) { return l.x27b; });
          linha.margem27 = x ? soma(linhas, function (l) { return l.mc27; }) / x * 100 : null;
          linha.lucro27 = r2(soma(linhas, function (l) { return l.lucro27; }));
        }
        return linha;
      });
    }

    // premissas comuns a todos os produtos + específicas identificadas pelo produto
    var comuns = (lista[0].r.premissas || []).filter(function (p) { return lista.every(function (x) { return (x.r.premissas || []).indexOf(p) >= 0; }); });
    out.premissas = comuns.slice();
    lista.forEach(function (x) {
      (x.r.premissas || []).forEach(function (p) { if (comuns.indexOf(p) < 0) out.premissas.push(x.nome + ': ' + p); });
    });

    out.fundamentos = RTC.legal.unicos(lista.map(function (x) { return x.r.fundamentos || []; }));
    out.ok = !out.erros.length;
    return out;
  }

  RTC.consolidar = consolidar;
  RTC.consolidar.quantidadeComum = quantidadeComum;
})(typeof window !== 'undefined' ? window : globalThis);

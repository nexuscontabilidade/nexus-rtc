/*
 * Nexus — integração entre os módulos RTC Comparativo (módulo 01) e Lucratividade por Item (módulo 02).
 *
 * Ao abrir um módulo, os produtos cadastrados no outro são copiados para ele, junto com a empresa (achada pelo
 * vínculo, pelo CNPJ ou pela razão social; se não existir, é criada) e com a operação/análise de origem.
 * Vínculo: empresa, operação/análise e produto copiados recebem um id `sync` comum aos dois módulos; o produto
 * cujo vínculo já existe no destino não é copiado de novo. Produto excluído no destino entra em `syncExcluidos`
 * e não volta. A cópia é do cadastro no momento da sincronização: alterações posteriores ficam em cada módulo.
 * Produtos ainda em branco (sem descrição e sem valor) esperam o preenchimento.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  var NOMES = { rtc: 'RTC Comparativo', lucro: 'Lucratividade por Item' };
  var REGIME_RTC_LUCRO = { SN: 'SIMPLES', LP: 'PRESUMIDO', LR: 'REAL' };
  var REGIME_LUCRO_RTC = { SIMPLES: 'SN', PRESUMIDO: 'LP', REAL: 'LR' };
  var PC_LUCRO_RTC = { NORMAL: 'normal', MONOFASICO: 'monofasico', ALIQ_ZERO: 'aliquota_zero', ISENTO: 'isento', SUSPENSO: 'suspensao' };
  var PC_RTC_LUCRO = { normal: 'NORMAL', monofasico: 'MONOFASICO', aliquota_zero: 'ALIQ_ZERO', isento: 'ISENTO', suspensao: 'SUSPENSO' };

  function informado(v) { return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }
  function num(v) { return informado(v) ? Number(v) : 0; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function digitos(s) { return String(s || '').replace(/\D/g, ''); }
  function nomeNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

  // ------------------------------------------------------------------ empresas
  function empresaLucroParaRtc(e) {
    var x = N.rtc.model.novaEmpresa();
    x.razaoSocial = e.razaoSocial || ''; x.nomeFantasia = e.nomeFantasia || ''; x.cnpj = e.cnpj || '';
    x.uf = e.uf || ''; x.regime = REGIME_LUCRO_RTC[e.regime] || 'LR';
    return x;
  }
  function empresaRtcParaLucro(e) {
    var x = N.lucro.modelo.novaEmpresa();
    x.razaoSocial = e.razaoSocial || ''; x.nomeFantasia = e.nomeFantasia || ''; x.cnpj = e.cnpj || '';
    x.uf = e.uf || x.uf; x.regime = REGIME_RTC_LUCRO[e.regime] || 'REAL';
    return x;
  }

  // ------------------------------------------------------------------ produtos
  /** Item da Lucratividade → produto do RTC (compra, tributação de venda e venda) */
  function lucroParaRtc(x, emp, empLucro) {
    var RTC = N.rtc, it = RTC.model.novoItem(emp);
    var c = x.compra || {}, v = x.venda || {};
    var LC = N.lucro;
    var p = N.store.merge(LC.motor.parametrosPadrao(), (empLucro && empLucro.params) || {});
    var t = x.trib || LC.motor.tributacaoPadrao(x, p);
    var q = num(x.quantidade);
    it.produto.codigo = x.codigo || '';
    it.produto.descricao = x.descricao || '';
    it.produto.ncm = x.ncm || '';
    it.produto.quantidade = q > 0 ? q : null;
    it.valores.valorUnitario = q > 0 && informado(c.valorMercadoria) ? r6(num(c.valorMercadoria) / q) : null;
    if (num(c.descontoCompra)) it.valores.desconto = num(c.descontoCompra);
    if (num(c.frete)) it.valores.frete = num(c.frete);
    if (num(c.icmsFrete)) { it.valores.freteNaNota = false; it.valores.icmsFrete = num(c.icmsFrete); } // frete do CT-e
    if (num(c.ipi)) it.valores.ipi = num(c.ipi);
    if (num(c.seguroOutros)) it.valores.seguro = num(c.seguroOutros);
    // o ICMS destacado vai como informado (0 inclusive): o RTC não calcula um ICMS que a nota não tem
    it.perfil.icms.valorEntradaInformado = num(c.icmsDestacado);
    var dae = num(c.daeValor);
    if (dae > 0 && (c.daeCodigo === '1023' || c.daeCodigo === '1031')) {
      it.perfil.antecipado = { tipo: c.daeCodigo === '1031' ? 'st' : 'antecipado', modo: 'informado', valor: dae, mva: null, ajustarMva: true };
    }
    it.perfil.pisCofins.tratamento = PC_LUCRO_RTC[(t && t.regimePisCofins) || c.regimePisCofins] || 'normal';
    // CBS e IBS (2027): o mesmo tratamento do item nos dois módulos
    var cb = x.cbsIbs || {};
    if (cb.regime === 'REDUCAO' && num(cb.reducao) > 0) { it.perfil.cbsIbs.tratamento = 'reducao'; it.perfil.cbsIbs.reducaoPct = num(cb.reducao); }
    else if (cb.regime === 'ALIQ_ZERO') it.perfil.cbsIbs.tratamento = 'aliquota_zero';
    else if (cb.regime === 'ISENTO') it.perfil.cbsIbs.tratamento = 'isento';
    if (t) {
      if (t.icmsSt && c.daeCodigo !== '1031') {
        // ICMS-ST sem DAE 1031: o valor retido na nota fica para o escritório completar no RTC
        it.perfil.icms.tratamento = 'st'; it.perfil.st.papel = 'substituido'; it.perfil.st.modo = 'informado';
      } else if (!t.icmsSt) {
        if (informado(t.aliqIcms)) { it.perfil.icms.aliqSaidaAuto = false; it.perfil.icms.aliqSaida = num(t.aliqIcms); }
        if (num(t.reducaoBcIcms) > 0) { it.perfil.icms.tratamento = 'reducao_base'; it.perfil.icms.reducaoSaida = num(t.reducaoBcIcms); }
      }
    }
    // modo "preço sem PIS/Cofins": o RTC recebe o preço de hoje (2026) e calcula o de 2027 pelas próprias regras
    var pvHoje = v.modo === 'PRECO_SEM_PIS_COFINS' && num(v.precoAtual) > 0 ? num(v.precoAtual) : num(v.precoVenda);
    if (pvHoje > 0) {
      it.venda.modo = 'B';
      it.venda.basePreco = 'unitario';
      it.venda.precoUnitarioAtual = pvHoje;
      if (q > 0) it.venda.precoAtual = r2(pvHoje * q);
    }
    if (it.venda.despesas[0]) it.venda.despesas[0].pct = num(v.comissao) || null;
    if (it.venda.despesas[1]) it.venda.despesas[1].pct = num(v.taxaCartao) || null;
    return it;
  }

  /** Produto do RTC → item da Lucratividade; os valores calculados pelo motor do RTC (ICMS, IPI, DAE) têm prioridade */
  function rtcParaLucro(it, emp, opcoes, an) {
    var LC = N.lucro, x = LC.modelo.novoItem(an);
    var r = null;
    try { r = N.rtc.engine.calcular(emp, it, opcoes || {}); } catch (e) { r = null; }
    var c26 = r && r.custo26;
    var pf = it.perfil, val = it.valores, c = x.compra;
    var q = num(it.produto.quantidade), vu = num(val.valorUnitario);
    x.codigo = it.produto.codigo || '';
    x.descricao = it.produto.descricao || '';
    x.ncm = it.produto.ncm || '';
    x.quantidade = q > 0 ? q : 1;
    c.valorMercadoria = c26 ? r2(c26.produtos) : (q > 0 && vu > 0 ? r2(q * vu) : null);
    c.descontoCompra = num(val.desconto);
    c.frete = num(val.frete);
    c.icmsFrete = val.freteNaNota === false ? num(val.icmsFrete) : 0;
    c.ipi = c26 ? r2(c26.ipi) : num(val.ipi);
    c.seguroOutros = r2(num(val.seguro) + num(val.despesas));
    c.icmsDestacado = c26 ? r2(c26.icms) : num(pf.icms.valorEntradaInformado);
    // antecipação → DAE 1023; ICMS-ST (na entrada ou retido na nota) → DAE 1031: custo, sem crédito de ICMS
    var tipoAnt = N.rtc.model.tipoAntecipacao(pf.antecipado);
    var ehSub = pf.icms.tratamento === 'st' && pf.st.papel === 'substituido';
    var antec = c26 ? num(c26.antecipado) : (pf.antecipado.modo === 'informado' ? num(pf.antecipado.valor) : 0);
    var stRetido = c26 && ehSub ? num(c26.st) : 0;
    if (tipoAnt === 'antecipado' && antec > 0) { c.daeValor = r2(antec); c.daeCodigo = '1023'; }
    else if ((tipoAnt === 'st' && antec > 0) || stRetido > 0) { c.daeValor = r2(antec + stRetido); c.daeCodigo = '1031'; }
    c.regimePisCofins = PC_RTC_LUCRO[pf.pisCofins.tratamento] || 'NORMAL';
    var cbt = (pf.cbsIbs || {}).tratamento;
    x.cbsIbs = cbt === 'reducao' && num(pf.cbsIbs.reducaoPct) > 0 ? { regime: 'REDUCAO', reducao: num(pf.cbsIbs.reducaoPct) }
      : cbt === 'aliquota_zero' ? { regime: 'ALIQ_ZERO', reducao: null } : cbt === 'isento' ? { regime: 'ISENTO', reducao: null } : { regime: 'NORMAL', reducao: null };
    var semIcmsVenda = ehSub || tipoAnt === 'st';
    var sai = r && r.ctx && r.ctx.icmsSai;
    var aliqSai = sai && sai.ok !== false ? sai.aliq : (pf.icms.aliqSaidaAuto === false && informado(pf.icms.aliqSaida) ? num(pf.icms.aliqSaida) : null);
    x.trib = {
      icmsSt: semIcmsVenda,
      aliqIcms: semIcmsVenda ? null : (pf.icms.tratamento === 'isento' || pf.icms.tratamento === 'diferido' ? 0 : aliqSai),
      reducaoBcIcms: pf.icms.tratamento === 'reducao_base' ? num(pf.icms.reducaoSaida) : 0,
      regimePisCofins: c.regimePisCofins, dasAliquota: null
    };
    // preço: o informado no RTC; sem ele, o preço que o RTC sugere para a margem desejada (2026)
    var v = it.venda, pv = 0;
    if (v.basePreco === 'unitario' && num(v.precoUnitarioAtual) > 0) pv = num(v.precoUnitarioAtual);
    else if (num(v.precoAtual) > 0 && q > 0) pv = num(v.precoAtual) / q;
    else if (r && r.a1 && r.a1.v26 && !r.a1.v26.erro && num(r.a1.v26.X) > 0 && q > 0) pv = num(r.a1.v26.X) / q;
    if (pv > 0) { x.venda.modo = 'PRECO_INFORMADO'; x.venda.precoVenda = r6(pv); }
    (v.despesas || []).forEach(function (d) {
      if (/comiss/i.test(d.descricao || '')) x.venda.comissao = num(d.pct);
      else if (/cart[aã]o|pagamento/i.test(d.descricao || '')) x.venda.taxaCartao = num(d.pct);
    });
    return x;
  }

  // ------------------------------------------------------------------ acesso aos dados de cada módulo
  var MODULOS = {
    rtc: {
      empresas: function (d) { return d.empresas || (d.empresas = []); },
      containers: function (d, emp) { return (d.simulacoes || []).filter(function (s) { return s.empresaId === emp.id; }); },
      itens: function (c) { return c.itens || []; },
      emBranco: function (it) { return !String((it.produto && it.produto.descricao) || '').trim() && !num(it.valores && it.valores.valorUnitario); },
      criarEmpresa: function (d, eSrc) { var e = empresaLucroParaRtc(eSrc); this.empresas(d).push(e); return e; },
      criarContainer: function (d, emp, cSrc) { var op = N.rtc.model.novaOperacao(emp, cSrc.nome); (d.simulacoes = d.simulacoes || []).push(op); return op; },
      copiar: function (d, emp, cont, itSrc, eSrc) {
        var it = lucroParaRtc(itSrc, emp, eSrc);
        cont.itens.push(it);
        if (!cont.itemAtivoId) cont.itemAtivoId = it.id;
        cont.atualizadoEm = new Date().toISOString();
        return it;
      }
    },
    lucro: {
      empresas: function (d) { return d.empresas || (d.empresas = []); },
      containers: function (d, emp) { return (d.analises || []).filter(function (a) { return a.empresaId === emp.id; }); },
      itens: function (c) { return c.itens || []; },
      emBranco: function (it) { return !String(it.descricao || '').trim() && !num(it.compra && it.compra.valorMercadoria); },
      criarEmpresa: function (d, eSrc) { var e = empresaRtcParaLucro(eSrc); this.empresas(d).push(e); return e; },
      criarContainer: function (d, emp, cSrc) { var an = N.lucro.modelo.novaAnalise(emp, cSrc.nome); (d.analises = d.analises || []).push(an); return an; },
      copiar: function (d, emp, cont, itSrc, eSrc, opcoesRtc) {
        var it = rtcParaLucro(itSrc, eSrc, opcoesRtc, cont);
        cont.itens.push(it);
        cont.atualizadoEm = new Date().toISOString();
        return it;
      }
    }
  };

  /** Empresa do destino: pelo vínculo, pelo CNPJ ou pela razão social */
  function acharEmpresa(lista, e) {
    var cnpj = digitos(e.cnpj), nome = nomeNorm(e.razaoSocial);
    return lista.filter(function (x) { return e.sync && x.sync === e.sync; })[0] ||
      (cnpj ? lista.filter(function (x) { return digitos(x.cnpj) === cnpj; })[0] : null) ||
      (nome ? lista.filter(function (x) { return !digitos(x.cnpj) || !cnpj ? nomeNorm(x.razaoSocial) === nome : false; })[0] : null) || null;
  }

  /**
   * Copia para o módulo `para` os produtos do outro módulo que ainda não estão lá.
   * o: { rtc: dados do RTC, lucro: dados da Lucratividade, para: 'rtc' | 'lucro', opcoesRtc: { parametros, aliquotasUF } }
   * Devolve { de, para, novos, empresasCriadas: [nomes], containersCriados, origemAlterada, destinoAlterado }.
   */
  function sincronizar(o) {
    var para = o.para, de = para === 'rtc' ? 'lucro' : 'rtc';
    var src = o[de], dst = o[para], A = MODULOS[de], B = MODULOS[para];
    var rel = { de: de, para: para, novos: 0, empresasCriadas: [], containersCriados: 0, origemAlterada: false, destinoAlterado: false };
    if (!src || !dst) return rel;
    var presentes = {};
    B.empresas(dst).forEach(function (e) { B.containers(dst, e).forEach(function (c) { B.itens(c).forEach(function (it) { if (it.sync) presentes[it.sync] = true; }); }); });
    (dst.syncExcluidos || []).forEach(function (s) { presentes[s] = true; });
    function marcar(obj) { if (!obj.sync) { obj.sync = N.store.uid('sync'); rel.origemAlterada = true; } return obj.sync; }
    A.empresas(src).forEach(function (eSrc) {
      var eDst = null;
      A.containers(src, eSrc).forEach(function (cSrc) {
        var cDst = null;
        A.itens(cSrc).forEach(function (itSrc) {
          if (A.emBranco(itSrc)) return;
          if (presentes[marcar(itSrc)]) return;
          marcar(eSrc); marcar(cSrc);
          if (!eDst) {
            eDst = acharEmpresa(B.empresas(dst), eSrc);
            if (!eDst) { eDst = B.criarEmpresa(dst, eSrc); rel.empresasCriadas.push(eDst.razaoSocial || 'Empresa sem nome'); }
            if (!eDst.sync) eDst.sync = eSrc.sync;
          }
          if (!cDst) {
            cDst = B.containers(dst, eDst).filter(function (c) { return c.sync === cSrc.sync; })[0];
            if (!cDst) { cDst = B.criarContainer(dst, eDst, cSrc); cDst.sync = cSrc.sync; rel.containersCriados++; }
          }
          var novo = B.copiar(dst, eDst, cDst, itSrc, eSrc, o.opcoesRtc);
          novo.sync = itSrc.sync;
          novo.origemModulo = de;
          presentes[novo.sync] = true;
          rel.novos++;
          rel.destinoAlterado = true;
        });
      });
    });
    return rel;
  }

  /** Guarda o vínculo dos produtos excluídos, para a sincronização não trazê-los de volta */
  function registrarExclusao(dados, itens) {
    if (!dados) return;
    var lista = dados.syncExcluidos || (dados.syncExcluidos = []);
    (itens || []).forEach(function (it) { if (it && it.sync && lista.indexOf(it.sync) < 0) lista.push(it.sync); });
  }

  /** Traz para o módulo `para` os produtos novos do outro módulo e grava os dois. Devolve o relatório ou null. */
  function puxar(para) {
    var rtc = N.rtc && N.rtc.app, lucro = N.lucro && N.lucro.app;
    if (!rtc || !lucro || !N.rtc.model || !N.lucro.modelo) return null;
    // só entre módulos liberados ao usuário: dados de um módulo sem acesso não são carregados nem gravados
    if (N.auth && N.auth.acessaModulo && (!N.auth.acessaModulo('rtc') || !N.auth.acessaModulo('lucro'))) return null;
    var rel = sincronizar({ rtc: rtc.d, lucro: lucro.d, para: para, opcoesRtc: { parametros: rtc.d.parametros, aliquotasUF: rtc.d.aliquotasUF } });
    var apps = { rtc: rtc, lucro: lucro };
    if (rel.origemAlterada) apps[rel.de].store.saveNow();
    if (rel.destinoAlterado) apps[rel.para].store.saveNow();
    return rel;
  }

  /** Aviso para o usuário depois de uma sincronização com produtos novos */
  function mensagem(rel) {
    if (!rel || !rel.novos) return '';
    return rel.novos + ' produto(s) trazido(s) do módulo ' + NOMES[rel.de] +
      (rel.empresasCriadas.length ? '. Empresa(s) criada(s) aqui: ' + rel.empresasCriadas.join(', ') + ' — confira o regime e os dados do cadastro' : '') +
      '. Se não quiser esses produtos aqui, use "Excluir selecionados" na lista de produtos.';
  }

  N.integracao = {
    NOMES: NOMES, sincronizar: sincronizar, puxar: puxar, mensagem: mensagem, registrarExclusao: registrarExclusao,
    lucroParaRtc: lucroParaRtc, rtcParaLucro: rtcParaLucro, empresaLucroParaRtc: empresaLucroParaRtc, empresaRtcParaLucro: empresaRtcParaLucro
  };
})(typeof window !== 'undefined' ? window : globalThis);

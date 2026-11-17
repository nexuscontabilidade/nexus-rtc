/* RTC Comparativo — componentes de interface (HTML) */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};
  RTC.views = RTC.views || {};
  var esc = function (s) { return N.fmt.esc(s); };

  function dataAttrs(o) {
    return ' data-scope="' + esc(o.scope || 'sim') + '"' + (o.id ? ' data-id="' + esc(o.id) + '"' : '') + ' data-path="' + esc(o.path) + '"';
  }

  function rotuloOrigem(origem) {
    if (!origem) return '';
    if (origem.indexOf('regra:') === 0) return '<span class="nx-orig is-regra" title="Valor obtido de regra cadastrada">regra</span>';
    if (origem === 'parametro') return '<span class="nx-orig is-param" title="Valor obtido de parâmetro legal">parâmetro</span>';
    if (origem === 'receita') return '<span class="nx-orig is-receita" title="Preenchido com os dados da Receita Federal (consulta CNPJá)">Receita</span>';
    return ''; // valores digitados são, por definição, informados pelo usuário (a memória de cálculo detalha a origem)
  }

  /** Campo de texto/número */
  function campo(o) {
    var tipo = o.tipo || 'text';
    var numerico = tipo === 'money' || tipo === 'pct' || tipo === 'num' || tipo === 'int' || tipo === 'unit';
    var prefixo = o.prefixo != null ? o.prefixo : (tipo === 'money' || tipo === 'unit' ? 'R$' : '');
    var sufixo = o.sufixo != null ? o.sufixo : (tipo === 'pct' ? '%' : '');
    var valor = N.fmt.inputValue(o.valor, tipo);
    var input;
    if (tipo === 'textarea') {
      input = '<textarea class="nx-input"' + dataAttrs(o) + ' rows="' + (o.linhas || 3) + '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.desabilitado ? ' disabled' : '') + '>' + esc(o.valor || '') + '</textarea>';
    } else {
      input = '<input class="nx-input' + (numerico ? ' is-num' : '') + '" type="text"' + dataAttrs(o) + ' data-type="' + tipo + '" value="' + esc(valor) + '"' +
        (numerico ? ' inputmode="decimal" autocomplete="off"' : '') + (o.maxlength ? ' maxlength="' + o.maxlength + '"' : '') +
        (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.desabilitado ? ' disabled' : '') +
        (o.rotulo ? ' aria-label="' + esc(o.rotulo) + '"' : '') + (o.rerender ? ' data-rerender="1"' : '') + '>';
    }
    return '<label class="nx-field w-' + (o.largura || 'md') + (o.classe ? ' ' + o.classe : '') + '" data-field="' + esc((o.scope || 'sim') + ':' + o.path) + '">' +
      (o.rotulo ? '<span class="nx-label">' + esc(o.rotulo) + (o.obrigatorio ? ' <b class="nx-req" aria-hidden="true">*</b>' : '') + rotuloOrigem(o.origem) + (o.dica ? '<span class="nx-tip" tabindex="0" title="' + esc(o.dica) + '">?</span>' : '') + '</span>' : '') +
      '<span class="nx-input-wrap' + (prefixo ? ' has-prefix' : '') + (sufixo ? ' has-suffix' : '') + '">' +
      (prefixo ? '<span class="nx-prefix">' + esc(prefixo) + '</span>' : '') + input + (sufixo ? '<span class="nx-suffix">' + esc(sufixo) + '</span>' : '') +
      '</span>' +
      (o.ajuda ? '<span class="nx-help">' + o.ajuda + '</span>' : '') +
      '<span class="nx-err" aria-live="polite"></span>' +
      '</label>';
  }

  /** Lista de seleção */
  function selecao(o) {
    var opts = (o.opcoes || []).map(function (op) {
      var v = Array.isArray(op) ? op[0] : op;
      var l = Array.isArray(op) ? op[1] : op;
      return '<option value="' + esc(v) + '"' + (String(v) === String(o.valor == null ? '' : o.valor) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
    return '<label class="nx-field w-' + (o.largura || 'md') + (o.classe ? ' ' + o.classe : '') + '" data-field="' + esc((o.scope || 'sim') + ':' + o.path) + '">' +
      (o.rotulo ? '<span class="nx-label">' + esc(o.rotulo) + (o.obrigatorio ? ' <b class="nx-req" aria-hidden="true">*</b>' : '') + rotuloOrigem(o.origem) + (o.dica ? '<span class="nx-tip" tabindex="0" title="' + esc(o.dica) + '">?</span>' : '') + '</span>' : '') +
      '<span class="nx-input-wrap is-select"><select class="nx-input"' + dataAttrs(o) + (o.cast ? ' data-cast="' + o.cast + '"' : '') + (o.desabilitado ? ' disabled' : '') + (o.rotulo ? ' aria-label="' + esc(o.rotulo) + '"' : '') + '>' + opts + '</select></span>' +
      (o.ajuda ? '<span class="nx-help">' + o.ajuda + '</span>' : '') +
      '<span class="nx-err" aria-live="polite"></span>' +
      '</label>';
  }

  /** Chave liga/desliga */
  function chave(o) {
    return '<label class="nx-switch' + (o.classe ? ' ' + o.classe : '') + '" data-field="' + esc((o.scope || 'sim') + ':' + o.path) + '">' +
      '<input type="checkbox"' + dataAttrs(o) + (o.marcado ? ' checked' : '') + (o.desabilitado ? ' disabled' : '') + '>' +
      '<span class="nx-switch-track" aria-hidden="true"></span>' +
      '<span class="nx-switch-text"><span>' + esc(o.rotulo) + rotuloOrigem(o.origem) + '</span>' + (o.ajuda ? '<small>' + o.ajuda + '</small>' : '') + '</span>' +
      '</label>';
  }

  /**
   * Controle segmentado (rádio). Com `compacto`, as opções viram pílulas de uma linha:
   * a descrição (op[2]) vai para a dica do mouse, e `dica` acrescenta o "?" ao lado do rótulo.
   */
  var segSeq = 0;
  function segmento(o) {
    var nome = 'seg' + (++segSeq) + '_' + String(o.path).replace(/\W/g, '');
    var c = !!o.compacto;
    return '<div class="nx-field w-' + (o.largura || (c ? 'auto' : 'full')) + '" data-field="' + esc((o.scope || 'sim') + ':' + o.path) + '">' +
      (o.rotulo ? '<span class="nx-label">' + esc(o.rotulo) + rotuloOrigem(o.origem) + (o.dica ? '<span class="nx-tip" tabindex="0" title="' + esc(o.dica) + '">?</span>' : '') + '</span>' : '') +
      '<div class="nx-seg' + (c ? ' is-compact' : '') + '" role="radiogroup"' + (o.rotulo ? ' aria-label="' + esc(o.rotulo) + '"' : '') + '>' +
      o.opcoes.map(function (op) {
        var marcado = String(op[0]) === String(o.valor);
        return '<label class="nx-seg-opt' + (marcado ? ' is-on' : '') + '"' + (c && op[2] ? ' title="' + esc(op[2]) + '"' : '') + '><input type="radio" name="' + nome + '" value="' + esc(op[0]) + '"' + dataAttrs(o) + (o.cast ? ' data-cast="' + o.cast + '"' : '') + (marcado ? ' checked' : '') + '>' +
          '<span><strong>' + esc(op[1]) + '</strong>' + (op[2] && !c ? '<small>' + esc(op[2]) + '</small>' : '') + '</span></label>';
      }).join('') +
      '</div>' + (o.ajuda ? '<span class="nx-help">' + o.ajuda + '</span>' : '') + '</div>';
  }

  function cartao(o) {
    return '<section class="nx-card' + (o.classe ? ' ' + o.classe : '') + '"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' +
      (o.titulo || o.acoes ? '<header class="nx-card-head"><div>' + (o.eyebrow ? '<span class="nx-eyebrow">' + esc(o.eyebrow) + '</span>' : '') + (o.titulo ? '<h2>' + o.titulo + '</h2>' : '') + (o.sub ? '<p>' + o.sub + '</p>' : '') + '</div>' + (o.acoes ? '<div class="nx-card-actions">' + o.acoes + '</div>' : '') + '</header>' : '') +
      '<div class="nx-card-body">' + (o.corpo || '') + '</div></section>';
  }

  function botao(rotulo, acao, o) {
    o = o || {};
    var attrs = Object.keys(o.dados || {}).map(function (k) { return ' data-' + k + '="' + esc(o.dados[k]) + '"'; }).join('');
    return '<button type="button" class="nx-btn ' + (o.tipo || 'ghost') + (o.classe ? ' ' + o.classe : '') + '" data-acao="' + esc(acao) + '"' + attrs + (o.titulo ? ' title="' + esc(o.titulo) + '"' : '') + (o.desabilitado ? ' disabled' : '') + '>' + (o.icone || '') + '<span>' + esc(rotulo) + '</span></button>';
  }

  function status(st) {
    var S = RTC.params.STATUS[st] || { rotulo: st, desc: '' };
    return '<span class="nx-badge st-' + esc(st) + '" title="' + esc(S.desc) + '"><i aria-hidden="true"></i>' + esc(S.rotulo) + '</span>';
  }

  function origem(o) {
    if (!o) return '';
    var cls = 'calc';
    if (/^Informado/.test(o)) cls = 'user';
    else if (/^Regra/.test(o)) cls = 'regra';
    else if (/^Parâmetro|^Tabela/.test(o)) cls = 'param';
    else if (/^Premissa/.test(o)) cls = 'premissa';
    return '<span class="nx-origem o-' + cls + '">' + esc(o) + '</span>';
  }

  function kpi(o) {
    var tone = '';
    if (o.delta != null && isFinite(o.delta) && Math.abs(o.delta) > 0.00001) {
      var sobe = o.delta > 0;
      tone = o.bomQuando === 'sobe' ? (sobe ? 'is-good' : 'is-bad') : o.bomQuando === 'desce' ? (sobe ? 'is-bad' : 'is-good') : 'is-neutral';
    }
    return '<div class="nx-kpi' + (o.destaque ? ' is-hero' : '') + '">' +
      '<span class="nx-kpi-label">' + esc(o.rotulo) + (o.dica ? '<span class="nx-tip" tabindex="0" title="' + esc(o.dica) + '">?</span>' : '') + '</span>' +
      '<span class="nx-kpi-value">' + (o.valor == null ? '—' : esc(o.valor)) + '</span>' +
      (o.deltaTexto ? '<span class="nx-kpi-delta ' + tone + '">' + (o.delta > 0.00001 ? '▲ ' : o.delta < -0.00001 ? '▼ ' : '') + esc(o.deltaTexto) + '</span>' : '') +
      (o.sub ? '<span class="nx-kpi-sub">' + esc(o.sub) + '</span>' : '') +
      '</div>';
  }

  function alertas(erros, avisos, opts) {
    opts = opts || {};
    var html = '';
    (erros || []).forEach(function (e) { html += '<li class="is-erro"><b>Erro</b><span>' + esc(e.msg) + '</span></li>'; });
    (avisos || []).forEach(function (a) { html += '<li class="is-' + (a.nivel === 'info' ? 'info' : 'alerta') + '"><b>' + (a.nivel === 'info' ? 'Nota' : 'Atenção') + '</b><span>' + esc(a.msg) + '</span></li>'; });
    if (!html) return opts.vazio ? '<p class="nx-muted">' + esc(opts.vazio) + '</p>' : '';
    return '<ul class="nx-alerts">' + html + '</ul>';
  }

  /** Frase-resposta no topo da tela: o resultado em uma frase, antes dos detalhes */
  function resposta(frase, sub, tom) {
    return '<div class="nx-resposta' + (tom ? ' is-' + tom : '') + '"><p>' + frase + '</p>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  }

  /** Explicação recolhível ("Como é calculado?"): a informação continua na tela, sem ocupar espaço */
  function explica(titulo, html) {
    return '<details class="nx-explica"><summary>' + esc(titulo) + '</summary><div class="nx-explica-corpo">' + html + '</div></details>';
  }

  function vazio(titulo, texto, acoes) {
    return '<div class="nx-empty"><div class="nx-empty-mark" aria-hidden="true"></div><h2>' + esc(titulo) + '</h2><p>' + esc(texto) + '</p>' + (acoes ? '<div class="nx-empty-actions">' + acoes + '</div>' : '') + '</div>';
  }

  function fundamentos(ids) {
    return (ids || []).map(function (id) {
      var l = RTC.legal.get(id);
      return l ? '<span class="nx-lei" title="' + esc(l.resumo) + '">' + esc(l.norma) + '</span>' : '';
    }).join('');
  }

  var UF_OPCOES = [['', 'Selecione']].concat(RTC.params.UFS.map(function (u) { return [u[0], u[0] + ' — ' + u[1]]; }));

  // ---------------------------------------------------------------- detalhamento (mais / menos detalhes)
  /** Linha aberta: clique na seta da linha ou, sem clique, a escolha geral "Mais detalhes" */
  function detalheAberto(A, chave) {
    var ab = A.abertos || {};
    return Object.prototype.hasOwnProperty.call(ab, chave) ? !!ab[chave] : A.d.ui.detalhes === 'mais';
  }
  var SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  function botaoDetalhe(chave, aberto, titulo) {
    return '<button type="button" class="nx-det-btn" data-acao="alternar-detalhe" data-chave="' + esc(chave) + '" aria-expanded="' + (aberto ? 'true' : 'false') + '" title="' + esc(titulo || 'Ver o detalhamento') + '">' + SETA + '</button>';
  }
  /** Conteúdo do detalhamento de uma linha de cálculo (custo ou venda) */
  function conteudoDetalhe(l, m) {
    var F = N.fmt;
    var itens = [];
    var val = typeof l.valor === 'number' ? Math.abs(l.valor) : null;
    if (l.aliq != null && l.base != null) itens.push(['Cálculo', m(l.base) + ' × ' + F.pct(l.aliq) + (val != null ? ' = ' + m(val) : '')]);
    else if (l.base != null) itens.push(['Base', m(l.base)]);
    if (l.natureza) itens.push(['Natureza', esc(l.natureza)]);
    if (l.formula) itens.push(['Fórmula', esc(l.formula)]);
    if (l.entrada && l.entrada !== '—') itens.push(['Dados usados', esc(l.entrada)]);
    if (l.obs) itens.push(['Observação', esc(l.obs)]);
    if (l.origem) itens.push(['Origem do valor', esc(l.origem)]);
    if (l.vig && l.vig !== '—') itens.push(['Vigência', esc(l.vig)]);
    if (l.fund && l.fund.length) itens.push(['Fundamento', fundamentos(l.fund)]);
    if (!itens.length) return '';
    return '<dl class="nx-det-dl">' + itens.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl>';
  }
  /** Linha de tabela com seta de detalhamento: devolve a linha principal + a linha de detalhe (oculta ou aberta) */
  function linhaComDetalhe(A, o) {
    var det = o.detalhe || '';
    var aberto = det ? detalheAberto(A, o.chave) : false;
    var btn = det ? botaoDetalhe(o.chave, aberto) : '<span class="nx-det-espaco" aria-hidden="true"></span>';
    return '<tr' + (o.classe ? ' class="' + o.classe + '"' : '') + '><td><div class="nx-det-cell">' + btn + '<div class="nx-det-nome">' + o.nome + '</div></div></td>' + o.celulas + '</tr>' +
      (det ? '<tr class="nx-det-row" data-det="' + esc(o.chave) + '"' + (aberto ? '' : ' hidden') + '><td colspan="' + (o.colunas || 2) + '">' + det + '</td></tr>' : '');
  }

  RTC.ui = { campo: campo, selecao: selecao, chave: chave, segmento: segmento, cartao: cartao, botao: botao, status: status, origem: origem, kpi: kpi, alertas: alertas, resposta: resposta, explica: explica, vazio: vazio, fundamentos: fundamentos, UF_OPCOES: UF_OPCOES, esc: esc,
    detalheAberto: detalheAberto, botaoDetalhe: botaoDetalhe, conteudoDetalhe: conteudoDetalhe, linhaComDetalhe: linhaComDetalhe };
})(typeof window !== 'undefined' ? window : globalThis);

/* RTC Comparativo — parâmetros tributários, alíquotas por UF, tabelas do Simples, regras e dados */
(function (root) {
  'use strict';
  var N = root.Nexus, RTC = N.rtc, U = RTC.ui, F = N.fmt, esc = F.esc;

  var ABAS = [['aliquotas', 'Alíquotas e limites'], ['uf', 'ICMS por UF'], ['simples', 'Tabelas do Simples'], ['regras', 'Regras cadastradas'], ['dados', 'Dados e backup']];
  var STATUS_OPC = Object.keys(RTC.params.STATUS).map(function (k) { return [k, RTC.params.STATUS[k].rotulo]; });

  function abaAliquotas(A) {
    var grupos = {};
    RTC.params.lista.forEach(function (p) { (grupos[p.grupo] = grupos[p.grupo] || []).push(p); });
    return Object.keys(grupos).map(function (g) {
      var rows = grupos[g].map(function (p) {
        var m = RTC.params.meta(p.id, A.d.parametros);
        var tipo = p.un === 'R$' ? 'money' : p.un === '%' ? 'pct' : 'num';
        return '<tr' + (m.status !== 'oficial' ? ' class="is-flag"' : '') + '><td><strong>' + esc(p.nome) + '</strong>' + (m.nota ? '<small class="nx-obs">' + esc(m.nota) + '</small>' : '') + '</td>' +
          '<td class="c-input">' + U.campo({ scope: 'param', id: p.id, path: 'valor', tipo: tipo, valor: m.valor, largura: 'sm', sufixo: p.un === 'p.p.' ? 'p.p.' : undefined, rotulo: '' }) + (m.alterado ? '<small class="nx-muted">padrão: ' + (p.un === 'R$' ? F.brl(m.valorPadrao) : F.num(m.valorPadrao)) + '</small>' : '') + '</td>' +
          '<td class="c-input">' + U.selecao({ scope: 'param', id: p.id, path: 'status', valor: m.status, opcoes: STATUS_OPC, largura: 'sm' }) + '</td>' +
          '<td>' + esc(m.vig) + '</td>' +
          '<td class="c-fund">' + U.fundamentos(p.fund) + '</td>' +
          '<td>' + F.date(m.atualizadoEm) + '</td>' +
          '<td>' + (A.d.parametros[p.id] ? U.botao('Restaurar', 'restaurar-param', { dados: { id: p.id }, classe: 'sm' }) : '') + '</td></tr>';
      }).join('');
      return U.cartao({ titulo: esc(g), corpo: '<div class="nx-table-wrap"><table class="nx-table nx-params"><thead><tr><th>Parâmetro</th><th>Valor</th><th>Status</th><th>Vigência</th><th>Fundamento</th><th>Atualizado</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' });
    }).join('');
  }

  function abaUF(A) {
    var rows = RTC.params.UFS.map(function (u) {
      var r = A.d.aliquotasUF[u[0]] || {};
      return '<tr><td><strong>' + u[0] + '</strong></td><td>' + esc(u[1]) + '</td>' +
        '<td class="c-input">' + U.campo({ scope: 'uf', id: u[0], path: 'interna', tipo: 'pct', valor: r.interna, largura: 'xs', rotulo: '' }) + '</td>' +
        '<td class="c-input">' + U.campo({ scope: 'uf', id: u[0], path: 'fcp', tipo: 'pct', valor: r.fcp, largura: 'xs', rotulo: '' }) + '</td>' +
        '<td class="c-input">' + U.campo({ scope: 'uf', id: u[0], path: 'fonte', valor: r.fonte, largura: 'lg', placeholder: 'Lei/RICMS, artigo, vigência', rotulo: '' }) + '</td>' +
        '<td>' + (r.atualizadoEm ? F.date(r.atualizadoEm) : '—') + '</td>' +
        '<td>' + (A.d.aliquotasUF[u[0]] ? U.botao('Limpar', 'limpar-uf', { dados: { id: u[0] }, classe: 'sm' }) : '') + '</td></tr>';
    }).join('');
    return U.cartao({
      eyebrow: 'Legislação estadual', titulo: 'Alíquotas internas (modais) de ICMS por UF',
      sub: 'Não vêm preenchidas: alíquotas internas mudam com frequência e variam por produto. Informe a alíquota modal (ou a aplicável à mercadoria), o adicional de fundo de combate à pobreza e a fonte legal. As simulações usam estes valores quando a alíquota está em “automática”.',
      corpo: '<div class="nx-table-wrap"><table class="nx-table nx-params"><thead><tr><th>UF</th><th>Estado</th><th>Alíq. interna</th><th>FCP/FECOP</th><th>Fonte / dispositivo</th><th>Atualizado</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="nx-note">Alíquotas interestaduais (7%, 12% e 4%) são definidas por Resolução do Senado e ficam na aba “Alíquotas e limites”.</p>'
    });
  }

  function tabelaSimples(ano, anexo) {
    var t = RTC.simples.TABELAS[ano];
    var faixas = t[anexo];
    var trib = Object.keys(faixas[0][3]);
    var inf = 0;
    var rows = faixas.map(function (f, i) {
      var r = '<tr><td>' + (i + 1) + 'ª</td><td class="num">' + F.brl(inf) + '</td><td class="num">' + F.brl(f[0]) + '</td><td class="num">' + F.pct(f[1]) + '</td><td class="num">' + F.brl(f[2]) + '</td>' +
        trib.map(function (k) { return '<td class="num">' + (f[3][k] ? F.pct(f[3][k]) : '—') + '</td>'; }).join('') + '</tr>';
      inf = f[0] + 0.01;
      return r;
    }).join('');
    return '<div class="nx-table-wrap"><table class="nx-table compact"><caption>' + esc(RTC.simples.ANEXOS[anexo]) + ' — ' + ano + ' ' + U.status(t.status) + '</caption><thead><tr><th>Faixa</th><th class="num">De</th><th class="num">Até</th><th class="num">Alíq. nominal</th><th class="num">Parcela a deduzir</th>' +
      trib.map(function (k) { return '<th class="num">' + k + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function abaSimples() {
    return U.cartao({ eyebrow: 'LC 123/2006', titulo: 'Anexos I e II — 2026', sub: 'Redação da LC 155/2016. Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12 (art. 18, § 1º-A).', corpo: tabelaSimples(2026, 'I') + tabelaSimples(2026, 'II') + '<p class="nx-fonte">' + U.fundamentos(['lc123_a18_p1a', 'lc123_anexos']) + '</p>' }) +
      U.cartao({ eyebrow: 'Transição', titulo: 'Partilha 2027–2028 (CBS e IBS no DAS)', sub: 'Percentuais obtidos de publicações especializadas, com CBS e IBS no lugar de PIS e Cofins. A CONFIRMAR no texto oficial (LC 123/2006 alterada pelas LC 214/2025 e 227/2026) e nas resoluções do CGSN, sobretudo a 6ª faixa.', corpo: tabelaSimples(2027, 'I') + tabelaSimples(2027, 'II') + '<p class="nx-fonte">' + U.fundamentos(['lc123_anexos_2027', 'lc214_a41_p3', 'lc214_a47_p9']) + '</p>' });
  }

  function abaRegras(A) {
    function item(r) {
      var campos = Object.keys(r.campos).filter(function (k) { return r.campos[k] !== null && r.campos[k] !== '' && r.campos[k] !== undefined; }).map(function (k) { return '<code>' + esc(k.replace('perfil.', '')) + ' = ' + esc(String(r.campos[k])) + '</code>'; }).join(' ');
      return '<li class="nx-regra"><div><strong>' + (r.usuario ? '★ ' : '') + esc(r.nome) + '</strong>' + (r.usuario ? '<span class="nx-orig is-user">usuário</span>' : '<span class="nx-orig is-regra">embutida</span>') + '<p>' + esc(r.desc || '') + '</p>' +
        (r.fund && r.fund.length ? '<p class="nx-fonte">' + U.fundamentos(r.fund) + '</p>' : '') + '<details><summary>Campos definidos</summary><div class="nx-codes">' + campos + '</div></details></div>' +
        (r.usuario ? U.botao('Excluir', 'excluir-regra', { dados: { id: r.id }, classe: 'sm danger-ghost' }) : '') + '</li>';
    }
    return U.cartao({ eyebrow: 'Perfis de produto', titulo: 'Regras cadastradas', sub: 'Regras definem tratamentos tributários reutilizáveis. As embutidas não fixam alíquotas estaduais; as do usuário são criadas em “Cadastro da operação › Salvar perfil como regra”.',
      corpo: '<ul class="nx-regras">' + RTC.rules.todas(A.d.regras).map(item).join('') + '</ul>' });
  }

  function abaDados(A) {
    var d = A.d;
    return U.cartao({ eyebrow: 'Armazenamento', titulo: 'Dados e backup',
      sub: 'Os dados ficam salvos neste navegador (armazenamento local). Exporte backups com regularidade e para levar as simulações a outro computador.',
      corpo: '<div class="nx-kpis k4">' +
        U.kpi({ rotulo: 'Empresas', valor: String(d.empresas.length) }) + U.kpi({ rotulo: 'Simulações', valor: String(d.simulacoes.length) }) +
        U.kpi({ rotulo: 'Regras do usuário', valor: String(d.regras.length) }) + U.kpi({ rotulo: 'UFs com alíquota cadastrada', valor: String(Object.keys(d.aliquotasUF).filter(function (k) { return d.aliquotasUF[k] && d.aliquotasUF[k].interna != null; }).length) }) +
        '</div><div class="nx-btn-row">' +
        U.botao('Exportar backup (JSON)', 'exportar-backup', { tipo: 'primary' }) + U.botao('Importar backup', 'importar-backup') + U.botao('Carregar exemplo ilustrativo', 'carregar-exemplo') + U.botao('Apagar todos os dados', 'apagar-tudo', { classe: 'danger-ghost' }) +
        '</div><p class="nx-note">Testes automatizados do motor de cálculo: <a href="tests/index.html" target="_blank" rel="noopener">abrir a suíte de testes</a>.</p>' });
  }

  RTC.views.parametros = {
    render: function (A) {
      var aba = A.d.ui.abaParametros || 'aliquotas';
      var topo = '<div class="nx-param-top"><div><span class="nx-eyebrow">Base de parâmetros ' + RTC.params.VERSAO_BASE + '</span>' +
        '<p>Última atualização dos parâmetros: <b data-live="params-data">' + F.dateTime(A.ultimaAtualizacaoParams()) + '</b></p>' +
        '<p class="nx-muted">Sem integração com base fiscal oficial. Cada valor indica status, vigência e fundamento; altere o status para “Oficial” somente após conferir a publicação.</p></div>' +
        (aba === 'aliquotas' ? U.botao('Restaurar todos', 'restaurar-params', { classe: 'sm' }) : '') + '</div>';
      var tabs = U.segmento({ scope: 'ui', path: 'abaParametros', valor: aba, opcoes: ABAS });
      var corpo = aba === 'uf' ? abaUF(A) : aba === 'simples' ? abaSimples() : aba === 'regras' ? abaRegras(A) : aba === 'dados' ? abaDados(A) : abaAliquotas(A);
      return '<div class="nx-stack">' + topo + tabs + corpo + '</div>';
    },
    live: { 'params-data': function (A) { return F.dateTime(A.ultimaAtualizacaoParams()); } }
  };
})(typeof window !== 'undefined' ? window : globalThis);

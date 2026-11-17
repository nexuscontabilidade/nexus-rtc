/* Lucratividade por Item — cadastro próprio de empresas (separado do RTC Comparativo) */
(function (root) {
  'use strict';
  var N = root.Nexus, LC = N.lucro, M = LC.motor, U = N.rtc.ui, F = N.fmt, esc = F.esc;

  function lista(L) {
    if (!L.d.empresas.length) return '<p class="nx-muted">Nenhuma empresa cadastrada neste módulo.</p>';
    return '<ul class="nx-emp-list">' + L.d.empresas.map(function (e) {
      var ativo = L.d.ui.empresaEditando === e.id;
      var n = L.analisesDa(e.id).length;
      return '<li class="nx-emp' + (ativo ? ' is-active' : '') + '"><div class="nx-emp-main"><strong>' + esc(e.razaoSocial || 'Empresa sem nome') + '</strong>' +
        '<span>' + (e.cnpj ? esc(e.cnpj) + ' · ' : '') + esc(e.uf || 'UF —') + ' · ' + esc(M.REGIMES[e.regime] || '—') + '</span><small>' + n + ' análise(s)</small></div>' +
        '<div class="nx-emp-acoes">' +
          U.botao(ativo ? 'Em edição' : 'Editar', 'lc-editar-empresa', { dados: { id: e.id }, classe: 'sm', desabilitado: ativo }) +
          U.botao('Análises', 'lc-usar-empresa', { dados: { id: e.id }, classe: 'sm', titulo: 'Abrir as análises desta empresa' }) +
          U.botao('Excluir', 'lc-excluir-empresa', { dados: { id: e.id }, classe: 'sm danger' }) +
        '</div></li>';
    }).join('') + '</ul>';
  }

  function ficha(L) {
    var e = L.editando();
    if (!e) {
      return U.cartao({ classe: 'nx-ficha-fechada', eyebrow: 'Ficha de cadastro', titulo: 'Cadastre ou edite uma empresa',
        corpo: '<p class="nx-muted">A ficha abre ao clicar em <b>Nova empresa</b>. Este módulo tem cadastro próprio: as empresas do RTC Comparativo não aparecem aqui.</p><div class="nx-btn-row">' + U.botao('Nova empresa', 'lc-nova-empresa', { tipo: 'primary' }) + '</div>' });
    }
    function c(o) { o.scope = 'emp'; o.id = e.id; return U.campo(o); }
    var cnpjOk = e.cnpj && F.cnpjValido(e.cnpj);
    var receita = e.receita ? '<p class="nx-note">Receita Federal (CNPJá): situação <b>' + esc(e.receita.situacao || '—') + '</b>' + (e.receita.cnae ? ' · CNAE ' + esc(e.receita.cnae.codigo) + ' ' + esc(e.receita.cnae.texto) : '') + ' · Simples Nacional: ' + (e.receita.simples && e.receita.simples.optante ? 'optante' : 'não optante') + '.</p>' : '';
    return U.cartao({
      eyebrow: e.__nova ? 'Nova empresa' : 'Editando', titulo: esc(e.razaoSocial || 'Nova empresa'),
      acoes: U.botao('Cancelar', 'lc-cancelar-empresa', { classe: 'sm' }) + U.botao('Salvar empresa', 'lc-concluir-empresa', { tipo: 'primary', classe: 'sm' }),
      corpo: '<div class="nx-form-grid">' +
          c({ rotulo: 'Razão social', path: 'razaoSocial', valor: e.razaoSocial, largura: 'lg', obrigatorio: true }) +
          c({ rotulo: 'Nome fantasia', path: 'nomeFantasia', valor: e.nomeFantasia, largura: 'md' }) +
          c({ rotulo: 'CNPJ', path: 'cnpj', valor: e.cnpj, largura: 'md', maxlength: 18, placeholder: '00.000.000/0000-00', ajuda: e.cnpj ? (cnpjOk ? '<span class="nx-ok-text">CNPJ válido.</span>' : '<span class="nx-warn-text">CNPJ com dígito verificador inválido.</span>') : '' }) +
          '<div class="nx-field w-sm nx-field-actions">' + U.botao(L.consultando ? 'Consultando…' : 'Buscar na Receita', 'lc-buscar-cnpj', { tipo: 'primary', classe: 'sm', desabilitado: !!L.consultando, titulo: 'Preenche razão social, UF e, se optante, o Simples Nacional (consulta pública CNPJá).' }) + '</div>' +
          U.selecao({ scope: 'emp', id: e.id, path: 'uf', valor: e.uf, rotulo: 'UF', opcoes: U.UF_OPCOES, largura: 'sm', obrigatorio: true }) +
        '</div>' + receita +
        U.segmento({ scope: 'emp', id: e.id, path: 'regime', valor: e.regime, rotulo: 'Regime tributário', opcoes: [
          ['SIMPLES', 'Simples Nacional', 'nenhum crédito na compra'], ['PRESUMIDO', 'Lucro Presumido', 'crédito só de ICMS'], ['REAL', 'Lucro Real', 'créditos de ICMS e PIS/Cofins']] }) +
        '<p class="nx-note">As regras do DAE 1023/1031 (Decreto 33.327/2019) valem para empresas do Ceará. As alíquotas padrão ficam em <a href="#/lucro/parametros">Parâmetros</a>.</p>'
    });
  }

  LC.views.empresas = {
    render: function (L) {
      return '<div class="nx-split"><div class="nx-split-side">' +
        U.cartao({ titulo: 'Empresas', sub: L.d.empresas.length + ' cadastrada(s) neste módulo', acoes: U.botao('Nova empresa', 'lc-nova-empresa', { tipo: 'primary', classe: 'sm' }), corpo: lista(L) }) +
        '</div><div class="nx-split-main">' + ficha(L) + '</div></div>';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

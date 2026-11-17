/*
 * Nexus — página da plataforma "Usuários" (somente administradores):
 * cadastro de acessos (nome, e-mail de login, senha inicial, perfil e módulos liberados), bloqueio/desbloqueio
 * (ex.: fatura em aberto) e envio de e-mail de redefinição de senha. Tudo vale na hora, direto no servidor (Firebase).
 */
(function (root) {
  'use strict';
  var N = root.Nexus;
  var esc = N.fmt.esc;
  var estado = { editando: null, lista: [], carregando: false, erro: '' }; // editando: null | 'novo' | id do usuário

  function campo(o) {
    return '<label class="nx-field w-full" data-campo="' + o.nome + '">' +
      '<span class="nx-label">' + esc(o.rotulo) + (o.obrigatorio ? ' <b class="nx-req" aria-hidden="true">*</b>' : '') + '</span>' +
      '<span class="nx-input-wrap"><input class="nx-input" name="' + o.nome + '" type="' + (o.tipo || 'text') + '" value="' + esc(o.valor || '') + '"' +
        ' autocomplete="' + (o.auto || 'off') + '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
        (o.tipo === 'email' ? ' inputmode="email" autocapitalize="off" spellcheck="false"' : '') + (o.obrigatorio ? ' required' : '') + '>' +
        (o.tipo === 'password' ? N.auth.botaoOlho(o.rotulo.toLowerCase()) : '') + '</span>' +
      (o.ajuda ? '<span class="nx-help">' + esc(o.ajuda) + '</span>' : '') +
      '<span class="nx-err" aria-live="polite"></span></label>';
  }

  function dataHora(iso) { return iso ? N.fmt.dateTime(iso) : '—'; }

  /** Nomes dos módulos liberados (null = todos) */
  function nomesModulos(ids) {
    if (!ids) return ['Todos os módulos'];
    return ids.map(function (id) { var m = N.shell.modulos.filter(function (x) { return x.id === id; })[0]; return m ? (m.curto || m.nome) : id; });
  }

  /** Escolha dos módulos do cliente; o administrador acessa todos (as caixas somem para esse perfil) */
  function seletorModulos(u) {
    var marcados = u.modulos;
    return '<div class="nx-field w-full nx-usr-mods-campo' + (u.perfil === 'admin' ? ' is-admin' : '') + '" data-campo="modulos">' +
      '<span class="nx-label">Módulos liberados</span>' +
      '<div class="nx-usr-mods" role="group" aria-label="Módulos liberados">' + N.shell.modulos.map(function (m) {
        var on = !marcados || marcados.indexOf(m.id) >= 0;
        return '<label class="nx-usr-mod"><input type="checkbox" name="modulos" value="' + esc(m.id) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="nx-usr-mod-ico" aria-hidden="true">' + N.shell.icone(m.icone || m.id) + '</span>' +
          '<span class="nx-usr-mod-txt"><strong>' + esc(m.nome) + '</strong><small>' + esc(m.descricao || '') + '</small></span>' +
          '<span class="nx-usr-mod-check" aria-hidden="true"></span></label>';
      }).join('') + '</div>' +
      '<span class="nx-help nx-usr-mods-cli">O cliente abre só os módulos marcados; os demais aparecem para ele em cinza, sem acesso.</span>' +
      '<span class="nx-help nx-usr-mods-adm">Administradores acessam todos os módulos.</span>' +
      '<span class="nx-err" aria-live="polite"></span></div>';
  }

  function lista(atual) {
    var us = estado.lista;
    var nAdm = us.filter(function (u) { return u.perfil === 'admin'; }).length;
    var nBloq = us.filter(function (u) { return u.bloqueado; }).length;
    var linhas = us.map(function (u) {
      var eu = atual && atual.id === u.id;
      var editando = estado.editando === u.id;
      var perfil = u.perfil === 'admin' ? '<span class="nx-usr-perfil is-admin">Administrador</span>' : '<span class="nx-usr-perfil">Cliente</span>';
      var situacao = u.bloqueado ? '<span class="nx-count is-erro">Bloqueado</span>' : '<span class="nx-count is-ok">Ativo</span>';
      var mods = u.perfil === 'admin' ? '' : nomesModulos(u.modulos).map(function (n) { return '<span class="nx-usr-modtag">' + esc(n) + '</span>'; }).join('');
      var detalheBloq = u.bloqueado ? '<small class="nx-usr-bloq">Bloqueado em ' + dataHora(u.bloqueadoEm) + (u.motivoBloqueio ? ' · ' + esc(u.motivoBloqueio) : '') + '</small>' : '';
      return '<li class="nx-usr' + (editando ? ' is-sel' : '') + (u.bloqueado ? ' is-bloq' : '') + '">' +
        '<span class="nx-avatar" aria-hidden="true">' + esc((u.nome || u.email || '?').charAt(0).toUpperCase()) + '</span>' +
        '<span class="nx-usr-id">' +
          '<b>' + (u.nome ? esc(u.nome) : '<em class="nx-usr-semnome">' + 'Nome não informado' + '</em>') + (eu ? ' <span class="nx-usr-voce">Você</span>' : '') + '</b>' +
          '<span class="nx-usr-email">' + esc(u.email || '—') + '</span>' +
          '<span class="nx-usr-tags">' + perfil + situacao + mods + '</span>' + detalheBloq +
        '</span>' +
        '<span class="nx-usr-acoes">' +
          '<button class="nx-btn sm" type="button" data-usr="editar" data-id="' + esc(u.id) + '">Editar</button>' +
          (u.bloqueado
            ? '<button class="nx-btn sm" type="button" data-usr="desbloquear" data-id="' + esc(u.id) + '">Desbloquear</button>'
            : '<button class="nx-btn sm danger-ghost" type="button" data-usr="bloquear" data-id="' + esc(u.id) + '"' + (eu ? ' disabled title="Você não pode bloquear o próprio acesso"' : '') + '>Bloquear</button>') +
          '<button class="nx-btn sm danger-ghost" type="button" data-usr="excluir" data-id="' + esc(u.id) + '"' + (eu || us.length <= 1 ? ' disabled title="' + (eu ? 'Você não pode excluir o próprio usuário' : 'É preciso manter ao menos um usuário') + '"' : '') + '>Excluir</button>' +
        '</span></li>';
    }).join('');
    return '<section class="nx-card">' +
      '<div class="nx-card-head"><div><span class="nx-eyebrow">Acesso à plataforma</span><h2>Usuários cadastrados</h2>' +
        '<p>' + us.length + (us.length === 1 ? ' usuário' : ' usuários') + ' · ' + nAdm + ' administrador(es) · ' + (us.length - nAdm) + ' cliente(s)' + (nBloq ? ' · ' + nBloq + ' bloqueado(s)' : '') + '. O login é feito pelo e-mail.</p></div>' +
        '<div class="nx-card-actions"><button class="nx-btn primary sm" type="button" data-usr="novo">Novo acesso</button></div></div>' +
      '<div class="nx-card-body"><ul class="nx-usr-list">' + linhas + '</ul>' +
      '<p class="nx-note">As alterações valem na hora, em qualquer computador. As senhas ficam no Firebase Authentication (a Nexus não as vê). Cada cliente tem os próprios dados (empresas e operações) na nuvem, isolados dos demais; nem administradores os acessam. Um cliente bloqueado perde o acesso imediatamente.</p>' +
      '</div></section>';
  }

  function ficha(atual) {
    if (!estado.editando) {
      return '<section class="nx-card nx-usr-vazio"><div class="nx-card-head"><div><span class="nx-eyebrow">Ficha do usuário</span><h2>Crie ou edite um acesso</h2>' +
        '<p>A ficha abre ao clicar em <b>Novo acesso</b>. Para alterar nome, e-mail, perfil ou senha, use <b>Editar</b> na lista.</p></div></div>' +
        '<div class="nx-card-body"><button class="nx-btn primary" type="button" data-usr="novo">Novo acesso</button></div></section>';
    }
    var novo = estado.editando === 'novo';
    var u = novo ? { nome: '', email: '', perfil: 'cliente', modulos: null } : estado.lista.filter(function (x) { return x.id === estado.editando; })[0];
    if (!u) { estado.editando = null; return ficha(atual); }
    var eu = atual && atual.id === u.id;
    var perfilSel = '<div class="nx-field w-full" data-campo="perfil"><span class="nx-label">Perfil</span><div class="nx-seg" role="radiogroup" aria-label="Perfil">' +
      [['cliente', 'Cliente', 'usa a plataforma; não gerencia acessos'], ['admin', 'Administrador', 'cria, edita e bloqueia acessos']].map(function (o) {
        var on = u.perfil === o[0];
        return '<label class="nx-seg-opt' + (on ? ' is-on' : '') + '"><input type="radio" name="perfil" value="' + o[0] + '"' + (on ? ' checked' : '') + (eu && o[0] === 'cliente' ? ' disabled' : '') + '><span><strong>' + o[1] + '</strong><small>' + o[2] + '</small></span></label>';
      }).join('') + '</div><span class="nx-err" aria-live="polite"></span></div>';
    return '<section class="nx-card nx-usr-ficha">' +
      '<form id="nx-usr-form" novalidate>' +
        '<div class="nx-card-head"><div><span class="nx-eyebrow">Ficha do usuário</span><h2>' + (novo ? 'Novo acesso' : 'Editar ' + (eu ? 'meu usuário' : 'acesso')) + '</h2>' +
          '<p>' + (novo ? 'Informe o nome, o e-mail que será usado no login, o perfil, os módulos liberados e a senha inicial. Envie a senha ao cliente por um canal seguro.' : 'Altere o nome, o perfil e os módulos liberados.') + '</p></div></div>' +
        '<div class="nx-card-body"><div class="nx-usr-campos">' +
          campo({ nome: 'nome', rotulo: 'Nome', valor: u.nome, placeholder: 'Nome do cliente ou da empresa', obrigatorio: true }) +
          (novo ? campo({ nome: 'email', rotulo: 'E-mail para login', tipo: 'email', valor: u.email, placeholder: 'nome@empresa.com.br', obrigatorio: true })
            : '<div class="nx-field w-full"><span class="nx-label">E-mail para login</span><span class="nx-input-wrap"><input class="nx-input" name="email" type="email" value="' + esc(u.email) + '" readonly aria-readonly="true"></span><span class="nx-help">O e-mail é o login e não pode ser alterado.</span></div>') +
          perfilSel +
          seletorModulos(u) +
          (novo ? campo({ nome: 'senha', rotulo: 'Senha inicial', tipo: 'password', auto: 'new-password', obrigatorio: true, ajuda: 'Mínimo de 8 caracteres, com letras e números. O cliente pode trocá-la em "Esqueci minha senha".' }) +
            campo({ nome: 'confirmacao', rotulo: 'Confirmar senha', tipo: 'password', auto: 'new-password', obrigatorio: true })
            : '<div class="nx-field w-full"><span class="nx-label">Senha</span><button class="nx-btn sm" type="button" data-usr="senha" data-id="' + esc(u.id) + '">Enviar e-mail de redefinição de senha</button><span class="nx-help">O usuário recebe um link para criar a própria senha.</span></div>') +
        '</div>' +
        '<p class="nx-login-erro" data-erro-geral role="alert"></p>' +
        '<div class="nx-ficha-rodape"><button class="nx-btn primary" type="submit">' + (novo ? 'Criar acesso' : 'Salvar alterações') + '</button>' +
          '<button class="nx-btn" type="button" data-usr="cancelar">Cancelar</button></div>' +
        '</div>' +
      '</form></section>';
  }

  function mostrarErros(form, erros) {
    Array.prototype.forEach.call(form.querySelectorAll('[data-campo]'), function (f) {
      var msg = erros[f.getAttribute('data-campo')] || '';
      f.classList.toggle('has-error', !!msg);
      var e = f.querySelector('.nx-err');
      if (e) e.textContent = msg;
    });
    form.querySelector('[data-erro-geral]').textContent = erros.geral || '';
    var primeiro = form.querySelector('.has-error input');
    if (primeiro) primeiro.focus();
  }

  function aindaAqui() { return N.shell.atual.rota === 'usuarios'; }

  function desenhar(el, ctx) {
    var atual = N.auth.atual();
    el.innerHTML = '<div class="nx-stack"><div class="nx-usr-grid">' + lista(atual) + ficha(atual) + '</div></div>';
    ligar(el, ctx);
  }

  /** Busca a lista no servidor e redesenha. Com `silencioso`, mantém a tela atual enquanto carrega. */
  function render(el, ctx, silencioso) {
    var atual = N.auth.atual();
    if (!atual || atual.perfil !== 'admin') {
      el.innerHTML = '<section class="nx-card"><div class="nx-card-head"><div><span class="nx-eyebrow">Acesso restrito</span><h2>Somente administradores</h2><p>A gestão de acessos é feita pela Nexus Contabilidade.</p></div></div></section>';
      return;
    }
    if (!silencioso) el.innerHTML = '<section class="nx-card"><div class="nx-card-head"><div><span class="nx-eyebrow">Acesso à plataforma</span><h2>Carregando usuários…</h2></div></div></section>';
    return N.auth.listar().then(function (us) {
      if (!aindaAqui()) return;
      estado.lista = us;
      desenhar(el, ctx);
    }, function (e) {
      if (!aindaAqui()) return;
      el.innerHTML = '<section class="nx-card"><div class="nx-card-head"><div><span class="nx-eyebrow">Acesso à plataforma</span><h2>Não foi possível carregar os usuários</h2><p>' + esc(e && e.message ? e.message : 'Verifique a conexão e tente novamente.') + '</p></div>' +
        '<div class="nx-card-actions"><button class="nx-btn primary sm" type="button" data-usr="recarregar">Tentar novamente</button></div></div></section>';
      el.querySelector('[data-usr="recarregar"]').addEventListener('click', function () { render(el, ctx); });
    });
  }

  function usuario(id) { return estado.lista.filter(function (x) { return x.id === id; })[0]; }

  function ligar(el, ctx) {
    var form = el.querySelector('#nx-usr-form');
    Array.prototype.forEach.call(el.querySelectorAll('[data-usr]'), function (b) {
      b.addEventListener('click', function () {
        var acao = b.getAttribute('data-usr'), id = b.getAttribute('data-id');
        var u = id ? usuario(id) : null;
        if (acao === 'novo') { estado.editando = 'novo'; desenhar(el, ctx); foco(el); }
        else if (acao === 'editar') { estado.editando = id; desenhar(el, ctx); foco(el); }
        else if (acao === 'cancelar') { estado.editando = null; desenhar(el, ctx); }
        else if (acao === 'senha' && u) {
          b.disabled = true;
          N.auth.redefinirSenha(u.email).then(function (r) { b.disabled = false; N.dom.toast(r.ok ? 'E-mail de redefinição enviado para ' + u.email + '.' : r.msg, r.ok ? 'ok' : 'erro'); });
        }
        else if (acao === 'bloquear' && u) {
          N.dom.dialogo({ titulo: 'Bloquear acesso', texto: 'Bloquear o acesso de "' + (u.nome || u.email) + '"? A pessoa perde o acesso na hora, inclusive se estiver com a plataforma aberta.',
            campos: [{ rotulo: 'Motivo (visível só para administradores)', valor: 'Fatura em aberto' }],
            botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Bloquear acesso', valor: true, tipo: 'danger' }] }).then(function (v) {
            if (!v) return;
            return N.auth.definirBloqueio(id, true, v[0]).then(function (r) {
              if (!r.ok) { N.dom.toast(r.msg, 'erro'); return; }
              N.dom.toast('Acesso bloqueado.');
              return render(el, ctx, true);
            });
          });
        }
        else if (acao === 'desbloquear' && u) {
          N.auth.definirBloqueio(id, false).then(function (r) {
            if (!r.ok) { N.dom.toast(r.msg, 'erro'); return; }
            N.dom.toast('Acesso desbloqueado.');
            return render(el, ctx, true);
          });
        }
        else if (acao === 'excluir' && u) {
          N.dom.confirmar('Excluir acesso', 'Excluir o acesso de "' + (u.nome || u.email) + '"? Essa pessoa deixa de acessar a plataforma na hora. Os dados dela continuam guardados na nuvem; a conta de login pode ser apagada no console do Firebase.', 'Excluir acesso', true).then(function (ok) {
            if (!ok) return;
            return N.auth.excluirUsuario(id).then(function (r2) {
              if (!r2.ok) { N.dom.toast(r2.msg, 'erro'); return; }
              if (estado.editando === id) estado.editando = null;
              N.dom.toast('Acesso excluído.');
              return render(el, ctx, true);
            });
          });
        }
      });
    });
    if (!form) return;
    N.auth.ligarOlhos(form);
    Array.prototype.forEach.call(form.querySelectorAll('input'), function (i) {
      i.addEventListener('input', function () {
        var f = i.closest('[data-campo]');
        if (!f) return;
        f.classList.remove('has-error');
        var e = f.querySelector('.nx-err'); if (e) e.textContent = '';
      });
      if (i.name === 'perfil') i.addEventListener('change', function () {
        Array.prototype.forEach.call(form.querySelectorAll('input[name="perfil"]'), function (x) { x.closest('.nx-seg-opt').classList.toggle('is-on', x.checked); });
        var mods = form.querySelector('.nx-usr-mods-campo');
        if (mods) mods.classList.toggle('is-admin', i.checked && i.value === 'admin');
      });
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = form.querySelector('[type="submit"]');
      var rot = btn.textContent;
      var perfil = form.querySelector('input[name="perfil"]:checked');
      var dados = { id: estado.editando === 'novo' ? null : estado.editando, nome: form.nome.value, email: form.email.value, perfil: perfil ? perfil.value : 'cliente',
        senha: form.senha ? form.senha.value : '', confirmacao: form.confirmacao ? form.confirmacao.value : '',
        modulos: Array.prototype.map.call(form.querySelectorAll('input[name="modulos"]:checked'), function (x) { return x.value; }) };
      btn.disabled = true; btn.textContent = 'Salvando…';
      N.auth.salvarUsuario(dados).then(function (r) {
        btn.disabled = false; btn.textContent = rot;
        if (!r.ok) { mostrarErros(form, r.erros || {}); return; }
        estado.editando = null;
        N.dom.toast(r.novo ? 'Acesso criado. O cliente já pode entrar com o e-mail e a senha informados.' : 'Acesso atualizado.');
        if (ctx && ctx.aoAlterar) ctx.aoAlterar();
        return render(el, ctx, true);
      });
    });
  }

  function foco(el) { var i = el.querySelector('#nx-usr-form input'); if (i) i.focus(); }

  N.shell.registrarPagina({
    id: 'usuarios',
    nome: 'Usuários',
    titulo: 'Usuários e acessos',
    icone: 'usuarios',
    perfil: 'admin',
    render: function (el, ctx) { if (ctx && ctx.trocou) estado.editando = null; render(el, ctx); }
  });
})(typeof window !== 'undefined' ? window : globalThis);

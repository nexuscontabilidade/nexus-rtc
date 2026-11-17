'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarNuvem, novoDispositivo, criarStore, logar, espera, ate, armazenamento } = require('./harness');

const SENHA = 'Senha12345';
const empresa = (nome) => ({ id: 'e_' + nome, razaoSocial: nome });

// ------------------------------------------------------------------ persistência
test('dados gravados chegam à nuvem e voltam em outro dispositivo (login em outro computador)', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);

  const pc1 = novoDispositivo(nuvem);
  const rtc1 = criarStore(pc1, 'rtc');
  assert.equal((await logar(pc1, 'ana@teste.com', SENHA)).ok, true);
  rtc1.data.empresas.push(empresa('Alfa'));
  rtc1.save();
  assert.ok(await ate(() => nuvem.escritas.length === 1), 'gravou na nuvem');
  assert.equal(pc1.N.sync.status(), 'ok');

  // outro computador, navegador limpo
  const pc2 = novoDispositivo(nuvem);
  const rtc2 = criarStore(pc2, 'rtc');
  assert.equal((await logar(pc2, 'ana@teste.com', SENHA)).ok, true);
  assert.equal(rtc2.data.empresas.length, 1);
  assert.equal(rtc2.data.empresas[0].razaoSocial, 'Alfa');
});

test('várias digitações seguidas viram um único envio (debounce) e o último valor vence', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const pc = novoDispositivo(nuvem, { atraso: 60 });
  const rtc = criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);
  for (let i = 0; i < 5; i++) { rtc.data.ui.n = i; rtc.saveNow(); }
  await ate(() => nuvem.escritas.length >= 1);
  await espera(150);
  assert.equal(nuvem.escritas.length, 1);
  assert.equal(JSON.parse(nuvem.stores.get([...nuvem.stores.keys()][0]).texto).ui.n, 4);
});

test('alteração feita durante um envio em andamento também é enviada', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const pc = novoDispositivo(nuvem, { atraso: 5 });
  const rtc = criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);
  const original = pc.backend.gravarStore;
  let primeira = true;
  pc.backend.gravarStore = function (...a) {
    const p = original.apply(this, a);
    if (primeira) { primeira = false; rtc.data.ui.durante = 'sim'; rtc.saveNow(); }   // muda enquanto envia
    return p;
  };
  rtc.data.ui.antes = 'sim'; rtc.saveNow();
  assert.ok(await ate(() => nuvem.escritas.length >= 2 && pc.N.sync.status() === 'ok'));
  const salvo = JSON.parse([...nuvem.stores.values()][0].texto);
  assert.equal(salvo.ui.antes, 'sim'); assert.equal(salvo.ui.durante, 'sim');
});

test('sem internet: nada se perde, fica pendente e é enviado quando a conexão volta', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const pc = novoDispositivo(nuvem);
  const rtc = criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);

  nuvem.falha = 'unavailable';
  rtc.data.empresas.push(empresa('Offline'));
  rtc.saveNow();
  assert.ok(await ate(() => pc.N.sync.status() === 'offline'));
  assert.equal(nuvem.escritas.length, 0);
  assert.ok(pc.N.sync.pendentes());
  const chave = pc.localStorage._chaves().find((k) => k.startsWith('nexus.cache.'));
  assert.ok(JSON.parse(pc.localStorage.getItem(chave)).dirty, 'cache local marcado como pendente');

  nuvem.falha = null;                                           // a internet volta
  assert.ok(await ate(() => pc.N.sync.status() === 'ok', 3000), 'reenvio automático');
  assert.equal(JSON.parse([...nuvem.stores.values()][0].texto).empresas[0].razaoSocial, 'Offline');
});

test('fechar o navegador com alterações pendentes: no próximo acesso elas são enviadas (cache do usuário)', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const ls = armazenamento();
  const pc1 = novoDispositivo(nuvem, { localStorage: ls });
  const rtc1 = criarStore(pc1, 'rtc');
  await logar(pc1, 'ana@teste.com', SENHA);
  nuvem.falha = 'unavailable';
  rtc1.data.empresas.push(empresa('Pendente'));
  rtc1.saveNow();
  await espera(50);

  // "fecha" o navegador (o localStorage sobrevive) e abre de novo, já com internet
  nuvem.falha = null;
  const pc2 = novoDispositivo(nuvem, { localStorage: ls });
  const rtc2 = criarStore(pc2, 'rtc');
  await logar(pc2, 'ana@teste.com', SENHA);
  assert.equal(rtc2.data.empresas[0].razaoSocial, 'Pendente', 'recuperou do cache');
  assert.ok(await ate(() => pc2.N.sync.status() === 'ok' && nuvem.escritas.length === 1));
});

test('abrir sem internet usa o cache do usuário; sem cache, não abre (não arrisca sobrescrever a nuvem)', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const ls = armazenamento();
  const pc1 = novoDispositivo(nuvem, { localStorage: ls });
  const rtc1 = criarStore(pc1, 'rtc');
  await logar(pc1, 'ana@teste.com', SENHA);
  nuvem.falha = 'unavailable';
  rtc1.data.empresas.push(empresa('Cache'));
  rtc1.saveNow();
  await espera(30);

  const pc2 = novoDispositivo(nuvem, { localStorage: ls });
  const rtc2 = criarStore(pc2, 'rtc');
  const r = await logar(pc2, 'ana@teste.com', SENHA);
  assert.equal(r.ok, true, 'abre offline com cache');
  assert.equal(rtc2.data.empresas[0].razaoSocial, 'Cache');

  const pc3 = novoDispositivo(nuvem);                           // navegador novo, sem cache e sem internet
  criarStore(pc3, 'rtc');
  const r3 = await logar(pc3, 'ana@teste.com', SENHA);
  assert.equal(r3.ok, false);
});

// ------------------------------------------------------------------ isolamento entre clientes
test('ISOLAMENTO: dois clientes no mesmo navegador não veem os dados um do outro', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  nuvem.novoCliente('bia@teste.com', SENHA);
  const ls = armazenamento();

  const a = novoDispositivo(nuvem, { localStorage: ls });
  const rtcA = criarStore(a, 'rtc');
  await logar(a, 'ana@teste.com', SENHA);
  rtcA.data.empresas.push(empresa('SegredoDaAna'));
  rtcA.saveNow();
  assert.ok(await ate(() => nuvem.escritas.length === 1));
  await a.N.auth.sair();                                       // sai: cache da Ana é apagado

  const b = novoDispositivo(nuvem, { localStorage: ls });
  const rtcB = criarStore(b, 'rtc');
  await logar(b, 'bia@teste.com', SENHA);
  assert.equal(rtcB.data.empresas.length, 0, 'Bia começa vazia');
  rtcB.data.empresas.push(empresa('DaBia'));
  rtcB.saveNow();
  assert.ok(await ate(() => nuvem.escritas.length === 2));

  const todos = ls._chaves().map((k) => ls.getItem(k)).join('\n');
  assert.ok(!todos.includes('SegredoDaAna'), 'nada da Ana ficou no navegador');
  // na nuvem, cada um tem o seu caminho
  const donos = [...nuvem.stores.keys()];
  assert.equal(donos.length, 2);
  assert.ok(donos.every((k, i, arr) => arr.filter((x) => x.split('/')[0] === k.split('/')[0]).length === 1));
});

test('ISOLAMENTO: a chave local compartilhada nunca é usada com a nuvem ligada (nem após sair)', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const ls = armazenamento();
  const pc = novoDispositivo(nuvem, { localStorage: ls });
  pc.N.sync.exigeNuvem = true;
  const rtc = criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);
  rtc.data.empresas.push(empresa('X'));
  rtc.save();                                                  // fica um temporizador pendente...
  await pc.N.sync.desativar({ limpar: true });                 // ...e o usuário sai antes dele disparar
  await espera(400);
  assert.equal(ls.getItem('nexus.rtc.v1'), null, 'nada vazou para a chave compartilhada');
});

test('ao sair com tudo enviado, o cache local é apagado; com envio impossível, é preservado', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const ls = armazenamento();
  const pc = novoDispositivo(nuvem, { localStorage: ls });
  const rtc = criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);
  rtc.data.empresas.push(empresa('Limpo')); rtc.saveNow();
  await pc.N.sync.desativar({ limpar: true });
  assert.equal(ls._chaves().filter((k) => k.startsWith('nexus.cache.')).length, 0);

  const pc2 = novoDispositivo(nuvem, { localStorage: ls });
  const rtc2 = criarStore(pc2, 'rtc');
  await logar(pc2, 'ana@teste.com', SENHA);
  nuvem.falha = 'unavailable';
  rtc2.data.empresas.push(empresa('NaoEnviado')); rtc2.saveNow();
  const r = await pc2.N.sync.desativar({ limpar: true, limiteMs: 200 });
  assert.equal(r.pendente, true);
  assert.equal(ls._chaves().filter((k) => k.startsWith('nexus.cache.')).length, 1, 'cache pendente preservado para não perder dados');
});

// ------------------------------------------------------------------ concorrência entre dispositivos
test('CONFLITO: dispositivo desatualizado não sobrescreve a nuvem; o usuário escolhe e a versão descartada vira backup', async () => {
  for (const escolha of ['nuvem', 'local']) {
    const nuvem = criarNuvem();
    nuvem.novoCliente('ana@teste.com', SENHA);
    const A = novoDispositivo(nuvem, { conflito: escolha }), B = novoDispositivo(nuvem, { conflito: escolha });
    const rtcA = criarStore(A, 'rtc'), rtcB = criarStore(B, 'rtc');
    await logar(A, 'ana@teste.com', SENHA); await logar(B, 'ana@teste.com', SENHA);

    rtcA.data.empresas.push(empresa('DoA')); rtcA.saveNow();
    assert.ok(await ate(() => nuvem.escritas.length === 1));
    rtcB.data.empresas.push(empresa('DoB')); rtcB.saveNow();   // B ainda estava na revisão 0
    assert.ok(await ate(() => B.eventos.dialogos.length >= 1 && B.N.sync.status() !== 'conflito', 3000), 'conflito detectado e resolvido');

    const nuvemTexto = JSON.parse([...nuvem.stores.values()][0].texto);
    const bkp = B.localStorage._chaves().find((k) => k.startsWith('nexus.backup.'));
    assert.ok(bkp, 'a versão descartada ficou como backup');
    if (escolha === 'nuvem') {
      assert.equal(nuvemTexto.empresas.length, 1); assert.equal(nuvemTexto.empresas[0].razaoSocial, 'DoA');
      assert.equal(rtcB.data.empresas[0].razaoSocial, 'DoA', 'B passou a mostrar a nuvem');
      assert.ok(JSON.parse(B.localStorage.getItem(bkp)).texto.includes('DoB'));
    } else {
      assert.equal(nuvemTexto.empresas[0].razaoSocial, 'DoB', 'a escolha explícita do usuário sobrescreve');
      assert.ok(JSON.parse(B.localStorage.getItem(bkp)).texto.includes('DoA'));
    }
  }
});

test('CONFLITO na abertura: cache com pendência + nuvem mais nova em outro dispositivo', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const ls = armazenamento();
  const A = novoDispositivo(nuvem, { localStorage: ls });
  const rtcA = criarStore(A, 'rtc');
  await logar(A, 'ana@teste.com', SENHA);
  nuvem.falha = 'unavailable';
  rtcA.data.empresas.push(empresa('LocalPendente')); rtcA.saveNow();
  await espera(40);
  A.N.sync._reset();                                            // o navegador é fechado: nada mais é reenviado
  nuvem.falha = null;

  const B = novoDispositivo(nuvem);                             // outro computador grava antes
  const rtcB = criarStore(B, 'rtc');
  await logar(B, 'ana@teste.com', SENHA);
  rtcB.data.empresas.push(empresa('DoOutroPC')); rtcB.saveNow();
  assert.ok(await ate(() => nuvem.escritas.length === 1));

  const A2 = novoDispositivo(nuvem, { localStorage: ls, conflito: 'nuvem' });
  const rtcA2 = criarStore(A2, 'rtc');
  await logar(A2, 'ana@teste.com', SENHA);
  assert.ok(A2.eventos.dialogos.some((d) => d[0] === 'dialogo'), 'perguntou ao usuário');
  assert.equal(rtcA2.data.empresas[0].razaoSocial, 'DoOutroPC');
  assert.ok(A2.localStorage._chaves().some((k) => k.startsWith('nexus.backup.')), 'pendência local preservada como backup');
});

// ------------------------------------------------------------------ migração dos dados antigos do navegador
test('MIGRAÇÃO: dados antigos do navegador só entram na conta com autorização, e a chave antiga é removida após o envio', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const ls = armazenamento();
  ls.setItem('nexus.rtc.v1', JSON.stringify({ versao: 1, empresas: [empresa('Antiga')], ui: {} }));

  const pc = novoDispositivo(nuvem, { localStorage: ls, migrar: true });
  const rtc = criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);
  assert.ok(pc.eventos.dialogos.some((d) => d[0] === 'confirmar'));
  assert.equal(rtc.data.empresas[0].razaoSocial, 'Antiga');
  assert.ok(await ate(() => nuvem.escritas.length === 1));
  assert.ok(await ate(() => ls.getItem('nexus.rtc.v1') === null), 'chave antiga removida depois de enviada');
});

test('MIGRAÇÃO recusada: conta começa vazia, dados antigos ficam intactos e a pergunta não se repete', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const ls = armazenamento();
  ls.setItem('nexus.rtc.v1', JSON.stringify({ versao: 1, empresas: [empresa('Antiga')], ui: {} }));
  const pc = novoDispositivo(nuvem, { localStorage: ls, migrar: false });
  const rtc = criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);
  assert.equal(rtc.data.empresas.length, 0);
  assert.ok(ls.getItem('nexus.rtc.v1'), 'dados antigos preservados');
  await pc.N.sync.desativar();
  const pc2 = novoDispositivo(nuvem, { localStorage: ls, migrar: true });
  criarStore(pc2, 'rtc');
  await logar(pc2, 'ana@teste.com', SENHA);
  assert.equal(pc2.eventos.dialogos.filter((d) => d[0] === 'confirmar').length, 0, 'não pergunta de novo');
});

test('MIGRAÇÃO: conta que já tem dados na nuvem nunca é sobrescrita pelos dados antigos', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const pc1 = novoDispositivo(nuvem);
  const r1 = criarStore(pc1, 'rtc');
  await logar(pc1, 'ana@teste.com', SENHA);
  r1.data.empresas.push(empresa('NaNuvem')); r1.saveNow();
  await ate(() => nuvem.escritas.length === 1);

  const ls = armazenamento();
  ls.setItem('nexus.rtc.v1', JSON.stringify({ versao: 1, empresas: [empresa('Antiga')], ui: {} }));
  const pc2 = novoDispositivo(nuvem, { localStorage: ls, migrar: true });
  const r2 = criarStore(pc2, 'rtc');
  await logar(pc2, 'ana@teste.com', SENHA);
  assert.equal(r2.data.empresas[0].razaoSocial, 'NaNuvem');
  assert.equal(pc2.eventos.dialogos.length, 0);
});

// ------------------------------------------------------------------ módulos liberados
test('MÓDULOS: cliente só com "lucro" não carrega nem grava o módulo RTC', async () => {
  const nuvem = criarNuvem();
  const uid = nuvem.novoCliente('ana@teste.com', SENHA, { modulos: ['lucro'] });
  // dado do RTC existente na nuvem (de quando o módulo estava liberado) — não pode ser lido
  nuvem.stores.set(uid + '/rtc', { rev: 1, texto: JSON.stringify({ versao: 1, empresas: [empresa('Secreta')], ui: {} }) });
  const pc = novoDispositivo(nuvem);
  const rtc = criarStore(pc, 'rtc'), lucro = criarStore(pc, 'lucro');
  assert.equal((await logar(pc, 'ana@teste.com', SENHA)).ok, true);
  assert.equal(rtc.data.empresas.length, 0, 'RTC não foi carregado');
  rtc.data.empresas.push(empresa('Tentativa')); rtc.saveNow();
  lucro.data.empresas.push(empresa('Lucro')); lucro.saveNow();
  await ate(() => nuvem.escritas.length === 1);
  await espera(100);
  assert.deepEqual(nuvem.escritas.map((e) => e.id), ['lucro']);
  assert.ok(JSON.parse(nuvem.stores.get(uid + '/rtc').texto).empresas[0].razaoSocial === 'Secreta', 'RTC na nuvem intacto');
});

// ------------------------------------------------------------------ bloqueio e perfil
test('BLOQUEIO: cliente bloqueado não abre a plataforma; sem perfil também não', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('dev@teste.com', SENHA, { bloqueado: true, motivoBloqueio: 'Fatura em aberto' });
  nuvem.criarContaDireta('semperfil@teste.com', SENHA);
  const pc = novoDispositivo(nuvem);
  criarStore(pc, 'rtc');
  const r = await logar(pc, 'dev@teste.com', SENHA);
  assert.equal(r.ok, false); assert.match(r.msg, /bloqueado/i);
  assert.equal(pc.N.auth.atual(), null);
  assert.equal(pc.N.sync.ativo(), false, 'nada foi carregado');
  await pc.backend.sair();
  const r2 = await logar(pc, 'semperfil@teste.com', SENHA);
  assert.equal(r2.ok, false); assert.match(r2.msg, /não tem acesso/i);
});

test('BLOQUEIO em tempo real: administrador bloqueia e a sessão aberta é encerrada; dados deixam de ser aceitos', async () => {
  const nuvem = criarNuvem();
  const uid = nuvem.novoCliente('ana@teste.com', SENHA);
  nuvem.novoAdmin('adm@teste.com', SENHA);
  const pc = novoDispositivo(nuvem);
  const rtc = criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);
  const adm = novoDispositivo(nuvem);
  await logar(adm, 'adm@teste.com', SENHA);

  const antes = pc.eventos.recarregou;
  const r = await adm.N.auth.definirBloqueio(uid, true, 'Fatura em aberto');
  assert.equal(r.ok, true);
  pc.backend.notificarPerfil(uid);                              // o listener do navegador do cliente dispara
  assert.ok(await ate(() => pc.eventos.recarregou > antes), 'cliente foi expulso');
  assert.match(pc.sessionStorage.getItem('nexus.aviso') || '', /bloqueado/i, 'aviso exibido no login');
  rtc.data.empresas.push(empresa('X')); rtc.saveNow();
  await espera(100);
  assert.equal(nuvem.escritas.length, 0, 'bloqueado não grava');

  await adm.N.auth.definirBloqueio(uid, false);                // desbloqueado volta a entrar
  const pc2 = novoDispositivo(nuvem); criarStore(pc2, 'rtc');
  assert.equal((await logar(pc2, 'ana@teste.com', SENHA)).ok, true);
});

test('PERMISSÃO NEGADA ao gravar: confere o perfil e expulsa se foi bloqueado/removido', async () => {
  const nuvem = criarNuvem();
  const uid = nuvem.novoCliente('ana@teste.com', SENHA);
  const pc = novoDispositivo(nuvem);
  const rtc = criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);
  nuvem.perfis.get(uid).bloqueado = true;                       // bloqueio feito sem o listener ter avisado
  const antes = pc.eventos.recarregou;
  rtc.data.empresas.push(empresa('X')); rtc.saveNow();
  assert.ok(await ate(() => pc.eventos.recarregou > antes), 'sessão encerrada');
  assert.match(pc.sessionStorage.getItem('nexus.aviso') || '', /bloqueado/i);
  assert.equal(nuvem.escritas.length, 0);
});

test('mudança de módulos pelo administrador recarrega a sessão do cliente', async () => {
  const nuvem = criarNuvem();
  const uid = nuvem.novoCliente('ana@teste.com', SENHA, { modulos: ['rtc'] });
  const pc = novoDispositivo(nuvem);
  criarStore(pc, 'rtc');
  await logar(pc, 'ana@teste.com', SENHA);
  assert.equal(pc.N.auth.acessaModulo('lucro'), false);
  nuvem.perfis.get(uid).modulos = ['rtc', 'lucro'];
  pc.backend.notificarPerfil(uid);
  assert.ok(await ate(() => pc.N.auth.acessaModulo('lucro')));
  assert.ok(await ate(() => pc.eventos.recarregou > 0, 2500));
});

// ------------------------------------------------------------------ gestão de acessos
test('ADMIN: cria cliente (conta + perfil), valida entradas e protege contra ficar sem administrador', async () => {
  const nuvem = criarNuvem();
  const admUid = nuvem.novoAdmin('adm@teste.com', SENHA);
  const pc = novoDispositivo(nuvem);
  await logar(pc, 'adm@teste.com', SENHA);
  const A = pc.N.auth;

  const ruim = await A.salvarUsuario({ nome: 'X', email: 'invalido', perfil: 'cliente', senha: '123', confirmacao: '1', modulos: [] });
  assert.equal(ruim.ok, false); assert.ok(ruim.erros.nome && ruim.erros.email && ruim.erros.senha && ruim.erros.modulos);

  const r = await A.salvarUsuario({ nome: 'Cliente Novo', email: 'Novo@Teste.com', perfil: 'cliente', senha: 'Senha12345', confirmacao: 'Senha12345', modulos: ['lucro'] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const perfil = nuvem.perfis.get(r.usuario.id);
  assert.equal(perfil.email, 'novo@teste.com'); assert.deepEqual(perfil.modulos, ['lucro']); assert.equal(perfil.bloqueado, false); assert.equal(perfil.perfil, 'cliente');
  assert.ok(nuvem.contas.has('novo@teste.com'));
  assert.ok(!JSON.stringify([...nuvem.perfis.values()]).includes('Senha12345'), 'senha nunca vai para o perfil');

  const dup = await A.salvarUsuario({ nome: 'Outro', email: 'novo@teste.com', perfil: 'cliente', senha: 'Senha12345', confirmacao: 'Senha12345', modulos: ['rtc'] });
  assert.equal(dup.ok, false); assert.ok(dup.erros.email);

  assert.equal((await A.definirBloqueio(admUid, true, 'x')).ok, false, 'não bloqueia a si mesmo');
  assert.equal((await A.excluirUsuario(admUid)).ok, false, 'não exclui a si mesmo');
  const ed = await A.salvarUsuario({ id: admUid, nome: 'Admin', perfil: 'cliente' });
  assert.equal(ed.ok, false, 'não rebaixa a si mesmo');
  assert.equal(nuvem.perfis.get(admUid).perfil, 'admin');

  const ed2 = await A.salvarUsuario({ id: r.usuario.id, nome: 'Cliente Editado', perfil: 'cliente', modulos: ['rtc', 'lucro'] });
  assert.equal(ed2.ok, true);
  assert.deepEqual(nuvem.perfis.get(r.usuario.id).modulos, ['rtc', 'lucro']);
  assert.equal(nuvem.perfis.get(r.usuario.id).email, 'novo@teste.com', 'e-mail (login) não muda na edição');

  assert.equal((await A.excluirUsuario(r.usuario.id)).ok, true);
  assert.equal(nuvem.perfis.has(r.usuario.id), false);
});

test('ADMIN: cliente comum não consegue gerenciar acessos nem listar usuários', async () => {
  const nuvem = criarNuvem();
  const alvo = nuvem.novoCliente('vitima@teste.com', SENHA);
  nuvem.novoCliente('ana@teste.com', SENHA);
  const pc = novoDispositivo(nuvem);
  await logar(pc, 'ana@teste.com', SENHA);
  const A = pc.N.auth;
  assert.equal(pc.N.auth.ehAdmin(), false);
  await assert.rejects(A.listar());
  assert.equal((await A.salvarUsuario({ nome: 'Hack', email: 'h@teste.com', perfil: 'admin', senha: 'Senha12345', confirmacao: 'Senha12345' })).ok, false);
  assert.equal((await A.definirBloqueio(alvo, true, 'x')).ok, false);
  assert.equal((await A.excluirUsuario(alvo)).ok, false);
  // mesmo burlando as verificações do código, o backend (regras) recusa
  await assert.rejects(pc.backend.atualizarPerfil(nuvem.contas.get('ana@teste.com').uid, { perfil: 'admin' }));
  await assert.rejects(pc.backend.lerStore(alvo, 'rtc'), 'não lê dados de outro usuário');
  await assert.rejects(pc.backend.gravarStore(alvo, 'rtc', 0, '{}'), 'não grava em dados de outro usuário');
});

test('ADMIN não lê os dados dos clientes', async () => {
  const nuvem = criarNuvem();
  const uid = nuvem.novoCliente('ana@teste.com', SENHA);
  nuvem.novoAdmin('adm@teste.com', SENHA);
  nuvem.stores.set(uid + '/rtc', { rev: 1, texto: '{"empresas":[]}' });
  const adm = novoDispositivo(nuvem);
  await logar(adm, 'adm@teste.com', SENHA);
  await assert.rejects(adm.backend.lerStore(uid, 'rtc'));
});

test('redefinição de senha: resposta neutra e e-mail inválido recusado', async () => {
  const nuvem = criarNuvem();
  const pc = novoDispositivo(nuvem);
  assert.equal((await pc.N.auth.redefinirSenha('nao-e-email')).ok, false);
  const r = await pc.N.auth.redefinirSenha('qualquer@teste.com');
  assert.equal(r.ok, true); assert.match(r.msg, /Se o e-mail estiver cadastrado/);
});

test('login: credenciais erradas dão mensagem genérica (não revela se o e-mail existe)', async () => {
  const nuvem = criarNuvem();
  nuvem.novoCliente('ana@teste.com', SENHA);
  const pc = novoDispositivo(nuvem);
  const a = await pc.N.auth.entrar('ana@teste.com', 'errada123', false);
  const b = await pc.N.auth.entrar('naoexiste@teste.com', 'qualquer123', false);
  assert.equal(a.ok, false); assert.equal(a.msg, b.msg);
});

test('política de senha', () => {
  const { N } = novoDispositivo(criarNuvem());
  assert.ok(N.auth.validarSenha('curta1'));
  assert.ok(N.auth.validarSenha('somenteletras'));
  assert.ok(N.auth.validarSenha('12345678'));
  assert.equal(N.auth.validarSenha('Senha12345'), '');
});

// ------------------------------------------------------------------ documentos grandes
test('partição de dados grandes: cada pedaço cabe no limite do Firestore e a junção recompõe o original', () => {
  const { N } = novoDispositivo(criarNuvem());
  vmCarregarNuvem(N);
  const grande = JSON.stringify({ x: 'ação—ü€'.repeat(120000) });   // ~720 mil caracteres, com acentos
  const partes = N.nuvem._partir(grande);
  assert.ok(partes.length > 1);
  assert.ok(partes.every((p) => p.length <= N.nuvem.TAM_PARTE));
  assert.ok(partes.every((p) => Buffer.byteLength(p, 'utf8') < 1048576 * 0.5), 'bem abaixo de 1 MiB por documento');
  assert.equal(partes.join(''), grande);
  assert.equal(JSON.stringify(N.nuvem._partir('')), '[""]');
});

function vmCarregarNuvem(N) {
  const vm = require('vm'); const fs = require('fs'); const path = require('path');
  const g = { Nexus: {}, Promise, JSON, Error, Date, Math, setTimeout };
  g.window = g; vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'src/core/nuvem.js'), 'utf8'), g);
  N.nuvem = g.Nexus.nuvem;
}

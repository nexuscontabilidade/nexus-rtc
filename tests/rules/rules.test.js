/*
 * Testes das regras de segurança do Firestore (firestore.rules) no Firebase Emulator Suite.
 * Como rodar (precisa de Java 11+ e do firebase-tools): veja tests/rules/LEIA-ME.md
 *   cd tests/rules && npm install && npm test
 */
'use strict';
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const ADMIN = 'uid_admin', ANA = 'uid_ana', BIA = 'uid_bia', BLOQ = 'uid_bloqueado', SOLO_LUCRO = 'uid_lucro', SEM_PERFIL = 'uid_sem_perfil', ADMIN2 = 'uid_admin2';
let env;

const perfil = (o) => Object.assign({ nome: 'Fulano', email: 'fulano@teste.com', perfil: 'cliente', modulos: null, bloqueado: false }, o || {});
const dbDe = (uid) => env.authenticatedContext(uid).firestore();
const meta = (rev) => ({ rev, partes: 1, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() });

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-nexus-rules', firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
});
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('users/' + ADMIN).set(perfil({ nome: 'Admin', email: 'adm@teste.com', perfil: 'admin' }));
    await db.doc('users/' + ADMIN2).set(perfil({ nome: 'Admin Dois', email: 'adm2@teste.com', perfil: 'admin' }));
    await db.doc('users/' + ANA).set(perfil({ nome: 'Ana', email: 'ana@teste.com' }));
    await db.doc('users/' + BIA).set(perfil({ nome: 'Bia', email: 'bia@teste.com' }));
    await db.doc('users/' + BLOQ).set(perfil({ nome: 'Bloq', email: 'b@teste.com', bloqueado: true }));
    await db.doc('users/' + SOLO_LUCRO).set(perfil({ nome: 'Lucro', email: 'l@teste.com', modulos: ['lucro'] }));
    await db.doc(`users/${ANA}/stores/rtc`).set({ rev: 1, partes: 1, atualizadoEm: new Date() });
    await db.doc(`users/${ANA}/stores/rtc/partes/0`).set({ rev: 1, texto: '{"empresas":[]}' });
  });
});

// ---------------------------------------------------------------- isolamento de dados
test('cliente lê e grava os próprios dados', async () => {
  const db = dbDe(ANA);
  await assertSucceeds(db.doc(`users/${ANA}/stores/rtc`).get());
  await assertSucceeds(db.doc(`users/${ANA}/stores/rtc/partes/0`).get());
  await assertSucceeds(db.doc(`users/${ANA}/stores/lucro`).set(meta(1)));
  await assertSucceeds(db.doc(`users/${ANA}/stores/lucro/partes/0`).set({ rev: 1, texto: '{}' }));
});

test('cliente NÃO lê nem grava os dados de outro cliente', async () => {
  const db = dbDe(BIA);
  await assertFails(db.doc(`users/${ANA}/stores/rtc`).get());
  await assertFails(db.doc(`users/${ANA}/stores/rtc/partes/0`).get());
  await assertFails(db.doc(`users/${ANA}/stores/rtc/partes/0`).set({ rev: 2, texto: 'invadido' }));
  await assertFails(db.doc(`users/${ANA}/stores/rtc`).set(meta(2)));
  await assertFails(db.collection(`users/${ANA}/stores`).get());
});

test('administrador NÃO lê dados de clientes', async () => {
  const db = dbDe(ADMIN);
  await assertFails(db.doc(`users/${ANA}/stores/rtc`).get());
  await assertFails(db.doc(`users/${ANA}/stores/rtc/partes/0`).get());
});

test('visitante sem login não acessa nada', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(db.doc(`users/${ANA}`).get());
  await assertFails(db.doc(`users/${ANA}/stores/rtc`).get());
  await assertFails(db.collection('users').get());
});

test('conta autenticada mas sem perfil cadastrado não acessa dados', async () => {
  const db = dbDe(SEM_PERFIL);
  await assertFails(db.doc(`users/${SEM_PERFIL}/stores/rtc`).set(meta(1)));
  await assertFails(db.doc(`users/${SEM_PERFIL}`).set(perfil({ perfil: 'admin' })));
});

test('cliente bloqueado perde leitura e escrita dos próprios dados', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc(`users/${BLOQ}/stores/rtc`).set({ rev: 1, partes: 1, atualizadoEm: new Date() }); });
  const db = dbDe(BLOQ);
  await assertFails(db.doc(`users/${BLOQ}/stores/rtc`).get());
  await assertFails(db.doc(`users/${BLOQ}/stores/lucro`).set(meta(1)));
  await assertSucceeds(db.doc(`users/${BLOQ}`).get());          // lê o próprio perfil para exibir o aviso de bloqueio
});

test('módulos: cliente só com "lucro" não acessa o módulo "rtc"', async () => {
  const db = dbDe(SOLO_LUCRO);
  await assertSucceeds(db.doc(`users/${SOLO_LUCRO}/stores/lucro`).set(meta(1)));
  await assertFails(db.doc(`users/${SOLO_LUCRO}/stores/rtc`).set(meta(1)));
  await assertFails(db.doc(`users/${SOLO_LUCRO}/stores/rtc`).get());
});

test('módulos desconhecidos e caminhos fora do modelo são negados', async () => {
  const db = dbDe(ANA);
  await assertFails(db.doc(`users/${ANA}/stores/outro`).set(meta(1)));
  await assertFails(db.doc(`users/${ANA}/qualquer/x`).set({ a: 1 }));
  await assertFails(db.doc('config/x').get());
});

// ---------------------------------------------------------------- integridade da gravação
test('revisão só sobe de 1 em 1 (impede sobrescrita por dispositivo desatualizado)', async () => {
  const db = dbDe(ANA);
  await assertFails(db.doc(`users/${ANA}/stores/rtc`).set(meta(1)));       // repetir a revisão atual
  await assertFails(db.doc(`users/${ANA}/stores/rtc`).set(meta(5)));       // pular revisões
  await assertSucceeds(db.doc(`users/${ANA}/stores/rtc`).set(meta(2)));
  await assertFails(db.doc(`users/${ANA}/stores/lucro`).set(meta(2)));     // criação precisa começar em 1
});

test('formato dos documentos de dados é validado (tamanho, campos extras, partes)', async () => {
  const db = dbDe(ANA);
  const p = (n) => db.doc(`users/${ANA}/stores/rtc/partes/${n}`);
  await assertSucceeds(p(1).set({ rev: 2, texto: 'x'.repeat(450000) }));
  await assertFails(p(2).set({ rev: 2, texto: 'x'.repeat(450001) }));
  await assertFails(p(3).set({ rev: 2, texto: 'ok', extra: 1 }));
  await assertFails(p(4).set({ rev: 2, texto: 123 }));
  await assertFails(p('abc').set({ rev: 2, texto: 'ok' }));
  await assertFails(db.doc(`users/${ANA}/stores/rtc`).set({ rev: 2, partes: 999, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() }));
  await assertFails(db.doc(`users/${ANA}/stores/rtc`).set({ rev: 2, partes: 1, atualizadoEm: new Date('2020-01-01') }));   // data forjada
  await assertFails(db.doc(`users/${ANA}/stores/rtc`).delete());
});

// ---------------------------------------------------------------- perfis e privilégios
test('cliente NÃO consegue virar administrador, liberar módulos nem se desbloquear', async () => {
  const db = dbDe(ANA);
  await assertFails(db.doc(`users/${ANA}`).update({ perfil: 'admin' }));
  await assertFails(db.doc(`users/${ANA}`).update({ modulos: ['rtc', 'lucro'] }));
  await assertFails(db.doc(`users/${ANA}`).update({ nome: 'Novo Nome' }));
  await assertFails(db.doc(`users/${ANA}`).delete());
  const b = dbDe(BLOQ);
  await assertFails(b.doc(`users/${BLOQ}`).update({ bloqueado: false }));
});

test('cliente NÃO lê o perfil de outras pessoas nem lista usuários', async () => {
  const db = dbDe(ANA);
  await assertSucceeds(db.doc(`users/${ANA}`).get());
  await assertFails(db.doc(`users/${BIA}`).get());
  await assertFails(db.collection('users').get());
  await assertFails(db.doc(`users/${BIA}`).update({ bloqueado: true }));
});

test('ninguém cria o próprio perfil (nem como administrador)', async () => {
  const db = dbDe(SEM_PERFIL);
  await assertFails(db.doc(`users/${SEM_PERFIL}`).set(perfil({ perfil: 'admin' })));
  await assertFails(dbDe(ANA).doc(`users/${ANA}x`).set(perfil()));
});

test('administrador lista, cria, edita, bloqueia e remove outros perfis', async () => {
  const db = dbDe(ADMIN);
  await assertSucceeds(db.collection('users').get());
  await assertSucceeds(db.doc(`users/${BIA}`).get());
  await assertSucceeds(db.doc('users/uid_novo').set(perfil({ nome: 'Novo', email: 'novo@teste.com', modulos: ['rtc'] })));
  await assertSucceeds(db.doc(`users/${ANA}`).update({ modulos: ['lucro'], nome: 'Ana Editada' }));
  await assertSucceeds(db.doc(`users/${ANA}`).update({ bloqueado: true, motivoBloqueio: 'Fatura em aberto', bloqueadoEm: new Date().toISOString() }));
  await assertSucceeds(db.doc(`users/${ADMIN2}`).update({ perfil: 'cliente' }));
  await assertSucceeds(db.doc(`users/${BIA}`).delete());
});

test('administrador não se rebaixa, não se bloqueia, não se apaga e não muda e-mail alheio', async () => {
  const db = dbDe(ADMIN);
  await assertFails(db.doc(`users/${ADMIN}`).update({ perfil: 'cliente' }));
  await assertFails(db.doc(`users/${ADMIN}`).update({ bloqueado: true }));
  await assertFails(db.doc(`users/${ADMIN}`).delete());
  await assertSucceeds(db.doc(`users/${ADMIN}`).update({ nome: 'Admin Renomeado' }));
  await assertFails(db.doc(`users/${ANA}`).update({ email: 'outro@teste.com' }));
});

test('administrador bloqueado perde os poderes', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc(`users/${ADMIN2}`).update({ bloqueado: true }); });
  const db = dbDe(ADMIN2);
  await assertFails(db.collection('users').get());
  await assertFails(db.doc(`users/${ANA}`).update({ bloqueado: true }));
});

test('perfil inválido é recusado (campos extras, perfil/módulo desconhecido, nome curto)', async () => {
  const db = dbDe(ADMIN);
  await assertFails(db.doc('users/u1').set(perfil({ extra: 'x' })));
  await assertFails(db.doc('users/u2').set(perfil({ perfil: 'superadmin' })));
  await assertFails(db.doc('users/u3').set(perfil({ modulos: ['rtc', 'financeiro'] })));
  await assertFails(db.doc('users/u4').set(perfil({ modulos: [] })));
  await assertFails(db.doc('users/u5').set(perfil({ nome: 'X' })));
  await assertFails(db.doc('users/u6').set(perfil({ bloqueado: 'nao' })));
});

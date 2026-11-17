# Banco de dados na nuvem (Firebase) — configuração, segurança e operação

A plataforma usa o projeto Firebase **nexus-rtc**:

- **Firebase Authentication** (e-mail e senha): login. As senhas ficam no Google (hash forte); a Nexus nunca as vê.
- **Cloud Firestore**: perfis de acesso e dados de cada cliente.
- **Regras de segurança** (`firestore.rules`): é onde a segurança realmente acontece, no servidor.

## 1. Como os dados são organizados

```
users/{uid}                          perfil: nome, email, perfil (admin|cliente), modulos (null = todos), bloqueado, motivoBloqueio...
users/{uid}/stores/{rtc|lucro}       cabeçalho do módulo: { rev, partes, atualizadoEm }
users/{uid}/stores/{id}/partes/{n}   conteúdo (JSON) em pedaços de até 150 mil caracteres
```

| Quem | O que pode |
|---|---|
| **Cliente** | Ler o próprio perfil. Ler e gravar **somente** `users/{seu uid}/stores/...`, e só dos módulos liberados. Não altera o próprio perfil, módulos nem bloqueio. |
| **Administrador** | Listar, criar, editar, bloquear e excluir perfis de **outras** pessoas. **Não lê dados de clientes.** Não pode rebaixar, bloquear ou apagar a si mesmo. |
| **Cliente bloqueado** | Perde leitura e escrita dos dados **na hora** (as regras checam `bloqueado` a cada operação). Uma sessão aberta é encerrada em segundos e vê o aviso de bloqueio. |
| **Conta sem perfil** | Nada. Qualquer pessoa pode criar uma conta de login na API pública do Firebase, mas sem um documento `users/{uid}` criado por um administrador ela não acessa nenhum dado. |
| **Qualquer outro caminho** | Negado. |

## 2. Persistência (o que acontece quando o cliente trabalha)

1. Cada alteração vai primeiro para o cache do navegador **daquele usuário** (`nexus.cache.<uid>.<módulo>`) e, ~1,5 s depois, para o Firestore, em segundo plano. A barra lateral mostra a situação: *Salvando…*, *Salvo na nuvem*, *Sem conexão…*.
2. **Sem internet**: nada se perde. A alteração fica marcada como pendente e é reenviada quando a conexão volta (ou no próximo acesso). O sistema abre offline se houver cache daquele usuário.
3. **Dois dispositivos ao mesmo tempo**: cada módulo tem uma revisão (`rev`). Uma gravação só é aceita se a nuvem ainda estiver na revisão que o dispositivo conhece (transação no servidor + regra que exige `rev + 1`). Se não, o usuário escolhe qual versão manter; a descartada fica como backup no navegador (`nexus.backup.<uid>.<módulo>`) até o usuário sair da plataforma.
4. **Sair**: envia o que estiver pendente e apaga o cache e os backups do usuário naquele navegador (computador compartilhado). Se o envio não for possível, o cache é preservado para não perder dados.
5. **Dados antigos** (salvos no navegador antes da nuvem): no primeiro login de cada conta a plataforma pergunta se deseja importá-los. Só entram com autorização, nunca sobrescrevem dados que já existam na nuvem, e a cópia antiga é apagada depois do envio.
6. Limite: ~9 milhões de caracteres de JSON por módulo (60 partes). Muito acima do uso esperado.

## 3. Configuração inicial (uma vez)

Faça no [console do Firebase](https://console.firebase.google.com/) → projeto **nexus-rtc**.

### 3.1 Ativar o login
**Authentication → Sign-in method → E-mail/senha → Ativar.**
Em **Authentication → Settings → Authorized domains**, deixe só os domínios onde o site roda (ex.: `nexus-rtc.web.app` e o domínio próprio). `localhost` é só para desenvolvimento.

### 3.2 Criar o banco
**Firestore Database → Criar banco de dados** → modo **produção** → região **southamerica-east1 (São Paulo)** (a região não pode ser mudada depois).

### 3.3 Publicar as regras
Opção A — console: **Firestore → Regras →** cole o conteúdo de `firestore.rules` → **Publicar**.
Opção B — linha de comando (`firebase login` com a conta dona do projeto):
```
firebase deploy --only firestore:rules --project nexus-rtc
```
> ⚠️ **Nunca** deixe o banco em "modo de teste" (`allow read, write: if true`): qualquer pessoa na internet leria e apagaria os dados de todos os clientes.

### 3.4 Criar o primeiro administrador (manual, uma única vez)
As regras nunca permitem que alguém se torne administrador sozinho; o primeiro é criado no console:
1. **Authentication → Users → Adicionar usuário**: e-mail e senha forte do administrador. Copie o **UID**.
2. **Firestore → Iniciar coleção** `users` → ID do documento = o **UID** copiado → campos:
   | campo | tipo | valor |
   |---|---|---|
   | `nome` | string | nome do administrador |
   | `email` | string | o mesmo e-mail, em minúsculas |
   | `perfil` | string | `admin` |
   | `modulos` | null | (null = todos) |
   | `bloqueado` | boolean | `false` |
3. Abra a plataforma e entre. A partir daí, **Usuários** (menu lateral) cria os acessos dos clientes.

### 3.5 Restringir a chave de API (recomendado)
A chave em `config/firebase-config.js` identifica o projeto e é pública por natureza, mas convém restringi-la:
Google Cloud Console → **APIs e serviços → Credenciais →** chave "Browser key" → **Restrições de aplicativo: Referenciadores HTTP** → liste os domínios do site.
Opcional e mais forte: **App Check** (reCAPTCHA Enterprise) no Firebase.

### 3.6 Hospedagem
Site estático: qualquer hospedagem com HTTPS. Com o Firebase Hosting, `firebase deploy --only hosting` usa `firebase.json` (já inclui cabeçalhos de segurança e **não publica** `docs/`, `tests/`, `firestore.rules` etc.).
O login do Firebase **não funciona abrindo o `index.html` por duplo clique (`file://`)**: use `http://localhost` (ex.: `python -m http.server 5180`) ou a hospedagem.

## 4. Operação do dia a dia

| Tarefa | Como |
|---|---|
| Novo cliente | **Usuários → Novo acesso**: nome, e-mail, módulos, senha inicial (enviar por canal seguro). Vale na hora. |
| Bloquear por fatura em aberto | **Usuários → Bloquear**. O cliente perde o acesso imediatamente; **Desbloquear** restaura tudo (os dados continuam guardados). |
| Cliente esqueceu a senha | Na tela de login, **Esqueci minha senha** (e-mail do Firebase), ou **Usuários → Editar → Enviar e-mail de redefinição**. |
| Alterar módulos liberados | **Usuários → Editar**. A sessão do cliente recarrega sozinha. |
| Excluir cliente | **Usuários → Excluir** remove o perfil (acesso cortado). Os dados continuam na nuvem e a conta de login continua em **Authentication**; apague ambos no console quando for definitivo (LGPD). Para reutilizar o mesmo e-mail, apague a conta no Authentication. |
| Backup | Cada cliente tem **Exportar backup** no módulo. Para backup do banco inteiro: Firestore → **Exportação/importação gerenciada** (exige plano Blaze) ou agendamentos de backup do Firestore. |

## 5. Testes

```
node --test --test-force-exit tests/node/*.test.js     # persistência, isolamento, conflito, bloqueio, gestão de acessos (backend em memória)
node tests/node/rodar-suite-navegador.js               # cálculos tributários (suíte original)
cd tests/rules && npm install && npm test              # regras do Firestore no emulador (precisa de Java)
```
Os testes de `tests/node` usam um backend de memória que imita o contrato do Firestore; **só os testes de `tests/rules` provam as regras de verdade** — rode-os antes de publicar qualquer mudança em `firestore.rules`.

## 6. Limites conhecidos (sem servidor próprio)

- **Excluir conta de login e senha de terceiros** exigem privilégio de servidor (Admin SDK / Cloud Functions, plano Blaze). Por isso: exclusão de conta é feita no console, e a troca de senha é por e-mail de redefinição, não digitada pelo administrador.
- **"Último administrador"**: as regras impedem que um administrador se rebaixe, bloqueie ou apague; dois administradores agindo ao mesmo tempo um contra o outro não são detectáveis pelas regras.
- **Carregamento**: o SDK do Firebase vem do CDN do Google (versão fixa 13.4.0). Sem internet e sem o SDK no cache do navegador, a plataforma não abre.
- **Cadastros abertos**: a API pública do Firebase aceita criação de contas por qualquer pessoa, mas contas sem perfil não acessam nada. Para impedir até isso, ative o **Identity Platform** e desabilite o auto-cadastro.
- **Cache local**: os dados do usuário conectado ficam no navegador enquanto a sessão está aberta e são apagados ao sair; quem tem acesso ao computador desbloqueado vê os dados. Oriente "Manter conectado" apenas em computadores pessoais.

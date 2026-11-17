# Nexus Contabilidade — Plataforma RTC

A plataforma Nexus tem dois módulos, separados no menu:

- **RTC Comparativo:** simula a formação do preço de venda de mercadorias e compara **2026** com **janeiro de 2027** (troca de PIS/Cofins pela CBS e IBS de transição), sempre com memória de cálculo e base legal.
- **Lucratividade por Item:** calcula, item a item, o lucro e a margem de uma venda. Parte do custo líquido de aquisição, já sem os créditos do regime, e do preço líquido de tributos, comissões, taxas e descontos. Recalcula na hora quando o preço muda (veja [Lucratividade por Item](#módulo-lucratividade-por-item)).

## Como abrir

- **Uso local (desenvolvimento):** sirva a pasta por HTTP, por exemplo `python -m http.server 5180`, e abra `http://localhost:5180`. O login do Firebase **não funciona** abrindo `index.html` por duplo clique (`file://`).
- **Produção:** publique a pasta em qualquer hospedagem estática com **HTTPS** (ex.: Firebase Hosting, `firebase deploy --only hosting`). Não há etapa de build. Configuração do banco, regras e primeiro administrador: [docs/FIREBASE.md](docs/FIREBASE.md).
- **Internet** é necessária para entrar e salvar na nuvem (o SDK do Firebase vem do CDN do Google), para as fontes (Google Fonts) e para o **PDF** (a biblioteca jsPDF é carregada sob demanda). Sem conexão, o app usa fontes do sistema, e o botão **Imprimir → Salvar como PDF** produz o relatório pelo layout de impressão. O **Excel** é gerado localmente, sem dependências.

## Acesso: login, usuários e menu de módulos

- **Login:** a plataforma abre na tela **Entrar na plataforma** (e-mail e senha), validada pelo **Firebase Authentication**. A opção **Manter conectado neste navegador** mantém a sessão entre aberturas do navegador; sem ela, a sessão vale até fechar o navegador. O Firebase limita tentativas erradas no servidor. **Esqueci minha senha** envia o link de redefinição por e-mail. Use **Sair** no topo ou na barra lateral.
- **Perfis:** **administrador** e **cliente**. Só administradores veem a página **Usuários**, onde criam acessos (nome, e-mail de login, perfil, **módulos liberados** e senha inicial), editam, **bloqueiam** (com motivo, por exemplo "Fatura em aberto") e desbloqueiam. Tudo vale **na hora**, no servidor. Não é possível bloquear, rebaixar ou excluir o próprio acesso nem deixar a plataforma sem administrador ativo. O cliente bloqueado perde o acesso aos dados imediatamente: a sessão aberta é encerrada em segundos e o login mostra "Seu acesso está bloqueado. Entre em contato com a Nexus Contabilidade para regularizar.".
- **Módulos por usuário:** na ficha do cliente, o administrador marca os módulos liberados: **RTC Comparativo**, **Lucratividade por Item** ou os dois.
  - É preciso marcar ao menos um.
  - O módulo não liberado continua aparecendo para o cliente, **em cinza** e com cadeado ("Não liberado no seu acesso"), no menu de módulos, na barra lateral e no seletor do topo. Ele não abre; o clique mostra o aviso para falar com a Nexus Contabilidade.
  - O cliente só vê os módulos marcados no menu inicial, na barra lateral e no seletor do topo.
  - Um endereço direto de outro módulo volta ao menu com o aviso "Seu acesso não inclui o módulo…".
  - Administradores acessam todos os módulos.
  - Acessos criados antes desta opção continuam com todos os módulos até serem editados.
  - Como o bloqueio, a escolha vale na hora e é imposta pelas regras do servidor: um módulo não liberado não tem os dados lidos nem gravados, mesmo que o código do site seja alterado no navegador.
- **Dados de cada cliente na nuvem:** cada login tem as próprias empresas, operações e parâmetros em `users/{uid}` no Cloud Firestore. As regras de segurança (`firestore.rules`) permitem que **só o dono** leia e grave os próprios dados — nem outro cliente, nem administrador, nem alguém que altere o código do site. Cada alteração é salva primeiro no navegador (daquele usuário) e enviada à nuvem em segundo plano; sem internet nada se perde e o envio é refeito quando a conexão volta. Dois dispositivos editando ao mesmo tempo não se sobrescrevem: o sistema detecta o conflito e pergunta qual versão manter. A barra lateral mostra a situação do salvamento.
- **Senhas:** ficam no Firebase Authentication (hash forte, no Google); a Nexus nunca as vê nem as grava. Política mínima: 8 caracteres com letras e números.
- **Primeiro administrador:** criado uma única vez no console do Firebase (passo a passo em [docs/FIREBASE.md](docs/FIREBASE.md#34-criar-o-primeiro-administrador-manual-uma-única-vez)). Não há senha nem usuário no código do site.
- **Dados antigos do navegador:** no primeiro login de cada conta, a plataforma oferece importar os dados que estavam salvos neste navegador antes da nuvem. Só entram com autorização.
- **Limites:** criar conta de login e redefinir senha funcionam pelo próprio site; **apagar** uma conta de login (e os dados dela) é feito no console do Firebase. Detalhes e operação: [docs/FIREBASE.md](docs/FIREBASE.md).
- **Menu de módulos (`#/`):** primeira tela após o login, em dois momentos.
  1. **Escolha do módulo:** os módulos aparecem em cartões grandes que ocupam a tela, lado a lado (um abaixo do outro em telas estreitas). Cada cartão tem o ícone em gradiente laranja com glow ao passar o mouse, a descrição, os números atuais e a última etapa visitada.
  2. **Etapas do módulo:** um clique no cartão (**Ver etapas**) encolhe os cartões numa faixa no topo, com o módulo escolhido destacado, e abre o painel do módulo. O painel traz **Abrir módulo**, **Continuar em…** e os números. Abaixo deles fica o **caminho do módulo**: o cadastro e as etapas numeradas, ligados por uma linha, com "Você parou aqui" na última etapa visitada. O que não é etapa numerada, como Parâmetros e regras, aparece em **Também neste módulo**. Em telas médias e no celular, o caminho fica na vertical.

  Para trocar de módulo, clique no outro cartão. Para fechar o painel, clique de novo no mesmo cartão, use o **×** ou o botão voltar do navegador. O endereço muda para `#/inicio/rtc` ou `#/inicio/lucro`.
- **Seletor de módulos (topo):** dentro de qualquer módulo, o seletor no canto superior direito mostra **RTC Comparativo** e **Lucratividade**, com o módulo atual destacado. Um clique troca de módulo e volta à última etapa visitada nele. No celular, o seletor mostra só os ícones. A barra lateral também lista os dois módulos e as etapas do módulo aberto.

## Fluxo de uso

1. **Empresas:** clique em **Nova empresa** para abrir a ficha. Para preencher pelos dados da Receita Federal, informe o CNPJ e clique em **Buscar na Receita** (ou apenas saia do campo CNPJ com a ficha ainda vazia). A consulta usa a [API pública da CNPJá](https://cnpja.com/api/open) (`GET https://open.cnpja.com/office/{cnpj}`, sem cadastro, até 5 consultas por minuto por computador). Ela preenche razão social, nome fantasia, UF, município, atividade (pelo CNAE principal: indústria nas divisões 10 a 33, comércio nas divisões 45 a 47) e, se a empresa for optante, o Simples Nacional com o anexo. Também mostra o cartão **Dados cadastrais oficiais**, com situação cadastral, CNAEs, natureza, porte, Simples/SIMEI e endereço. Os campos preenchidos assim levam o selo **Receita**, que some quando o campo é editado. A Receita não informa se a empresa é do Lucro Presumido ou do Real, nem a RBT12: esses dados continuam com o escritório. Só o CNPJ é enviado à CNPJá, e o quadro de sócios não é guardado. Para um volume maior de consultas, a CNPJá oferece a API comercial com chave; ela exige um servidor para guardar a chave, pois no navegador a chave ficaria exposta. Preencha regime, UF e atividade e clique em **Salvar empresa**. Para alterar, use **Editar**; para remover, **Excluir**. No Simples Nacional, informe o anexo e a **RBT12**. O sistema mostra faixa, alíquota nominal, parcela a deduzir e alíquota efetiva `((RBT12 × Alíq) − PD) ÷ RBT12` (LC 123/2006, art. 18, § 1º-A), com a partilha de 2026 e de 2027.
2. **Cadastro da operação:** ao abrir a aba, aparecem só as operações cadastradas e a lista de produtos da operação selecionada. As fichas do produto abrem ao clicar no produto ou em **Cadastrar produto**. O valor total de cada produto é calculado (quantidade × valor unitário). Produtos, operações e empresas podem ser excluídos.
   **Planilha do cliente e importação:** em **Baixar planilha do cliente**, o sistema gera uma planilha de compras simples, com o nome da empresa, para o cliente preencher olhando as notas fiscais. São 16 colunas, das quais 5 são obrigatórias (marcadas com * e título laranja): nº da nota fiscal, UF do fornecedor, descrição do produto, quantidade e valor unitário. As opcionais (título cinza) são: fornecedor do Simples (Sim/Não), NCM, unidade, frete, IPI da nota, desconto, ICMS destacado, DAE (R$), código do DAE, preço de venda por unidade e margem desejada. **Código do DAE** (SEFAZ-CE): 1031 = ICMS-ST na entrada (vira custo e encerra a tributação); 1023 = ICMS antecipado (crédito após o pagamento no regime normal; custo no Simples). Código diferente ou ausente: o valor é guardado e o escritório define o recolhimento no sistema. Se o DAE for da nota inteira, o cliente informa o valor em uma linha e repete o código nos outros produtos cobrados; o sistema divide o valor proporcionalmente ao valor dos produtos e avisa quando o mesmo valor aparece repetido em vários produtos. Há uma linha de exemplo, que não é importada, e uma aba **Como preencher**. Produtos da mesma nota repetem o número da nota. O tipo de operação é deduzido da UF do fornecedor: mesma UF da empresa = interna; outra UF = interestadual; Exterior = importação. Se houver margem, o método é A; se houver só o preço de venda, o método é B (margem efetiva). Sem nenhum dos dois, o produto entra com aviso para o escritório completar. A parte tributária (ICMS, ST, PIS/Cofins, IBS/CBS, CFOP) fica com o escritório, no sistema. Em **Importar planilha** (.xlsx ou .csv), o sistema mostra a pré-visualização com as notas, os produtos válidos e os erros com a linha e o motivo. Linhas com erro não são importadas, e cada importação cria operações novas. A importação também aceita colunas avançadas (tipo de operação, CFOP, tratamentos tributários) para planilhas montadas pelo escritório. Exemplo do arquivo: `docs/planilha-de-compras-exemplo.xlsx`.
   **Antecipação do ICMS (ficha do produto):**
   - **ICMS antecipado** (sem encerramento): para empresa do regime normal, vira crédito fiscal após o efetivo recolhimento (Decreto 33.327/2019, RICMS-CE, art. 61, § 5º). Para empresa do Simples Nacional, integra o custo.
   - **ICMS-ST na entrada:** sempre integra o custo (não há crédito) e encerra a tributação até o consumidor final, de modo que a venda sai sem débito de ICMS.
   - Cálculo pela MVA (ou pelo diferencial de alíquotas) ou pelo valor pago no DAE. Fica bloqueado quando o ICMS-ST já veio retido pelo fornecedor na NF.
   **Natureza única por operação:** tipo de operação, UF de origem, UF de destino e destinatário valem para todos os produtos. Alterar em um produto aplica a todos e ajusta o primeiro dígito dos CFOPs. Um CFOP fora do grupo da operação é recusado na digitação: entrada 1/2/3 para interna, interestadual ou importação; saída 5/6 para venda interna ou interestadual. Exemplo: numa operação interestadual com CFOP 2102, não é possível cadastrar outro produto como interno com CFOP 1102.
   Campos de cada produto: mercadoria (NCM, CEST, CFOP), UFs, valores da NF, fornecedor, hipótese de preço do fornecedor em 2027, perfil tributário (ICMS, ST, antecipação, IPI, PIS/Cofins, CBS/IBS), margem, despesas e preço atual.
3. **Custo de aquisição:** as telas de custo, preço e comparativo seguem a mesma ordem:
   - **barra O que analisar**, numa linha no topo;
   - **resposta numa frase**: quanto o custo líquido muda de 2026 para 2027;
   - indicadores, com **?** que explica cada um;
   - detalhes.

   As fórmulas gerais ficam em **Como o custo é calculado?**, que abre com um clique. Na barra, **Detalhes** pode ser **Menos**, que mostra só os valores, ou **Mais**, que abre tudo. Em qualquer modo, a seta de cada linha abre e fecha o detalhamento daquele componente: cálculo (base × alíquota), fórmula, observação, origem do valor, vigência e fundamento legal. O mesmo vale para a formação do preço.
   **Visões:** na barra, em **Analisar**, escolha a **operação completa** (soma dos produtos, com tabela por produto e componentes somados) ou **um produto** (detalhe com as chaves para habilitar ou desabilitar cada crédito e a hipótese de preço do fornecedor em 2027). Em **Calcular o custo por**, escolha **quantidade total** ou **por unidade** (valores em reais ÷ quantidade; alíquotas e percentuais não mudam). Na operação completa, a média por unidade exige a mesma unidade de medida em todos os produtos. Nas tabelas por produto (custo, preço e cadastro), cada célula traz 2026 em cima e janeiro de 2027 embaixo, em laranja; a coluna **Variação** mostra seta, percentual e diferença em reais.
4. **Formação do preço:** o cartão **Quanto devo cobrar em 2027?** fica depois das colunas comparativas de 2026 e 2027. Ele começa **oculto** toda vez que a tela é aberta: o botão **Mostrar resultado** revela o cartão quando o escritório for apresentar ao cliente, e **Ocultar** esconde de novo. Enquanto o cartão estiver oculto, a coluna "Cobrar em 2027" da tabela por produto também fica escondida. O cartão mostra o preço (total ao cliente e valor da mercadoria) que mantém em 2027 o mesmo lucro em reais de 2026, já com a CBS/IBS e o custo de aquisição de 2027. A conta é `X = (custo líquido 2027 + Σb + lucro 2026) ÷ (1 − Σ tributos e despesas sobre a venda)`. O lucro considerado segue a "margem medida" do produto: margem de contribuição, ou lucro líquido (no Lucro Presumido, com IRPJ/CSLL presumidos no divisor; no Lucro Real, com lucro ÷ (1 − τ)). A referência de 2026 é o preço atual informado ou, sem ele, o preço sugerido pela margem. Na operação completa, cada produto mantém o próprio lucro e a tabela por produto ganha a coluna "Cobrar em 2027". Para o restante, valem as mesmas escolhas (operação completa ou produto; quantidade total ou por unidade). A escolha entre total e unidade é a mesma da tela de custo e da ficha *Venda* do produto. Cada produto usa o modo A (margem → preço, markup divisor) ou o modo B (preço → margem efetiva). Por unidade, o preço informado no modo B é o preço de 1 unidade. Na operação completa, cada produto é somado no próprio método.
5. **Comparativo:** visão da operação completa (produtos somados) ou de um produto. Inclui análise 1 (mesma margem), análise 2 (mesmo preço), gráficos e sensibilidade à alíquota da CBS. A escolha da análise fica na barra do topo, e a frase de abertura resume as duas: quanto o preço precisa mudar para manter a margem; quanto o lucro muda mantendo o preço.
6. **Relatório:** dois modelos, escolhidos em **Modelo do relatório**. O modelo escolhido vale para a tela, o **PDF**, o **Excel** e a impressão. O padrão é Completo para administradores e Simplificado para clientes.
   - **Completo:** produtos da operação, comparativos, memória de cálculo de cada produto, sensibilidade da CBS, premissas, avisos, fundamentos legais e parâmetros.
   - **Simplificado (para o empresário):** 1 a 2 páginas em linguagem direta. Traz três respostas: custo de compra em 2027, lucro mantendo o preço de hoje e quanto cobrar em 2027 para lucrar o mesmo. Depois vêm o "Em resumo", com três frases, e o "Como chegamos a esses números" (custo + impostos da venda + despesas + lucro = valor da mercadoria; + impostos à parte = total ao cliente, em 2026 e 2027). Fecha com as tabelas curtas de impostos na venda, custo de compra e produto (por unidade) e com "O que muda em 2027". Não traz memória linha a linha, parâmetros nem lista de leis: o aviso final indica o relatório completo para isso. O PDF sai em retrato (A4) e o Excel tem as abas "Resumo" e "Por produto".

## Módulo Lucratividade por Item

Especificação completa: `docs/modulo-lucratividade.md`. O módulo tem **cadastro de empresas próprio**, e os dados ficam em `nexus.lucro.v1`, no armazenamento do navegador. Os produtos são trocados com o RTC Comparativo: veja [Integração entre os módulos](#integração-entre-os-módulos).

1. **Empresas:** razão social, CNPJ (com **Buscar na Receita**, pela mesma API CNPJá), UF e regime (Simples, Presumido ou Real). **Análises** abre as análises da empresa. Cada análise reúne os itens de uma compra.
2. **Parâmetros:** o regime vem da empresa e pode ser trocado na análise para simular ("e se eu fosse Lucro Real?"). Também ficam aqui as alíquotas padrão, com a base legal, o ICMS interno padrão, o IRPJ/CSLL opcional e a **margem-alvo**. O **cenário** (2026 ou 2027) é escolhido no menu de etapas do módulo, na barra do topo ou aqui; veja [Cenário 2027](#cenário-2027-cbs-e-ibs).
3. **Compra:** **Baixar modelo** gera a planilha de itens: aba *Itens*, com uma linha por produto, e aba *Instruções*. A linha tem duas partes:
   - **Compra**, com os valores do total do item na NF-e: código do produto*, descrição*, NCM*, quantidade*, valor da mercadoria*, descontos incondicionais, frete, ICMS do frete (CT-e), IPI, seguro e outras despesas, ICMS destacado na NF-e, valor do DAE e código do DAE (lista: 1023 ou 1031).
   - **Venda:** preço de venda por unidade, comissão (%) e taxa de cartão (%), mais a **tributação da venda**, escolhida em listas:
     - ICMS-ST na venda (Sim/Não);
     - alíquota do ICMS na venda (%);
     - redução da base do ICMS (%);
     - PIS/Cofins na venda (Normal, Monofásico, Alíquota zero, Isento ou Suspenso).

     Com essas colunas preenchidas, o item já entra com a tributação pronta. O que ficar em branco segue o padrão: a venda padrão da análise para preço e despesas; o ICMS interno padrão de Parâmetros; o PIS/Cofins da compra; ICMS-ST quando o DAE é 1031. Sem preço, ele é definido na tela Venda.

   **Importar planilha** aceita .xlsx ou .csv (separador `;`, decimal `,`). O cabeçalho é reconhecido pelo nome, e os nomes antigos em snake_case continuam aceitos. Também valem as colunas avançadas (`dae_pago`, `regime_pis_cofins_item`, `fornecedor_pj_brasil`) e uma aba separada de tributação de venda, ligada pelo código ou pelo NCM. A tributação da própria linha tem prioridade sobre a aba separada. Antes de gravar, uma prévia mostra os itens válidos, quantos têm preço de venda e tributação da venda, os alertas e os erros. Bloqueiam a linha: um código de DAE diferente de 1023 ou 1031, um percentual fora de 0 a 100 e um valor fora da lista. Na tabela de itens, **Selecionar produtos** mostra as caixas de seleção para **excluir em lote**; **Cancelar** esconde as caixas e desmarca tudo. O botão **Selecionar vindos do RTC** marca de uma vez os produtos trazidos do outro módulo. Falta de alíquota de venda gera o alerta "sem alíquota de venda". Os itens também podem ser cadastrados um a um. A tabela mostra o custo bruto, os créditos e o custo líquido (CL) de cada item.
   - **Créditos por regime:** no Simples, nenhum. No Presumido, só o ICMS. No Real, ICMS e PIS/Cofins: 9,25% sobre `valor da mercadoria − desconto − ICMS destacado na NF`.
   - **DAE 1023:** é crédito só depois de pago. Não pago, fica "a apropriar" e não reduz o custo.
   - **DAE 1031 (ICMS-ST):** é sempre custo, e o item fica sem crédito de ICMS: o ICMS destacado na NF e o do frete também ficam no custo.
4. **Venda:** o cartão **Item em análise** escolhe o item. Ele traz:
   - busca por código, descrição ou NCM (Enter abre o primeiro encontrado);
   - filtro por situação, com a contagem de cada uma: prejuízo, abaixo da meta, na meta ou acima, e sem preço;
   - a lista dos itens filtrados, com a margem de cada um, e os botões **Anterior** e **Próximo**.

   Para o item escolhido, a tela mostra o custo e o cartão **Lucro, margem e DRE**, com o lucro do item, a margem sobre o PLD e a **DRE do item** (Lei 6.404/1976, art. 187). A DRE vai da receita bruta às deduções (descontos incondicionais, ICMS, PIS e Cofins, ou DAS), à receita líquida, ao CMV (custo líquido de aquisição), ao lucro bruto, às despesas com vendas (comissão e cartão) e ao resultado. Com IRPJ/CSLL presumidos ou estimados, ela também mostra o resultado antes deles e o lucro líquido. Há colunas por unidade, total da linha e AV % sobre a receita bruta.

   Em tela larga, a DRE fica ao lado do preço e acompanha a rolagem. No celular, a coluna de total sai, porque o total da linha já aparece no cartão de lucro. Ao lado ficam o preço e as deduções: quatro modos de formar o preço (markup com despesas, markup sem despesas, preço informado ou **preço sem PIS/Cofins**), desconto (% ou R$ por unidade), comissão, taxa de cartão e a tributação de venda do item. **Margem desejada** e **preço** funcionam nos dois sentidos: digitar a margem calcula o preço. A DRE, o lucro e a margem na lista mudam enquanto se digita. As referências trazem o **PV mínimo** (lucro zero) e o **PV para a margem-alvo**, numa régua com o preço atual. **Venda padrão da análise**, no fim da tela, aplica o mesmo modo e as mesmas despesas a todos os itens.
5. **Resultado:** a planilha de todos os itens tem o preço editável na própria linha. Lucro, margem, PV mínimo, PV meta e os totais mudam enquanto se digita. A margem total é `Σ lucros ÷ Σ PLD`, ponderada, e não a média das margens. As cores seguem as faixas: vermelho = prejuízo, amarelo = abaixo da meta, verde = acima. A faixa também vem escrita, para não depender só da cor.
6. **Relatório:** escolha a **análise** e baixe em **PDF** ou **Excel**.
   - **Conteúdo:** identificação da empresa e da análise (com regime, UF, cenário, margem-alvo e ICMS padrão); resumo (faturamento, custo líquido, lucro e margem total); resultado por item, com situação; DRE da análise (soma das DREs dos itens); notas com a base legal.
   - **DRE de cada item:** entra por padrão e pode ser desmarcada para um relatório mais curto.
   - **Formatos:** o PDF sai em A4 paisagem, com o cabeçalho da Nexus e as páginas numeradas. O Excel tem as abas Resumo, Itens e DRE por item.
   - **Prévia:** a tela mostra o resumo e a DRE da análise antes de baixar.

Fórmulas: `Σ = a_ICMS + (a_PIS + a_Cofins)(1 − a_ICMS) + comissão + cartão`, `PLD = PV(1 − d)`, `Lucro = PLD(1 − Σ) − CL`, `PV_mín = CL ÷ ((1 − d)(1 − Σ))` e `PV_meta = CL ÷ ((1 − d)(1 − Σ − m))`. Detalhes e base legal em `docs/ARQUITETURA.md` (seção 5).

### Cenário 2027 (CBS e IBS)

O cenário vale para todas as empresas e análises do módulo e fica gravado com os dados (`cenario` em `nexus.lucro.v1`). Pode ser trocado em três lugares:
- no menu inicial, no painel **Etapas do módulo**, em **Cenário da simulação**;
- na barra do topo (**Cenário 2026 | 2027**);
- em **Parâmetros**.

**2026:** o que já existia (ICMS + PIS/Cofins, ou DAS).

**2027:** as regras e as alíquotas do RTC Comparativo (LC 214/2025):
- **Alíquotas:** as de **Parâmetros e regras do RTC**. A CBS é a referência menos 0,1 ponto percentual (arts. 347 e 349); a referência ainda é estimada, até a Resolução do Senado. O IBS é 0,05% estadual + 0,05% municipal (art. 344). Quando a alíquota oficial for publicada e atualizada no RTC, a Lucratividade usa o novo valor.
- **Venda:**
  - CBS e IBS **por fora**, sobre (PLD − ICMS) (art. 12, § 2º, V). São somados ao preço e pagos pelo cliente; não entram no faturamento, na DRE nem no lucro (DL 1.598/1977, art. 12, § 4º).
  - **ICMS com CBS e IBS na base**, conforme orientação da SEFAZ-SP e da SEFAZ-MG: ICMS = PLD × t(1 + k) ÷ (1 + t·k).
  - **Comissão e cartão** sobre o total cobrado do cliente (com CBS e IBS), como no RTC.
  - As duas premissas têm chave própria em Parâmetros.
  - PIS e Cofins deixam de existir (EC 132/2023, ADCT, art. 126, II).
- **Compra:** o fornecedor mantém o valor da mercadoria e acrescenta CBS e IBS por fora, sobre (valor da operação − ICMS destacado).
  - **Lucro Real e Presumido** recuperam a CBS e o IBS integralmente (art. 47).
  - **Simples Nacional** não recupera: a CBS e o IBS da compra ficam no custo (art. 47, § 9º). Na venda, a CBS e o IBS ficam dentro do DAS.
  - O **IPI é zero** (ADCT, art. 126, III; LC 214/2025, art. 454), salvo produto da Zona Franca de Manaus, que tem chave em Parâmetros.
- **Tratamento do item:** campo **CBS e IBS do item (2027)**, na ficha da compra e na tributação da venda. As opções são alíquota de referência, redução (%), alíquota zero ou isenção. Também há a coluna de mesmo nome, com lista, na planilha de importação. O tratamento vale para a compra e para a venda e vai junto na integração com o RTC.
- **Telas:**
  - Compra mostra o crédito de CBS/IBS no lugar do de PIS/Cofins.
  - Venda mostra o bloco **Cobrado do cliente à parte**: PLD + CBS + IBS = total pago pelo cliente.
  - Resultado e Relatório (PDF e Excel) trazem o total pago pelos clientes.

**Preço sem PIS/Cofins** (modo 4 de **Como formar o preço**, na Venda): digita-se o **preço de hoje**, com o PIS e a Cofins embutidos, e o sistema retira deles o PIS e a Cofins pelas regras de 2026: (PIS + Cofins) × (preço − ICMS), a mesma conta do débito da venda (STF, Tema 69). O PLD cai exatamente o valor retirado, e a CBS e o IBS entram por fora sobre o novo preço.
- Lucro Real, ICMS de 20%: 9,25% × 80% = 7,40% do preço; R$ 180,00 vira R$ 166,68.
- Lucro Presumido: 3,65% × (1 − ICMS).
- Item com ICMS-ST: a base é o preço inteiro.
- Simples Nacional e item sem PIS/Cofins na venda (monofásico, alíquota zero, isento, suspenso): o preço fica igual.
- No cenário **2026**, o preço de hoje vale como está, e a tela mostra quanto ele cairá em 2027.
- As alíquotas do PIS e da Cofins de hoje ficam em Parâmetros, também no cenário 2027.
- Ao escolher o modo, o preço que está na tela vira o preço de hoje. Em **Venda padrão da análise**, cada item usa o próprio preço.
- Na integração, o RTC recebe o preço de hoje e calcula 2027 pelas próprias regras.

Os testes conferem os números à mão:
- A100: custo líquido de 2027 de R$ 934,00, lucro de R$ 349,06 e ICMS = 20% × (PLD + CBS + IBS).
- O custo líquido de 2027 é o mesmo nos dois módulos: A100 R$ 934,00; MS 162 R$ 7.598,11.

### Telas mais simples

As telas seguem a mesma ordem do RTC: primeiro a **resposta numa frase**, depois os números e, por fim, os detalhes.
- **Compra:** custo real da compra e créditos.
- **Venda:** lucro e margem do item com o preço atual.
- **Resultado:** lucro e margem da análise e os itens que pedem atenção.

Os textos técnicos ficam em explicações que abrem com um clique, como **Como o custo é calculado?**. A busca do item na Venda virou uma barra sem cabeçalho. A importação da planilha foi para o cartão dos itens. A tabela do Resultado juntou lucro unitário e da linha e preço mínimo e da meta.

## Integração entre os módulos

Os produtos cadastrados em um módulo vão para o outro. Exemplo: o cliente que só tinha a Lucratividade contrata o RTC, e o RTC já abre com os produtos dele.
- **Quando:** ao abrir uma tela de um módulo, o sistema traz os produtos novos do outro módulo e avisa quantos vieram.
- **O que vem junto:**
  - a empresa (achada pelo CNPJ ou pela razão social; se não existir, é criada, e convém conferir o regime);
  - a operação do RTC, que vira análise na Lucratividade, e vice-versa, com o mesmo nome.
- **O que é levado:**
  - código, descrição, NCM e quantidade;
  - valores da nota: mercadoria, desconto, frete, ICMS do CT-e, IPI, seguro e ICMS destacado;
  - DAE: 1023 equivale à antecipação no RTC, e 1031 ao ICMS-ST na entrada;
  - tributação da venda: ICMS-ST, alíquota e redução do ICMS, PIS/Cofins;
  - preço de venda, comissão e taxa de cartão.

  Do RTC para a Lucratividade, os valores calculados pelo RTC (ICMS, IPI, antecipação) e o preço sugerido para a margem têm prioridade. O ICMS-ST retido na nota vai como DAE 1031. Os testes conferem que o custo líquido fica igual nos dois módulos.
- **Cópia, não espelho:** cada produto é copiado uma vez, com um vínculo comum aos dois módulos. Alterações feitas depois ficam no módulo onde foram feitas.
- **Não quer os produtos do outro módulo?** Exclua em lote:
  - no RTC (módulo 01): Cadastro da operação › lista de produtos › **Selecionar produtos**, **Selecionar vindos da Lucratividade**, **Excluir selecionados**;
  - na Lucratividade (módulo 02): Compra › tabela de itens › **Selecionar produtos**, **Selecionar vindos do RTC**, **Excluir selecionados**.

  O produto excluído num módulo continua no outro e **não volta** na próxima sincronização: o vínculo fica guardado em `syncExcluidos`, até depois de "Apagar todos os dados" no RTC. Produtos ainda em branco esperam ser preenchidos para ir.
- **Código no RTC:** o RTC ganhou o campo **Código do produto**, que liga o produto ao da Lucratividade.

## PIS/Cofins sem ICMS na base

Nos dois módulos, o ICMS fica sempre fora da base do PIS e da Cofins. Não é premissa opcional.
- **Na venda:** PIS e Cofins incidem sobre o preço sem o ICMS (STF, Tema 69 — RE 574.706), no Lucro Real e no Presumido.
- **Na compra (crédito do Lucro Real):** a regra é do escritório (28/10/2026), conferida com a planilha `calculo_1_lucratividade.xlsx`. A base é `valor da mercadoria − desconto − ICMS destacado na NF` (Lei 14.592/2023).
  - Sai todo o ICMS destacado, inclusive o que incide sobre o frete da NF, mesmo quando não é creditável.
  - Frete, seguro, outras despesas e IPI ficam fora da base.
  - O DAE não entra nem é excluído, seja o ICMS antecipado (1023) ou o ICMS-ST (1031).
  - Exemplo, a MS 162: 7.461,09 − 316,59 = 7.144,50, que dá PIS/Cofins de 660,87.
- **ICMS do CT-e no RTC Comparativo:** com o frete contratado fora da NF, informe o **ICMS destacado no CT-e**. O campo aparece ao desmarcar "Frete cobrado pelo fornecedor na própria NF" e a importação aceita a coluna "ICMS do CT-e (R$)". Esse ICMS entra no crédito de ICMS quando o da compra é recuperável.
- **No Simples Nacional:** PIS e Cofins estão dentro do DAS, calculado sobre a receita bruta (LC 123/2006), e não há crédito.

## Manutenção dos parâmetros

Os parâmetros ficam em **Parâmetros e regras**. Cada um indica status, vigência, fundamento e data de atualização.

- **Alíquota de referência da CBS 2027:** vem como **8,80% — ESTIMADO** (estimativa do Ministério da Fazenda, abr/2024). Quando o Senado publicar a resolução (LC 214/2025, art. 349, com previsão até dez/2026), atualize o valor e mude o status para **Oficial**.
- **ICMS interno por UF:** não vem preenchido, para não presumir alíquotas. Informe a alíquota modal (ou a do produto), o FCP/FECOP e a fonte legal da UF. Enquanto isso, as simulações podem usar alíquota manual.
- **Partilha do Simples 2027/2028:** marcada **A CONFIRMAR** (fonte secundária). Para corrigir, edite `src/modules/rtc/simples.js` (`TABELAS[2027]`).
- **Regras cadastradas:** use “Salvar perfil como regra” no cadastro da operação para reaproveitar tratamentos por NCM.

Os padrões legais ficam em `src/modules/rtc/params.js`. Ao revisar a base, atualize `VERSAO_BASE` e `DATA_BASE`.

## Formato dos números

Valores em reais aparecem sempre como **R$ 0,00**, com 2 casas decimais, nas telas, nos campos, no PDF e no Excel. Isso vale também para valores unitários e preços calculados pela margem. O cálculo interno usa a precisão completa: um valor unitário digitado com mais casas, como 0,1234, entra assim no total, mas aparece como 0,12. Percentuais, multiplicadores e quantidades continuam no formato próprio de cada um.

## Dados e backup

Os dados ficam na **nuvem (Firestore), na conta de cada usuário**, com cópia no navegador enquanto a sessão está aberta (o cache é apagado ao sair). Em **Parâmetros › Dados e backup**, exporte e importe backups em JSON.

## Testes

Abra `tests/index.html` no navegador (115 testes) ou rode `node tests/node/rodar-suite-navegador.js`. Persistência, isolamento entre clientes, conflitos, bloqueio e gestão de acessos: `node --test --test-force-exit tests/node/*.test.js`; regras do Firestore: `tests/rules/LEIA-ME.md`. A suíte cobre os cenários tributários: Simples Nacional (faixas, segregação, opção fora do DAS), Lucro Presumido, Lucro Real, ICMS-ST e MVA ajustada, créditos por regime e por fornecedor, IPI, CBS/IBS 2027, alíquotas-teste de 2026, markup, margem efetiva, validações e o gerador XLSX. Os testes de `tests/lucro.test.js` cobrem o módulo Lucratividade por Item:
- os 8 testes obrigatórios da especificação: com a base do escritório (mercadoria − ICMS), o caso A100 dá lucro de R$ 281,04 e margem de 15,93%; a especificação, que somava frete e seguro à base, dava R$ 286,04 e 16,22%;
- o caso real MS 162 da planilha do escritório: PIS/Cofins de 660,87, custo de 7.325,22 e lucro unitário de 286,42 (31,69 com 25% de desconto);
- totais ponderados;
- desconto em R$;
- IRPJ/CSLL presumidos;
- item com ICMS-ST (1031) sem crédito de ICMS;
- importação das planilhas.

Os testes de `tests/lucro2027.test.js` cobrem o cenário 2027: alíquotas vindas do RTC, compra com CBS e IBS e IPI zero, venda com ICMS sobre (PLD + CBS + IBS), Presumido e Simples, alíquota zero, redução e ICMS-ST, a coluna da planilha, o mesmo custo líquido de 2027 nos dois módulos e o modo **Preço sem PIS/Cofins**. Neste último, o valor retirado é igual ao PIS e à Cofins que o mesmo preço paga em 2026, e há casos para Presumido, Simples, monofásico, ST, desconto em R$, o cenário 2026 e a integração.

## Estrutura

```
index.html                 shell da plataforma + scripts
assets/css/nexus.css       identidade visual (preto, laranja, gradiente e glow)
assets/css/plataforma.css  tela de login, menu de módulos, cadastro de usuários e usuário conectado
assets/css/rtc.css         estilos do RTC Comparativo e do relatório impresso
assets/css/lucro.css       estilos do módulo Lucratividade por Item
assets/img/                logos Nexus
src/core/                  formatação pt-BR, repositórios (store.js), nuvem Firebase (nuvem.js), sincronização (sync.js), UI, gráficos SVG, gerador XLSX, login (auth.js), usuários (usuarios.js), shell/rotas e seletor de módulos
config/firebase-config.js  configuração pública do projeto Firebase
firestore.rules            regras de segurança do banco (isolamento por cliente, perfis, bloqueio)
firebase.json              emuladores, regras e hospedagem (cabeçalhos de segurança)
docs/FIREBASE.md           configuração, segurança e operação do banco na nuvem
src/modules/rtc/           base legal, parâmetros, Simples, regras, motor de cálculo, telas, exportação, planilha modelo/importação (planilha.js)
src/modules/lucro/         Lucratividade por Item: motor.js (funções puras), modelo.js (empresa, análise, item), importar.js, relatorio.js (PDF e Excel), app.js (estado e eventos), views/
src/core/integracao.js     integração entre os módulos: cópia de produtos RTC ⇄ Lucratividade, vínculo e exclusões
tests/                     suíte de testes no navegador (fixtures/: planilha salva no formato do Excel)
docs/ARQUITETURA.md        arquitetura, módulos e fórmulas
docs/modulo-lucratividade.md  especificação do módulo Lucratividade por Item
```

Novos módulos da plataforma entram com `Nexus.shell.registrar({...})` (veja `src/modules/rtc/app.js` e `src/modules/lucro/app.js`). Eles aparecem automaticamente na barra lateral, no menu de módulos e no seletor do topo. No menu, o cartão usa os campos opcionais `resumo`, `entrada` (etapa aberta por **Abrir módulo**) e `resumoInicio()` (números exibidos no cartão). O seletor usa `curto` (nome curto) quando ele existe. Os módulos dividem a mesma área de conteúdo, por isso cada um ignora eventos quando não é o módulo ativo (`Nexus.shell.atual.modulo`).

## Limites conhecidos

- Não há integração com base fiscal oficial: os resultados dependem dos dados e parâmetros informados.
- O DIFAL a não contribuinte é aproximado pela alíquota interna do destino (base única).
- A importação direta exige a informação manual do ICMS e do IPI, porque a base aduaneira não é modelada.
- IRPJ/CSLL no Lucro Real são estimados pela alíquota marginal (24% ou 34%) sobre o resultado da operação.
- Os temas controvertidos ficam como premissas explícitas e alternáveis: IBS/CBS na base do ICMS em 2027, ICMS-ST na base das contribuições (STJ, Tema 1125) e LC 224/2025 (ADI 7936).

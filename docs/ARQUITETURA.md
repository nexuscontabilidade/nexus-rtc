# RTC Comparativo — Arquitetura, módulos e fórmulas

Módulo **RTC Comparativo** da plataforma Nexus Contabilidade. Ele simula a formação do preço de venda de mercadorias e compara o cenário de **2026** com o de **janeiro de 2027**, quando PIS e Cofins dão lugar à CBS (EC 132/2023, ADCT art. 126; LC 214/2025).

> **Sem integração com base fiscal oficial.** Todas as alíquotas são parâmetros editáveis. Cada um traz fonte legal, vigência e status (*oficial*, *estimado*, *ilustrativo*, *a confirmar* ou *informado*). O resultado depende dos dados informados.

---

## 1. Arquitetura resumida

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Consulta de CNPJ | `src/core/cnpja.js` | API pública da CNPJá (`open.cnpja.com/office/{cnpj}`, CORS liberado): validação do CNPJ, limite local de 5 consultas/minuto, tempo limite de 15 s, cache de 10 min e mensagens de erro (404, 429, rede). Normaliza a resposta só com dados cadastrais; `RTC.model.aplicarReceita` preenche a empresa e marca a origem "receita". |
| Acesso e nuvem | `src/core/auth.js`, `src/core/nuvem.js`, `src/core/sync.js`, `src/core/usuarios.js`, `config/firebase-config.js`, `firestore.rules` | Login pelo **Firebase Authentication**; perfil (`admin`/`cliente`), módulos liberados e bloqueio no documento `users/{uid}`, que só administradores escrevem. `nuvem.js` é o único ponto que conhece o SDK (Auth + Firestore, SDK 13.4.0 via CDN); `sync.js` mantém cada repositório (`rtc`, `lucro`) no cache do navegador do usuário (`nexus.cache.<uid>.<módulo>`) e o envia ao Firestore em segundo plano, com revisão (`rev`) para detectar conflito entre dispositivos, fila de reenvio offline e migração dos dados antigos. Dados em `users/{uid}/stores/{módulo}` (+ `partes/{n}`, 150 mil caracteres por documento). As regras de `firestore.rules` garantem: só o dono lê/grava os próprios dados, administrador não lê dados de clientes, bloqueio e módulos valem a cada operação. O shell mostra e abre só os módulos de `Nexus.auth.acessaModulo(id)`. Ver `docs/FIREBASE.md`. |
| Shell (plataforma) | `index.html`, `src/core/shell.js` | Layout Nexus, menu de módulos (`#/`: cartões dos módulos; `#/inicio/<modulo>`: painel com o caminho de etapas do módulo escolhido), seletor de módulos no topo (`#nx-modswitch`, com 2 ou mais módulos, volta à última etapa de cada um), páginas da plataforma (`#/usuarios`, via `Nexus.shell.registrarPagina()`), registro de módulos e roteamento por hash (`#/rtc/...`, `#/lucro/...`). Novos módulos entram com `Nexus.shell.registrar()`. Os módulos dividem `#nx-content`, por isso cada um ignora eventos quando `Nexus.shell.atual.modulo` não é o seu. |
| Integração entre os módulos | `src/core/integracao.js` | Ao entrar numa tela, `Nexus.integracao.puxar(modulo)` copia os produtos novos do outro módulo. A cópia leva a empresa (por vínculo, CNPJ ou razão social) e a operação/análise. Mapeamentos: `lucroParaRtc` e `rtcParaLucro`; este usa o motor do RTC para ICMS, IPI e antecipação. Empresa, operação/análise e produto ganham um `sync` comum; o produto cujo vínculo já existe no destino não é copiado. Exclusões guardam o vínculo em `syncExcluidos`, e o produto não volta. A cópia é única: alterações posteriores não se propagam. |
| Lucratividade por Item | `src/modules/lucro/motor.js`, `modelo.js`, `importar.js`, `relatorio.js`, `app.js`, `views/*.js`, `assets/css/lucro.css` | Segundo módulo (`Nexus.lucro`), com cadastro de empresas próprio (`nexus.lucro.v1`). O **motor** tem funções puras (`calcularCompra`, `calcularSigma`, `calcularResultado`, `precoParaMargem`, `calculadora`, `calcularItem`, `totais`, `dre`). A `dre` monta a DRE do item pela Lei 6.404/1976, art. 187. Os tributos da venda vêm de `CENARIOS['2026']` (ICMS + PIS/Cofins ou DAS) ou `CENARIOS['2027']` (ICMS + CBS e IBS). No 2027, a CBS e o IBS saem com `fora: true`: ficam fora de Σ e vão para `r.fora`, `r.tributosFora` e `r.totalCliente`. O ICMS tem CBS e IBS na base (t(1 + k) ÷ (1 + t·k)). As alíquotas vêm de `referencia2027()`, que lê `Nexus.rtc.params`, inclusive os valores ajustados no RTC. Na compra de 2027 entram CBS e IBS por fora, com crédito no regime regular, e o IPI fica zero. O cenário é do módulo (`d.cenario`) e chega ao motor em `L.params()`. O seletor do menu inicial usa os ganchos `painelInicio()` e `acaoInicio()` do shell. A importação lê uma linha por item, com a compra, a venda (preço, comissão e cartão) e a tributação da venda (ICMS-ST, alíquota e redução do ICMS, PIS/Cofins), e reconhece o cabeçalho pelo nome. O `relatorio.js` gera o relatório de uma análise: `dados()`, que é puro e tem teste, com resumo, itens, DRE consolidada (`dreConsolidada`) e DRE por item; o PDF (jsPDF sob demanda); o Excel (`planilha()`). A aba de tributação de venda é opcional e se liga por código, com o NCM como reserva. O `app.js` guarda em cache o CL e o Σ de cada item: mudar o preço refaz só o passo do resultado, e as regiões `data-lc-live` são redesenhadas sem trocar o campo em edição. Ver seção 5. |
| Núcleo | `src/core/format.js`, `store.js`, `dom.js`, `charts.js`, `xlsx.js` | Formatação pt-BR (valores em reais sempre como R$ 0,00, com 2 casas nas telas, campos, PDF e Excel; o cálculo usa a precisão completa), repositórios em memória com cache local por usuário e nuvem (`Nexus.sync`) + backup JSON, utilidades de UI, gráficos SVG e XLSX sem dependências: geração (estilos, colunas fixas, listas suspensas) e leitura (.xlsx compactado via `DecompressionStream` e .csv). |
| Base legal | `src/modules/rtc/legal.js` | Catálogo de fundamentos legais (norma, dispositivo, resumo, link). Cada cálculo referencia IDs desse catálogo. |
| Parâmetros | `src/modules/rtc/params.js` | Alíquotas e limites com status, vigência, fundamento e data de atualização. |
| Simples Nacional | `src/modules/rtc/simples.js` | Anexos I e II da LC 123/2006 (2026) e partilha 2027/2028. Calcula a alíquota efetiva ((RBT12 × Aliq − PD) / RBT12). |
| Regras cadastradas | `src/modules/rtc/rules.js` | Perfis tributários de produto (embutidos ou do usuário), aplicáveis à operação. |
| Consolidação | `src/modules/rtc/consolidar.js` | Calcula cada produto da operação e soma custos (inclusive as linhas da memória por componente), preços, tributos, margens e sensibilidade (percentuais recalculados sobre as somas). Com métodos diferentes entre produtos, soma cada produto no próprio método. Quantidade comum (mesma unidade) habilita as médias por unidade. |
| Planilha / importação | `src/modules/rtc/planilha.js` | Planilha de compras do cliente (13 colunas simples: nota, UF do fornecedor, produto, quantidade, valor unitário e opcionais) com abas Produtos e Como preencher. Importação: reconhece as colunas do cliente e as avançadas (COLS, com sinônimos), deduz o tipo de operação pela UF do fornecedor, agrupa por nota e valida linha a linha. |
| **Motor de cálculo** | `src/modules/rtc/engine.js` | Funções **puras**: custo de aquisição, formação do preço, margem efetiva, comparativo, sensibilidade, avisos e memória de cálculo. |
| Telas | `src/modules/rtc/views/*.js` | Empresas, Operação, Custo, Preço, Comparativo, Relatório e Parâmetros. |
| Exportação | `src/modules/rtc/export.js`, `src/modules/rtc/views/relatorio.js` | Dois modelos: **completo** (`dados`: memória de cálculo, comparativos, sensibilidade, fundamentos e parâmetros; PDF paisagem) e **simplificado** (`dadosSimples`: respostas principais, "como chegamos a esses números" com custo + impostos + despesas + lucro = preço, tabelas curtas e "o que muda em 2027"; PDF retrato). PDF com jsPDF carregado sob demanda; Excel .xlsx nativo. O modelo vem de `ui.modeloRelatorio` (padrão: completo para administradores, simplificado para clientes). |
| Testes | `tests/index.html`, `tests/engine.test.js`, `tests/lucro.test.js` | Suíte executada no navegador, cobrindo os cenários tributários e o módulo Lucratividade por Item. |

**Por que JavaScript sem build?** A aplicação roda em qualquer servidor estático com HTTPS (ou `http://localhost`); o login do Firebase não funciona via `file://`. O código fica organizado por namespaces (`Nexus.*`, `Nexus.rtc.*`), e o motor de cálculo não depende do DOM.

### Fluxo de dados

```
Empresa (regime, UF, Simples: anexo + RBT12) ─┐
Operação → Produtos (cada um: identificação,  │
  valores = qtd × unitário, perfil, venda)     ├─► engine.calcular() por produto → consolidar() ─► { custo26, custo27, venda26, venda27,
Parâmetros + alíquotas internas por UF        ┘                         análise 1, análise 2, sensibilidade,
                                                                         avisos, erros, memória de cálculo }
                                                           │
                              telas (Custo, Preço, Comparativo, Relatório) + exportações PDF/XLSX
```

---

## 2. Módulos funcionais

1. **Empresas**: cadastro por cliente. Para o Simples Nacional, pede anexo e RBT12, enquadra a faixa e calcula a alíquota efetiva e a partilha. Verifica o sublimite de R$ 3,6 mi e o limite de R$ 4,8 mi. Também guarda a opção de recolher IBS/CBS fora do DAS em 2027.
2. **Cadastro da operação**: mercadoria (NCM, CEST, CFOPs), UFs, tipo de operação, valores da NF, fornecedor e perfil tributário do produto (ICMS, ST, antecipação, IPI, PIS/Cofins 2026, CBS/IBS 2027), além de margem, despesas variáveis e preço atual.
3. **Custo de aquisição**: componente a componente, com cada crédito habilitável ou desabilitável e o motivo da elegibilidade.
4. **Formação do preço**: modo A (margem → preço) e modo B (preço → margem efetiva), lado a lado.
5. **Comparativo**: indicadores, análise 1 (mesma margem) e análise 2 (mesmo preço), gráficos e sensibilidade à alíquota da CBS.
6. **Relatório**: memória de cálculo completa e exportação em PDF e Excel.
7. **Parâmetros**: alíquotas legais, alíquotas internas por UF, tabelas do Simples, regras cadastradas e backup.

---

## 3. Fórmulas

Convenção: percentuais digitados (ex.: 20) são convertidos para decimal (0,20) antes do cálculo.

### 3.1 Custo de aquisição

```
Valor dos produtos          = quantidade × valor unitário (arredondado a 2 casas, como na NF-e)
Valor da operação (NF)  Vop = produtos + frete (se na NF) + seguro + outras despesas − descontos incondicionais
Custo bruto             CB  = Vop + frete fora da NF + IPI + ICMS-ST + ICMS antecipado [+ CBS + IBS por fora, 2027]
Créditos                CR  = Σ tributos recuperáveis elegíveis e habilitados
Custo líquido           CL  = CB − CR          Custo unitário = CL / quantidade
```

| Componente | Quando é recuperável | Base / fórmula | Fundamento |
|---|---|---|---|
| ICMS próprio | Contribuinte no regime normal de ICMS (não optante do Simples, ou optante acima do sublimite), saída tributada, sem ST ou antecipação com encerramento | `Vop × (1 − red.base) × alíq.`. Se o fornecedor é do Simples: `Vop × % informado na NF`. Com frete fora da NF, soma-se o ICMS destacado no CT-e (campo `valores.icmsFrete`) | LC 87/1996 arts. 13, 19, 20 e 21; LC 123 art. 23 §1º |
| IPI | Estabelecimento industrial ou equiparado, fora do Simples | **valor destacado na NF** (prevalece) ou `Vop × alíq. TIPI` (por fora). Em 2027 (só ZFM): alíquota efetiva da NF × Vop de 2027 | RIPI art. 226; LC 87 art. 13 §2º |
| PIS/Cofins 2026 | Lucro Real (não cumulativo), produto com tributação normal | `(valor dos produtos − descontos − ICMS destacado na NF) × 1,65% / 7,6%`. Regra do escritório: sai todo o ICMS destacado, inclusive o do frete da NF e quando ele não é creditável (ST, isenção). Frete, seguro, despesas, IPI, ICMS-ST e antecipação ficam fora | Leis 10.637/2002 e 10.833/2003, art. 3º e §2º, III (Lei 14.592/2023) |
| CBS/IBS 2027 | Regime regular (LP, LR ou Simples com opção do art. 41 §3º), operação tributada | Fornecedor regular: valor destacado. Fornecedor do Simples: limitado ao valor pago no DAS | LC 214/2025 arts. 47 e 47 §9º |
| ICMS-ST | **Nunca** como crédito para o substituído; vai para o custo | `[(Vop + IPI) × (1 + MVA) × alíq. interna] − ICMS próprio` | LC 87 arts. 6º a 10; Conv. ICMS 142/2018 |
| Antecipação | Crédito só sem encerramento de tributação | informado ou `(alíq. interna − alíq. entrada) × Vop` | legislação estadual |

**Valor da mercadoria em 2027** (premissa explícita, sem presumir aumento ou redução):
- *mesmo valor*: fornecedor mantém o preço e acrescenta CBS/IBS por fora;
- *sem PIS/Cofins embutidos*: `produtos × (1 − % PIS/Cofins do fornecedor)`;
- *informado manualmente*.

### 3.2 Tributos sobre a venda (lineares no preço X)

Cada tributo é modelado como `valor = a·X + b`. Isso permite distinguir os cálculos **por dentro**, **por fora** e **sobre bases específicas**:

| Tributo | 2026 | 2027 | Natureza |
|---|---|---|---|
| ICMS | `t·(1 − red)·X` | idem; se IBS/CBS integrarem a base do ICMS: `t(1+k)/(1+t·k)·X` | por dentro (LC 87 art. 13 §1º, I) |
| PIS/Cofins | `r·(1 − a_ICMS)·X` (sem o ICMS — STF Tema 69; regra fixa, não é premissa opcional) [− r·ICMS-ST, opcional — STJ Tema 1125] | **extintos** | por dentro |
| DAS (Simples) | `alíq. efetiva ajustada·X` (segregação de monofásico/ST — LC 123 art. 18 §4º-A) | partilha 2027 (CBS/IBS no DAS) ou fora do DAS | por dentro |
| CBS | 0,9% teste — **informativo, sem impacto** (LC 214 art. 348) | `(ref − 0,1 p.p.)·(1 − red)·(X − ICMS)` | **por fora** (art. 12 §2º, V; art. 347) |
| IBS | 0,1% teste — **informativo** | `(0,05% + 0,05%)·(1 − red)·(X − ICMS)` | **por fora** (art. 344) |
| IPI | `alíq.·X` (indústria) | zero, salvo ZFM (art. 126, III ADCT; LC 214 art. 454) | por fora |
| IRPJ/CSLL (LP) | `pres.·(15% [+10%]) + pres.·9%` sobre X | idem (CBS/IBS fora da receita bruta) | sobre receita presumida |
| IRPJ/CSLL (LR) | `τ × lucro antes do IR/CS`, τ = 24% ou 34% | idem | sobre o resultado |

### 3.3 Preço de venda (markup divisor)

```
X = (C + Σb) / (1 − m − Σa_dentro − Σa_despesas)          (denominador obrigatoriamente > 0)
```

Forma simplificada do briefing, quando não há bases específicas (`b = 0`):

```
Preço de venda = custo líquido / (1 − margem − tributos sobre a venda − despesas variáveis)
```

- **Margem operacional** (antes de IRPJ/CSLL): `m` entra direto no divisor.
- **Margem líquida** (após IRPJ/CSLL): no Lucro Presumido, os IRPJ/CSLL presumidos entram no divisor. No Lucro Real, usa-se `m_antes = m / (1 − τ)`. No Simples, o IRPJ/CSLL já está no DAS.
- **Valor total ao cliente** = `X + tributos por fora` (IPI, ICMS-ST do substituto, CBS e IBS em 2027).
- Despesas variáveis podem incidir sobre o valor da mercadoria ou sobre o total cobrado (com IBS/CBS).

### 3.4 Margem efetiva (preço informado)

```
Margem efetiva (R$) = X − custo − tributos sobre a venda − despesas variáveis
Margem efetiva (%)  = Margem (R$) / X
Lucro bruto         = X − custo − tributos sobre a venda
Lucro líquido       = margem de contribuição − IRPJ/CSLL estimados
Markup multiplicador = X / custo   (exibido à parte: acréscimo sobre o custo NÃO é margem)
```

### 3.5 Comparativo

- **Análise 1 (mesma margem)**: preço necessário em cada período. Mostra a diferença absoluta e a variação percentual, tanto do valor da mercadoria quanto do total ao cliente.
- **Análise 2 (mesmo preço)**: o preço atual (ou o sugerido de 2026) é mantido. A opção padrão mantém o **total cobrado do cliente**: `X27 = (Total26 − Σb_fora) / (1 + Σa_fora)`. Compara-se a margem efetiva.
- **Sensibilidade**: preço e margem de 2027 para a alíquota de referência da CBS ± 0,5 p.p. e ± 1 p.p.

### 3.6 Simples Nacional (LC 123/2006, art. 18, §1º-A)

```
Alíquota efetiva = (RBT12 × Alíquota nominal − Parcela a deduzir) / RBT12
```

Segregação 2026: ICMS-ST ou antecipação com encerramento retira a parcela do ICMS. PIS/Cofins monofásico retira as parcelas de PIS e Cofins (art. 18 §4º-A, I; §12).
Em 2027, a partilha substitui PIS/Cofins por CBS e IBS. Com a opção do art. 41 §3º (LC 214), as parcelas de CBS/IBS saem do DAS e os tributos passam a ser cobrados por fora, com direito a crédito.

---

## 4. Regras de segurança tributária implementadas

- Nenhuma alíquota fixa sem parâmetro. A alíquota de referência da CBS para 2027 vem como **ESTIMADA** (8,80%, estimativa do Ministério da Fazenda de abr/2024), pendente da Resolução do Senado (LC 214 art. 349).
- As alíquotas internas de ICMS por UF **não vêm preenchidas**. São informadas pelo usuário e ficam registradas com fonte e data.
- Cada regime tem sua própria regra de crédito, e nenhum tributo destacado é recuperado automaticamente.
- ICMS-ST nunca é crédito.
- As alíquotas-teste de 2026 não somam carga (art. 348).
- Custo de aquisição e tributos sobre a venda ficam separados.
- Margem sobre a venda e acréscimo sobre o custo aparecem separados.
- Cada linha da memória de cálculo indica a origem: *Informado*, *Regra cadastrada*, *Parâmetro legal* ou *Calculado*.
- Os avisos aparecem quando falta informação para uma conclusão tributária confiável.
- Os parâmetros registram a data da última atualização.

## 5. Módulo Lucratividade por Item

Especificação: `docs/modulo-lucratividade.md`. Todos os valores de compra são **totais da linha**; o preço de venda (PV) é **unitário**.

### 5.1 Custo líquido de aquisição (CL)

```
CB  = V_merc − D_compra + Frete + IPI + Seguro/outros + DAE
Crédito ICMS = ICMS destacado + ICMS do frete + DAE 1023 (só se pago, empresa do CE, fora do Simples)
               — zero no item com DAE 1031 (ICMS-ST)
Base PIS/Cofins (Real) = V_merc − D_compra − ICMS destacado na NF      (frete, seguro, IPI e DAE fora: regra do escritório)
Crédito PIS/Cofins (Real) = Base × (1,65% + 7,6%)   — zero se monofásico/alíquota zero/isento/suspenso ou fornecedor não PJ no Brasil
CL  = CB − créditos
```

| Regime | Créditos | Fundamento |
|---|---|---|
| Simples Nacional | nenhum | LC 123/2006, art. 23 |
| Lucro Presumido | ICMS | LC 87/1996, arts. 19 e 20 |
| Lucro Real | ICMS + PIS/Cofins | idem + Leis 10.637/2002 e 10.833/2003, art. 3º |

- **DAE 1023 (ICMS antecipado):** é crédito no regime normal, apropriado só depois do recolhimento (Decreto 33.327/2019, art. 61, § 5º). Não pago, fica como crédito a apropriar, com alerta. Por cautela, esse valor **não** reduz o CL.
- **DAE 1031 (ICMS-ST):** sempre custo, sem crédito de ICMS e fora da base de PIS/Cofins (STJ, Tema 1.231).
- **Item com DAE 1031:** a ST encerra a tributação, então não há débito na venda nem crédito na compra. O ICMS destacado na NF e o ICMS do frete do item também ficam no custo, sem crédito. A tabela da especificação creditava o ICMS destacado mesmo nesse caso; a regra foi alterada por decisão do escritório em 28/10/2026. A base de crédito de PIS/Cofins (Real) continua excluindo o ICMS destacado, porque a Lei 14.592/2023 manda excluí-lo. A explicação aparece no detalhe do crédito de ICMS (`motivoIcms`). O dispositivo específico do RICMS-CE ainda deve ser confirmado antes de ser citado na tela.

- **Base do crédito de PIS/Cofins (decisão do escritório, 28/10/2026):** `mercadoria − desconto − ICMS destacado na NF`. A especificação somava frete e seguro (A100: base 934, lucro 286,04). Na regra do escritório, a base do A100 é 880 e o lucro é 281,04. A regra foi conferida com o caso real MS 162 da planilha `calculo_1_lucratividade.xlsx`: base 7.144,50, PIS/Cofins 660,87, custo 7.325,22375 e lucro unitário 286,42138, iguais aos da planilha.

### 5.2 Venda, lucro e margem

```
Σ   = a_ICMS_ef + (a_PIS + a_Cofins)(1 − a_ICMS_ef) + comissão + cartão  [+ IRPJ/CSLL presumidos, se ativado no Presumido]
      a_ICMS_ef = alíquota × (1 − redução da base); 0 com ICMS-ST na venda; Simples: alíquota do DAS do item
PLD = PV (1 − d)               (desconto em R$: PLD = PV − desconto)
Lucro  = PLD (1 − Σ) − CL_unit
Margem = Lucro ÷ PLD
PV_mín   = CL ÷ ((1 − d)(1 − Σ))
PV_meta(m) = CL ÷ ((1 − d)(1 − Σ − m))    — erro quando Σ + m ≥ 100%
```

- PIS/Cofins da venda incidem sobre o PLD sem o ICMS (STF, Tema 69 — RE 574.706). O desconto incondicional fica fora da base (Leis 10.637/2002 e 10.833/2003, art. 1º, § 3º, V, "a"; LC 87/1996, art. 13, § 1º, II, "a").
- **Modos do preço:**
  1. markup com despesas: `PV = CL × M`;
  2. markup sem despesas: `PV = CL × M ÷ ((1 − d)(1 − Σ))`;
  3. preço informado.
- Digitar a margem desejada calcula `PV_meta` e muda o modo para preço informado.
- **Totais:** a margem total é `Σ lucros ÷ Σ PLD`, ponderada pelo faturamento, e não a média das margens.
- **IRPJ/CSLL:**
  - **Presumido:** entram em Σ (2,28% do PLD sem o adicional) quando ativados.
  - **Real:** só uma estimativa sobre o lucro do item, porque a apuração depende do resultado do período.
- **Cenário 2027:** a configuração já existe e devolve erro ("em breve"). O motor recebe os tributos da venda como uma lista configurável por cenário (`CENARIOS`). Para incluir a CBS/IBS, basta acrescentar a configuração de 2027.

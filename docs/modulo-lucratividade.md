# RTC Comparativo — Módulo de Lucratividade por Item

Oct 28, 2026 · @Rafael

## Visão geral

O módulo calcula, item a item, a lucratividade de uma venda a partir do custo líquido de aquisição (já descontados os créditos recuperáveis do regime da empresa) e do preço de venda líquido de tributos, comissões, taxas e descontos. Qualquer alteração no preço de venda recalcula lucro e margem na hora, sem salvar nem recarregar.

**Fluxo em quatro etapas**

1. **Parâmetros da empresa** — regime (Simples, Presumido, Real), UF, alíquotas padrão e cenário (2026 ou 2027).
2. **Compra** — o usuário importa ou digita os itens; o sistema separa o que é crédito do que é custo.
3. **Venda** — o usuário escolhe o modo (markup ou preço informado) e o sistema monta o preço e as deduções.
4. **Resultado** — lucro bruto, lucro líquido e margem por item e no total, com recálculo em tempo real.

**Fora do escopo desta versão:** rateio de despesas fixas por item (ponto de equilíbrio) e apuração mensal de IRPJ/CSLL do Lucro Real, que depende do resultado do período e não do item isolado.

## Parâmetros da empresa

O regime tributário é o parâmetro que decide todas as regras de crédito; ele é escolhido uma vez por empresa e pode ser sobrescrito por simulação ("e se eu fosse Lucro Real?").

| Campo | Tipo | Valores / padrão | Uso no cálculo |
| --- | --- | --- | --- |
| `regime` | enum | `SIMPLES`, `PRESUMIDO`, `REAL` | Define créditos de compra e tributos de venda |
| `uf` | texto | `CE` | Habilita as regras do DAE 1023/1031 (Decreto 33.327/2019) |
| `aliq_pis` / `aliq_cofins` | % | Real: 1,65% / 7,6%; Presumido: 0,65% / 3% | Débito na venda e crédito na compra (só Real) |
| `aliq_icms_interna_padrao` | % | editável | Sugestão para itens sem tributação importada |
| `das_aliquota_efetiva` | % | calculada fora do módulo ou digitada | Tributo sobre a venda no Simples |
| `presuncao_irpj` / `presuncao_csll` | % | 8% / 12% (comércio), editáveis | IRPJ/CSLL sobre a receita no Presumido |
| `aliq_irpj` / `aliq_csll` | % | 15% (+ adicional 10%) / 9% | Presumido: sobre a base presumida; Real: estimativa opcional |
| `considerar_irpj_csll` | booleano | `false` | Mostra lucro antes e depois de IRPJ/CSLL |
| `cenario` | enum | `2026`, `2027` | Ponto de extensão para CBS/IBS (ver abaixo) |

**Regras de base legal para os padrões:**

- PIS/COFINS não cumulativos (Real): 1,65% e 7,6% — Lei 10.637/2002, art. 2º, e Lei 10.833/2003, art. 2º.
- PIS/COFINS cumulativos (Presumido): 0,65% e 3% — Lei 9.715/1998, art. 8º, I, e Lei 9.718/1998, art. 8º. O Presumido fica fora da não cumulatividade por força da Lei 10.637/2002, art. 8º, II, e da Lei 10.833/2003, art. 10, II.
- Presunção do Presumido: 8% (IRPJ) e 12% (CSLL) para revenda de mercadorias — Lei 9.249/1995, arts. 15 e 20. Deixar editável, porque a empresa pode ter atividade com outro percentual.

**Cenário 2027.** A partir de 2027, PIS e COFINS são substituídos pela CBS (EC 132/2023 e LC 214/2025). O motor deve receber os tributos sobre a venda e os créditos como uma lista de tributos configurável, e não como campos fixos `pis`/`cofins`, para que o cenário 2027 seja só outra configuração.

*Implementado em 16/11/2026* com as regras e as alíquotas do RTC Comparativo. As regras:
- CBS e IBS por fora, sobre (PLD − ICMS);
- ICMS com CBS e IBS na base, conforme orientação da SEFAZ;
- crédito de CBS e IBS na compra, no regime regular;
- IPI zero;
- no Simples, a CBS e o IBS ficam no DAS e na compra não geram crédito.

O detalhe está no README, em "Cenário 2027 (CBS e IBS)".

## Compra — campos e custo de aquisição

O custo bruto de aquisição soma tudo o que a empresa desembolsa para trazer a mercadoria até o estabelecimento; o custo líquido é esse valor menos os créditos que o regime permite recuperar. Essa composição segue o Decreto-Lei 1.598/1977, art. 13, §1º (reproduzido no RIR/2018, art. 301, §1º): transporte, seguro e tributos devidos na aquisição integram o custo das mercadorias.

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `codigo` / `descricao` / `ncm` | texto | sim | Chave para casar com a planilha de tributação de venda |
| `quantidade` | número | sim | Todos os valores abaixo são do total da linha; o sistema divide por quantidade para ter o unitário |
| `valor_mercadoria` | R$ | sim | Valor dos produtos na NF |
| `desconto_compra` | R$ | não | Desconto incondicional na NF de compra (reduz o custo) |
| `frete` | R$ | não | Frete pago pelo comprador (FOB) ou destacado na NF |
| `icms_frete` | R$ | não | ICMS destacado no CT-e, quando o frete é FOB e tomado por contribuinte |
| `ipi` | R$ | não | IPI destacado pelo fornecedor |
| `seguro_outros` | R$ | não | Seguro e outras despesas acessórias |
| `icms_destacado` | R$ | não | ICMS próprio destacado na NF de compra |
| `dae_valor` | R$ | não | Valor recolhido via DAE |
| `dae_codigo` | enum | se `dae_valor` > 0 | `1023` (ICMS Antecipado) ou `1031` (ICMS-ST entrada interestadual) |
| `dae_pago` | booleano | não | Controla o momento do crédito do 1023 (ver regras de crédito) |
| `regime_pis_cofins_item` | enum | só Real | `NORMAL`, `MONOFASICO`, `ALIQ_ZERO`, `ISENTO`, `SUSPENSO` |
| `fornecedor_pj_brasil` | booleano | só Real | `true` por padrão; `false` bloqueia crédito de PIS/COFINS |

**Custo bruto de aquisição (CB):**

```latex
CB = V_{merc} - D_{compra} + Frete + IPI + Seg + DAE
```

O ICMS destacado e o ICMS do frete não somam ao CB porque já estão dentro do valor da mercadoria e do frete (cálculo "por dentro"); eles só aparecem como crédito.

## Regras de crédito por regime

No Simples nada é recuperado; no Presumido só o ICMS; no Real, ICMS e PIS/COFINS — com três exclusões da base de PIS/COFINS que o sistema precisa aplicar automaticamente (ICMS, IPI e ICMS-ST).

| Componente da compra | Simples Nacional | Lucro Presumido | Lucro Real |
| --- | --- | --- | --- |
| ICMS destacado na NF | Custo | Crédito | Crédito |
| ICMS do frete (CT-e, FOB) | Custo | Crédito | Crédito |
| DAE 1023 — ICMS Antecipado | Custo | Crédito após o pagamento | Crédito após o pagamento |
| DAE 1031 — ICMS-ST | Custo | Custo | Custo (sem crédito de PIS/COFINS) |
| IPI (comerciante) | Custo | Custo | Custo (fora da base de PIS/COFINS) |
| Frete e seguro | Custo | Custo | Custo + base de PIS/COFINS (líquidos do ICMS do frete) |
| PIS/COFINS sobre a compra | — | — | Crédito de 1,65% + 7,6% sobre a base ajustada |

### Simples Nacional

- Nenhum crédito é apropriado: LC 123/2006, art. 23, caput.
- 1023 e 1031 entram integralmente no custo. O Simples não dispensa o ICMS por ST nem o antecipado: LC 123/2006, art. 13, §1º, XIII, alíneas "a" e "g".

### Lucro Presumido e Lucro Real — ICMS

- O direito ao crédito do ICMS decorre da não cumulatividade (LC 87/1996, arts. 19 e 20) e independe do regime de IRPJ.
- **1023 (Antecipado):** é crédito fiscal no Regime Normal (Decreto 33.327/2019, art. 61, caput), mas a apropriação só é permitida após o efetivo recolhimento (art. 61, §5º). O Parecer CECON nº 235/2024 aplica esse mesmo parágrafo. Regra do sistema: se `dae_pago = false`, o crédito entra no cálculo como "crédito a apropriar" e a tela mostra um alerta.
- **1031 (ICMS-ST):** a substituição tributária encerra a fase de tributação, então não há débito na saída nem crédito na entrada; o valor é custo. Antes de publicar, confirmar o dispositivo específico do Decreto 33.327/2019 (ou do decreto setorial da ST por CNAE, no caso da Lei 14.237/2008) para citar na tela de ajuda.

### Lucro Real — PIS/COFINS

Base do crédito: Lei 10.637/2002, art. 3º, I, e Lei 10.833/2003, art. 3º, I (bens adquiridos para revenda). O sistema monta a base assim:

```latex
BC_{PIS/COF} = V_{merc} - D_{compra} + Frete + Seg - ICMS_{dest} - ICMS_{frete}
```

- **Exclui o ICMS destacado:** Lei 10.637/2002 e Lei 10.833/2003, art. 3º, §2º, III, incluído pela Lei 14.592/2023. A Solução de Consulta COSIT nº 267/2023 fixa a exclusão obrigatória a partir de 1º/05/2023.
- **Exclui o IPI não recuperável:** IN RFB 2.121/2022, art. 171, parágrafo único, III (redação da IN RFB 2.152/2023). O STJ confirmou no Tema Repetitivo 1.373, para operações a partir de 20/12/2022.
- **Exclui o ICMS-ST (1031) e o ICMS Antecipado (1023):** o STJ, no Tema Repetitivo 1.231, negou crédito de PIS/COFINS sobre o ICMS-ST pago pelo substituído. O 1023 já é recuperado como ICMS, então também fica fora.
- **Zera o crédito do item** quando `regime_pis_cofins_item` for `MONOFASICO` ou `ALIQ_ZERO` (Lei 10.637/2002 e Lei 10.833/2003, art. 3º, I, alínea "b") ou quando a aquisição não sofreu incidência (art. 3º, §2º, II).
- **Zera o crédito** se `fornecedor_pj_brasil = false` (art. 3º, §3º, I, das duas leis).

## Venda — campos e modos de precificação

Toda dedução da venda é expressa em percentual sobre o preço líquido de desconto (PLD), o valor que de fato é faturado; isso permite recalcular tudo instantaneamente quando o preço muda.

| Campo | Tipo | Base de incidência |
| --- | --- | --- |
| `preco_venda` (PV) | R$ unitário | — |
| `desconto_incondicional` | % ou R$ | Sobre PV; gera o PLD |
| `comissao` | % | Sobre PLD |
| `taxa_cartao` | % | Sobre PLD (permitir uma taxa média ou por bandeira/parcela em versão futura) |
| `tributos_venda` | lista | Vem da planilha de tributação (seção seguinte) ou dos padrões do regime |

O desconto incondicional fica fora da receita tributável: Lei 10.637/2002 e Lei 10.833/2003, art. 1º, §3º, V, "a" (PIS/COFINS), e LC 87/1996, art. 13, §1º, II, "a", que só inclui na base do ICMS os descontos condicionais.

### Tributos sobre a venda por regime

| Regime | Tributos calculados sobre o PLD |
| --- | --- |
| Simples | DAS: `das_aliquota_item`. Para item com ICMS-ST ou antecipado, a planilha deve trazer a alíquota já sem a parcela de ICMS (LC 123/2006, art. 18, §4º-A, I) |
| Presumido | ICMS próprio (zero se o item é ST) · PIS 0,65% e COFINS 3% sobre (PLD − ICMS) · IRPJ e CSLL presumidos, se `considerar_irpj_csll` |
| Real | ICMS próprio (zero se ST) · PIS 1,65% e COFINS 7,6% sobre (PLD − ICMS), zero se o item é monofásico · IRPJ/CSLL só como estimativa opcional sobre o lucro do item |

A exclusão do ICMS da base de PIS/COFINS na venda segue o STF, Tema 69 (RE 574.706).

### Modos de formar o preço

O usuário escolhe o modo por item ou para a planilha inteira; em qualquer modo, o PV resultante fica editável e passa a valer como preço informado.

1. **Markup que já contempla as despesas.** PV = custo líquido × markup. As comissões, a taxa de cartão e os tributos são informados só para o sistema mostrar quanto sobra de lucro.
2. **Markup que não contempla as despesas.** O markup aplicado sobre o custo gera o preço-base, e o sistema adiciona as despesas "por dentro" (gross-up) para que elas não comam a margem.
3. **Preço informado.** O usuário digita o PV e cada despesa individualmente; o sistema só calcula o resultado.
4. **Preço sem PIS/Cofins** *(acrescentado em 16/11/2026)*. O usuário digita o preço de hoje, com o PIS e a Cofins embutidos (`venda.precoAtual`). No cenário 2027, o sistema retira deles o PIS e a Cofins pelas regras de 2026: f = (alíquota do PIS + da Cofins) × (1 − alíquota efetiva do ICMS), a mesma conta do débito da venda (STF, Tema 69). Com desconto em %, PV = preço de hoje × (1 − f); com desconto em R$, PV = preço de hoje − f × (preço de hoje − desconto). Nos dois casos, o PLD cai exatamente o PIS e a Cofins do PLD de hoje. f = 0 no Simples Nacional (PIS e Cofins dentro do DAS) e no item sem incidência na venda. No cenário 2026, PV = preço de hoje. A CBS e o IBS são calculados por fora sobre o novo preço.

## Importação de planilhas

São duas planilhas independentes, ligadas pelo `codigo` do item (com o `ncm` como chave de reserva): a de compra traz os custos, a de tributação traz como cada item é tributado na venda. Aceitar .xlsx e .csv (separador `;`, decimal `,`), e oferecer o modelo vazio para download.

**Planilha 1 — Compra** (uma linha por item da NF):

```csv
codigo;descricao;ncm;quantidade;valor_mercadoria;desconto_compra;frete;icms_frete;ipi;seguro_outros;icms_destacado;dae_valor;dae_codigo;dae_pago;regime_pis_cofins_item
A100;Torneira metal;84818019;10;1000,00;0,00;50,00;6,00;50,00;10,00;120,00;80,00;1023;S;NORMAL
B200;Chuveiro eletr.;85161000;5;400,00;0,00;20,00;0,00;0,00;0,00;0,00;72,00;1031;S;NORMAL
```

**Planilha 2 — Tributação de venda** (uma linha por item):

```csv
codigo;ncm;icms_st;aliq_icms_venda;reducao_bc_icms;regime_pis_cofins_venda;das_aliquota_item
A100;84818019;N;20,00;0,00;NORMAL;
B200;85161000;S;0,00;0,00;NORMAL;
```

**Regras de importação:**

- Cabeçalho por nome, não por posição; aceitar variações sem acento e em maiúsculas.
- `dae_codigo` aceita só `1023` ou `1031`; qualquer outro valor bloqueia a linha com mensagem.
- Item da compra sem linha de tributação: usar os padrões do regime e marcar o item com o aviso "tributação padrão".
- `icms_st = S` zera o ICMS da venda e exige que a compra tenha `dae_codigo = 1031` ou ICMS-ST retido na NF; se não tiver, mostrar alerta de inconsistência sem bloquear.
- Mostrar uma prévia com contagem de linhas válidas, alertas e erros antes de gravar.

## Motor de cálculo

Todo o resultado sai de duas grandezas: o custo líquido (CL), fixo enquanto a compra não muda, e a soma das deduções percentuais sobre o PLD (Σ), fixa enquanto a tributação não muda. Com elas, lucro, margem e preço-alvo são contas de uma linha.

**1. Créditos e custo líquido**

```latex
Cred_{ICMS} = ICMS_{dest} + ICMS_{frete} + DAE_{1023} \quad (\text{zero no Simples})
```

```latex
Cred_{PIS/COF} = BC_{PIS/COF} \cdot (1{,}65\% + 7{,}6\%) \quad (\text{só Real, item elegível})
```

```latex
CL = CB - Cred_{ICMS} - Cred_{PIS/COF}
```

**2. Deduções da venda (Σ)**, com a alíquota efetiva de ICMS = alíquota × (1 − redução de base):

```latex
\Sigma = a_{ICMS} + (a_{PIS} + a_{COF})(1 - a_{ICMS}) + a_{com} + a_{cartao} + a_{IR/CS\,presumido}
```

No Simples, Σ = DAS do item + comissão + cartão. No Presumido com IRPJ/CSLL ligado, a parcela presumida é presunção × alíquota (8% × 15% + 12% × 9% = 2,28% do PLD, sem o adicional, que depende do trimestre).

**3. Resultado do item**

```latex
PLD = PV \cdot (1 - d) \qquad Lucro = PLD \cdot (1 - \Sigma) - CL \qquad Margem = \frac{Lucro}{PLD}
```

**4. Preços derivados**

```latex
PV_{min} = \frac{CL}{(1-d)(1-\Sigma)} \qquad PV_{alvo}(m) = \frac{CL}{(1-d)(1-\Sigma-m)} \qquad PV_{modo2} = \frac{CL \cdot M}{(1-d)(1-\Sigma)}
```

Se Σ + m ≥ 100%, não existe preço que atinja a margem: o sistema mostra a mensagem em vez de dividir.

**Caso de teste — item A100, Lucro Real** (compra da planilha de exemplo; venda a R$ 1.800,00 com 2% de desconto, ICMS 20%, comissão 3%, cartão 2,5%):

| Etapa | Cálculo | Valor (R$) |
| --- | --- | --- |
| Custo bruto (CB) | 1.000 + 50 + 50 + 10 + 80 | 1.190,00 |
| Crédito de ICMS | 120 + 6 + 80 (1023 pago) | 206,00 |
| Base PIS/COFINS da compra | 1.000 + 50 + 10 − 120 − 6 | 934,00 |
| Crédito PIS + COFINS | 934 × 9,25% | 86,40 |
| Custo líquido (CL) | 1.190 − 206 − 86,40 | 897,61 |
| PLD | 1.800 × 0,98 | 1.764,00 |
| ICMS da venda | 1.764 × 20% | 352,80 |
| PIS + COFINS da venda | (1.764 − 352,80) × 9,25% | 130,54 |
| Comissão + cartão | 1.764 × 5,5% | 97,02 |
| **Lucro do item** | 1.764 − 352,80 − 130,54 − 97,02 − 897,61 | **286,04** |
| **Margem sobre o PLD** | 286,04 ÷ 1.764 | **16,22%** |
| Σ | 20% + 9,25% × 80% + 5,5% | 32,90% |
| PV mínimo (lucro zero) | 897,61 ÷ (0,98 × 0,671) | 1.365,01 |
| PV para margem de 20% | 897,61 ÷ (0,98 × 0,471) | 1.944,64 |
| PV modo 1, markup 1,6 | 897,61 × 1,6 | 1.436,17 |
| PV modo 2, markup 1,6 | 1.436,17 ÷ (0,98 × 0,671) | 2.184,02 |

Os cálculos usam precisão total e arredondam só na exibição (2 casas); os testes devem comparar com tolerância de R$ 0,01.

## Recálculo em tempo real e tela de resultado

O recálculo é instantâneo porque CL e Σ são calculados uma vez por item e guardados como estado derivado; mudar o preço refaz só a etapa 3 do motor, sem chamada ao servidor.

**Como implementar:**

- Motor como funções puras (`calcularCompra`, `calcularSigma`, `calcularResultado`, `precoParaMargem`) num módulo sem dependência de interface — o mesmo código roda no navegador e nos testes.
- Estado derivado (`useMemo` ou equivalente) dependente de compra e tributação; o preço é estado local do campo.
- Edição nos dois sentidos: o usuário digita o **preço** e vê a margem, ou digita a **margem desejada** e o sistema preenche o preço com `PV_alvo(m)`.
- Gravar no banco com debounce (cerca de 500 ms) só depois que o usuário para de digitar; o cálculo na tela não espera a gravação.

**Tela por item (de cima para baixo):**

1. Custo bruto, créditos (ICMS e PIS/COFINS separados) e custo líquido, com o detalhe de cada crédito ao passar o mouse.
2. Campo de preço com o modo de precificação ao lado, desconto, comissão e cartão editáveis.
3. Cascata do preço: PLD → tributos → comissão e cartão → custo líquido → lucro.
4. Lucro em R$ e margem em %, com cor por faixa: vermelho abaixo de zero, amarelo abaixo da margem-alvo da empresa, verde acima.
5. Referências fixas: PV mínimo e PV para a margem-alvo, para o usuário ver o espaço de negociação.

**Tela da planilha:** tabela com uma linha por item (custo líquido, PV, lucro, margem) e totais ponderados pelo faturamento; a margem total é Σ lucros ÷ Σ PLD, e não a média das margens. Editar o PV numa célula atualiza a linha e os totais na hora. Alertas visíveis por linha: 1023 não pago, tributação padrão, inconsistência de ST, margem negativa.

## Modelo de dados, testes e prompt para o Claude Code

**Tipos centrais** (TypeScript; adaptar à stack do RTC):

```typescript
type Regime = 'SIMPLES' | 'PRESUMIDO' | 'REAL';
type RegimePisCofinsItem = 'NORMAL' | 'MONOFASICO' | 'ALIQ_ZERO' | 'ISENTO' | 'SUSPENSO';
type ModoPreco = 'MARKUP_COM_DESPESAS' | 'MARKUP_SEM_DESPESAS' | 'PRECO_INFORMADO' | 'PRECO_SEM_PIS_COFINS';

interface ItemCompra {
  codigo: string; descricao: string; ncm: string; quantidade: number;
  valorMercadoria: number; descontoCompra: number; frete: number; icmsFrete: number;
  ipi: number; seguroOutros: number; icmsDestacado: number;
  dae?: { valor: number; codigo: '1023' | '1031'; pago: boolean };
  regimePisCofins: RegimePisCofinsItem; fornecedorPjBrasil: boolean;
}

interface TributacaoVenda {
  codigo: string; icmsSt: boolean; aliqIcms: number; reducaoBcIcms: number;
  regimePisCofins: RegimePisCofinsItem; dasAliquota?: number;
}

interface Venda {
  modo: ModoPreco; markup?: number; precoVenda?: number;
  desconto: number; comissao: number; taxaCartao: number; margemAlvo?: number;
}

interface ResultadoItem {
  custoBruto: number; creditoIcms: number; creditoIcmsPendente: number;
  creditoPisCofins: number; custoLiquido: number; sigma: number;
  pld: number; tributosVenda: number; despesasVenda: number;
  lucro: number; margem: number; pvMinimo: number; pvAlvo?: number;
  alertas: string[];
}
```

**Testes obrigatórios:**

- [ ] Item A100 no Lucro Real reproduz a tabela do caso de teste (lucro 286,04; margem 16,22%).
- [ ] Mesmo item no Simples: crédito zero e CL igual ao CB (1.190,00).
- [ ] Mesmo item no Presumido: crédito só de ICMS (206,00) e CL de 984,00.
- [ ] DAE 1031 nunca gera crédito, em nenhum regime.
- [ ] DAE 1023 com `pago = false` vai para `creditoIcmsPendente` e gera alerta.
- [ ] Item monofásico no Real: crédito de PIS/COFINS zero na compra e PIS/COFINS zero na venda.
- [ ] Σ + margem-alvo ≥ 100% retorna erro tratado, sem divisão por zero.
- [ ] Alterar o PV muda lucro e margem sem recalcular CL nem Σ.

**Prompt para colar no Claude Code:**

```markdown
Vou implementar no RTC Comparativo um novo módulo "Lucratividade por Item".
A especificação completa está em docs/modulo-lucratividade.md (colei este documento lá).

1. Leia a especificação e a estrutura atual do projeto antes de propor qualquer código.
2. Crie o motor de cálculo como funções puras, separadas da interface, seguindo a seção "Motor de cálculo".
3. Escreva primeiro os testes da seção "Testes obrigatórios" e faça-os passar.
4. Depois implemente a importação das duas planilhas e a tela com recálculo em tempo real.
5. Use os padrões de componentes, estilo e banco já existentes no projeto.
Mostre o plano antes de começar a editar arquivos.
```

## Fontes

- [Decreto CE 33.327/2019 — art. 61, §5º](https://www.legisweb.com.br/legislacao/?id=384287)
- [Parecer CECON nº 235/2024 (crédito do ICMS Antecipado após o pagamento)](https://www.legisweb.com.br/legislacao/?id=474763)
- [Códigos de receita do DAE/CE (1023 ICMS Antecipado)](https://www.coad.com.br/files/trib/html/pesquisa/ce/em60643.htm)
- [Código 1031 — ICMS-ST entrada interestadual (EFD/CE)](https://portalspedbrasil.com.br/?p=19283)
- [Solução de Consulta COSIT 267/2023 — exclusão do ICMS da base de crédito](https://tributodevido.com.br/portal/icms-na-base-de-calculo-dos-creditos-de-pis-cofins/)
- [STJ, Tema 1.231 — ICMS-ST não gera crédito de PIS/COFINS](https://cesconbarrieu.com.br/primeira-secao-do-stj-julga-relevantes-temas-em-materia-de-piscofins/)
- [STJ, Tema 1.373 — IPI não recuperável fora da base de crédito](https://www.legjur.com/jurisprudencia/eme/580.3645.9594.8754)

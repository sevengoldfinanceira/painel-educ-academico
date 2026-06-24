# Educ Acadêmico

Sistema simples para organizar parcerias, cursos, precos e vendas.

## Como abrir

Cole este endereco no navegador:

```text
file:///C:/Users/Jhow/Documents/CRM%20EDUCAMAIS/index.html
```

## O que ele faz

- Lista todas as escolas, faculdades e polos parceiros.
- Mostra os cursos por parceria.
- Mostra um plano geral com todos os cursos.
- Pesquisa por curso, parceria, modalidade, area e observacoes.
- Ordena cursos por nome, instituicao, custo ou valor de venda.
- Cadastra e edita parcerias.
- Guarda link do site da parceria e contrato em PDF.
- Guarda link do MEC na parceria/faculdade.
- Guarda observacoes livres por instituicao, incluindo dados de pagamento e informacoes adicionais.
- Permite excluir parceria e remove junto os cursos e vendas ligados a ela.
- Cadastra, edita e exclui cursos.
- Guarda custo, preco, repasse, prazo de entrega, responsavel/diretor e diplomas em cada curso.
- Mostra botoes de acesso rapido para MEC, site da parceria e contrato.
- Adiciona uma venda direto pelo botao `+` na lista de cursos.
- Registra comissao do vendedor em cada venda, em valor ou percentual sobre o lucro.
- Mantem um relatorio de vendas com data, aluno, grau, curso, faculdade, situacao, custo, venda, lucro, vendedor, pagamento e quantidade.
- Calcula os totais de custo, venda, comissao e lucro no relatorio.
- Filtra vendas por intervalo de datas, mes especifico, vendedor, forma de pagamento, instituicao, curso e situacao.
- Mantem uma aba de custos da operacao para marketing semanal, marketing mensal, ChatGPT e outros custos.
- Calcula lucro liquido descontando comissoes e custos operacionais.
- Mostra a sequencia Venda, Custo, Lucro, Comissao e Lucro final no relatorio.
- Mantem editor de texto padrao para contratos, com impressao/salvamento em PDF.
- Guarda um contrato, varios catalogos de precos e outros documentos por faculdade.
- Guarda prova em PDF por curso e lista todas as provas em uma aba propria.
- Exporta e importa os dados para levar as edicoes ao site publicado online.
- Inclui a faculdade Edu Mais, seu catalogo PDF e 388 cursos importados do catalogo fornecido.
- Mantem uma aba de Marketing para arquivos de venda, indicacao, templates para clientes, redes sociais e outros materiais.

## Onde os dados ficam

O sistema esta configurado para salvar online no Supabase e mantem uma copia local de seguranca.

## Ativar o banco online

1. Abra o projeto no Supabase.
2. Entre em `SQL Editor`.
3. Abra e execute o conteudo do arquivo `supabase-setup.sql`.
4. Entre em `Authentication` e depois `Users`.
5. Crie um usuario com e-mail e senha.
6. Abra o site e entre com o usuario criado.

O indicador no topo mostrara `Salvo online` quando a sincronizacao estiver funcionando.

Sempre que o arquivo `supabase-setup.sql` for atualizado, execute seu conteudo novamente no SQL Editor. A tabela
`crm_sales` guarda cada venda separadamente e evita que alteracoes em outros aparelhos sobrescrevam vendas.

# REGRAS PERMANENTES DO PROJETO

## 1. Tipo de projeto e padrão geral
Este projeto faz parte do conjunto de **sistemas/CRMs do usuário**.

Ele **não deve ser tratado como landing page simples**.  
Ele deve ser tratado como **sistema contínuo**, com uso em **desktop, mobile e PWA instalado**.

### Padrão-base deste projeto
- **Frontend:** aplicação web responsiva com comportamento de sistema/app
- **Formato de uso:** desktop + mobile + PWA
- **Backend / banco / autenticação:** Supabase
- **Deploy / hospedagem:** Vercel
- **Repositório oficial:** GitHub

### Regra importante
Este projeto compartilha o mesmo padrão-base dos outros sistemas do usuário.  
Sempre que possível, o agente deve manter consistência estrutural, visual e de experiência com os outros CRMs/sistemas do mesmo ecossistema.

---

## 2. GitHub é a fonte oficial do projeto
- O **GitHub é a fonte principal e a verdade oficial do projeto**.
- A pasta local é apenas uma cópia de trabalho.
- Antes de qualquer alteração, o agente deve considerar que a versão mais confiável é a do GitHub.
- O agente nunca deve trabalhar assumindo que a pasta local está atualizada sem verificar antes.

---

## 3. Sincronização obrigatória antes de editar
Antes de qualquer alteração no projeto, o agente deve:

1. verificar o estado atual do repositório local
2. sincronizar a pasta local com a versão mais recente do GitHub antes de editar
3. evitar trabalhar em cima de uma versão desatualizada

Se houver conflito, alteração local pendente, erro de sincronização ou risco de sobrescrever trabalho, o agente deve **parar e avisar o usuário antes de continuar**.

---

## 4. Aprovação obrigatória antes de commit, push ou deploy
Antes de qualquer commit, push ou publicação, o agente deve obrigatoriamente:

1. mostrar um resumo claro do que foi alterado
2. listar os arquivos modificados
3. aguardar a aprovação do usuário

O agente **não pode** fazer commit, push ou deploy automaticamente sem aprovação explícita do usuário.

---

## 5. Fluxo após aprovação
Após a aprovação do usuário, o agente deve:

1. criar um commit com mensagem clara e descritiva
2. fazer push para a branch principal do projeto
3. confirmar que o push foi concluído corretamente

Se o projeto estiver conectado à Vercel com deploy automático, considerar que o push poderá disparar a atualização automaticamente.

---

## 6. Regra de escopo da alteração
O agente deve alterar **somente o que foi pedido**.

### Regras:
- se o pedido for apenas **mobile**, não alterar desktop
- se o pedido for apenas **desktop**, não alterar mobile
- se o pedido for apenas **visual/UI/UX**, não alterar backend, banco, auth, integrações, rotas ou lógica de negócio
- se o pedido for apenas uma tela específica, evitar mexer em outras telas sem necessidade
- sempre preservar as funções existentes, salvo ordem explícita do usuário

---

## 7. Regra de análise antes de alterar
Antes de editar qualquer tela, componente ou funcionalidade, o agente deve:

- analisar como aquela parte já funciona hoje
- verificar se já existe componente, estilo ou padrão semelhante no projeto
- reaproveitar a estrutura existente sempre que possível
- evitar recriar do zero algo que já exista no sistema

Objetivo:
manter consistência, evitar duplicação e não bagunçar o projeto.

---

## 8. Regra de consistência visual
O agente deve manter consistência visual entre as páginas do sistema.

### Diretrizes:
- seguir o padrão visual já existente nas telas mais recentes/aprovadas do projeto
- manter aparência de **sistema premium, limpo, moderno e com cara de app/PWA**
- reaproveitar padrões de:
  - cards
  - tabelas
  - botões
  - badges
  - modais
  - cabeçalhos
  - busca/filtros
  - paginação
- antes de criar um novo layout, observar como páginas semelhantes já foram feitas no projeto

---

## 9. Regra de responsividade
Toda alteração visual deve respeitar a responsividade do projeto.

### O agente deve garantir:
- funcionamento correto no desktop
- funcionamento correto no mobile
- ausência de scroll horizontal indevido
- textos legíveis
- botões clicáveis
- cards/tabelas sem estouro lateral
- layout consistente com o pedido do usuário

### Regras adicionais:
- se o pedido for só mobile, não mexer no desktop
- se o pedido for só desktop, não mexer no mobile
- se houver tablet no projeto, respeitar também o comportamento intermediário quando necessário

---

## 10. Regra de PWA e experiência mobile
Este projeto é um **PWA/sistema instalável**, então o agente deve preservar e melhorar a experiência de app.

### O agente deve considerar:
- comportamento mobile parecido com app
- evitar zoom indevido em inputs no iPhone
- evitar scroll horizontal
- respeitar safe areas do mobile
- manter navegação, botões e espaçamentos adequados para toque
- manter layout consistente quando instalado como PWA

### Regras importantes:
- não quebrar manifest, ícones ou comportamento de instalação do PWA
- não alterar service worker/cache sem necessidade
- se mexer em atualização/caching do PWA, avisar claramente o que foi alterado

---

## 11. Regra de atualização do PWA
Como este projeto é um sistema em PWA, a atualização da versão publicada deve ser tratada com cuidado.

### Diretrizes:
- evitar estratégias agressivas de cache que deixem o app preso em versão antiga
- priorizar atualização correta da versão publicada
- se houver service worker, ele deve ser tratado de forma segura
- não mexer em cache/service worker sem o usuário pedir ou sem necessidade real

Se o usuário pedir ajuste em atualização do PWA, o agente deve considerar:
- GitHub + Vercel como origem da nova versão
- necessidade de evitar versão antiga presa no app instalado

---

## 12. Regra de modo claro e modo escuro
Sempre que alterar uma tela visualmente, o agente deve verificar se a mudança também está correta no modo claro e no modo escuro, caso o projeto possua os dois temas.

O agente deve evitar:
- texto claro em fundo claro
- texto escuro em fundo escuro
- cards com fundo incorreto no dark mode
- bordas ilegíveis
- campos, botões ou tabelas quebrados em um dos temas

---

## 13. Regra de segurança de produção
O agente não deve fazer mudanças arriscadas sem necessidade.

### O agente deve:
- evitar reescrever grandes partes do sistema se o pedido for pequeno
- preferir alterações pontuais, seguras e controladas
- evitar quebrar funcionalidades existentes por causa de ajustes visuais
- avisar o usuário se a mudança solicitada exigir uma alteração estrutural arriscada

---

## 14. Regra de não alterar o que não foi pedido
O agente deve manter foco no pedido atual.

### Isso significa:
- não modificar páginas paralelas sem necessidade
- não alterar textos, componentes, estilos ou fluxos fora do escopo
- não “aproveitar” para refatorar outras partes do projeto sem autorização
- não fazer mudanças cosméticas extras que não foram solicitadas, salvo se forem necessárias para corrigir o problema principal

---

## 15. Regra de organização do código
O agente deve manter o código organizado e coerente com a estrutura do projeto.

### Prioridades:
- evitar duplicação desnecessária de componentes
- evitar duplicação de estilos
- evitar criar novas estruturas se já existir uma solução semelhante no projeto
- manter nomes e organização consistentes
- respeitar a arquitetura atual do sistema

---

## 16. Regra de Supabase
Este projeto usa **Supabase** como backend, banco de dados e/ou autenticação.

### O agente deve respeitar:
- não quebrar integrações existentes com Supabase
- não alterar credenciais, URLs, keys ou configuração do Supabase sem necessidade
- não expor chaves privadas no frontend
- não modificar estrutura de tabelas, policies, auth ou storage sem pedido explícito do usuário
- ao mexer em dados, auth ou integrações, explicar claramente o impacto

Se o pedido for apenas visual, o agente **não deve mexer em nada do Supabase**.

---

## 17. Regra de Vercel e deploy
Este projeto usa **Vercel** para deploy.

### O agente deve considerar:
- o deploy pode acontecer automaticamente após push no repositório
- por isso, não deve fazer push sem aprovação
- se houver alteração de domínio, build, variáveis de ambiente, cache ou configuração de deploy, isso deve ser informado ao usuário antes

---

## 18. Regra de segurança de dados e chaves
O agente nunca deve expor chaves privadas, segredos ou credenciais sensíveis no front-end.

### Regras:
- não colocar API keys privadas diretamente em código visível do cliente
- não expor secrets em componentes de front-end
- variáveis sensíveis devem permanecer em ambiente/configuração segura
- se alguma integração exigir chave secreta, ela deve ficar no backend ou em variáveis protegidas do ambiente

---

## 19. Regra de verificação antes de finalizar
Antes de considerar uma tarefa concluída, o agente deve revisar se:

- o layout não quebrou no desktop
- o layout não quebrou no mobile
- o texto continua legível
- os botões continuam clicáveis
- a alteração não criou scroll horizontal indevido
- o modo escuro não ficou quebrado
- o modo claro não ficou quebrado
- nenhuma função existente foi removida sem querer

---

## 20. Regra de explicação ao final
Ao terminar uma alteração importante, o agente deve explicar de forma simples:

1. o que foi alterado
2. quais arquivos foram modificados
3. se a alteração foi apenas visual ou se também envolveu estrutura
4. se existe algum ponto de atenção para teste

---

# REGRAS DE UI/UX PADRÃO DOS CRMs/SISTEMAS

## 21. Regra geral de experiência visual
As telas dos CRMs/sistemas devem seguir aparência de **sistema premium, limpo, organizado e com cara de app/PWA**, e não aparência de planilha crua ou site improvisado.

O agente deve priorizar:
- clareza visual
- boa hierarquia
- espaçamento consistente
- leitura fácil
- navegação intuitiva
- aparência profissional

---

## 22. Regra de estrutura visual das páginas internas
Sempre que fizer ou refatorar páginas internas do sistema, o agente deve priorizar esta estrutura visual:

1. **header da seção** com título forte e subtítulo curto
2. **área de ações/filtros** logo abaixo (busca, ordenação, botões)
3. **conteúdo principal** em card/container bem definido
4. **listas, cards ou tabelas** com visual organizado
5. **paginação/rodapé** quando necessário

Objetivo:
deixar as páginas com cara de painel profissional, e não de bloco solto sem estrutura.

---

## 23. Regra de containers e blocos principais
Em telas internas, o agente deve preferir que o conteúdo principal fique dentro de **containers/cards visuais bem definidos**, em vez de elementos soltos.

Priorizar:
- blocos com bordas arredondadas
- espaçamento interno confortável
- separação clara entre seções
- hierarquia entre cabeçalho, filtros e conteúdo

---

## 24. Regra de cards
Sempre que a tela usar cards, o agente deve manter padrão visual consistente.

### Diretrizes:
- cantos arredondados
- espaçamento interno confortável
- conteúdo bem alinhado
- título forte
- texto secundário legível
- contadores/status bem posicionados
- nada espremido ou mal distribuído

Se houver cards de resumo, estatística, filtros ou itens de lista, eles devem parecer parte do mesmo sistema visual.

---

## 25. Regra de botões
Os botões devem seguir hierarquia clara.

### Regra:
- ação principal da tela: botão mais destacado
- ações secundárias: botões mais discretos
- botões devem ter tamanho confortável para clique/toque
- ícones devem ser usados com moderação e de forma consistente

### Botão principal
Quando o projeto usar um padrão de botão principal, o agente deve preservá-lo em todas as telas para manter consistência visual.

---

## 26. Regra de busca, filtros e ordenação
Busca, filtros e ordenação devem ter aparência consistente e ficar visualmente integrados ao restante da tela.

### O agente deve:
- evitar busca pequena ou perdida no layout
- manter boa hierarquia entre busca, filtros e botões
- garantir legibilidade e bom espaçamento
- no mobile, evitar filtros espremidos lado a lado se isso piorar a usabilidade

---

## 27. Regra de tabelas no desktop
Quando a tela usar tabela no desktop, o agente deve manter aparência de **tabela premium**, e não planilha crua.

### Diretrizes:
- cabeçalho legível
- espaçamento confortável nas linhas
- hover suave
- alinhamento correto entre colunas
- badges/status visuais quando fizer sentido
- ações com boa clareza visual

---

## 28. Regra de listas/cards no mobile
No mobile, o agente deve priorizar **cards/listas adaptadas para toque**, em vez de manter tabelas horizontais ruins de usar.

### Regra:
- evitar exigir arrastar para o lado para ler informação importante
- quando uma tabela desktop não funcionar bem no mobile, preferir transformar em cards/lista mobile
- manter leitura rápida, ações claras e boa hierarquia das informações

---

## 29. Regra de modais
Modais devem seguir o padrão visual do sistema.

### Diretrizes:
- cabeçalho claro
- título forte
- campos organizados
- botões bem posicionados
- espaçamento confortável
- aparência consistente com o restante do CRM

---

## 30. Regra de paginação
Paginação deve ser visualmente consistente com o sistema e fácil de entender.

### O agente deve:
- manter paginação clara
- destacar página ativa
- garantir botões clicáveis
- manter consistência com o restante do layout

---

## 31. Regra de ícones e badges
Ícones, chips, badges e contadores devem ser usados de forma padronizada.

### O agente deve:
- evitar excesso de ícones sem função
- usar ícones para reforçar leitura, não para poluir
- manter badges/status consistentes
- alinhar contadores, selos e indicadores de forma limpa

---

## 32. Regra de texto e legibilidade
O agente deve preservar boa leitura em todas as telas.

### Evitar:
- textos cortados sem necessidade
- labels espremidas
- fontes pequenas demais
- subtítulos quebrando feio
- contraste ruim

### Priorizar:
- títulos claros
- subtítulos curtos
- boa hierarquia entre texto principal e secundário
- leitura fácil no desktop e no mobile

---

## 33. Regra de fluxo visual mobile
No mobile, o agente deve pensar em fluxo de app, não de desktop espremido.

### Prioridades:
- header claro
- ações organizadas em coluna quando necessário
- cards/listas fáceis de tocar
- sem elementos minúsculos
- sem excesso de informação na mesma linha
- sem scroll horizontal

---

## 34. Regra de fluxo visual desktop
No desktop, o agente deve aproveitar melhor o espaço horizontal, sem deixar a página nem vazia demais, nem espremida demais.

### Prioridades:
- blocos bem distribuídos
- filtros e resumo organizados
- tabelas ou grids com boa proporção
- uso inteligente da largura da tela
- aparência de dashboard profissional

---

## 35. Regra de consistência entre telas do CRM
Antes de criar ou refatorar qualquer tela, o agente deve observar as outras páginas já aprovadas do sistema.

Objetivo:
- manter o mesmo “idioma visual”
- evitar que cada aba pareça de um sistema diferente
- preservar consistência de UX entre:
  - clientes
  - parceiros
  - cursos
  - dashboard
  - modais
  - listas
  - páginas administrativas em geral

---

## 36. Regra final de comportamento do agente neste projeto
Sempre que atuar neste projeto, o agente deve seguir esta ordem:

1. entender o pedido do usuário
2. verificar o estado atual do projeto
3. sincronizar com a versão oficial do GitHub antes de editar, se necessário
4. analisar o padrão já existente da tela/funcionalidade
5. fazer apenas a alteração solicitada
6. preservar o restante do sistema
7. respeitar o padrão visual do CRM
8. mostrar resumo + arquivos alterados
9. aguardar aprovação antes de commit, push ou deploy
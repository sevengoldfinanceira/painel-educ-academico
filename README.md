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

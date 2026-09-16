# Betão do Iagão

Projeto de cassino fictício em HTML, CSS e JavaScript com login, seleção de jogos, slot e Mines.

## Como rodar localmente

1. Instale o Node.js 18+.
2. Abra o terminal na pasta do projeto.
3. Execute:

```bash
npm install
npm start
```

4. Acesse:

```text
http://localhost:8000
```

## Estrutura principal

- [index.html](index.html) — página principal do site
- [server.js](server.js) — backend em Node.js com Express e SQLite
- [package.json](package.json) — dependências e scripts de execução
- [render.yaml](render.yaml) — configuração para deploy em Render
- [sitebet.db](sitebet.db) — banco de usuários e saldo

## Funcionalidades

- Login e cadastro por nome + senha
- Persistência do saldo em SQLite
- Tela de escolha de jogos
- Slot machine
- Mines com multiplicador e cashout

## Deploy real

Esse projeto foi adaptado para hospedagem real, não só para execução local. A forma mais simples é usar o Render:

1. Crie um repositório no GitHub.
2. Envie o projeto para o GitHub.
3. Conecte o repositório ao Render.
4. Escolha o serviço Web.
5. Use o arquivo [render.yaml](render.yaml) como base.
6. O Render executa automaticamente `npm install` e `npm start`.

## Observação

Este é um projeto fictício de estudo/visualização, não é um cassino real nem um produto financeiro.

# App Gestao da Reitoria

Aplicacao interna da equipe SEL/SEPMA para gestao das etapas dos processos, fila, capacidade, historico, configuracoes, e-mails e avisos de prazo.

Este projeto foi separado do Painel de Contratacoes. O App Gestao deve ficar em repositorio proprio e em GitHub Pages proprio, porque possui login, escrita na planilha, envio de e-mails e trigger diario.

## Estrutura

```text
app_gestao-reitoria/
|-- index.html              pagina estatica publicada no GitHub Pages
|-- config.js               URL publica do Apps Script da DECOF
|-- CHECKLIST_PUBLICACAO.md roteiro de publicacao e testes
|-- apps-script/
|   `-- Code.gs             backend do App Gestao para copiar no Apps Script
|-- README.md
`-- .gitignore
```

## Fluxo geral

```text
Google Sheets da unidade
  |
  | le e escreve com a conta institucional
  v
Apps Script do App Gestao
  |
  | login, tokens, fila, etapas, capacidade, e-mails e avisos
  v
App Gestao no GitHub Pages
  |
  | equipe usa pelo navegador
  v
Atualizacoes voltam para a mesma planilha
```

O Painel de Contratacoes le a mesma planilha por outro Apps Script, separado e somente leitura. Assim o painel pode ficar publico, enquanto o App Gestao continua protegido por login.

## Principais funcoes

- Login por matricula e senha.
- Recuperacao de senha por e-mail.
- Registro e conclusao de etapas.
- Regressao de etapa quando uma etapa precisa ser reaberta.
- Retorno de processo para a fila preservando o status real do processo.
- Reativacao de processos retornados pela aba Fila.
- Controle de capacidade por servidor e fase.
- Cadastro e manutencao da equipe.
- Envio de avisos e trigger diario.

## Retorno para fila

Processos em andamento podem voltar para a fila em casos reais como suspensao, paralisacao, devolucao pelo setor ou desistencia.

Esse fluxo preserva o historico do processo:

- O status atual do processo e da etapa fica preservado.
- A etapa atual recebe uma marca operacional `RETORNO PARA FILA` no campo de motivo.
- O D0 existente continua registrado.
- Etapas ja concluidas continuam concluidas.
- A justificativa fica registrada no historico.
- A capacidade do processo deixa de contar como ativa.
- Os avisos automaticos de atraso deixam de ser enviados enquanto o processo estiver na fila.
- O processo aparece novamente na aba Fila.
- Ao iniciar/reativar pela Fila, o status volta para `Em andamento`.

Esse comportamento tambem ajuda nos testes, porque permite simular a volta para fila sem apagar a realidade atual dos dados.

## Configuracao

Use `CHECKLIST_PUBLICACAO.md` como roteiro curto. O resumo e:

1. Crie um projeto novo em `script.google.com` na conta da DECOF.
2. Copie o conteudo de `apps-script/Code.gs` para o Apps Script.
3. Em `Configuracoes do projeto > Propriedades do script`, cadastre:
   - `SEL_SS_ID`: ID real da planilha.
   - `SEL_CHEFIA_EMAIL`: e-mail institucional da chefia, se necessario.
4. Implante como Web App:
   - Executar como: `Eu`.
   - Quem pode acessar: `Qualquer pessoa`.
5. Copie a URL terminada em `/exec`.
6. Cole essa URL em `config.js`, no campo `apiUrl`.
7. Mantenha `apiTimeoutMs` em `90000`, salvo se o Apps Script precisar de outro tempo de espera.
8. Publique este repositorio no GitHub Pages em `main` + `/(root)`.

## Rotas do Apps Script

- `?route=appsel.challenge`
- `?route=appsel.loginProof`
- `?route=appsel.changePasswordHash`
- `?route=appsel.call&method=...`

O login no GitHub Pages usa desafio criptografico: a senha digitada nao e enviada aberta na URL. As demais chamadas preservam a compatibilidade com as funcoes atuais do App Gestao e exigem token quando a funcao original ja exigia token.

## Cuidados

- Nao publicar ID real de planilha no GitHub.
- Nao publicar e-mails pessoais ou PDFs/planilhas reais neste repositorio.
- Manter o Painel e o App Gestao em repositorios separados.
- Testar em Chrome, Edge e aba anonima depois de publicar.
- Testar login preferencialmente no GitHub Pages, com HTTPS. Abrir o `index.html` localmente pode bloquear a validacao criptografica da senha em alguns navegadores.

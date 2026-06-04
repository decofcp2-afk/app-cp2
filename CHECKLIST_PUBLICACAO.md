# Checklist de Publicacao - AppSEL

## 1. Apps Script da DECOF

- Criar projeto novo no Apps Script da conta DECOF.
- Copiar `apps-script/Code.gs` para o editor.
- Em propriedades do script, configurar:
  - `SEL_SS_ID`: ID real da planilha.
  - `SEL_CHEFIA_EMAIL`: e-mail institucional da chefia, se necessario.
  - `SEL_MUNICIPIO_CALENDARIO`: municipio dos feriados locais, por exemplo `Rio de Janeiro`.
- Salvar.
- Implantar como Web App:
  - Executar como: `Eu`.
  - Quem pode acessar: `Qualquer pessoa`.
- Autorizar as permissoes solicitadas pelo Google.
- Copiar a URL final terminada em `/exec`.
- Conferir em `Acionadores` se nao existe acionador antigo de conta pessoal para `enviarAvisosPrazo`.

## 2. GitHub Pages

- Colar a URL `/exec` em `config.js`, no campo `apiUrl`.
- Criar repositorio separado para o AppSEL.
- Enviar apenas os arquivos desta pasta.
- Configurar GitHub Pages:
  - Source: `Deploy from a branch`.
  - Branch: `main`.
  - Folder: `/(root)`.
- Deixar `Custom domain` vazio, salvo se houver dominio institucional real com DNS configurado.

## 3. Testes obrigatorios

- Abrir o AppSEL pelo link do GitHub Pages em Chrome.
- Abrir o AppSEL pelo link do GitHub Pages em Edge.
- Testar em aba anonima.
- Fazer login com matricula e senha temporaria.
- Confirmar troca obrigatoria de senha.
- Testar recuperacao de senha por e-mail.
- Abrir Etapas.
- Concluir uma etapa.
- Regredir uma etapa.
- Voltar um processo em andamento para a Fila com justificativa.
- Confirmar que o status real foi preservado e que o processo saiu dos avisos de atraso.
- Abrir Fila.
- Iniciar processo pela Fila.
- Reativar pela Fila um processo marcado como retorno para fila.
- Abrir Capacidade.
- Salvar pontuacao.
- Salvar Outros.
- Abrir Configuracoes como chefia.
- Editar equipe.
- Editar e-mails.
- Instalar/Reinstalar trigger pela conta DECOF.
- Confirmar que os acionadores ficaram separados: prazos proximos por volta de 10h30 e etapas vencidas por volta de 14h, de segunda a sexta.
- Testar e-mail.
- Enviar avisos agora.

## 4. Conferencia de seguranca

- Confirmar que o repositorio nao tem ID real da planilha.
- Confirmar que o repositorio nao tem e-mail pessoal.
- Confirmar que nao ha planilhas, PDFs ou documentos administrativos no repositorio.
- Confirmar que o Apps Script usa propriedades do script para dados sensiveis.
- Confirmar que os avisos automaticos aparecem como acionadores da conta institucional e que a conta pessoal nao envia mais e-mails.

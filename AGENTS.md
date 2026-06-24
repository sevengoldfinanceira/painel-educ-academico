# Regras do Projeto - Painel Educ Academico

## Deploy Automatico

Toda vez que finalizar uma tarefa e commitar mudancas, **SEMPRE** executar estes passos na ordem:

### 1. Atualizar versao PWA

Rodar o script PowerShell para bumpar a versao:

```powershell
powershell -ExecutionPolicy Bypass -File update-version.ps1
```

Isso atualiza automaticamente a versao em `sw.js` e `index.html` com a data/hora atual.

### 2. Commit e Push

```bash
git add -A
git commit -m "chore: bump PWA version + <descricao da tarefa>"
git push origin main
```

### Ordem obrigatoria

1. Fazer as alteracoes no codigo
2. Rodar `update-version.ps1` para atualizar a versao PWA
3. `git add -A`
4. `git commit`
5. `git push origin main`

**NUNCA esquecer de rodar o update-version.ps1 antes do commit final.**

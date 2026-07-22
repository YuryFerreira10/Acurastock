# AcuraStock

Calculadora de acurácia de estoque com login por empresa, importação de CSV, histórico e exportação de relatórios.

## ⚠️ Importante sobre os dados

Os dados são salvos no **localStorage do navegador** — ou seja, cada pessoa que acessa o site guarda os dados só no computador/navegador dela. Não há sincronização entre dispositivos. Isso é suficiente para uso individual ou de uma equipe no mesmo computador; não é indicado para várias pessoas colaborarem na mesma contagem em tempo real (isso exigiria um backend).

---

## Passo 1 — Subir para o GitHub

1. Entre em [github.com](https://github.com) e clique em **New repository** (botão verde "New").
2. Dê um nome, por exemplo `acurastock`, e clique em **Create repository**.
3. Na página do repositório vazio, clique no link **"uploading an existing file"**.
4. Arraste **todos os arquivos e pastas desta pasta** (`acurastock-app`) para a área de upload — incluindo a pasta `src` inteira.
5. Clique em **Commit changes**.

## Passo 2 — Hospedar de graça na Vercel

1. Entre em [vercel.com](https://vercel.com) e crie uma conta gratuita usando login do GitHub.
2. Clique em **Add New → Project**.
3. Selecione o repositório `acurastock` que você acabou de criar.
4. A Vercel detecta automaticamente que é um projeto **Vite** — não precisa mudar nada.
5. Clique em **Deploy** e aguarde ~1 minuto.
6. Pronto: você recebe uma URL própria (algo como `acurastock.vercel.app`), sem nenhuma marca do Claude.

> Alternativa: [Netlify](https://netlify.com) funciona do mesmo jeito (conecta no GitHub, detecta Vite, faz o deploy).

## Rodando localmente (opcional, para testar antes de publicar)

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## Estrutura do projeto

```
acurastock-app/
  src/
    App.jsx        → toda a lógica e interface do app
    storage.js      → camada de persistência (localStorage)
    main.jsx        → ponto de entrada React
    index.css        → estilos base (Tailwind)
  index.html
  package.json
  vite.config.js
  tailwind.config.js
  postcss.config.js
```

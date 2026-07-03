# Matrix Bank — Shark Tank Edition

App bank estilo Matrix (verde/preto, code rain) mobile-first pra jogar Shark Tank
com amigos. Cada jogador tem uma conta com uma quantia de "dinheiro" do jogo,
o host publica os cases (pitches) pelo painel de admin, e todo mundo investe em
tempo real pelo celular.

## Como funciona

- Cada jogador cria uma conta com `nome + PIN` e recebe um saldo inicial (padrao 50.000).
- O host abre `/admin`, cria os cases (empresa, pitch, valor pedido, equity).
- Todo mundo vê os cases no topo da tela (chip switcher), o mais recente vem
  como o "case ao vivo" ja focado.
- Investindo: o saldo é debitado na hora. Da pra investir varias vezes no
  mesmo case, ate o saldo acabar.
- Quando o host encerra o case, ele escolhe um **multiplicador de retorno**
  (ex: `2` = investidores dobram, `0.5` = pegam metade, `0` = perdem tudo,
  `3.5` = jackpot). Os payouts caem no saldo automaticamente.
- Cases antigos ficam no strip do topo pra revisitar; o "ao vivo" é sempre o
  mais recente aberto.

## Rodar local

```bash
npm install
npm start
# abre http://localhost:3000
# admin: http://localhost:3000/admin (senha padrao: shark)
```

## Deploy no Railway

1. Faz o push desse repo pro GitHub (branch `main` ou a que voce quiser).
2. No Railway: **New Project → Deploy from GitHub repo** e seleciona esse repo.
3. Railway detecta Node automaticamente via Nixpacks. Nada mais precisa configurar
   pra subir.
4. **(Recomendado)** Adiciona as variaveis de ambiente em **Variables**:
   - `ADMIN_PASSWORD` — senha do host. **Muda essa antes de jogar em producao.**
   - `STARTING_BALANCE` — saldo inicial. Padrao `50000`.
   - `DATA_DIR` — pasta pra salvar o `data.json`. Se voce anexar um Volume
     do Railway (ex: montado em `/data`), coloca `DATA_DIR=/data` pra os dados
     sobreviverem redeploy.
5. Em **Settings → Networking**, clica em **Generate Domain**. Pronto,
   o app fica em `https://<seu-projeto>.up.railway.app`.

### Persistencia dos dados

Sem Volume, o `data.json` mora dentro do container e é apagado a cada
redeploy. Pra manter jogadores e cases entre deploys:

1. No projeto Railway, **New → Volume**, montado em `/data`.
2. Em **Variables**, adiciona `DATA_DIR=/data`.

Pro proprio jogo, resetar é 1 clique no admin ("Reset TOTAL"), entao a
persistencia é opcional dependendo do uso.

## Estrutura

```
server.js          # Express + API + SSE + storage JSON
public/
  index.html       # App do jogador (mobile-first, tema Matrix)
  admin.html       # Painel do host
  css/style.css    # Tema todo
  js/matrix.js     # Chuva de codigo Matrix (canvas)
  js/app.js        # Logica do jogador
  js/admin.js      # Logica do admin
railway.json       # Config de deploy (Nixpacks + start command)
```

## Variaveis de ambiente

| Variavel           | Padrao   | O que faz |
|--------------------|----------|-----------|
| `PORT`             | `3000`   | Porta HTTP (Railway injeta automatico) |
| `ADMIN_PASSWORD`   | `shark`  | Senha pra entrar em `/admin` |
| `STARTING_BALANCE` | `50000`  | Saldo inicial dos novos jogadores |
| `DATA_DIR`         | (repo)   | Onde salvar `data.json` (use Volume) |

## Dicas de jogo

- Cria os cases **antes** de comecar o pitch pra so publicar quando o
  empreendedor terminar de apresentar. Assim a galera nao começa a
  investir antes da hora.
- Multiplicadores tipicos:
  - `0` — negocio nao fecha ou empresa quebra
  - `0.5` — investidor sai no prejuizo
  - `1` — devolve o que investiu
  - `1.5` a `2` — deal ok
  - `3+` — jackpot / unicórnio
- Se algo der errado, use "Reset (mantem jogadores)" pra zerar cases sem
  perder as contas.

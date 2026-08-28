# Risco & Resultado — Esportiva Bet (mobile)

Página mobile pra ver o Liability Report e o Bet List do sb2admin Altenar sem
precisar do PC. Você loga pelo celular (o login vai direto pro Altenar, eu
não guardo usuário/senha em lugar nenhum) e a partir daí é tudo automático.

## Deploy (Vercel)

1. `npm install`
2. Suba num repositório (GitHub) e importe no Vercel, ou rode `vercel` direto
   pela CLI a partir dessa pasta.
3. Nas configurações do projeto na Vercel, crie a env var:
   - `SESSION_SECRET` = uma string aleatória longa (gere com `openssl rand -hex 32`).
     É a chave que criptografa o cookie de sessão — sem ela o login não funciona.
4. Confirme o plano da Vercel: as funções `login` e `betlist` sobem um Chromium
   headless e podem levar bem mais que os 10s padrão do plano Hobby (configurei
   `maxDuration: 60` no `vercel.json`, mas isso só funciona se o seu plano permitir
   função rodando até 60s — vale conferir na hora do deploy; se der timeout, esse é
   o primeiro lugar pra olhar).
5. Deploy. Abra a URL no celular, adicione à tela inicial se quiser.

## O que cada coisa faz

- `index.html` — a página em si (login, tela de código 2FA quando pedir, e os
  dois botões).
- `api/login.js` — abre um Chromium headless, faz o login de verdade no
  `Account/Login` do Altenar, guarda a sessão resultante criptografada num
  cookie `httpOnly` da própria ferramenta (não em banco nenhum). Expira em
  30 minutos. A Altenar pede um código de verificação (2FA) da primeira vez —
  quando isso acontece, essa função guarda o estado intermediário (cookie
  `altenar_pending`, 5 min) e devolve `needs2FA: true` pro front mostrar o
  campo do código.
- `api/verify2fa.js` — segunda etapa: recebe o código que você digitar,
  retoma a sessão intermediária, marca "Remember device" e confirma. Se der
  certo, salva a sessão normal **e** um cookie `altenar_device` (60 dias) com
  o "dispositivo confiável" — é isso que faz os próximos logins pularem o
  2FA, do jeito que você descreveu (só pede na primeira vez). `api/login.js`
  já aplica esse cookie automaticamente nas próximas tentativas.
- `api/liability.js` — usa o contrato JSON confirmado do Liability Report
  (`POST /Api/Liability/GetEvents`) direto por HTTP, sem abrir navegador —
  rápido. Busca PRELIVE e LIVE, ordena por maior exposição.
- `api/betlist.js` — **essa é a parte com menos certeza.** Não consegui capturar
  o contrato JSON por trás do Bet List durante o reconhecimento, então em vez
  de arriscar adivinhar nomes de campo da API, essa função abre um Chromium
  headless de verdade e clica exatamente nos mesmos campos que você usa
  manualmente (Settled from/to, Operational, Show totals, Currency BRL,
  desmarcar base currency), usando os ids reais do DOM que confirmei olhando
  a página. Os ids têm um sufixo GUID que muda a cada carregamento — o código
  já lida com isso (seletor por prefixo), mas essa é a peça que mais precisa
  de um teste ao vivo antes de confiar 100%.
- `lib/betlistSelectors.js` — também calcula a data de "hoje" pelo fuso de
  Bahia (não confia no padrão que a tela carrega, que atrasa/adianta um dia
  à noite por causa do fuso grego da Altenar).

## Coisas que só um teste ao vivo confirma

- Se o clique no toggle "Operational/Archive" via bootstrap-toggle funciona
  igual eu simulei (testei a lógica, mas não contra a página real logada).
- Se o widget Kendo MultiSelect de moeda aceita o `.value(['986'])` programático
  ou se precisa clicar na lista visualmente.
- Se o timeout da função `betlist` (Chromium + navegação + cliques) cabe no
  plano da Vercel.
- O prazo real que a Altenar guarda o "dispositivo confiável" (chutei 60 dias
  no `DEVICE_MAX_AGE` do `lib/session.js` — se pedir 2FA de novo antes disso,
  é só a Altenar tendo um prazo menor, ajusta essa constante).

Se `api/betlist.js` falhar, a resposta de erro vem com um print da tela
(`debugScreenshotBase64`, em base64) pra eu conseguir ver o que aconteceu sem
precisar reabrir sessão no seu Chrome de novo.

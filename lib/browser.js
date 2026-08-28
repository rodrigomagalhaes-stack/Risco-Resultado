// Sobe um Chromium headless dentro da função serverless da Vercel.
// Usa @sparticuz/chromium (binário compilado pra rodar em Lambda/Vercel)
// + playwright-core (sem baixar navegador próprio, usa esse binário).
//
// IMPORTANTE (fix "libnss3.so: cannot open shared object file"):
// o @sparticuz/chromium só extrai as bibliotecas de sistema que o Chromium
// precisa (libnss3, libnspr4, ...) quando detecta um runtime AWS Lambda cujo
// nome contém "20.x" (Amazon Linux 2023). O runtime da Vercel é Node 22 — que
// TAMBÉM é Amazon Linux 2023, mesmas libs — mas não bate com essa checagem,
// então o pacote pulava a extração e o Chromium morria ao subir.
// Sinalizamos o runtime ANTES de importar o pacote: aí ele extrai o conjunto
// AL2023 pra /tmp/al2023/lib e configura o LD_LIBRARY_PATH sozinho.
// (O projeto na Vercel também tem AWS_LAMBDA_JS_RUNTIME=nodejs20.x como env
// var, de reforço — mas deixamos aqui pra não depender só do painel.)
process.env.AWS_LAMBDA_JS_RUNTIME = process.env.AWS_LAMBDA_JS_RUNTIME || 'nodejs20.x';

const chromium = require('@sparticuz/chromium');
const { chromium: playwrightChromium } = require('playwright-core');

async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  return playwrightChromium.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });
}

module.exports = { launchBrowser };

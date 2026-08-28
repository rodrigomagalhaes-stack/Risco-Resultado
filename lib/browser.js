// Sobe um Chromium headless dentro da função serverless da Vercel.
// Usa @sparticuz/chromium (binário compilado pra rodar em Lambda/Vercel)
// + playwright-core (sem baixar navegador próprio, usa esse binário).
const path = require('path');
const chromium = require('@sparticuz/chromium');
const { chromium: playwrightChromium } = require('playwright-core');

async function launchBrowser() {
  // Não precisamos de WebGL/GPU só pra logar e navegar. Desligar o modo
  // gráfico evita depender de bibliotecas de vídeo (swiftshader/GL) que o
  // runtime enxuto da Vercel não traz — menos chance de erro de "shared object".
  try { chromium.setGraphicsMode = false; } catch (_) {}

  // executablePath() descompacta o binário E as libs (.so) do @sparticuz
  // dentro de /tmp. O runtime da Vercel não tem libnss3/libnspr4 etc. no
  // sistema, então precisamos apontar o LD_LIBRARY_PATH pra pasta onde essas
  // libs foram extraídas — senão o Chromium nem sobe (libnss3.so: cannot open
  // shared object file). Tem que ser feito ANTES do launch.
  const executablePath = await chromium.executablePath();
  const libDir = path.dirname(executablePath); // normalmente /tmp
  process.env.LD_LIBRARY_PATH = [libDir, process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(':');

  return playwrightChromium.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });
}

module.exports = { launchBrowser };

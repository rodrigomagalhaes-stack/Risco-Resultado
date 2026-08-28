// Sobe um Chromium headless dentro da função serverless da Vercel.
// Usa @sparticuz/chromium (binário compilado pra rodar em Lambda/Vercel)
// + playwright-core (sem baixar navegador próprio, usa esse binário).
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

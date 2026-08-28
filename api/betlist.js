// Bet List (resultado do dia). Diferente do Liability Report, aqui NÃO
// temos o contrato exato da API JSON por trás (a captura de rede não deu
// certo durante o reconhecimento). Em vez de arriscar adivinhar nomes de
// campo da API - o que poderia devolver dado errado sem erro nenhum -,
// esse endpoint abre um navegador headless e clica exatamente nos mesmos
// controles que o Rodrigo usa manualmente, usando os ids reais do DOM
// (confirmados por inspeção em 28/08/2026, prefixo fixo + sufixo GUID que
// muda a cada load - por isso os seletores usam id^=).
const { launchBrowser } = require('../lib/browser');
const { getAltenarCookies } = require('../lib/session');
const sel = require('../lib/betlistSelectors');

const BASE_URL = 'https://sb2admin-altenar2.biahosted.com';
const CURRENCY_VALUE_BRL = '986'; // confirmado no <select> real em 28/08/2026

async function setCheckbox(page, selector, desired) {
  const checkbox = page.locator(selector).first();
  await checkbox.waitFor({ state: 'attached', timeout: 15000 });
  const isChecked = await checkbox.evaluate((el) => el.checked);
  if (isChecked === desired) return;

  // bootstrap-toggle costuma envolver o checkbox real num <div class="toggle ...">
  // que precisa ser clicado (clicar no input escondido direto às vezes não dispara
  // os handlers da tela). Tenta o wrapper primeiro, cai pro clique direto senão.
  const wrapper = page.locator(selector).first().locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " toggle ")][1]');
  if (await wrapper.count()) {
    await wrapper.first().click();
  } else {
    await checkbox.click({ force: true });
  }
  await page.waitForTimeout(150);
}

async function setDateField(page, selector, value) {
  const input = page.locator(selector).first();
  await input.waitFor({ state: 'attached', timeout: 15000 });
  await input.click();
  await input.fill('');
  await input.fill(value);
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  const actual = await input.evaluate((el) => el.value);
  if (!actual || !actual.startsWith(value.slice(0, 10))) {
    throw new Error(`Campo de data (${selector}) não ficou com o valor esperado. Esperado começar com "${value.slice(0, 10)}", ficou "${actual}".`);
  }
}

async function setCurrencyBRL(page) {
  // Widget Kendo MultiSelect: a forma confiável de setar valor é pela API
  // do próprio Kendo (via jQuery), não só mexendo no <select> escondido.
  const ok = await page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector(selector);
      if (!el || !window.jQuery) return false;
      const widget = window.jQuery(el).data('kendoMultiSelect');
      if (!widget) return false;
      widget.value([value]);
      widget.trigger('change');
      return true;
    },
    { selector: sel.currencySelect, value: CURRENCY_VALUE_BRL }
  );
  if (!ok) {
    throw new Error('Não consegui setar a moeda BRL pelo widget Kendo (widget não encontrado). A tela pode ter mudado.');
  }
}

function parseMoney(str) {
  if (!str) return null;
  const cleaned = str.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

async function extractTotals(page) {
  // Lê o bloco de totais (Page / Overall) que aparece depois de marcar
  // "Show totals" e aplicar o filtro - mesmo texto que aparece na tela pro
  // Rodrigo.
  const text = await page.locator('body').innerText();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  function grab(label) {
    const line = lines.find((l) => l.toLowerCase().startsWith(label.toLowerCase()));
    if (!line) return null;
    const rest = line.slice(label.length).trim();
    const parts = rest.split(/\s+/).filter((p) => p.startsWith('R$'));
    // formato observado: "Total stake: R$ 476.92 R$ 6,465,230.34" -> [pagina, overall]
    const matches = rest.match(/R\$\s?[\d.,]+/g) || [];
    return {
      page: matches[0] ? parseMoney(matches[0]) : null,
      overall: matches[1] ? parseMoney(matches[1]) : null,
    };
  }

  const overallTotalLine = lines.find((l) => l.toLowerCase().startsWith('overall total:'));
  const overallUsersLine = lines.find((l) => l.toLowerCase().startsWith('overall users:'));

  return {
    overallTotalBets: overallTotalLine ? Number(overallTotalLine.split(':')[1].trim().replace(/\D/g, '')) : null,
    overallUsers: overallUsersLine ? Number(overallUsersLine.split(':')[1].trim().replace(/\D/g, '')) : null,
    totalStake: grab('Total stake:'),
    totalWin: grab('Total win:'),
    openBetsWinnings: grab('Open bets winnings:'),
    bonusStake: grab('Bonus stake:'),
    bonusWinnings: grab('Bonus winnings:'),
    bonusPotentialWinnings: grab('Bonus potential winnnings:') || grab('Bonus potential winnings:'),
    net: grab('Net:'),
  };
}

module.exports = async (req, res) => {
  const cookies = getAltenarCookies(req);
  if (!cookies) {
    res.status(401).json({ ok: false, needsLogin: true, error: 'Sessão expirada, faça login de novo.' });
    return;
  }

  let browser;
  let debugScreenshot = null;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(cookies);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/BetList`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    if (page.url().includes('/Account/Login')) {
      res.status(401).json({ ok: false, needsLogin: true, error: 'Sessão expirada, faça login de novo.' });
      return;
    }

    // 1) Habilita o filtro "Settled" e coloca em modo Absolute (datas explícitas)
    await setCheckbox(page, sel.isSettledCheckbox, true);
    await setCheckbox(page, sel.settledRelativeToggle, false); // false = Absolute

    const { from, to } = sel.settledFromToToday();
    await setDateField(page, sel.settledFromInput, from);
    await setDateField(page, sel.settledToInput, to);

    // 2) Operational/Archive: Rodrigo confirmou (28/08/2026) que o padrão
    // usado é Archive (marcado) mesmo, não Operational.
    await setCheckbox(page, sel.useReportDbCheckbox, true);

    // 3) Show totals
    await setCheckbox(page, sel.showTotalsCheckbox, true);

    // 4) Currency = BRL
    await setCurrencyBRL(page);

    // 5) Desmarcar "Betlist in base currency"
    await setCheckbox(page, sel.inBaseCurrencyCheckbox, false);

    // 6) Aplicar
    await page.locator(sel.findButton).first().click();
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const totals = await extractTotals(page);

    if (totals.totalStake === null && totals.net === null) {
      // Não achou o bloco de totais - tira um print pra ajudar a debugar sem
      // precisar reabrir sessão de novo.
      const buf = await page.screenshot({ fullPage: false });
      debugScreenshot = buf.toString('base64');
      throw new Error('Não encontrei o bloco de totais na página depois de aplicar os filtros.');
    }

    res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      settledFrom: from,
      settledTo: to,
      currency: 'BRL',
      totals,
    });
  } catch (err) {
    const payload = { ok: false, error: 'Falha ao buscar Bet List: ' + (err && err.message ? err.message : String(err)) };
    if (debugScreenshot) payload.debugScreenshotBase64 = debugScreenshot;
    res.status(500).json(payload);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

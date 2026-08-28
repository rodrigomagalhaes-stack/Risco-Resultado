const { launchBrowser } = require('../lib/browser');
const { setAltenarCookies, setDeviceCookies, getDeviceCookies, setPendingCookies } = require('../lib/session');
const { SEL, isTwoFactorScreen, extractErrorInfo } = require('../lib/altenarLogin');

const BASE_URL = 'https://sb2admin-altenar2.biahosted.com';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ ok: false, error: 'Usuário e senha são obrigatórios.' });
    return;
  }

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

    // Se já temos um "dispositivo lembrado" de um login anterior, aplica os
    // cookies antes de navegar - isso é o que faz a Altenar pular o 2FA.
    const deviceCookies = getDeviceCookies(req);
    if (deviceCookies) {
      await context.addCookies(deviceCookies).catch(() => {});
    }

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });

    try {
      const acceptBtn = page.locator('#accept-cookie-btn');
      if (await acceptBtn.isVisible({ timeout: 2000 })) await acceptBtn.click();
    } catch (_) {}

    await page.fill(SEL.username, username);
    await page.fill(SEL.password, password);

    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}),
      page.click(SEL.submit),
    ]);
    await page.waitForTimeout(1200);

    // Caso 1: pediu o código de verificação (dispositivo não reconhecido /
    // primeira vez / "lembrar dispositivo" expirou).
    if (await isTwoFactorScreen(page)) {
      const pendingCookies = await context.cookies();
      setPendingCookies(res, pendingCookies);
      res.status(200).json({ ok: false, needs2FA: true });
      return;
    }

    const currentUrl = page.url();
    const stillOnLogin = currentUrl.includes('/Account/Login') || (await page.locator(SEL.password).isVisible().catch(() => false));

    // Caso 2: erro (usuário/senha errados, ou algo inesperado).
    if (stillOnLogin) {
      const { allValidationTexts, debugScreenshotBase64 } = await extractErrorInfo(page);
      res.status(401).json({
        ok: false,
        error: allValidationTexts.length ? allValidationTexts.join(' | ') : 'Usuário ou senha inválidos.',
        debugUrl: currentUrl,
        debugAllValidationTexts: allValidationTexts,
        debugScreenshotBase64,
      });
      return;
    }

    // Caso 3: sucesso direto (dispositivo já era confiável, sem 2FA).
    const cookies = await context.cookies();
    setAltenarCookies(res, cookies);
    setDeviceCookies(res, cookies); // renova a confiança do dispositivo
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Falha ao tentar logar no Altenar: ' + (err && err.message ? err.message : String(err)) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

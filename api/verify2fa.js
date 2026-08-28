// Segunda etapa do login: recebe o código de verificação, retoma a sessão
// intermediária (cookies salvos pelo api/login.js quando detectou a tela de
// 2FA) e confirma com "Remember device" marcado, pra não pedir de novo.
const { launchBrowser } = require('../lib/browser');
const { setAltenarCookies, setDeviceCookies, getPendingCookies, clearPendingCookies } = require('../lib/session');
const { SEL, extractErrorInfo } = require('../lib/altenarLogin');

const BASE_URL = 'https://sb2admin-altenar2.biahosted.com';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const { code } = req.body || {};
  if (!code) {
    res.status(400).json({ ok: false, error: 'Código de verificação é obrigatório.' });
    return;
  }

  const pendingCookies = getPendingCookies(req);
  if (!pendingCookies) {
    res.status(400).json({ ok: false, error: 'Sessão de verificação expirou. Faça login de novo.' });
    return;
  }

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addCookies(pendingCookies);

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/Account/Login`, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const codeVisible = await page.locator(SEL.codeInput).isVisible({ timeout: 5000 }).catch(() => false);
    if (!codeVisible) {
      res.status(400).json({ ok: false, error: 'A tela de verificação não apareceu de novo (a sessão pode ter expirado). Faça login de novo.' });
      clearPendingCookies(res);
      return;
    }

    await page.fill(SEL.codeInput, String(code).trim());

    // Garante que "Remember device" fica marcado, senão vamos pedir 2FA de novo na próxima.
    const rememberBox = page.locator(SEL.rememberDeviceCheckbox).first();
    const isChecked = await rememberBox.evaluate((el) => el.checked).catch(() => null);
    if (isChecked === false) {
      await rememberBox.click();
    }

    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}),
      page.click(SEL.twoFaSubmit),
    ]);
    await page.waitForTimeout(1200);

    const currentUrl = page.url();
    const stillOnLogin = currentUrl.includes('/Account/Login') || (await page.locator(SEL.codeInput).isVisible().catch(() => false));

    if (stillOnLogin) {
      const { allValidationTexts, debugScreenshotBase64 } = await extractErrorInfo(page);
      res.status(401).json({
        ok: false,
        error: allValidationTexts.length ? allValidationTexts.join(' | ') : 'Código inválido ou expirado.',
        debugAllValidationTexts: allValidationTexts,
        debugScreenshotBase64,
      });
      return;
    }

    const cookies = await context.cookies();
    setAltenarCookies(res, cookies);
    setDeviceCookies(res, cookies);
    clearPendingCookies(res);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Falha ao confirmar o código: ' + (err && err.message ? err.message : String(err)) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

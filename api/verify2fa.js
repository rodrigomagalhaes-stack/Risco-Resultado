// Segunda etapa do login: recebe o código de verificação, retoma a sessão
// intermediária (cookies salvos pelo api/login.js quando detectou a tela de
// 2FA) e confirma com "Remember device" marcado, pra não pedir de novo.
const { launchBrowser } = require('../lib/browser');
const { setAltenarCookies, setDeviceCookies, getPending, clearPendingCookies } = require('../lib/session');
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

  const pending = getPending(req);
  if (!pending) {
    res.status(400).json({ ok: false, error: 'Sessão de verificação expirou. Faça login de novo.' });
    return;
  }

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addCookies(pending.cookies);

    const page = await context.newPage();
    // Volta pra URL exata onde a tela de código apareceu no login (fallback pro
    // /Account/Login se por algum motivo não tiver sido guardada).
    const resumeUrl = pending.url || `${BASE_URL}/Account/Login`;
    await page.goto(resumeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    let codeVisible = await page.locator(SEL.codeInput).isVisible({ timeout: 5000 }).catch(() => false);
    // Se caiu na tela de usuário/senha (a Altenar às vezes remostra o form), dá
    // um refresh — em fluxos ASP.NET a tela de código costuma reaparecer com o
    // cookie de 2FA presente.
    if (!codeVisible) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      codeVisible = await page.locator(SEL.codeInput).isVisible({ timeout: 4000 }).catch(() => false);
    }
    if (!codeVisible) {
      // Diagnóstico curto e legível no próprio celular pra eu saber onde parou.
      const landedUrl = page.url();
      const usernameVisible = await page.locator(SEL.username).isVisible().catch(() => false);
      const title = await page.title().catch(() => '');
      res.status(400).json({
        ok: false,
        error:
          'A tela de verificação não apareceu de novo. [diag] parou em: ' + landedUrl +
          ' | título: "' + title + '" | campo de usuário à mostra: ' + (usernameVisible ? 'sim' : 'não') +
          '. Faça login de novo.',
        debugResumeUrl: resumeUrl,
        debugLandedUrl: landedUrl,
        debugUsernameVisible: usernameVisible,
        debugTitle: title,
      });
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

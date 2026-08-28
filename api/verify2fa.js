// Segunda etapa do login: recebe o código TOTP (Google Authenticator) e faz o
// login inteiro numa ÚNICA sessão de navegador — usuário/senha (guardados
// cifrados pelo api/login.js quando detectou o 2FA) + o código + "Remember
// device". Como é TOTP, o código continua válido e refazer o login não invalida
// nada; isso é bem mais robusto do que tentar ressuscitar a tela de código num
// navegador novo (o backoffice é um SPA e a tela não volta só recarregando).
const { launchBrowser } = require('../lib/browser');
const {
  setAltenarCookies,
  setDeviceCookies,
  getDeviceCookies,
  getPendingCredentials,
  clearPendingCookies,
} = require('../lib/session');
const { SEL, isTwoFactorScreen, extractErrorInfo } = require('../lib/altenarLogin');

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

  const pending = getPendingCredentials(req);
  if (!pending || !pending.username || !pending.password) {
    res.status(400).json({ ok: false, error: 'Sessão de verificação expirou. Faça login de novo.' });
    return;
  }

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

    // Se já houver dispositivo confiável, aplica (pode até pular o código).
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

    // Etapa 1: usuário/senha (mesma coisa que o api/login.js faz).
    await page.fill(SEL.username, pending.username);
    await page.fill(SEL.password, pending.password);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}),
      page.click(SEL.submit),
    ]);
    await page.waitForTimeout(1200);

    const needsCode = await isTwoFactorScreen(page);
    if (!needsCode) {
      // Caso raro: dispositivo já confiável -> logou direto, sem pedir código.
      const stillOnLogin =
        page.url().includes('/Account/Login') ||
        (await page.locator(SEL.password).isVisible().catch(() => false));
      if (!stillOnLogin) {
        const cookies = await context.cookies();
        setAltenarCookies(res, cookies);
        setDeviceCookies(res, cookies);
        clearPendingCookies(res);
        res.status(200).json({ ok: true });
        return;
      }
      // Nem código nem login: provavelmente usuário/senha foram rejeitados agora.
      const { allValidationTexts, debugScreenshotBase64 } = await extractErrorInfo(page);
      res.status(401).json({
        ok: false,
        error: allValidationTexts.length
          ? allValidationTexts.join(' | ')
          : 'Não consegui reabrir a tela de código. Faça login de novo.',
        debugScreenshotBase64,
      });
      clearPendingCookies(res);
      return;
    }

    // Etapa 2: digita o código TOTP, garante "Remember device" e confirma.
    await page.fill(SEL.codeInput, String(code).trim());

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

    const stillOnLogin =
      page.url().includes('/Account/Login') ||
      (await page.locator(SEL.codeInput).isVisible().catch(() => false));

    if (stillOnLogin) {
      // Código errado/expirado. NÃO limpa o pending: dá pra tentar outro código.
      const { allValidationTexts, debugScreenshotBase64 } = await extractErrorInfo(page);
      res.status(401).json({
        ok: false,
        error: allValidationTexts.length ? allValidationTexts.join(' | ') : 'Código inválido ou expirado.',
        debugAllValidationTexts: allValidationTexts,
        debugScreenshotBase64,
      });
      return;
    }

    // Sucesso: salva a sessão e renova a confiança do dispositivo (pula 2FA
    // nas próximas), e descarta as credenciais guardadas.
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

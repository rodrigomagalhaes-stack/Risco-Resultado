// Seletores e helpers compartilhados entre api/login.js e api/verify2fa.js.
// Confirmados por inspeção ao vivo em 28/08/2026.
const SEL = {
  username: '#username_input',
  password: '#password_input',
  submit: 'button[type="submit"]',
  codeInput: '#codeInput', // tela de verificação em 2 etapas ("Enter verification code here:")
  rememberDeviceCheckbox: 'input[type="checkbox"]', // único checkbox na tela de código = "Remember device"
  twoFaSubmit: '#submitButton',
};

async function isTwoFactorScreen(page) {
  return page.locator(SEL.codeInput).isVisible({ timeout: 1500 }).catch(() => false);
}

async function extractErrorInfo(page) {
  let allValidationTexts = [];
  try {
    const validation = page.locator('.field-validation-error, .validation-summary-errors, .alert-danger, [class*="validation"]');
    const count = await validation.count();
    for (let i = 0; i < count; i++) {
      const t = (await validation.nth(i).innerText().catch(() => '')).trim();
      if (t) allValidationTexts.push(t);
    }
  } catch (_) {}

  let debugScreenshotBase64 = null;
  try {
    debugScreenshotBase64 = (await page.screenshot({ fullPage: false })).toString('base64');
  } catch (_) {}

  return { allValidationTexts, debugScreenshotBase64 };
}

module.exports = { SEL, isTwoFactorScreen, extractErrorInfo };

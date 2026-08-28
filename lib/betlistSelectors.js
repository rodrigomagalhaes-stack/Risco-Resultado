// IDs reais dos campos do Bet List (sb2admin), levantados por inspeção do
// DOM em 28/08/2026. O sufixo GUID do id muda a cada carregamento de página
// (confirmado: mudou entre dois reloads na mesma sessão), então usamos
// sempre seletor "começa com" (id^=) e nunca o id completo.
module.exports = {
  isSettledCheckbox: 'input[id^="IsSettledCB_"]',
  settledRelativeToggle: 'input[id^="isEnabledRelativeSettledFilter_"]', // checked = Relative, unchecked = Absolute
  settledFromInput: 'input[id^="settledFromDatePicker_"]',
  settledToInput: 'input[id^="settledToDatePicker_"]',
  useReportDbCheckbox: 'input[id^="useReportDbCB_"]', // checked = Archive, unchecked = Operational
  showTotalsCheckbox: 'input[id^="showTotalsCB_"]',
  inBaseCurrencyCheckbox: 'input[id^="inBaseCurrCBbl-"]', // checked = mostra na moeda base da conta; queremos DESMARCADO pra ver em BRL
  currencySelect: 'select[id^="currencyFilterMS_"]',
  findButton: 'button:has-text("Find")',
};

// Formato confirmado do campo de data no Bet List: "dd/MM/yyyy HH:mm:ss"
function formatBRDateTime(date, timeStr) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy} ${timeStr}`;
}

// Calcula o dia de "hoje" em America/Bahia (UTC-3, sem horário de verão) -
// não confiar no valor padrão que a tela do Altenar carrega, porque à noite
// (fuso grego já virou o dia) ele vem adiantado um dia. Rodrigo confirmou
// isso em 28/08/2026.
function todayInBahia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  // new Date(y, m-1, d) cria a data em horário local do servidor, mas só
  // usamos os componentes dd/mm/yyyy pra montar a string - o timezone do
  // servidor não importa aqui.
  return new Date(Number(map.year), Number(map.month) - 1, Number(map.day));
}

function settledFromToToday() {
  const today = todayInBahia();
  return {
    from: formatBRDateTime(today, '00:00:00'),
    to: formatBRDateTime(today, '23:59:59'),
  };
}

module.exports.formatBRDateTime = formatBRDateTime;
module.exports.todayInBahia = todayInBahia;
module.exports.settledFromToToday = settledFromToToday;

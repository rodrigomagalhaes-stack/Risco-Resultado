// Liability Report (PRELIVE + LIVE). Não precisa abrir navegador: a chamada
// POST /Api/Liability/GetEvents é uma API JSON normal, autenticada só por
// cookie de sessão - então usamos o cliente HTTP do Playwright (request
// context) reaproveitando os cookies guardados no login. Muito mais rápido
// que abrir um Chromium pra isso.
const { request } = require('playwright-core');
const { getAltenarCookies } = require('../lib/session');

const BASE_URL = 'https://sb2admin-altenar2.biahosted.com';

// Vistos durante o reconhecimento em 28/08/2026 - conferir se ainda batem
// caso a conta/marca mude no futuro.
const LICENSE_ID = 251;
const BRAND_ID = 796;

function baseFilters() {
  return {
    SportIds: [],
    CategoriesIds: [],
    ChampionshipIds: [],
    SearchId: '',
    LicenseId: LICENSE_ID,
    BrandId: BRAND_ID,
    Market: 1,
    SortByStrain: 2,
    SortByCategory: 2,
    Period: 4,
    ShowMatches: true,
    ShowOutrights: true,
    ShowLate: false,
    OnlyManual: false,
  };
}

async function fetchEvents(ctx, isLive) {
  const resp = await ctx.post(`${BASE_URL}/Api/Liability/GetEvents`, {
    data: {
      Filters: { ...baseFilters(), IsLive: isLive },
      Paging: { Page: 1, PageSize: 500 },
    },
  });
  if (!resp.ok()) {
    throw new Error(`GetEvents (IsLive=${isLive}) retornou HTTP ${resp.status()}`);
  }
  const json = await resp.json();
  return (json && json.Data && json.Data.Rows) || [];
}

// Cada linha da API vem por seleção (1/X/2 etc.) dentro de um evento, com
// LiabilitySingles/LiabilityMultiples/LiabilitySuperSingles/LiabilityTotal
// (nomes confirmados direto na resposta real da API em 28/08/2026).
// LiabilityTotal positivo = quanto a casa pode perder se aquela seleção
// vencer (exposição); negativo = resultado favorável à casa nesse cenário.
// O que interessa pra "risco" é o maior LiabilityTotal positivo entre as
// seleções de cada evento.
function summarize(rows) {
  return rows
    .map((ev) => {
      const selections = (ev.Selections || []).map((s) => ({
        name: s.Name,
        totalBets: s.TotalBets,
        totalStakes: s.TotalStakes,
        liabilitySingles: s.LiabilitySingles,
        liabilityMultiples: s.LiabilityMultiples,
        liabilitySuperSingles: s.LiabilitySuperSingles,
        liabilityTotal: s.LiabilityTotal,
      }));
      const worstExposure = selections.reduce((max, s) => {
        const v = typeof s.liabilityTotal === 'number' ? s.liabilityTotal : -Infinity;
        return v > max ? v : max;
      }, -Infinity);
      return {
        eventId: ev.EventId,
        date: ev.EventDate,
        name: ev.Name,
        sport: ev.Sport,
        category: ev.Category,
        champ: ev.Champ,
        market: ev.MarketName,
        selections,
        worstExposure,
      };
    })
    .sort((a, b) => b.worstExposure - a.worstExposure); // maior exposição primeiro
}

module.exports = async (req, res) => {
  const cookies = getAltenarCookies(req);
  if (!cookies) {
    res.status(401).json({ ok: false, needsLogin: true, error: 'Sessão expirada, faça login de novo.' });
    return;
  }

  let ctx;
  try {
    ctx = await request.newContext({
      storageState: { cookies, origins: [] },
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });

    const [prelive, live] = await Promise.all([fetchEvents(ctx, false), fetchEvents(ctx, true)]);

    res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      prelive: { totalEvents: prelive.length, events: summarize(prelive).slice(0, 25) },
      live: { totalEvents: live.length, events: summarize(live).slice(0, 25) },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Falha ao buscar Liability Report: ' + (err && err.message ? err.message : String(err)) });
  } finally {
    if (ctx) await ctx.dispose().catch(() => {});
  }
};

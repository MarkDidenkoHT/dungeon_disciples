// ── errands-complete ────────────────────────────────────────────────────────
// Cron: every 10 minutes.
//
// Finds every errand that is still running but whose time is up, applies what it
// was worth, closes it, and tells the player through the bot.
//
// Also announces finished TRANSMUTATIONS (the `transmutations` table, written by
// POST /api/transmute/start). Those are only announced here, never paid: the
// crystals are granted when the player taps Collect in the game, so there is
// still exactly one place that pays out.
//
// Errands cannot fail, so there is no roll here — completion is arithmetic. The
// row already carries everything needed (written by POST /api/errands/start), so
// this function never imports game data and never has to agree with the game
// server about balance.
//
// WHAT DECIDES "TIME IS UP"
//   errand_data.ends_at   written at start, the authority
//   created_at + hours    fallback, if a row predates ends_at or lost it
//   transmutation.ends_at written at start, the only source for a transmutation
// All are compared against now() on the server, never against a client clock.
//
// Secrets required (Project Settings -> Edge Functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN
//
// Deploy:  supabase functions deploy errands-complete
// Cron:    select cron.schedule('errands-complete', '*/10 * * * *', $$
//            select net.http_post(
//              url := 'https://<project>.functions.supabase.co/errands-complete',
//              headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
//            ) $$);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: { ...HEADERS, ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Types kept loose on purpose: errand_data is authored by the game server and
// this function must not fall over if a field it does not use changes shape.
type Reward = {
  xp_self?: number;
  xp_roster?: number;
  heal_pct?: number;
  resources?: Record<string, number>;
  // GRAND errands pay out of the supply pool instead of the treasury: a Tome, a
  // Sigil, a stack of potions. Keys are token ids (data/embark.js TOKEN_DEFS);
  // they land in `resources` under item_type 'token'.
  tokens?: Record<string, number>;
};

type ErrandRow = {
  id: number;
  player: string;
  errand: string;
  active: boolean;
  created_at: string;
  errand_data: Record<string, any> | null;
};

type Report = {
  checked: number;
  completed: number;
  skipped: number;
  muted: number;
  errors: number;
  tx_checked: number;
  tx_notified: number;
  tx_skipped: number;
};

function endsAt(row: ErrandRow): number {
  const d = row.errand_data || {};
  if (d.ends_at) return new Date(d.ends_at).getTime();
  const hours = Number(d.hours) || 0;
  return new Date(row.created_at).getTime() + hours * 3600_000;
}

// ── Rewards ─────────────────────────────────────────────────────────────────
// Applied AFTER the row is claimed (see below), so a crash mid-way can lose a
// reward but can never pay one twice. Losing one is recoverable by hand;
// double-paying silently inflates every economy in the game.
async function applyReward(row: ErrandRow) {
  const data   = row.errand_data || {};
  const reward = (data.reward || {}) as Reward;
  const chatId = row.player;

  const granted: Reward & { healed?: number } = {};

  // The unit that went: its XP, and the rest it got on the way home.
  if (data.roster_id && (reward.xp_self || reward.heal_pct)) {
    const rows = await db(`/roster?id=eq.${encodeURIComponent(data.roster_id)}&select=id,unit_data`);
    const unit = rows?.[0];
    if (unit) {
      const ud = { ...(unit.unit_data || {}) };

      if (reward.xp_self) {
        ud.current_xp = (Number(ud.current_xp) || 0) + reward.xp_self;
        granted.xp_self = reward.xp_self;
      }
      if (reward.heal_pct && ud.max_hp) {
        const before = Number(ud.current_hp ?? ud.max_hp);
        const healed = Math.floor(Number(ud.max_hp) * reward.heal_pct / 100);
        ud.current_hp = Math.min(Number(ud.max_hp), before + healed);
        granted.healed = ud.current_hp - before;
      }

      await db(`/roster?id=eq.${encodeURIComponent(data.roster_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ unit_data: ud }),
      });
    }
  }

  // XP for everyone who stayed behind. The hero is included — it cannot be sent
  // on an errand, so excluding it would make the reward strictly worse for a
  // player whose roster is mostly hero.
  if (reward.xp_roster) {
    const rest = await db(
      `/roster?chat_id=eq.${encodeURIComponent(chatId)}&select=id,unit_data`,
    ) as Array<{ id: string | number; unit_data: any }>;

    await Promise.all(rest
      .filter(r => String(r.id) !== String(data.roster_id))
      .map(r => db(`/roster?id=eq.${encodeURIComponent(String(r.id))}`, {
        method: 'PATCH',
        body: JSON.stringify({
          unit_data: { ...(r.unit_data || {}), current_xp: (Number(r.unit_data?.current_xp) || 0) + reward.xp_roster! },
        }),
      })));
    granted.xp_roster = reward.xp_roster;
  }

  // ── Resources and tokens ──────────────────────────────────────────────────
  // Both live in `resources`, told apart by item_type: gold and crystals are
  // 'resource', a Tome or a Sigil is 'token'. The distinction is not cosmetic —
  // the game reads tokens with `item_type=eq.token`, so a tome written as a
  // resource would be invisible to the Tome button and to the sigil badge.
  //
  // Which is also why the existing-row lookup matches on item AND item_type:
  // matching on the name alone would find the wrong row the moment a token and
  // a resource ever shared one.
  type Payout = { item: string; amount: number; itemType: 'resource' | 'token' };
  const payouts: Payout[] = [];
  for (const [item, amount] of Object.entries(reward.resources || {})) {
    payouts.push({ item, amount, itemType: 'resource' });
  }
  for (const [item, amount] of Object.entries(reward.tokens || {})) {
    payouts.push({ item, amount, itemType: 'token' });
  }

  if (payouts.length) {
    const inventory = await db(
      `/resources?chat_id=eq.${encodeURIComponent(chatId)}&select=id,item,item_type,amount`,
    ) as Array<{ id: number; item: string; item_type: string; amount: number }>;

    const grantedResources: Record<string, number> = {};
    const grantedTokens:    Record<string, number> = {};

    for (const { item, amount, itemType } of payouts) {
      const existing = inventory.find(r => r.item === item && r.item_type === itemType);
      if (existing) {
        await db(`/resources?id=eq.${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ amount: Number(existing.amount) + amount }),
        });
      } else {
        // Tokens genuinely start absent — a player who has never earned a tome
        // has no row — so this insert is the normal path for them, not the
        // exception it is for gold.
        await db('/resources', {
          method: 'POST',
          body: JSON.stringify({ chat_id: chatId, item_type: itemType, item, amount }),
        });
      }
      if (itemType === 'token') grantedTokens[item] = amount;
      else                      grantedResources[item] = amount;
    }

    if (Object.keys(grantedResources).length) granted.resources = grantedResources;
    if (Object.keys(grantedTokens).length)    granted.tokens    = grantedTokens;
  }

  return granted;
}

// ── Notification ────────────────────────────────────────────────────────────
const MSG = {
  en: (unit: string, title: string, lines: string[]) =>
    `🕊 <b>${unit}</b> is back from <i>${title}</i>.\n\n${lines.join('\n')}`,
  ru: (unit: string, title: string, lines: string[]) =>
    `🕊 <b>${unit}</b> вернулся: <i>${title}</i>.\n\n${lines.join('\n')}`,
};
const LBL = {
  en: { xp: 'XP', xpAll: 'XP to everyone at home', hp: 'HP restored', nothing: 'Home safe.' },
  ru: { xp: 'опыта', xpAll: 'опыта всем оставшимся', hp: 'HP восстановлено', nothing: 'Вернулся невредимым.' },
};

// A token's id is not a thing to show a player. Spelled out here rather than
// imported for the same reason the errand's own title rides on the row: this
// function must not depend on data/ to say a sentence. An id with no entry
// falls back to itself, so a token added later announces awkwardly instead of
// breaking the message.
const TOKEN_NAMES: Record<string, { en: string; ru: string }> = {
  health_potion:     { en: 'Health Potion',     ru: 'Зелье здоровья' },
  tome_of_knowledge: { en: 'Tome of Knowledge', ru: 'Том знаний' },
  crossroad_sigil:   { en: 'Crossroad Sigil',   ru: 'Перекрёстная Печать' },
  engraving_token:   { en: 'Engraving Token',   ru: 'Жетон Гравировки' },
};

const TX_MSG = {
  en: (n: number, crystal: string) =>
    `⚗️ Transmutation complete: <b>${n} ${crystal}</b> crystals are ready to collect.`,
  ru: (n: number, crystal: string) =>
    `⚗️ Трансмутация завершена: <b>${n} ${crystal}</b> кристаллов ждут в игре.`,
};

function rewardLines(granted: Reward & { healed?: number }, lang: 'en' | 'ru') {
  const L = LBL[lang];
  const out: string[] = [];
  if (granted.xp_self)   out.push(`• +${granted.xp_self} ${L.xp}`);
  if (granted.xp_roster) out.push(`• +${granted.xp_roster} ${L.xpAll}`);
  if (granted.healed)    out.push(`• +${granted.healed} ${L.hp}`);
  for (const [item, amount] of Object.entries(granted.resources || {})) {
    out.push(`• +${amount} ${item.replace('Crystals_', '')}`);
  }
  // Last, and in bold: a token is the whole point of a grand errand, and it is
  // the one line the player is waiting half a day for.
  for (const [item, amount] of Object.entries(granted.tokens || {})) {
    out.push(`• <b>+${amount} ${TOKEN_NAMES[item]?.[lang] ?? item}</b>`);
  }
  return out.length ? out : [L.nothing];
}

async function notify(chatId: string, text: string) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) console.error('telegram', res.status, await res.text());
  } catch (err) {
    // A player who blocked the bot must not stop the sweep.
    console.error('telegram failed', err);
  }
}

// ── Errands ─────────────────────────────────────────────────────────────────
async function sweepErrands(report: Report) {
  const rows = await db('/errands?active=is.true&select=*&order=created_at.asc&limit=500') as ErrandRow[];
  report.checked = rows.length;

  for (const row of rows) {
    if (endsAt(row) > Date.now()) continue;    // still out

    try {
      // CLAIM FIRST. The PATCH is filtered on active=is.true, so if another run
      // (or a retry after a timeout) already took this row, PostgREST returns
      // an empty array and this one steps away. Without it, two overlapping
      // runs would both pay the reward.
      const claimed = await db(`/errands?id=eq.${row.id}&active=is.true`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ active: false }),
      });
      if (!Array.isArray(claimed) || !claimed.length) { report.skipped++; continue; }

      const granted = await applyReward(row);

      // Write the outcome back for the client to display. `seen` is left alone
      // — the game sets it when the player has actually been shown the result.
      //
      // `tokens_paid` is NOT left alone. The game server pays nothing for an
      // errand, but it does check that flag before it would, so stamping it
      // here is what keeps the two from ever both paying for one row.
      await db(`/errands?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          errand_data: {
            ...(row.errand_data || {}),
            completed_at: new Date().toISOString(),
            tokens_paid: true,
            granted,
          },
        }),
      });

      // Language and the notification opt-out both live on the player, not on
      // the errand. The reward is applied either way — a player who turned
      // messages off still gets what their unit earned, they just are not
      // pinged about it (settings.notifications, see screens/settings.js).
      const players = await db(
        `/players?chat_id=eq.${encodeURIComponent(row.player)}&select=settings&limit=1`,
      ) as Array<{ settings: any }>;
      const settings = players?.[0]?.settings || {};
      const lang: 'en' | 'ru' = settings.language === 'ru' ? 'ru' : 'en';

      if (settings.notifications !== false) {
        const d     = row.errand_data || {};
        const unit  = d.unit_name || (lang === 'ru' ? 'Боец' : 'Your unit');
        const title = d.title?.[lang] || d.title?.en || row.errand;
        await notify(row.player, MSG[lang](unit, title, rewardLines(granted, lang)));
      } else {
        report.muted++;
      }
      report.completed++;
    } catch (err) {
      report.errors++;
      console.error(`errand ${row.id} failed:`, err);
      // Deliberately NOT re-activated. The row is closed and the player has
      // lost at most one reward, which is recoverable by hand; reopening it
      // would risk paying twice on the next sweep.
    }
  }
}

// ── Transmutations ──────────────────────────────────────────────────────────
// Announce only. The row stays open until the player taps Collect in the game,
// which grants the crystals and sets collected_at. notified_at is stamped here
// so the next sweep does not ping again.
async function sweepTransmutations(report: Report) {
  const now = new Date().toISOString();
  const jobs = await db(
    `/transmutations?collected_at=is.null&notified_at=is.null&ends_at=lte.${encodeURIComponent(now)}` +
    `&select=id,chat_id,target,amount&order=ends_at.asc&limit=500`,
  ) as Array<{ id: number; chat_id: string; target: string; amount: number }>;
  report.tx_checked = jobs.length;

  for (const job of jobs) {
    try {
      // CLAIM THE NOTIFICATION, same idea as the errand claim: filtered on
      // notified_at IS NULL, so two overlapping runs send one message. If the
      // player collected it in the meantime, the filter matches nothing.
      const claimed = await db(
        `/transmutations?id=eq.${job.id}&notified_at=is.null&collected_at=is.null`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ notified_at: new Date().toISOString() }),
        });
      if (!Array.isArray(claimed) || !claimed.length) { report.tx_skipped++; continue; }

      const players = await db(
        `/players?chat_id=eq.${encodeURIComponent(job.chat_id)}&select=settings&limit=1`,
      ) as Array<{ settings: any }>;
      const settings = players?.[0]?.settings || {};
      if (settings.notifications === false) { report.muted++; continue; }
      const lang: 'en' | 'ru' = settings.language === 'ru' ? 'ru' : 'en';
      await notify(job.chat_id, TX_MSG[lang](Number(job.amount) || 0, String(job.target).replace('Crystals_', '')));
      report.tx_notified++;
    } catch (err) {
      report.errors++;
      console.error(`transmutation ${job.id} failed:`, err);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
Deno.serve(async () => {
  const started = Date.now();
  const report: Report = {
    checked: 0, completed: 0, skipped: 0, muted: 0, errors: 0,
    tx_checked: 0, tx_notified: 0, tx_skipped: 0,
  };

  try {
    await sweepErrands(report);
    // Its own guard: a transmutation failure must not report the errand sweep
    // (which already ran and paid) as failed.
    try {
      await sweepTransmutations(report);
    } catch (err) {
      report.errors++;
      console.error('transmutation sweep failed:', err);
    }
  } catch (err) {
    console.error('sweep failed:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, ...report, ms: Date.now() - started }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

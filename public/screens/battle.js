import { api, navigate, itemsCache, bootstrapCache } from '../api.js';
import { UNIT_ABILITIES } from '../../data/unit_abilities.js';
import { resolveAbility, abilityName, resolveUnitDef, CRYSTAL_ICONS, GOLD_ICON, openSheet, closeSheet, openSubSheet, getSheetBody, handleUnitInspect, buildUnitCard, renderItemSlotIcon, buildItemModalParts, itemFromDefKey, combatantItem, unitName, cellFootprint } from '../utils.js';
import { initBattleFx, reattachBattleFx, destroyBattleFx, EFFECTS } from '../battle-fx.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { initSfx, playAbilitySound } from '../sfx.js';
import { createBattleRealtimeController } from '../realtime.js';
import { assetUrl } from '../asset_base.js';
import { SPELLS, POWER_MAX, POWER_NAMES, spellParamsAtPower } from '../../data/spells.js';

const ROWS = 3;
const COLS = 2;

// Effects that take two positional cells — EFFECTS[name](sourceCell, targetCell)
// — because something (life, blood) travels between the acting unit and its
// target. Everything else is single-cell / (cell, opts). Keep in sync with the
// two-cell effects in battle-fx.js.
const SRC_TARGET_FX = new Set(['communion', 'shared_suffering', 'sacrifice', 'terror']);

// Effects that hit MANY cells at once — EFFECTS[name](originCell, { targetCells }).
// The engine logs one entry per victim (fellfire splashes every burning enemy,
// see utils/passive-processor.js), and playback awaits each animation in turn,
// so left alone these would play one after another and read as separate events
// rather than the single simultaneous burst the mechanic actually is. Each run
// of consecutive entries from the same actor is collapsed into one play; the
// individual LOG LINES are untouched, only the animation is deduplicated.
// radiance is here for both reasons at once: it fires on EVERY adjacent enemy
// when the unit is healed, and the light leaves the caster for all of them in
// the same instant.
const FAN_OUT_FX = new Set(['fellfire', 'light_of_dawn', 'radiance', 'mothers_blessing', 'pale_embrace']);

function cellIndex(row, col) { return row * COLS + col; }

function getPortraitUrl(unit, variant = 'default') {
  const unitDef = resolveUnitDef(unit);
  const unitId = unitDef?.id;
  if (!unitId) return null;
  const portraitId = unitId.match(/^(h_[a-z]_\d)/)?.[1] ?? unitId;
  const size = unitDef?.size ?? 'tile';
  const prefix = (variant === 'grid' && (size === 'row' || size === 'column')) ? 'p2' : 'p';
  return `${assetUrl(`/assets/character_portraits/${prefix}_${portraitId}.png`)}`;
}

// Result-screen copy. The rest of the battle UI is icons, so these are the only
// strings on it — they were the last hardcoded English on the screen.
const BT = {
  expandLog:    { en: 'Expand log',         ru: 'Развернуть журнал' },
  collapseLog:  { en: 'Collapse log',       ru: 'Свернуть журнал' },
  btnInfo:      { en: 'Info',               ru: 'Инфо' },
  showInfo:     { en: 'Show ability info',  ru: 'Показать информацию' },
  showLog:      { en: 'Show combat log',    ru: 'Показать журнал боя' },
  infoAction:   { en: 'Action',             ru: 'Действие' },
  infoAbility:  { en: 'Ability',            ru: 'Способность' },
  infoNoAbility:{ en: 'This unit has no active ability.', ru: 'У этого юнита нет активной способности.' },
  infoNoActor:  { en: 'No unit is acting.', ru: 'Сейчас никто не ходит.' },
  infoPower:    { en: 'Power',              ru: 'Сила' },
  infoRange:    { en: 'Range',              ru: 'Дальность' },
  infoTargets:  { en: 'Targets',            ru: 'Цели' },
  infoType:     { en: 'Type',               ru: 'Тип' },
  infoUsed:     { en: 'Already used this battle', ru: 'Уже использована в этом бою' },
  infoFatigue:  { en: n => `Battle fatigue: healing at ${n}%`, ru: n => `Усталость боя: лечение на ${n}%` },
  victory:      { en: 'Victory',            ru: 'Победа' },
  defeat:       { en: 'Defeat',             ru: 'Поражение' },
  returnCastle: { en: 'Return to Castle',   ru: 'Вернуться в замок' },
  calculating:  { en: 'Calculating rewards…', ru: 'Подсчёт наград…' },
  noRewards:    { en: 'No rewards on defeat.', ru: 'При поражении наград нет.' },
  claimed:      { en: 'Rewards already processed.', ru: 'Награды уже начислены.' },
  saveFailed:   { en: m => `Failed to save rewards: ${m}`, ru: m => `Не удалось сохранить награды: ${m}` },
  unlocked:     { en: n => `\u{1F513} Level ${n} unlocked!`, ru: n => `\u{1F513} Уровень ${n} открыт!` },
  xpEach:       { en: 'XP each',            ru: 'опыта каждому' },
  // The four action buttons are labelled by ROLE, always these four words —
  // never the unit's action name. "Mend Flesh" / "Repair" / "Holy Shock" told
  // the player what the unit does but not which button they were looking at,
  // and the word changed every turn as the actor changed.
  btnAction:    { en: 'Action',             ru: 'Действие' },
  btnAbility:   { en: 'Ability',            ru: 'Способность' },
  btnDefend:    { en: 'Defend',             ru: 'Защита' },
  btnSpell:     { en: 'Spell',              ru: 'Магия' },
  // Per-unit XP block on the victory screen.
  xpGained:       { en: 'Experience',        ru: 'Опыт' },
  maxTier:        { en: 'Max tier',          ru: 'Макс. ранг' },
  readyToUpgrade: { en: 'Ready to upgrade',  ru: 'Готов к улучшению' },
  // Unit detail panel: the generic action labels shown when a unit has no named
  // ability, plus the two empty/failure states of the panel itself.
  actSacrifice:  { en: 'Sacrifice',     ru: 'Жертва' },
  actHolyShock:  { en: 'Holy Shock',    ru: 'Священный удар' },
  actShield:     { en: 'Shield',        ru: 'Щит' },
  actDecay:      { en: 'Decay',         ru: 'Тлен' },
  actMothersKiss:{ en: "Mother's Kiss", ru: 'Поцелуй матери' },
  actPassive:    { en: 'Passive',       ru: 'Пассивная' },
  actHeal:       { en: 'Heal',          ru: 'Лечение' },
  actAttack:     { en: 'Attack',        ru: 'Атака' },
  passiveNone:   { en: 'None',          ru: 'Нет' },
  tapForStats:   { en: 'Tap a unit to see stats', ru: 'Нажмите на юнита, чтобы увидеть характеристики' },
  noUnitData:    { en: 'Unit data unavailable',   ru: 'Данные юнита недоступны' },
  noAbility:     { en: 'No Ability',              ru: 'Нет способности' },
  noSpells:      { en: 'No combat spells researched yet.', ru: 'Боевые заклинания ещё не изучены.' },
  noPower:       { en: 'Not enough power for any spell yet.', ru: 'Пока не хватает силы ни на одно заклинание.' },
  castBtn:       { en: 'Cast',                    ru: 'Применить' },
  logPower:      { en: (a, n, t) => `${a} gathers <span class="log-val-shield">${n}</span> power (${t})`,
                   ru: (a, n, t) => `${a} копит <span class="log-val-shield">${n}</span> силы (${t})` },
  logCast:       { en: (a, s, n) => `${a} casts <span class="log-passive">${s}</span> for <span class="log-val-shield">${n}</span> power`,
                   ru: (a, s, n) => `${a} читает <span class="log-passive">${s}</span> за <span class="log-val-shield">${n}</span> силы` },

  // ── Combat log ─────────────────────────────────────────────────────────────
  // Whole clauses rather than stitched-together words: Russian word order and
  // case endings do not survive being assembled from an English sentence's
  // parts. Each entry takes the pieces it needs and returns finished markup.
  logRound:      { en: n => `── Round ${n} ──`, ru: n => `── Раунд ${n} ──` },
  logIntercept:  { en: (a, t) => `${a} <span class="log-passive">intercepted</span> attack on ${t}`,
                   ru: (a, t) => `${a} <span class="log-passive">перехватил</span> атаку по ${t}` },
  logShield:     { en: (t, v) => `${t} 🛡 shield absorbed <span class="log-val-shield">${v}</span>`,
                   ru: (t, v) => `${t} 🛡 щит поглотил <span class="log-val-shield">${v}</span>` },
  logShieldThru: { en: n => `, ${n} passes through`, ru: n => `, ${n} прошло` },
  logShieldAll:  { en: ', all blocked',            ru: ', всё заблокировано' },
  logDecay:      { en: (t, v) => `${t} 🥀 decay ate <span class="log-val">${v}</span> healing`,
                   ru: (t, v) => `${t} 🥀 тлен поглотил <span class="log-val">${v}</span> исцеления` },
  logDecayThru:  { en: n => `, ${n} healed`,        ru: n => `, ${n} вылечено` },
  logDecayAll:   { en: ', all of it',               ru: ', полностью' },
  // A POOL being granted, as opposed to one being spent. `total` is where the
  // pool now stands, which is the number the player is deciding against.
  logShieldOn:   { en: (a, t, v, tot) => `${a} shields ${t} for <span class="log-val-shield">${v}</span> (${tot} total)`,
                   ru: (a, t, v, tot) => `${a} даёт ${t} щит на <span class="log-val-shield">${v}</span> (всего ${tot})` },
  logDecayOn:    { en: (a, t, v, tot) => `${a} decays ${t} by <span class="log-val">${v}</span> (${tot} total)`,
                   ru: (a, t, v, tot) => `${a} насылает на ${t} тлен <span class="log-val">${v}</span> (всего ${tot})` },
  logStatus:     { en: (a, p, t, v) => `${a} applied <span class="log-passive">${p}</span> to ${t} <span class="log-dot">(${v}/turn)</span>`,
                   ru: (a, p, t, v) => `${a} наложил <span class="log-passive">${p}</span> на ${t} <span class="log-dot">(${v}/ход)</span>` },
  logGranted:    { en: (a, p, t, v, s) => `${a} <span class="log-passive">${p}</span> granted ${t} <span class="log-val-heal">+${v}</span> ${s}`,
                   ru: (a, p, t, v, s) => `${a} <span class="log-passive">${p}</span> даёт ${t} <span class="log-val-heal">+${v}</span> ${s}` },
  logPassiveHeal:{ en: (a, p, t, v) => `${a} <span class="log-passive">${p}</span> healed ${t} for <span class="log-val-heal">${v}</span>`,
                   ru: (a, p, t, v) => `${a} <span class="log-passive">${p}</span> лечит ${t} на <span class="log-val-heal">${v}</span>` },
  logPassiveHit: { en: (a, p, t, v) => `${a} <span class="log-passive">${p}</span> hit ${t} for <span class="log-val">${v}</span>`,
                   ru: (a, p, t, v) => `${a} <span class="log-passive">${p}</span> бьёт ${t} на <span class="log-val">${v}</span>` },
  logHeal:       { en: (a, t, v) => `${a} healed ${t} for <span class="log-val-heal">${v}</span>`,
                   ru: (a, t, v) => `${a} лечит ${t} на <span class="log-val-heal">${v}</span>` },
  logHit:        { en: (a, t, v) => `${a} hit ${t} for <span class="log-val">${v}</span>`,
                   ru: (a, t, v) => `${a} бьёт ${t} на <span class="log-val">${v}</span>` },
  logResisted:   { en: (p, r) => ` <span class="log-resisted">(${p} power, ${r} resisted)</span>`,
                   ru: (p, r) => ` <span class="log-resisted">(${p} силы, ${r} поглощено)</span>` },
  logPower:      { en: p => ` <span class="log-resisted">(${p} power)</span>`,
                   ru: p => ` <span class="log-resisted">(${p} силы)</span>` },
  logSkip:       { en: a => `${a} skipped`,        ru: a => `${a} пропускает ход` },

  // Stat names as they appear in a "granted +N <stat>" line.
  statArmor:     { en: 'Armor',      ru: 'брони' },
  statMaxHp:     { en: 'max HP',     ru: 'макс. HP' },
  statInit:      { en: 'Initiative', ru: 'инициативы' },
  statResist:    { en: 'Resist',     ru: 'сопр.' },

  // Live status chips on the inspected unit.
  chipDead:      { en: 'Dead',       ru: 'Погиб' },
  chipStunned:   { en: 'Stunned',    ru: 'Оглушён' },
  chipDot:       { en: 'DoT',        ru: 'Урон/ход' },
  chipRegen:     { en: 'Regen',      ru: 'Реген' },
  chipPerRound:  { en: '/round',     ru: '/ход' },
  chipShield:    { en: 'Shield',     ru: 'Щит' },
  chipDecay:     { en: 'Decay',      ru: 'Тлен' },
  chipInvuln:    { en: 'Invulnerable', ru: 'Неуязвим' },
  chipDamage:    { en: 'Damage',     ru: 'Урон' },
};

export function renderBattle(root, { player, battle_id, region_id, level, snapshot, reconnect, selectedSpells, logs }) {
  const BL = player?.settings?.language === 'ru' ? 'ru' : 'en';
  const BTx = k => BT[k][BL];

  // A combatant's `unit_name` is the ENGLISH name the server stamped on it when
  // the battle was created, so it cannot be shown to a Russian player as-is.
  // Resolve the definition and translate; fall back to the stored name if the
  // def cannot be found (an older snapshot, a unit that has since been renamed).
  const cName = c => (c ? (unitName(resolveUnitDef(c)) || c.unit_name || '') : '');
  initSfx(player); // pick up the player's sfx_enabled setting for ability sounds
  let state            = snapshot ? { ...snapshot, log: Array.isArray(logs) && logs.length ? logs : (snapshot.log || []) } : { combatants: [], log: [] };
  let selectingTarget  = null;
  let pendingAction    = null;
  // The bottom panel shows one of two things: the combat log, or a breakdown of
  // the acting unit's action and ability with the numbers resolved against that
  // unit. The fifth action button swaps between them.
  let panelMode        = 'log';   // 'log' | 'info'
  let selectedCombatant = null;
  let processing       = false;
  let prevState        = null;   // snapshot before each render, used for diff-based animations

  let prevLogLen = 0;
  let lastLogId  = null;
  // Initialize lastLogId from the logs passed at mount (e.g. on reconnect)
  // so the first action only fetches entries newer than what's already displayed.
  if (Array.isArray(logs) && logs.length) {
    const lastEntry = logs[logs.length - 1];
    if (lastEntry?.id != null) lastLogId = lastEntry.id;
  }
  // Seeded below, once playedLogIds exists — see seedPlayedLogs(). Everything
  // handed to the screen at mount has, by definition, already been shown.
  let ui = null;
  let realtimeController = null;
  let battleResolved = false;
  let rewardRequestInFlight = false;
  let fxInitialized = false;

  // Items for the equipped-gear inspector. Served from the shared bootstrap
  // cache — the battle screen no longer fetches its own copy.
  let items = [];
  itemsCache.get(player.chat_id).then(data => { items = data || []; }).catch(() => {});

  function equippedItemFor(rosterId) {
    if (rosterId == null) return null;
    return items.find(it => String(it.equipped_by) === String(rosterId)) || null;
  }

  if (!document.__battleItemInspectBound) {
    document.addEventListener('click', e => {
      const itemBtn = e.target.closest('[data-item-inspect]');
      if (!itemBtn) return;
      // Blueprint key (enemy) or owned row (player).
      const item = itemBtn.dataset.itemKey
        ? itemFromDefKey(itemBtn.dataset.itemKey)
        : equippedItemFor(itemBtn.dataset.rosterId);
      if (!item) return;
      const parts = buildItemModalParts(item, player);
      openSubSheet(parts.title, parts.body, parts.badges);
    });
    document.__battleItemInspectBound = true;
  }

  function snapshotState() {
    if (!state) return null;
    const map = {};
    for (const c of state.combatants) map[c.id] = { hp: c.battle_hp, alive: c.alive };
    return map;
  }

  // Icon art for the actor's active ability, or null when it has none / has no
  // art. The BUTTON's caption is the fixed word "Ability" either way — this only
  // supplies the picture above it.
  function abilityIconSrc(actor) {
    const abilityKey = actor?.unit_data?.ability || actor?.unit_data?.active_ability;
    const def = resolveAbility(abilityKey);
    const fileKey = abilityKey ? abilityKey.replace(/\s+/g, '_').replace(/_\d+$/, '') : null;
    return def && fileKey ? `${assetUrl(`/assets/icons/abilities/${fileKey}.jpg`)}` : null;
  }

  // Localized bark text. For a non-English language, returns ONLY that language's
  // line (no English fallback), matching the spell-translation rule.
  function barkText(entry) {
    const lang = player?.settings?.language;
    if (lang && lang !== 'en') return entry.text_ru ?? '';
    return entry.text ?? '';
  }

  function showBarkToast(actorId, text) {
    if (player?.settings?.barks_enabled === false) return;
    if (!text) return;
    const cell = root.querySelector(`.battle-cell[data-id="${actorId}"]`);
    if (!cell) return;
    cell.classList.add('battle-cell--bark-active');
    // The grid has to come above its own frame art for the toast to be visible
    // at all — see .battle-grid--bark in style.css.
    const grid = cell.closest('.battle-grid');
    grid?.classList.add('battle-grid--bark');
    const toast = document.createElement('div');
    toast.className = 'bark-toast';
    toast.textContent = text;
    cell.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.remove();
      cell.classList.remove('battle-cell--bark-active');
      // Only drop the grid back down once no other cell is still speaking.
      if (grid && !grid.querySelector('.battle-cell--bark-active')) {
        grid.classList.remove('battle-grid--bark');
      }
      document.removeEventListener('click', dismiss, true);
      document.removeEventListener('touchstart', dismiss, true);
    };
    // Any interaction anywhere closes it - deferred so the click that triggered
    // this render (e.g. the action button press) doesn't instantly dismiss it.
    setTimeout(() => {
      document.addEventListener('click', dismiss, true);
      document.addEventListener('touchstart', dismiss, true);
    }, 0);
    setTimeout(dismiss, 6000);
  }

  // Resolves the animation effect name for a log entry.
  // Passive entries use effect_name from the ability definition.
  // Action entries use the actor's action string.
  function effectForEntry(entry, actorCombatant) {
    // An entry may name its own effect outright. Spells take this path: they log
    // as type 'spell', which none of the branches below match, so without it a
    // spell could never animate however well its FX was authored.
    if (entry.effect_name) return entry.effect_name;
    // 'intercept' is a passive as far as animation goes — it just carries its own
    // log type (see resolveProtectorIntercept in utils/battle-engine.js). Without
    // it here, Protector resolved to no effect at all and never animated despite
    // being correctly wired in data/unit_abilities.js.
    if ((entry.type === 'passive' || entry.type === 'intercept') && entry.passive) {
      const def = Object.values(UNIT_ABILITIES).find(d => d?.name === entry.passive);
      if (def?.effect_name) return def.effect_name;
    }
    if (entry.type === 'action' && actorCombatant) {
      return actorCombatant.unit_data?.action_animation || null;
    }
    if (entry.type === 'ability') {
      // Active abilities carry their key on the entry (e.g. 'shared_suffering 1').
      // Map to an effect via the def's effect_name, else the ability's base name.
      const key = entry.ability
        || actorCombatant?.unit_data?.ability
        || actorCombatant?.unit_data?.active_ability;
      const def = key ? UNIT_ABILITIES[key] : null;
      return def?.effect_name || (key ? String(key).split(' ')[0] : null);
    }
    return null;
  }

  // Sound for an entry, played alongside its animation. See public/sfx.js.
  // Two sources, same folder (/assets/sfx/abilities/<name>.mp3):
  //   passives/statuses -> the ability def's `animation_sound`
  //   basic actions     -> the acting unit's `action_sfx` (data/units.js)
  // A unit without action_sfx is simply silent, as before.
  function soundForEntry(entry, actorCombatant) {
    if ((entry.type === 'passive' || entry.type === 'status') && entry.passive) {
      const def = Object.values(UNIT_ABILITIES).find(d => d?.name === entry.passive);
      return def?.animation_sound || null;
    }
    if (entry.type === 'action' && actorCombatant) {
      const raw = actorCombatant.unit_data?.action_sfx;
      // Tolerate either 'arrow_shot' or 'arrow_shot.mp3' in the data.
      return raw ? String(raw).replace(/\.mp3$/i, '') : null;
    }
    return null;
  }

  // Two entries belong to the same play: same kind of event, same source.
  function sameFxGroup(a, b) {
    return a.type === b.type && a.passive === b.passive && a.ability === b.ability &&
           a.actorName === b.actorName && a.actorCell === b.actorCell;
  }

  // Where a group of simultaneous entries has to STOP.
  //
  // Grouping skips past foreign entries rather than stopping at the first one —
  // a hit fires triggers whose log lines land between the victims, and Light of
  // Dawn's heal and burn are split by exactly that. But a batch can span several
  // ROUNDS (the AI loop keeps going until it is your turn again), so the same
  // actor really can act twice inside one batch. Scanning blindly to the end
  // then swallowed the second volley into the first: six strikes across two
  // rounds animated as one burst of three, and the second round drew nothing.
  //
  // So: a round boundary closes a group, and so does anybody ACTING — including
  // this same actor acting again. Side-effect entries (passives, barks, statuses)
  // still do not, which is what keeps the interleaved-trigger case working.
  function closesFxGroup(e, entry) {
    if (e.type === 'round') return true;
    if (e.type === 'action' || e.type === 'ability' || e.type === 'spell') {
      return !sameFxGroup(e, entry);
    }
    return false;
  }

  // Where ONE entry's animation is anchored and what it is handed, for the
  // effects that draw on a single cell. Returns a `run` to call (so several can
  // be started together) and a `key` identifying what it will draw — two
  // entries with the same key would paint the same animation over itself.
  // Returns null when there is no cell to draw on.
  function singleEffectCall(entry, effectName, actor, actorCell) {
    const fn = EFFECTS[effectName];
    if (!fn) return null;
    const targetCell = entry.targetId
      ? document.querySelector(`.battle-cell[data-id="${entry.targetId}"]`)
      : null;
    const sourceCell = entry.sourceId
      ? document.querySelector(`.battle-cell[data-id="${entry.sourceId}"]`)
      : null;
    const isEnemy = actor?.side === 'enemy';
    const id = el => el?.dataset?.id ?? '';

    if (entry.type === 'action') {
      const isHeal = entry.heal === true;
      // A heal is drawn ON the unit mended; a strike is drawn on the attacker
      // and aimed at the target, which is what lets impale and the like point
      // the right way.
      const cell = isHeal ? targetCell : (actorCell || targetCell);
      if (!cell) return null;
      return {
        key: `${id(cell)}>${id(targetCell)}`,
        run: () => fn(cell, { isEnemy, targetCell, isHeal }),
      };
    }
    if (entry.type === 'intercept') {
      // Anchors on the INTERCEPTOR, not the unit it saved: the shield goes up
      // over the protector who stepped in. fromCell is the ATTACKER, so the
      // shield can face the blow.
      if (!actorCell) return null;
      return {
        key: `${id(actorCell)}<${id(sourceCell)}`,
        run: () => fn(actorCell, { fromCell: sourceCell }),
      };
    }
    // Passives and everything else are drawn on whoever they happened to.
    if (!targetCell) return null;
    return { key: id(targetCell), run: () => fn(targetCell) };
  }

  // Patches local state incrementally from a single log entry so HP bars
  // update in sync with the animation rather than all at once at the end.
  // Every log id this client has already animated.
  //
  // Playback used to trust that whatever arrived was new, and three paths can
  // deliver the same entry: the response to your own action, the stream's
  // catch-up fetch, and the refresh on returning to foreground. Whenever
  // `lastLogId` was behind — most of all at the START of a battle, before any
  // entry with an id had been seen — a catch-up returned the whole log and the
  // fight replayed from the beginning. That is exactly why it was worst in
  // round one and clean by the end: by then lastLogId was high and a refetch
  // returned almost nothing.
  //
  // Filtering on the id makes a duplicate delivery cost nothing, whichever
  // route it came by, instead of each route needing its own guard.
  const playedLogIds = new Set();

  // Drops entries this client already holds, BEFORE they are merged into
  // state.log. Playback has its own guard, but the log pane appends first — so
  // without this the text duplicated even when the animation did not.
  function dedupeIncoming(logs) {
    const seenInState = new Set((state?.log || []).map(e => e?.id).filter(id => id != null));
    return (logs || []).filter(e => e?.id == null || (!seenInState.has(e.id) && !playedLogIds.has(e.id)));
  }

  // Anything already on screen at mount counts as played: a reconnect mid-battle
  // hands the whole log back, and without this the first catch-up would replay
  // the entire fight — the worst case of the duplicate problem, and the reason
  // it looked so much worse early on.
  (function seedPlayedLogs() {
    for (const e of [...(logs || []), ...(snapshot?.log || [])]) {
      if (e?.id != null) {
        playedLogIds.add(e.id);
        if (lastLogId == null || e.id > lastLogId) lastLogId = e.id;
      }
    }
  })();

  async function playbackSequence(entries) {
    const newEntries = (entries || []).filter(e => {
      if (e?.id == null) return true;          // no id (a local/optimistic entry) — always play
      if (playedLogIds.has(e.id)) return false;
      playedLogIds.add(e.id);
      if (lastLogId == null || e.id > lastLogId) lastLogId = e.id;
      return true;
    });
    if (!newEntries.length) return;
    console.log('[battle] playbackSequence START, entries:', newEntries.length, newEntries.map(e => e.type + ':' + (e.passive || e.value || '')));
    // Indices whose animation has already been covered by an earlier play —
    // either a fan-out, or a simultaneous volley (see below). Their log lines
    // still print and their HP still lands; only the repeat animation and its
    // repeat sound are skipped.
    const fxCovered = new Set();
    for (let entryIdx = 0; entryIdx < newEntries.length; entryIdx++) {
      const entry = newEntries[entryIdx];
      // Track position in the log
      if (entry.id != null) lastLogId = entry.id;
      // Append this log line to the visible battle log
      const logEl = ui?.battleLog;
      if (logEl) {
        const html = formatLogEntry(entry);
        if (html) {
          const div = document.createElement('div');
          div.innerHTML = html;
          const el = div.firstElementChild;
          if (el) {
            triggerAnim(el, 'anim-log-in');
            logEl.prepend(el);
          }
        }
      }

      // 4. Show bark toast if applicable
      if (entry.type === 'bark') showBarkToast(entry.actorId, barkText(entry));

      // Flash the portrait when a damage-over-time effect ticks on it.
      const dotKind = dotTickKind(entry);
      if (dotKind && entry.targetId) {
        flashCellStatus(document.querySelector(`.battle-cell[data-id="${entry.targetId}"]`), dotKind);
      }

      // Find actor from either side — needed for enemy attacks to get damage_source and range.
      //
      // Only `bark` entries carry actorId; every action/passive entry identifies
      // its actor by actorCell + actorName (see pushLog in utils/battle-engine.js).
      // cellIndex is 0..5 PER SIDE, so a player and an enemy routinely share one,
      // and matching on cell alone returned whichever came first in
      // state.combatants — always a player unit, since those are pushed first.
      // An enemy's attack then resolved to the player unit standing on the same
      // index, which both picked that unit's action_animation and anchored it on
      // that unit's own cell: your spear replaying on your own side.
      // actorName breaks the tie; cell-only is kept as a last resort.
      const actor =
        (entry.actorId != null && state.combatants.find(u => u.id === entry.actorId)) ||
        (entry.actorCell !== undefined && entry.actorName != null &&
          state.combatants.find(u => u.cellIndex === entry.actorCell && u.unit_name === entry.actorName)) ||
        (entry.actorCell !== undefined &&
          state.combatants.find(u => u.cellIndex === entry.actorCell)) ||
        null;
      const effectName = effectForEntry(entry, actor);
      const abilitySound = soundForEntry(entry, actor);
      // An entry already covered by an earlier play is a repeat of something the
      // player has just seen AND heard — four splash victims fired the same clip
      // four times over itself.
      if (abilitySound && !fxCovered.has(entryIdx)) playAbilitySound(abilitySound);
      console.log('[battle] entry', entry.type, entry.passive || '', '| effectName:', effectName, '| targetId:', entry.targetId);
      if (effectName && EFFECTS[effectName]) {
        const targetCell = entry.targetId
          ? document.querySelector(`.battle-cell[data-id="${entry.targetId}"]`)
          : null;
        const sourceCell = entry.sourceId
          ? document.querySelector(`.battle-cell[data-id="${entry.sourceId}"]`)
          : null;
        const actorCell = actor
          ? document.querySelector(`.battle-cell[data-id="${actor.id}"]`)
          : null;

        if (FAN_OUT_FX.has(effectName)) {
          // Collapse the consecutive run of entries this actor produced for the
          // same passive, and play once against every victim. Grouping by RUN
          // rather than by name means two separate triggers in one batch still
          // animate twice, as they should.
          if (!fxCovered.has(entryIdx)) {
            const cells = [];
            for (let j = entryIdx; j < newEntries.length; j++) {
              const e = newEntries[j];
              // Skips PAST foreign entries rather than stopping at them (the run
              // is rarely unbroken — see closesFxGroup for what does end it).
              if (j !== entryIdx && closesFxGroup(e, entry)) break;
              if (!sameFxGroup(e, entry)) continue;
              fxCovered.add(j);
              const c = e.targetId
                ? document.querySelector(`.battle-cell[data-id="${e.targetId}"]`)
                : null;
              if (c) cells.push(c);
            }
            const origin = actorCell || cells[0];
            if (origin && cells.length) await EFFECTS[effectName](origin, { targetCells: cells });
          }
        } else if (SRC_TARGET_FX.has(effectName)) {
          // Two-cell effects: life/blood flows between a source and a target.
          // communion carries an explicit sourceId (the drained enemy); the
          // others originate on the acting unit, so fall back to the actor cell.
          const src = sourceCell || actorCell;
          if (src) await EFFECTS[effectName](src, targetCell);
        } else if (!fxCovered.has(entryIdx)) {
          // A single-target effect that landed on SEVERAL units at once — a
          // splash, a cleave, a multi-target action, an aura tick — is logged
          // once per victim. Awaiting each in turn played one strike, then
          // another, then another, which reads as three separate events when the
          // mechanic was one. Every entry in this batch that resolves to the
          // same effect from the same actor is collected and played TOGETHER.
          const plays  = [];
          const drawn  = new Set();
          for (let j = entryIdx; j < newEntries.length; j++) {
            const e = newEntries[j];
            if (j !== entryIdx) {
              // Same event, same source. Foreign entries are skipped past rather
              // than stopping the scan, for the same reason as the fan-out above
              // — but a round boundary or somebody acting ends the group, or a
              // second volley later in the batch would be swallowed into this one.
              if (closesFxGroup(e, entry)) break;
              if (!sameFxGroup(e, entry)) continue;
              if (effectForEntry(e, actor) !== effectName) continue;
            }
            const call = singleEffectCall(e, effectName, actor, actorCell);
            fxCovered.add(j);
            if (!call) continue;
            // Two entries drawing the same animation on the same cell toward the
            // same target would just paint it over itself.
            if (drawn.has(call.key)) continue;
            drawn.add(call.key);
            plays.push(call.run);
          }
          if (plays.length) await Promise.all(plays.map(run => run()));
        }
      }

      // The result of THIS entry, applied now that its animation has finished.
      // Without it nothing on the board moved until the whole exchange had been
      // played and render() ran at the end — so a spell appeared to leave the
      // enemy at full health right through the enemy's own turn, and every bar
      // on the field then snapped at once.
      applyEntryHp(entry);
    }
    console.log('[battle] playbackSequence END');
  }

  // Moves the HP text and bar for whatever the entry changed. Values are the
  // absolute HP the server left each unit on (see pushLog in battle-engine.js),
  // so this cannot drift out of step with the authoritative state — and the
  // render() at the end of the turn reconciles anything not covered here
  // (shields, status icons, buffs).
  function applyEntryHp(entry) {
    const hp = entry?.hp;
    if (!hp) return;
    for (const [id, value] of Object.entries(hp)) {
      const occ = (state.combatants || []).find(c => String(c.id) === String(id));
      if (!occ) continue;
      const cellEl = document.querySelector(`.battle-cell[data-id="${id}"]`);
      if (!cellEl) continue;

      const maxHp = occ.max_hp || 1;
      const cur   = Math.max(0, Math.min(value, maxHp));
      const pct   = cur / maxHp;
      const dead  = cur <= 0;

      const sub = cellEl.querySelector('.battle-cell-sub');
      // A shield is not HP and is not stamped here, so the shield chip is left
      // exactly as it was rather than being rewritten from stale state.
      if (sub) {
        if (dead) sub.innerHTML = '💀';
        else {
          const shieldChip = sub.innerHTML.match(/🛡\d+/);
          sub.innerHTML = `${cur}/${maxHp}${shieldChip ? ` ${shieldChip[0]}` : ''}`;
        }
      }
      const fill = cellEl.querySelector('.bc-hp-fill');
      if (fill) {
        fill.style.width      = `${Math.max(0, pct * 100)}%`;
        fill.style.background = hpColor(pct);
      }
      cellEl.classList.toggle('battle-cell--dead', dead);
    }
  }

  function triggerAnim(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  function openStatsModal(c) {
    selectedCombatant = c;
    const name = c.name ?? c.unit_data?.unit_id ?? 'Unit';
    openSheet(name, unitStatsHtml(c));
  }

  function closeStatsModal() {
    closeSheet();
  }

  const regionMeta = {
    crimson_basilica: { label: 'Crimson Basilica', icon: '🌲' },
    glittering_abyss: { label: 'Glittering Abyss', icon: '⛰️' },
    chamber_of_unrest: { label: 'Chamber Of Unrest', icon: '💀' },
  };
  const meta = regionMeta[region_id] || { label: region_id, icon: '⚔' };

  function hpColor(pct) {
    if (pct > 0.6) return '#4a9a4a';
    if (pct > 0.3) return '#c8973a';
    return '#c84a3a';
  }

  function getActionLabel(unit) {
    const actionKey = unit?.unit_data?.action;
    const key = typeof actionKey === 'string' ? actionKey : actionKey?.id;
    if (key === 'sacrifice') return BTx('actSacrifice');
    if (key === 'holy_shock') return BTx('actHolyShock');
    if (key === 'shield')    return BTx('actShield');
    if (key === 'decay')     return BTx('actDecay');
    const actionType = typeof actionKey === 'object' ? actionKey?.action_type : null;
    if (actionType === 'none') return BTx('actPassive');
    if (unit?.buffs?._mothers_kiss || unit?._mothers_kiss) return BTx('actMothersKiss');
    const tt = unit?.unit_data?.target_type || unit?.unit_data?.action?.target_type;
    return tt === 'ally' ? BTx('actHeal') : BTx('actAttack');
  }

  function getPassiveName(unit) {
    const p = unit?.unit_data?.passive || unit?.unit_data?.passive_ability;
    if (!p) return BTx('passiveNone');
    if (Array.isArray(p)) {
      return p.filter(Boolean).map(k => k.split(' ')[0].replace(/_/g, ' ')).join(', ') || BTx('passiveNone');
    }
    const name = typeof p === 'string' ? p : (p.name || p.id || '');
    return name.split(' ')[0].replace(/_/g, ' ');
  }

  function cellLabel(cellIdx) {
    const r = Math.floor(cellIdx / COLS);
    const c = cellIdx % COLS;
    return `R${r + 1}C${c + 1}`;
  }

  function currentActor() {
    if (!state || state.done) return null;
    return state.combatants
      .filter(c => c.alive && !c.acted_this_round)
      .sort((a, b) => b.initiative - a.initiative)[0] ?? null;
  }

  // Mirrors TAG_RULES / filterByTagRules in utils/tag-rules.js, which the server
  // enforces. Duplicated rather than imported because that module is CommonJS
  // and server-side — same reason as FATIGUE below. If the rules there change,
  // change these too.
  //
  // Highlighting ignored them entirely, so a mender lit up every ally on the
  // field and only the server refused the tap: Repair offered flesh it cannot
  // touch, Heal offered Constructs, Mend Flesh offered the living.
  const TARGET_TAG_RULES = {
    heal:           { exclude: ['Construct', 'Zombie'] },
    repair:         { require: ['Construct'] },
    'mend flesh':   { require: ['Zombie'] },
    pale_embrace:   { require: ['Spirit'] },
    song_of_ash:    { require: ['Demon'] },
  };

  function passesTagRules(unit, actionKey) {
    // Action ids are not written consistently in data/units.js ('mend flesh',
    // 'Mend flesh', 'Mend Flesh' all appear), and the server lowercases before
    // looking the rules up. Do the same, or two of those three spellings match
    // no rule and filter nothing.
    const rules = TARGET_TAG_RULES[String(actionKey ?? '').toLowerCase()];
    if (!rules) return true;
    const tags = unit?.unit_data?.tags ?? unit?.tags ?? [];
    if (rules.require && !rules.require.some(t => tags.includes(t))) return false;
    if (rules.exclude && rules.exclude.some(t => tags.includes(t))) return false;
    return true;
  }

  function getValidTargetIds(actor, forAbility) {
    if (!actor || !state) return new Set();
    const targets = new Set();
    const isHeal  = actor.unit_data?.target_type === 'ally' || actor.unit_data?.action?.target_type === 'ally';
    const actionRaw = actor.unit_data?.action;
    const actionKey = typeof actionRaw === 'string' ? actionRaw : actionRaw?.id;

    if (actionKey === 'sacrifice') {
      state.combatants.filter(c => c.alive && c.side === actor.side && c.id !== actor.id).forEach(c => targets.add(c.id));
      return targets;
    }

    // Holy Shock reaches both sides — tapping an ally mends, tapping an enemy
    // strikes. Allies are added here; enemies fall through to the shared reach
    // logic at the bottom, so melee reach stays in ONE place and keeps mirroring
    // meleeCanReach() on the server.
    const isHolyShock = actionKey === 'holy_shock';
    if (isHolyShock) {
      state.combatants
        // Mending, so the heal rules apply: Holy Shock cannot mend a Construct
        // or a Zombie either. Matches getValidTargets in battle-engine.js, which
        // filters this branch by the 'heal' rules specifically.
        .filter(c => c.alive && c.side === actor.side && c.id !== actor.id && passesTagRules(c, 'heal'))
        .forEach(c => targets.add(c.id));
    }

    if (forAbility) {
      const key    = actor.unit_data?.ability || actor.unit_data?.active_ability;
      const def    = key ? UNIT_ABILITIES[key] : null;
      const ttype  = def?.target ?? 'enemy';
      const tagReq = def?.params?.tag_required ?? null;
      let cands = [];
      // 'any' — both sides are legal; the ability decides heal vs damage from
      // the side of whoever is tapped (Holy Shock).
      if      (ttype === 'any')        cands = state.combatants.filter(c => c.alive);
      else if (ttype === 'self')       cands = [actor];
      else if (ttype === 'enemy')      cands = state.combatants.filter(c => c.side !== actor.side && c.alive);
      else if (ttype === 'ally')       cands = state.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
      else if (ttype === 'ally_any')   cands = state.combatants.filter(c => c.side === actor.side && c.alive);
      else if (ttype === 'all_allies') cands = state.combatants.filter(c => c.side === actor.side && c.alive);
      else if (ttype === 'ally_dead')  cands = state.combatants.filter(c => c.side === actor.side && !c.alive && (!tagReq || (c.unit_data?.tags ?? []).includes(tagReq)));
      else if (ttype === 'ally_tagged') cands = state.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id && (!tagReq || (c.unit_data?.tags ?? []).includes(tagReq)));
      else cands = state.combatants.filter(c => c.side !== actor.side && c.alive);
      cands.forEach(c => targets.add(c.id));
      return targets;
    }

    if (isHeal && !isHolyShock) {
      state.combatants
        .filter(c => c.side === actor.side && c.alive && passesTagRules(c, actionKey))
        .forEach(c => targets.add(c.id));
      return targets;
    }

    const range = actor.unit_data?.range ?? 1;
    const actorRow = Math.floor(actor.cellIndex / COLS);
    state.combatants.filter(c => c.side !== actor.side && c.alive).forEach(t => {
      if (range > 1) { targets.add(t.id); return; }
      // Melee reach — must mirror meleeCanReach() on the server. Front column
      // first (whole column must fall before the back is exposed), then adjacent
      // rows (±1); if none in the reachable column are adjacent, the nearest by
      // row distance is reachable.
      const side       = t.side;
      const frontCol   = side === 'enemy' ? 0 : 1;
      const backCol    = side === 'enemy' ? 1 : 0;
      const frontAlive = state.combatants.some(c => c.side === side && c.alive && c.cellIndex % COLS === frontCol);
      const reachableCol = frontAlive ? frontCol : backCol;
      if (t.cellIndex % COLS !== reachableCol) return;
      const colUnits = state.combatants.filter(c => c.side === side && c.alive && c.cellIndex % COLS === reachableCol);
      const tDist    = Math.abs(Math.floor(t.cellIndex / COLS) - actorRow);
      const hasAdjacent = colUnits.some(c => Math.abs(Math.floor(c.cellIndex / COLS) - actorRow) <= 1);
      const ok = hasAdjacent
        ? tDist <= 1
        : tDist === Math.min(...colUnits.map(c => Math.abs(Math.floor(c.cellIndex / COLS) - actorRow)));
      if (ok) targets.add(t.id);
    });
    return targets;
  }

  function unitStatsHtml(c) {
    if (!c) return `<div class="battle-unit-detail-empty">${BTx('tapForStats')}</div>`;
    const def = resolveUnitDef(c);
    if (!def) return `<div class="battle-unit-detail-empty">${BTx('noUnitData')}</div>`;

    // The card is drawn from the LIVE combatant, not the blueprint: armor,
    // initiative and resistances are mutated in place by buffs, and damage
    // scales through _dmg_mult rather than by rewriting the power stat. The
    // blueprint values captured at battle start (_base_stats) become the
    // comparison unit, so every buffed stat renders with its own +/- delta the
    // same way a roster comparison does.
    const base       = c._base_stats || {};
    const basePower  = base.action_power ?? def.action_power ?? def.action?.value ?? 0;
    const livePower  = Math.floor(basePower * (c._dmg_mult ?? 1));
    const guard      = c.defend_armor_bonus || 0;
    const liveArmor  = (c.armor ?? def.armor ?? 0) + guard;
    // Defending raises every resistance by the same amount it raises armor (see
    // DEFEND_BONUS in utils/battle-engine.js), so the resist column has to show
    // it too — otherwise the card claims bracing only helps against physical,
    // which is exactly the bug it used to have.
    const liveResists = { ...(c.unit_data?.resistances ?? def.resistances ?? {}) };
    if (guard) for (const k of Object.keys(liveResists)) liveResists[k] = Math.min(100, (liveResists[k] ?? 0) + guard);

    const liveUnit = {
      ...def,
      hp:           `${c.battle_hp}/${c.max_hp}`,
      armor:        liveArmor,
      initiative:   c.initiative ?? def.initiative ?? '—',
      action_power: livePower,
      resistances:  liveResists,
    };

    // Spread the SAME def liveUnit was built from, then override only the four
    // stats a buff can move. Building this from scratch left targets and range
    // undefined, and the diff read that as 0 — so every unit whose action hits
    // more than one target at more than range 1 reported a permanent
    // "Targets +1 / Range +1" that no buff had granted.
    const baseUnit = {
      ...def,
      armor:        base.armor ?? def.armor ?? 0,
      initiative:   base.initiative ?? def.initiative ?? 0,
      action_power: basePower,
      resistances:  base.resistances ?? def.resistances ?? {},
    };

    const badge = c.side === 'player' ? 'Ally' : 'Enemy';

    // Everything the engine registers as a dispellable effect already carries a
    // display name and a polarity, so the chip row is generated from that list
    // rather than from a hand-maintained set of known buff names.
    const chip = (cls, text) => `<span class="stat-diff-chip stat-diff--${cls}">${text}</span>`;
    const effectChips = (c._effects || []).map(e =>
      chip(e.polarity === 'positive' ? 'up' : 'down', logPassive(e.name || e.key)));

    // Damage-over-time and stack counters live outside the effect registry (they
    // tick and expire on their own), so they are listed explicitly.
    const dot = (c.dot_dmg || 0) + (c._poison_dmg || 0);
    // Rage/Aegis/Fanaticism are ability names, so they translate through the
    // ability table like every other one rather than being spelled out here.
    // The ability table is keyed by tier ("rage 1", "rage 2"), so these resolve
    // by display NAME the same way the log's passive names do.
    const stackChip = (n, ability, icon) => n > 0
      ? chip('up', `${icon} ${logPassive(ability)} x${n}`)
      : '';
    const perRound = BTx('chipPerRound');
    const extraChips = [
      !c.alive                 ? chip('down', `💀 ${BTx('chipDead')}`) : '',
      c._stun_rounds > 0       ? chip('down', `💫 ${BTx('chipStunned')} ${c._stun_rounds}`) : '',
      dot > 0                  ? chip('down', `🩸 ${BTx('chipDot')} ${dot}${perRound}`) : '',
      c._hot > 0               ? chip('up',   `💚 ${BTx('chipRegen')} ${c._hot}${perRound}`) : '',
      stackChip(c._rage_stacks,       'Rage',       '😡'),
      stackChip(c._aegis_stacks,      'Aegis',      '🛡'),
      stackChip(c._fanaticism_stacks, 'Fanaticism', '🔥'),
      (c._shield ?? 0) > 0     ? chip('up',   `🛡 ${BTx('chipShield')} ${c._shield}`) : '',
      (c._decay  ?? 0) > 0     ? chip('down', `🥀 ${BTx('chipDecay')} ${c._decay}`) : '',
      c._invulnerable          ? chip('up',   `✨ ${BTx('chipInvuln')}`) : '',
      (c._dmg_mult ?? 1) !== 1 ? chip((c._dmg_mult > 1) ? 'up' : 'down',
                                      `⚔ ${BTx('chipDamage')} ${Math.round(((c._dmg_mult ?? 1) - 1) * 100)}%`) : '',
    ].filter(Boolean);

    const statusChips = [...effectChips, ...extraChips].join('');
    const statusHtml = statusChips ? `<div class="unit-stat-diffs">${statusChips}</div>` : '';

    // Drawn for ANY combatant carrying an item. The player's units resolve
    // through the owned-items table; enemies carry an item_id blueprint key from
    // the encounter (see data/embark.js getEncounter), which is why keying only
    // off _rosterId showed nothing on the enemy side.
    const equippedItem = combatantItem(c, equippedItemFor);
    const itemSlotHtml = equippedItem
      ? renderItemSlotIcon(equippedItem, c._rosterId, { interactive: false, player })
      : (c.side === 'player' ? renderItemSlotIcon(null, c._rosterId, { interactive: false, player }) : '');

    return `<div class="battle-unit-detail" data-roster-id="${c._rosterId ?? ''}">${buildUnitCard(liveUnit, { badge, itemSlotHtml, compareUnit: baseUnit })}${statusHtml}</div>`;
  }

  // ── Combat log rendering ────────────────────────────────────────────────────
  // The log is written by the SERVER, in English: unit names, passive names and
  // the odd literal like "all allies" all arrive already-rendered. Every one of
  // them is a key we can resolve back to a definition, so the whole line is
  // rebuilt in the viewer's language here rather than printed as it arrived.
  const BTf = k => BT[k][BL];

  const loc = cell => cell !== undefined ? ` <span class="log-loc">(${cellLabel(cell)})</span>` : '';

  // Server-side literals that name a group rather than a unit.
  const GROUP_NAMES = {
    'all allies':  { en: 'all allies',  ru: 'всем союзникам' },
    'all enemies': { en: 'all enemies', ru: 'всем врагам' },
  };

  // A name as the server stamped it, translated back. Combatant ids are the
  // reliable route; the name string is the fallback for older log rows.
  function logName(name, id, cls, cell) {
    const group = GROUP_NAMES[name];
    let label = group ? group[BL] : null;
    if (!label && id) {
      const c = state.combatants?.find(x => x.id === id);
      if (c) label = cName(c);
    }
    if (!label) {
      const c = state.combatants?.find(x => x.unit_name === name);
      label = c ? cName(c) : name;
    }
    return `<span class="${cls}">${label}</span>${loc(cell)}`;
  }

  // entry.passive is the ability's English name — the same string the icon
  // lookups in this file already key off, so it resolves to a definition and
  // through abilityName to the localized one.
  function logPassive(name) {
    const def = Object.values(UNIT_ABILITIES).find(d => d?.name === name);
    return def ? abilityName(def) : name;
  }

  const STAT_LOG_LABELS = { armor: 'statArmor', 'max HP': 'statMaxHp', initiative: 'statInit' };
  function logStat(stat) {
    const key = STAT_LOG_LABELS[stat];
    if (key) return BTx(key);
    const m = String(stat).match(/^(air|fire|nature|cold|life|death)\s*resist$/i);
    return m ? `${m[1]} ${BTx('statResist')}` : stat;
  }

  // ── Power ──────────────────────────────────────────────────────────────────
  // Five pips per side. A dead hero greys its whole strip — that side's casting
  // is over for the fight, and saying so is worth more than showing a number
  // that will never move again.
  function heroOf(side) {
    return (state?.combatants || []).find(c => c.side === side && (c._is_hero || c.buffs?._is_hero));
  }

  function renderPowerStrips() {
    const pips = (side) => {
      const have = Number(state?.power?.[side] ?? 0);
      const hero = heroOf(side);
      const dead = hero ? !hero.alive : true;
      const cells = Array.from({ length: POWER_MAX }, (_, i) =>
        `<span class="power-pip ${i < have ? 'power-pip--full' : ''}"></span>`).join('');
      return { html: cells, dead, have };
    };

    for (const [side, el] of [['player', ui.powerPlayer], ['enemy', ui.powerEnemy]]) {
      if (!el) continue;
      const { html, dead, have } = pips(side);
      el.innerHTML = html;
      el.classList.toggle('power-strip--spent', dead);
      el.title = `${powerLabel()}: ${have}/${POWER_MAX}`;
      if (side === 'player') {
        // Only openable on the hero's own turn with something to spend — the
        // list would otherwise offer spells that cannot be cast yet.
        const hero = heroOf('player');
        const canCast = !!hero?.alive && have > 0 && currentActor()?.id === hero.id && !processing;
        el.disabled = !canCast;
        el.classList.toggle('power-strip--ready', canCast);
      }
    }
  }

  function powerLabel() {
    const names = POWER_NAMES[player?.faction] || POWER_NAMES.enemies;
    return BL === 'ru' ? names.ru : names.en;
  }

  // ── Casting ────────────────────────────────────────────────────────────────
  // Researched combat spells only, and only those the current power can pay for
  // — a list that shows what you cannot afford is a list of disappointments.
  // The power slider under each spell is the whole decision: the same spell is
  // a cheap patch at 1 and a turning point at 5.
  let castChoice = null;   // { spell, power } while picking a target

  // Which spells are researched. The player object the battle is handed does not
  // reliably carry them (the Tome fetches its own), so this is pulled once, the
  // first time the sheet is opened, and reused for the rest of the fight —
  // nothing can be researched mid-battle.
  let researchedIds = null;
  async function loadResearched() {
    if (researchedIds) return researchedIds;
    if (Array.isArray(player?.learned_spells)) return (researchedIds = new Set(player.learned_spells));
    try {
      const res = await api(`/spells/research?chat_id=${player.chat_id}`);
      researchedIds = new Set(res?.researched_spells || []);
    } catch {
      researchedIds = new Set();
    }
    return researchedIds;
  }

  function learnedCombatSpells(known) {
    const all = SPELLS[player?.faction] || [];
    return all.filter(s => known.has(s.id) && s.category !== 'non_combat' && s.usage !== 'roster');
  }

  // Spell art. `icon` on the definition, falling back to the id's base name, so
  // a spell without its own file still lines up with the ability icons rather
  // than leaving a hole.
  // Spell art is keyed by the spell's ID and lives in /assets/icons/spells as a
  // PNG. The portrait badge is a different picture entirely — see effect_icon.
  function spellIconHtml(spell, cls = 'spell-cast-icon') {
    return `<img class="${cls}" src="${assetUrl(`/assets/icons/spells/${spell.id}.png`)}"
                 alt="${spell.name}" onerror="this.style.visibility='hidden'">`;
  }

  // What the numbers become at this power. Reads the same scaling function the
  // server casts with, so the preview cannot promise something the engine will
  // not deliver.
  function spellPreviewHtml(spell, power) {
    const p = spellParamsAtPower(spell, power);
    const bits = [];
    const add = (label, v, suffix = '') => { if (v) bits.push(`${label} <strong>${v}${suffix}</strong>`); };

    add(BL === 'ru' ? 'броня'      : 'armor',      p.armor_boost);
    add(BL === 'ru' ? 'урон'       : 'damage',     p.damage_flat);
    add(BL === 'ru' ? 'инициатива' : 'initiative', p.initiative_boost);
    add(BL === 'ru' ? 'щит'        : 'shield',     p.shield_caster);
    add(BL === 'ru' ? 'тлен'       : 'decay',      p.decay_amount);
    add(BL === 'ru' ? 'усилений'   : 'buffs',      p.dispel_count);
    add(BL === 'ru' ? 'урон'       : 'damage',     p.damage_boost_pct, '%');
    add(BL === 'ru' ? 'перенаправление' : 'redirect', p.martyrdom_redirect_pct, '%');
    add(BL === 'ru' ? 'перехват'   : 'intercept',  p.intercept_chance_pct, '%');
    if (p.damage_dealt_reduction_pct) bits.push(`${BL === 'ru' ? 'урон врага' : 'enemy damage'} <strong>−${p.damage_dealt_reduction_pct}%</strong>`);
    if (p.armor_flat_reduction)       bits.push(`${BL === 'ru' ? 'броня' : 'armor'} <strong>−${p.armor_flat_reduction}</strong>`);
    for (const [school, amount] of Object.entries(p.resist_reduction || {})) {
      bits.push(`${school} <strong>−${amount}</strong>`);
    }
    for (const [school, amount] of Object.entries(p.resistances || {})) {
      bits.push(`${school} <strong>+${amount}</strong>`);
    }
    if (p.duration_rounds) bits.push(`${p.duration_rounds} ${BL === 'ru' ? 'раунда' : 'rounds'}`);
    if (p.lock_all_passives_rounds) bits.push(`${BL === 'ru' ? 'пассивки молчат' : 'passives silenced'} <strong>${p.lock_all_passives_rounds}</strong>`);
    return bits.join(' · ');
  }

  async function openSpellSheet() {
    const known = await loadResearched();
    const have = Number(state?.power?.player ?? 0);
    const list = learnedCombatSpells(known);
    const affordable = list.filter(s => (s.power_cost ?? 1) <= have);

    if (!list.length) {
      openSheet(powerLabel(), `<p class="modal-empty">${BTx('noSpells')}</p>`);
      return;
    }

    // A TRACK of spell art with one detail panel under it, rather than a stack
    // of full-height rows. Six spells as rows meant scrolling a sheet to
    // compare them, on the screen where the player is mid-turn; as icons they
    // are all visible at once and the panel answers for whichever is selected.
    const track = affordable.map((s, i) => `
      <button class="spell-pick ${i === 0 ? 'spell-pick--on' : ''}" data-pick="${s.id}"
              title="${BL === 'ru' ? (s.name_ru || s.name) : s.name}">
        ${spellIconHtml(s, 'spell-pick-img')}
      </button>`).join('');

    const body = `
      <div class="spell-track">${track}</div>
      <div class="spell-detail" id="spell-detail"></div>`;

    openSheet(`${powerLabel()} ${have}/${POWER_MAX}`,
      affordable.length ? body : `<p class="modal-empty">${BTx('noPower')}</p>`);

    const sheet = getSheetBody();

    // The detail panel for one spell: description, the numbers this cast will
    // actually produce, the power selector, and the cast button.
    const chosenPower = {};
    function renderDetail(spell) {
      const min = spell.power_cost ?? 1;
      const power = chosenPower[spell.id] ?? min;
      const desc = BL === 'ru' ? (spell.description_ru || spell.description) : spell.description;
      const opts = [];
      for (let p = min; p <= Math.min(POWER_MAX, have); p++) {
        opts.push(`<button class="spell-power-opt${p === power ? ' spell-power-opt--on' : ''}"
                           data-spell="${spell.id}" data-power="${p}">${p}</button>`);
      }
      const panel = sheet?.querySelector('#spell-detail');
      if (!panel) return;
      panel.innerHTML = `
        <div class="spell-cast-name">${BL === 'ru' ? (spell.name_ru || spell.name) : spell.name}</div>
        <p class="spell-cast-desc">${desc}</p>
        <div class="spell-cast-preview" data-preview="${spell.id}">${spellPreviewHtml(spell, power)}</div>
        <div class="spell-cast-power">
          <span class="spell-cast-power-label">${powerLabel()}</span>
          ${opts.join('')}
        </div>
        <button class="spell-cast-btn" data-cast="${spell.id}">${BTx('castBtn')}</button>`;
      bindDetail(spell);
    }

    function bindDetail(spell) {
      // Power choice restates the outcome in place — the numbers ARE the choice.
      sheet?.querySelectorAll('.spell-power-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          chosenPower[spell.id] = Number(btn.dataset.power);
          renderDetail(spell);
        });
      });
      sheet?.querySelector('.spell-cast-btn')?.addEventListener('click', () => {
        closeSheet();
        beginCast(spell, chosenPower[spell.id] ?? (spell.power_cost ?? 1));
      });
    }

    if (affordable.length) {
      renderDetail(affordable[0]);
      sheet?.querySelectorAll('.spell-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          const spell = affordable.find(s => s.id === btn.dataset.pick);
          if (!spell) return;
          sheet.querySelectorAll('.spell-pick').forEach(b => b.classList.toggle('spell-pick--on', b === btn));
          renderDetail(spell);
        });
      });
    }
  }

  // A spell that needs a target arms the grid the same way an attack does, so
  // targeting is one system rather than two that look alike.
  function beginCast(spell, power) {
    const needsTarget = spell.target_scope === 'single_enemy' || spell.target_scope === 'single_ally';
    if (!needsTarget) { sendCast(spell.id, power, null); return; }
    castChoice = { spell, power };
    selectingTarget = currentActor();
    pendingAction   = 'spell';
    render();
  }

  async function sendCast(spell_id, power, target_id) {
    castChoice = null;
    pendingAction = null;
    selectingTarget = null;
    processing = true;
    render();
    try {
      const result = await api('/battle/cast', { chat_id: player.chat_id, battle_id, spell_id, power, target_id });
      if (result.error) throw new Error(result.error);
      const newLogs = dedupeIncoming(result.logs);
      state = { ...(result.state || state), log: [...(state.log || []), ...newLogs] };
      if (ui?.battleLog) {
        const existingCount = (state.log || []).length - newLogs.length;
        ui.battleLog.innerHTML = (state.log || []).slice(0, existingCount).slice().reverse().map(formatLogEntry).join('');
      }
      await playbackSequence(newLogs);
      if (realtimeController) realtimeController.setLastLogId(lastLogId);
      if (result.done) { renderResult(result.winner); return; }
      processing = false;
      render();
    } catch (err) {
      console.error('Cast failed:', err);
      processing = false;
      alert(err.message || 'Cast failed');
      render();
    }
  }

  function formatLogEntry(entry) {
    const actor  = () => logName(entry.actorName,  entry.actorId,  'log-actor',  entry.actorCell);
    const target = () => logName(entry.targetName, entry.targetId, 'log-target', entry.targetCell);

    if (entry.type === 'round') return `<div class="log-entry log-entry--round">${BTf('logRound')(entry.round)}</div>`;
    if (entry.type === 'intercept') {
      return `<div class="log-entry log-entry--passive">${BTf('logIntercept')(actor(), target())}</div>`;
    }
    if (entry.type === 'defend' || entry.type === 'ability') {
      // entry.message is composed server-side and stays in English — see the
      // note in the log header. Everything around it is localized.
      const tgt = entry.targetName ? ` → ${target()}` : '';
      return `<div class="log-entry">${actor()}${tgt} ${entry.message}</div>`;
    }
    if (entry.type === 'shield') {
      const tail = entry.remaining > 0 ? BTf('logShieldThru')(entry.remaining) : BTx('logShieldAll');
      return `<div class="log-entry log-entry--shield">${BTf('logShield')(target(), entry.value)}${tail}</div>`;
    }
    if (entry.type === 'power') {
      return `<div class="log-entry log-entry--shield">${BTf('logPower')(actor(), entry.value, entry.total)}</div>`;
    }
    if (entry.type === 'cast') {
      return `<div class="log-entry log-entry--passive">${BTf('logCast')(actor(), entry.spell, entry.value)}</div>`;
    }
    if (entry.type === 'pool') {
      const tpl = entry.pool === 'shield' ? 'logShieldOn' : 'logDecayOn';
      return `<div class="log-entry log-entry--shield">${BTf(tpl)(actor(), target(), entry.value, entry.total)}</div>`;
    }
    if (entry.type === 'decay') {
      const tail = entry.remaining > 0 ? BTf('logDecayThru')(entry.remaining) : BTx('logDecayAll');
      return `<div class="log-entry log-entry--shield">${BTf('logDecay')(target(), entry.value)}${tail}</div>`;
    }
    if (entry.type === 'status') {
      return `<div class="log-entry">${BTf('logStatus')(actor(), logPassive(entry.passive), target(), entry.value)}</div>`;
    }
    if (entry.type === 'passive') {
      // A stat grant (armor / resistance / max HP) is neither a heal nor a hit.
      // `stat` names it; without that flag the entry would fall through to the
      // heal wording, which is how buff auras came to read as "healed for 3".
      if (entry.stat) {
        return `<div class="log-entry log-entry--passive">${
          BTf('logGranted')(actor(), logPassive(entry.passive), target(), entry.value, logStat(entry.stat))}</div>`;
      }
      const tpl = entry.heal !== false ? 'logPassiveHeal' : 'logPassiveHit';
      return `<div class="log-entry log-entry--passive">${
        BTf(tpl)(actor(), logPassive(entry.passive), target(), entry.value)}</div>`;
    }
    if (entry.type === 'action') {
      const line = entry.heal
        ? BTf('logHeal')(actor(), target(), entry.value)
        : BTf('logHit')(actor(), target(), entry.value);
      const detail = (!entry.heal && entry.rawDmg != null)
        ? (entry.resisted > 0 ? BTf('logResisted')(entry.rawDmg, entry.resisted) : BTf('logPower')(entry.rawDmg))
        : '';
      return `<div class="log-entry">${line}${detail}${entry.killed ? ' 💀' : ''}</div>`;
    }
    if (entry.type === 'skip') return `<div class="log-entry log-entry--skip">${BTf('logSkip')(actor())}</div>`;
    if (entry.type === 'bark') {
      if (player?.settings?.barks_enabled === false) return '';
      return `<div class="log-entry log-entry--bark">${actor()}: "${barkText(entry)}"</div>`;
    }
    if (entry.type === 'notice') return `<div class="log-entry log-entry--notice">${entry.message}</div>`;
    return '';
  }

  // ── Ability info panel ──────────────────────────────────────────────────────
  // Mirrors BATTLE_FATIGUE in utils/battle-engine.js. Duplicated rather than
  // imported because that module is CommonJS and server-side; if the engine's
  // numbers change, change these too.
  const FATIGUE = {
    start: 5, perRound: 10, maxPct: 50,
    witherStart: 10,
    // The Withering does a flat 5% of max HP a turn — it does not ramp
    // mechanically. The aura ramps anyway, over this many rounds, because what
    // the player needs to feel is the pressure ACCUMULATING: every round spent
    // here has cost more than the last.
    witherRampRounds: 6,
  };

  function fatigueHealPct() {
    const over = (state.round ?? 1) - FATIGUE.start;
    if (over <= 0) return 100;
    return 100 - Math.min(FATIGUE.maxPct, over * FATIGUE.perRound);
  }

  // ── Attrition aura ─────────────────────────────────────────────────────────
  // Battle Fatigue and the Withering were invisible: two lines in the log as
  // each phase opened, and nothing afterwards. A player watching heals shrink
  // had no way to connect that to the round counter. Both phases now light the
  // grid frames — amber as healing weakens, deep red once the field itself
  // starts killing — and both deepen as the rounds pile up, so the pressure is
  // legible without reading anything.
  //
  // Returned as 0..1 intensities rather than classes so the two can stack: in
  // the late game both are lit at once, which is exactly the situation.
  function attritionLevels() {
    const round = state?.round ?? 1;

    const overFatigue = round - FATIGUE.start;
    const warm = overFatigue <= 0 ? 0
      : Math.min(FATIGUE.maxPct, overFatigue * FATIGUE.perRound) / FATIGUE.maxPct;

    const overWither = round - FATIGUE.witherStart;
    const dire = overWither <= 0 ? 0
      : Math.min(1, overWither / FATIGUE.witherRampRounds);

    return { warm, dire };
  }

  function applyAttritionAura() {
    const arena = root.querySelector('.battle-arena');
    if (!arena) return;
    const { warm, dire } = attritionLevels();
    arena.style.setProperty('--attrition-warm', warm.toFixed(2));
    arena.style.setProperty('--attrition-dire', dire.toFixed(2));
    // Only used to gate the pulse animation — the glow itself is driven by the
    // two variables above, and is invisible on its own when both are 0.
    arena.classList.toggle('battle-arena--fatigued',  warm > 0);
    arena.classList.toggle('battle-arena--withering', dire > 0);
  }

  const infoRow = (k, v) =>
    `<div class="binfo-row"><span class="binfo-k">${k}</span><span class="binfo-v">${v}</span></div>`;

  // Params are shown resolved: a percentage-of-HP cost is worth nothing to a
  // player as "10%", so the absolute figure for THIS unit is worked out too.
  function paramRows(def, actor) {
    const p     = def?.params || {};
    const maxHp = actor.max_hp ?? actor.unit_data?.hp ?? 0;
    const rows  = [];
    for (const [key, val] of Object.entries(p)) {
      if (val == null || typeof val === 'boolean' || typeof val === 'object') continue;
      const label = key.replace(/_/g, ' ');
      if (typeof val === 'number' && /pct$/.test(key)) {
        const hpish = /hp|heal|cost|sacrifice|drain/.test(key);
        rows.push(infoRow(label, hpish && maxHp
          ? `${val}% <span class="binfo-calc">= ${Math.max(1, Math.floor(maxHp * val / 100))} HP</span>`
          : `${val}%`));
      } else {
        rows.push(infoRow(label, String(val)));
      }
    }
    return rows.join('');
  }

  function renderBattleInfo() {
    if (!ui?.battleInfo) return;
    const actor = currentActor();
    if (!actor) {
      ui.battleInfo.innerHTML = `<p class="binfo-empty">${BTx('infoNoActor')}</p>`;
      return;
    }
    const ud      = actor.unit_data || {};
    const healPct = fatigueHealPct();

    // ONE section, for whatever is currently selected — not a dump of everything
    // the unit can do. The ability button arms 'ability'; anything else means
    // the basic action, which is what is armed by default.
    const showingAbility = pendingAction === 'ability';

    let head, bodyHtml;
    if (showingAbility) {
      const abilityKey = ud.ability || ud.active_ability;
      const def        = abilityKey ? (resolveAbility(abilityKey) || UNIT_ABILITIES[abilityKey]) : null;
      if (def) {
        const abName = BL === 'ru' ? (def.name_ru || def.name) : def.name;
        const abDesc = BL === 'ru' ? (def.description_ru || def.description) : def.description;
        head = `${BTx('infoAbility')} — ${abName}`;
        bodyHtml = `
          ${abDesc ? `<p class="binfo-desc">${abDesc}</p>` : ''}
          ${paramRows(def, actor)}
          ${actor.used_active ? `<div class="binfo-note">${BTx('infoUsed')}</div>` : ''}`;
      } else {
        head = BTx('infoAbility');
        bodyHtml = `<p class="binfo-empty">${BTx('infoNoAbility')}</p>`;
      }
    } else {
      const dmgMult  = actor.buffs?._dmg_mult ?? 1;
      const rawPower = Number(ud.action_power ?? 0);
      const power    = Math.floor(rawPower * dmgMult);
      const powerStr = dmgMult !== 1
        ? `${power} <span class="binfo-calc">(${rawPower} x${dmgMult.toFixed(2)})</span>`
        : `${power}`;
      head = `${BTx('infoAction')} — ${getActionLabel(actor)}`;
      bodyHtml = `
        ${infoRow(BTx('infoPower'), powerStr)}
        ${ud.damage_source ? infoRow(BTx('infoType'), ud.damage_source) : ''}
        ${infoRow(BTx('infoRange'), String(ud.range ?? 1))}
        ${infoRow(BTx('infoTargets'), String(ud.targets ?? 1))}`;
    }

    ui.battleInfo.innerHTML = `
      <div class="binfo">
        <div class="binfo-unit">${cName(actor)}</div>
        <div class="binfo-section">
          <div class="binfo-head">${head}</div>
          ${bodyHtml}
        </div>
        ${healPct < 100 ? `<div class="binfo-note binfo-note--warn">${BT.infoFatigue[BL](healPct)}</div>` : ''}
      </div>`;
  }

  // Swaps which of the two bottom panels is on show, and re-labels the button
  // with what it will do NEXT.
  function applyPanelMode() {
    if (!ui?.battleInfo) return;
    const info = panelMode === 'info';
    ui.battleInfo.classList.toggle('hidden', !info);
    ui.battleLog.classList.toggle('hidden', info);
    ui.logToggle?.parentElement?.classList.toggle('hidden', info);
    if (ui.panelBtn) {
      ui.panelBtn.title = info ? BTx('showLog') : BTx('showInfo');
      ui.panelBtn.setAttribute('aria-label', ui.panelBtn.title);
      ui.panelBtn.classList.toggle('action-btn--armed', info);
      ui.panelBtn.innerHTML = `<span class="action-btn-glyph">${info ? '📜' : 'ℹ'}</span>`;
    }
    if (info) renderBattleInfo();
  }

  function ensureShell() {
    if (ui?.screen) return ui;

    root.innerHTML = `
      <div class="screen screen-battle">
        <div class="battle-arena">
          <div class="battle-half battle-half--player">
            <div class="battle-grid-wrap">
              <div class="battle-grid" id="battle-grid-player"></div>
            </div>
            <!-- Power. Five pips, because the only question being asked is
                 "have I got enough for the spell I want" and a bar of pips
                 answers it without reading a number. The player's own strip is
                 the button that opens the spell list. -->
            <button class="power-strip" id="power-player" data-side="player"></button>
          </div>
          <div class="battle-half battle-half--enemy">
            <div class="battle-grid-wrap">
              <div class="battle-grid" id="battle-grid-enemy"></div>
            </div>
            <div class="power-strip power-strip--enemy" id="power-enemy" data-side="enemy"></div>
          </div>
        </div>
        <div class="init-queue" id="init-queue"></div>
        <div class="action-panel">
          <div class="action-panel-label" id="action-panel-label"></div>
          <!-- Each button is an icon tile with its role caption BELOW the tile,
               outside the button's own border. The captions are fixed words and
               never change, so they are written once here rather than rebuilt
               on every render. -->
          <div class="action-btns">
            <div class="action-slot">
              <button class="action-btn" id="btn-main" data-battle-action="main"></button>
              <span class="action-slot-label">${BTx('btnAction')}</span>
            </div>
            <div class="action-slot">
              <button class="action-btn" id="btn-ability" data-battle-action="ability"></button>
              <span class="action-slot-label">${BTx('btnAbility')}</span>
            </div>
            <div class="action-slot">
              <button class="action-btn" id="btn-defend" data-battle-action="defend"></button>
              <span class="action-slot-label">${BTx('btnDefend')}</span>
            </div>
            <!-- Spells get a slot of their own, next to the other actions.
                 Hanging them off the power strip alone meant the one new system
                 in the fight had no presence where the player looks for things
                 to do — the strip stays tappable, but this is the button. -->
            <div class="action-slot">
              <button class="action-btn action-btn--spell" id="btn-spell" data-battle-action="spell"></button>
              <span class="action-slot-label">${BTx('btnSpell')}</span>
            </div>
            <div class="action-slot">
              <button class="action-btn action-btn--panel" id="btn-panel" data-battle-action="panel"></button>
              <span class="action-slot-label">${BTx('btnInfo')}</span>
            </div>
          </div>
        </div>
        <div class="battle-log-bar">
          <button class="battle-log-toggle" id="battle-log-toggle" aria-expanded="false"></button>
        </div>
        <div class="battle-log" id="battle-log"></div>
        <div class="battle-info hidden" id="battle-info"></div>
      </div>
    `;

    ui = {
      screen: root.querySelector('.screen-battle'),
      initQueue: root.querySelector('#init-queue'),
      powerPlayer: root.querySelector('#power-player'),
      powerEnemy:  root.querySelector('#power-enemy'),
      playerGrid: root.querySelector('#battle-grid-player'),
      enemyGrid: root.querySelector('#battle-grid-enemy'),
      actionPanelLabel: root.querySelector('#action-panel-label'),
      mainBtn: root.querySelector('#btn-main'),
      abilityBtn: root.querySelector('#btn-ability'),
      defendBtn: root.querySelector('#btn-defend'),
      spellBtn:  root.querySelector('#btn-spell'),
      battleLog: root.querySelector('#battle-log'),
      battleInfo: root.querySelector('#battle-info'),
      panelBtn: root.querySelector('#btn-panel'),
      logToggle: root.querySelector('#battle-log-toggle'),
    };

    // Expand/collapse the log. The battle screen is a fixed-height column, so
    // the log otherwise gets whatever is left after the arena — about four
    // lines on a phone, which is not enough to read back a turn.
    const applyLogToggle = () => {
      const expanded = ui.battleLog.classList.contains('battle-log--expanded');
      ui.logToggle.textContent = expanded ? '▼' : '▲';
      ui.logToggle.title = expanded ? BT.collapseLog[BL] : BT.expandLog[BL];
      ui.logToggle.setAttribute('aria-label', ui.logToggle.title);
      ui.logToggle.setAttribute('aria-expanded', String(expanded));
    };
    ui.logToggle?.addEventListener('click', () => {
      ui.battleLog.classList.toggle('battle-log--expanded');
      applyLogToggle();
    });
    applyLogToggle();
    applyPanelMode();

    attachEvents();
    return ui;
  }

  // ── Standing states on a portrait ─────────────────────────────────────────
  // Two columns of ability art, both filled top-down: BUFFS down the right edge,
  // DEBUFFS down the left. The number on an icon is whatever the effect counts —
  // stacks for Rage/Fanaticism/Aegis, rounds left for the timed ones, damage per
  // tick for DoTs, percent for the reductions — and is hidden when it is 1 or
  // when the effect has nothing to count.
  //
  // `val(c)` reads BOTH shapes on purpose: these fields are nested under `buffs`
  // in a battle snapshot and flat on a live combatant (same as aegisLevelFor).
  // The art is /assets/icons/abilities/<ability id, spaces to _, rank stripped>,
  // the same convention abilityIconSrc uses; a missing file hides itself.
  const st = (occ, field) => occ?.[field] ?? occ?.buffs?.[field];
  const num = (occ, field) => Number(st(occ, field) ?? 0) || 0;

  // Hits still to come before this unit's next dodge, or 0 when it has no dodge
  // passive at all (which hides the badge). Mirrors the engine's rule exactly —
  // `_dodge_count % dodge_every === 0` avoids the blow, see executeAction and
  // strikeTarget in utils/battle-engine.js — so the countdown cannot drift from
  // what actually happens. Only PHYSICAL attacks are counted there, which is why
  // this badge can sit still through a whole volley of spell damage.
  function dodgeCountdown(occ) {
    const source = occ?.unit_data?.native_passive ?? occ?.unit_data?.passive;
    const keys   = Array.isArray(source) ? source : (source ? [source] : []);
    const every  = keys
      .map(k => resolveAbility(k)?.params?.dodge_every)
      .find(v => v != null);
    if (!every) return 0;
    return every - (num(occ, '_dodge_count') % every);
  }

  const BUFF_DEFS = [
    { key: 'rage',        icon: 'rage.jpg',             en: 'Rage',            ru: 'Ярость',         n: c => num(c, '_rage_stacks') },
    { key: 'fanaticism',  icon: 'fanaticism.jpg',       en: 'Fanaticism',      ru: 'Фанатизм',       n: c => num(c, '_fanaticism_stacks') },
    { key: 'aegis',       icon: 'aegis.jpg',            en: 'Aegis',           ru: 'Эгида',          n: c => num(c, '_aegis_stacks') },
    // Damage the unit can still absorb before anything reaches its HP.
    { key: 'shield',      icon: 'shield.jpg',            en: 'Shield',          ru: 'Щит',            n: c => num(c, '_shield'),             unit: 'dmg_absorb' },
    { key: 'frost-armor', icon: 'frost_armor.jpg',      en: 'Frost Armor',     ru: 'Ледяной доспех', n: c => num(c, '_frost_armor_rounds'), unit: 'rounds' },
    { key: 'stone-form',  icon: 'stone_form.jpg',       en: 'Stone Form',      ru: 'Каменная форма', n: c => num(c, '_stone_form_rounds'),  unit: 'rounds' },
    { key: 'sanctuary',   icon: 'sanctuary.jpg',        en: 'Sanctuary',       ru: 'Святилище',      n: c => num(c, '_sanctuary_rounds'),   unit: 'rounds' },
    { key: 'regenerate',  icon: 'regenerate.jpg',       en: 'Regeneration',    ru: 'Регенерация',    n: c => num(c, '_hot'),                unit: 'hp' },
    { key: 'blessing',    icon: 'mothers_blessing.jpg', en: "Mother's Blessing", ru: 'Благословение Матери', n: c => (st(c, '_mothers_blessing') ? 1 : 0) },
    { key: 'kiss',        icon: 'communion.jpg',        en: "Mother's Kiss",   ru: 'Поцелуй Матери',  n: c => (st(c, '_mothers_kiss') ? 1 : 0) },
    { key: 'parry',       icon: 'duelist.jpg',          en: 'Parry ready',     ru: 'Парирование готово', n: c => (st(c, '_parry_available') ? 1 : 0) },
    // _dodge_count is a running tally of physical hits TAKEN, not stacks of
    // anything: the engine dodges when it divides evenly by the passive's
    // dodge_every. Printed raw it climbed all battle and never reset, so the
    // badge read "Dodge: 6" — six of what? It now counts down the hits until
    // the next dodge, which is the only number a player can act on.
    { key: 'dodge',       icon: 'dodge.jpg',            en: 'Dodge',           ru: 'Уклонение',      n: c => dodgeCountdown(c), unit: 'hits', alwaysNum: true },
    { key: 'defend',      icon: 'fortify.jpg',          en: 'Defending',       ru: 'В защите',       n: c => num(c, 'defend_armor_bonus'),  unit: 'armor' },
    { key: 'invulnerable',icon: 'undying.jpg',          en: 'Invulnerable',    ru: 'Неуязвим',       n: c => (st(c, '_invulnerable') ? 1 : 0) },
    { key: 'untargetable',icon: 'unity.jpg',            en: 'Cannot be targeted', ru: 'Нельзя выбрать целью', n: c => (st(c, '_untargetable') ? 1 : 0) },
  ];

  const DEBUFF_DEFS = [
    { key: 'burn',    icon: 'burn.jpg',    en: 'Burning',          ru: 'Горение',        n: c => num(c, 'dot_dmg'),             unit: 'dmg' },
    { key: 'bleed',   icon: 'bleed.jpg',   en: 'Bleeding',         ru: 'Кровотечение',   n: c => num(c, '_bleed_dmg'),          unit: 'dmg' },
    { key: 'poison',  icon: 'poison.jpg',  en: 'Poisoned',         ru: 'Отравление',     n: c => num(c, '_poison_dmg'),         unit: 'dmg' },
    { key: 'chill',   icon: 'chill.jpg',   en: 'Chilled',          ru: 'Обморожение',    n: c => num(c, '_chill_dmg'),          unit: 'dmg' },
    { key: 'stun',    icon: 'stun.jpg',    en: 'Stunned',          ru: 'Оглушение',      n: c => num(c, '_stun_rounds'),        unit: 'rounds' },
    { key: 'terror',  icon: 'terror.jpg',  en: 'Terror',           ru: 'Ужас',           n: c => num(c, '_terror_rounds'),      unit: 'rounds' },
    { key: 'fear',    icon: 'fear.jpg',    en: 'Fear',             ru: 'Страх',          n: c => num(c, '_fear_dmg_reduction'), unit: 'pct' },
    { key: 'infect',  icon: 'infect.jpg',  en: 'Healing reduced',  ru: 'Лечение снижено', n: c => num(c, '_healing_reduction'), unit: 'pct' },
    { key: 'taunt',   icon: 'taunt.jpg',   en: 'Taunted',          ru: 'Спровоцирован',  n: c => (st(c, '_taunted_by_id') ? 1 : 0) },
    { key: 'sorrow',  icon: 'sorrow.jpg',  en: 'Sorrow',           ru: 'Скорбь',         n: c => (st(c, '_sorrow_source_ids') || []).length },
    // The pool left, not a percentage: it is how much healing this unit will
    // lose before any reaches its HP.
    { key: 'decay',   icon: 'decay.jpg', en: 'Decay',      ru: 'Тлен',           n: c => num(c, '_decay'),  unit: 'heal' },
  ];

  const UNIT_SUFFIX = {
    rounds: { en: 'rounds left', ru: 'ост. раундов' },
    dmg:    { en: 'per turn',    ru: 'за ход' },
    hp:     { en: 'HP per turn', ru: 'HP за ход' },
    pct:    { en: '%',           ru: '%' },
    armor:  { en: 'armor',       ru: 'брони' },
    hits:   { en: 'hits until the next dodge', ru: 'ударов до уклонения' },
    heal:        { en: 'healing absorbed', ru: 'исцеления поглотит' },
    dmg_absorb:  { en: 'damage absorbed',  ru: 'урона поглотит' },
  };

  // A tile is 110px tall and an icon row is 18px, so six is the most that fits
  // before the column runs off the bottom of the portrait. Show five and roll
  // the rest into a "+N" tile whose tooltip names them, rather than letting the
  // column overflow into the row below.
  const MAX_STATE_ICONS = 5;

  function stateIconsHtml(occ, defs) {
    if (!occ || !occ.alive) return '';
    const L = player?.settings?.language === 'ru' ? 'ru' : 'en';
    const active = defs.map(d => ({ d, n: d.n(occ) })).filter(x => x.n > 0);
    const shown  = active.slice(0, MAX_STATE_ICONS);
    const hidden = active.slice(MAX_STATE_ICONS);

    const more = hidden.length
      ? `<span class="bc-state bc-state--more" title="${hidden.map(x => x.d[L]).join(', ')}">
           <span class="bc-state-more">+${hidden.length}</span>
         </span>`
      : '';

    return shown
      .map(({ d, n }) => {
        const suffix = d.unit ? ` ${UNIT_SUFFIX[d.unit][L]}` : '';
        const title  = d.unit || n > 1 ? `${d[L]}: ${n}${suffix}` : d[L];
        return `
        <span class="bc-state bc-state--${d.key}" title="${title}">
          <img class="bc-state-img" src="${assetUrl(`/assets/icons/abilities/${d.icon}`)}" alt="${d[L]}"
               onerror="this.style.display='none'">
          ${n > 1 || d.alwaysNum ? `<span class="bc-state-num">${n}</span>` : ''}
        </span>`;
      })
      .join('') + more;
  }

  // Spell effects are not in BUFF_DEFS/DEBUFF_DEFS — they are not fixed fields
  // on the combatant but records in `_effects`, one per spell that landed. They
  // carry their own icon and polarity, so they are rendered from the record
  // rather than from a hand-maintained table, and a new spell shows up on the
  // portrait without anything here changing.
  function spellEffectIconsHtml(occ, polarity) {
    const effects = (occ?._effects ?? occ?.buffs?._effects ?? [])
      .filter(e => e?.icon && e.polarity === polarity);
    if (!effects.length) return '';
    // From the ABILITIES set, not the spell art: this tile sits beside the
    // passive-driven statuses and has to read as one of them.
    return effects.slice(0, MAX_STATE_ICONS).map(e => `
      <span class="bc-state bc-state--spell" title="${e.name}${e.rounds ? ` · ${e.rounds}` : ''}">
        <img class="bc-state-img" src="${assetUrl(`/assets/icons/abilities/${e.icon}.jpg`)}"
             alt="${e.name}" onerror="this.style.display='none'">
        ${e.rounds > 1 ? `<span class="bc-state-num">${e.rounds}</span>` : ''}
      </span>`).join('');
  }

  const buffIconsHtml   = occ => stateIconsHtml(occ, BUFF_DEFS)   + spellEffectIconsHtml(occ, 'positive');
  const debuffIconsHtml = occ => stateIconsHtml(occ, DEBUFF_DEFS) + spellEffectIconsHtml(occ, 'negative');

  // A one-shot coloured pulse over a portrait when its DoT ticks. Purely visual;
  // sits above the portrait but below the name/HP so text stays readable.
  function flashCellStatus(cellEl, kind) {
    if (!cellEl) return;
    const flash = document.createElement('div');
    flash.className = `bc-status-flash bc-status-flash--${kind}`;
    const info = cellEl.querySelector('.battle-cell-info');
    if (info) cellEl.insertBefore(flash, info);
    else cellEl.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
    setTimeout(() => flash.remove(), 900); // fallback if animationend never fires
  }

  // 'Bleed'/'Chill'/'DoT' passive ticks carry a dot_kind; anything else is not a DoT.
  function dotTickKind(entry) {
    if (entry.type !== 'passive') return null;
    return entry.dot_kind || null;
  }

  // Aegis is a STACKING state, not a one-off: each hit adds armor (or a resist
  // matching the damage type) for the rest of the round. The proc flash lives in
  // battle-fx.js; this drives the standing ward drawn on the cell, which has to
  // survive re-renders and outlive any single animation.
  // Both shapes are read because buffs are nested in the snapshot but flat on
  // live combatants (same as _mothers_kiss elsewhere in this file).
  function aegisLevelFor(occ) {
    const armor   = occ._aegis_armor   ?? occ.buffs?._aegis_armor   ?? 0;
    const resists = occ._aegis_resists ?? occ.buffs?._aegis_resists ?? {};
    const total   = Number(armor) +
      Object.values(resists).reduce((s, v) => s + (Number(v) || 0), 0);
    // resist_gain is 3-4 per proc, so /3 approximates the stack count. Capped at
    // 4 so a long round cannot bloom the cell into something unreadable.
    return total > 0 ? Math.min(4, Math.max(1, Math.round(total / 3))) : 0;
  }

  function patchCell(cellEl, occ, actor, validTargetKeys) {
    const isActor  = actor?.id === occ.id;
    const isTarget = validTargetKeys.has(occ.id);
    const hpPct    = occ.battle_hp / occ.max_hp;

    // Same stacking ward as in renderSide. It has to be recomputed HERE too:
    // patchCell rewrites className wholesale, so without this a cell that was
    // patched rather than re-rendered would silently lose its Aegis ward mid-round.
    const aegisLevel = aegisLevelFor(occ);

    let cls = `battle-cell ${!occ.alive ? 'battle-cell--dead' : ''} ${aegisLevel ? 'battle-cell--aegis' : ''}`;
    if (isActor)               cls += ' battle-cell--acting anim-actor-pulse';
    else if (isTarget)         cls += ' battle-cell--targetable';
    else if (selectedCombatant?.id === occ.id) cls += ' battle-cell--selected';
    else if (occ.side === 'player') cls += ' battle-cell--placed';
    else                       cls += ' battle-cell--enemy';

    for (const ac of ['anim-hit', 'anim-death', 'battle-cell--bark-active']) {
      if (cellEl.classList.contains(ac)) cls += ` ${ac}`;
    }
    cellEl.className = cls;
    if (aegisLevel) cellEl.style.setProperty('--aegis-level', aegisLevel);
    else            cellEl.style.removeProperty('--aegis-level');

    const sub = cellEl.querySelector('.battle-cell-sub');
    if (sub) {
      sub.innerHTML = occ.alive
        ? `${occ.battle_hp}/${occ.max_hp}${(occ.buffs||[]).find(b=>b.type==='shield') ? ` 🛡${(occ.buffs||[]).find(b=>b.type==='shield').value}` : ''}`
        : '💀';
    }
    const fill = cellEl.querySelector('.bc-hp-fill');
    if (fill) {
      fill.style.width = `${Math.max(0, hpPct * 100)}%`;
      fill.style.background = hpColor(hpPct);
    }
    const debuffEl = cellEl.querySelector('.bc-debuff-icons');
    if (debuffEl) debuffEl.innerHTML = debuffIconsHtml(occ);
    const buffEl = cellEl.querySelector('.bc-buff-icons');
    if (buffEl) buffEl.innerHTML = buffIconsHtml(occ);
  }

  function renderSide(side, actor, validTargetKeys) {
    const cellMap = {};
    const shadow  = new Set();

    // Footprint via the shared helper, which mirrors the engine's. Deriving the
    // covered cells here meant a `row` anchored in column 1 reserved nothing at
    // all — its 2-wide tile then started at the grid's last column and pushed
    // the whole rest of the grid down a row.
    for (const co of state.combatants) {
      if (co.side !== side) continue;
      const cells = cellFootprint(co.cellIndex, co.size ?? 'tile', ROWS, COLS);
      cellMap[cells[0]] = co;
      cells.slice(1).forEach(cell => shadow.add(cell));
    }

    const html = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (shadow.has(idx)) continue;

        const occ = cellMap[idx];
        if (!occ) {
          html.push(`<div class="battle-cell battle-cell--empty"><span class="battle-cell-row-hint">R${r+1}</span></div>`);
          continue;
        }

        const size      = occ.size ?? 'tile';
        const colSpan   = size === 'row'    ? 2 : 1;
        const rowSpan   = size === 'column' ? 2 : 1;
        const spanStyle = (colSpan > 1 || rowSpan > 1)
          ? `grid-column:span ${colSpan};grid-row:span ${rowSpan};`
          : '';

        const isActor    = actor?.id === occ.id;
        const isTarget   = validTargetKeys.has(occ.id);
        const isSelected = selectedCombatant?.id === occ.id;
        const hpPct      = occ.battle_hp / occ.max_hp;
        const portraitUrl = getPortraitUrl(occ, 'grid');

        const aegisLevel = aegisLevelFor(occ);   // see aegisLevelFor above

        let cls = `battle-cell ${!occ.alive ? 'battle-cell--dead' : ''} ${aegisLevel ? 'battle-cell--aegis' : ''}`;
        if (isActor)              cls += ' battle-cell--acting anim-actor-pulse';
        else if (isTarget)        cls += ' battle-cell--targetable';
        else if (isSelected)      cls += ' battle-cell--selected';
        else if (side === 'player') cls += ' battle-cell--placed';
        else                      cls += ' battle-cell--enemy';

        html.push(`
          <div class="${cls}" data-id="${occ.id}" style="${spanStyle}${aegisLevel ? `--aegis-level:${aegisLevel};` : ''}">
            ${portraitUrl ? `<img class="battle-cell-portrait" src="${portraitUrl}" alt="${cName(occ)}" onerror="this.style.display='none'">` : ''}
            <div class="bc-debuff-icons">${debuffIconsHtml(occ)}</div>
            <div class="bc-buff-icons">${buffIconsHtml(occ)}</div>
            <div class="battle-cell-info">
              <span class="battle-cell-name">${cName(occ)}</span>
              ${occ.alive
                ? `<span class="battle-cell-sub">${occ.battle_hp}/${occ.max_hp}${(occ.buffs||[]).find(b=>b.type==='shield') ? ` 🛡${(occ.buffs||[]).find(b=>b.type==='shield').value}` : ''}</span>`
                : `<span class="battle-cell-sub">💀</span>`}
              <div class="bc-hp-bar"><div class="bc-hp-fill" style="width:${Math.max(0, hpPct*100)}%;background:${hpColor(hpPct)}"></div></div>
            </div>
          </div>
        `);
      }
    }
    return html.join('');
  }

  function render() {
    ensureShell();
    const actor = currentActor();
    if (!state) return;

    const isEnemyTurn  = !actor || actor.side === 'enemy';
    const hasAbility   = actor && !!(actor.unit_data?.ability || actor.unit_data?.active_ability);
    // The button used to show the RAW key off the unit ("Shield_Wall"), which is
    // neither translated nor formatted. Resolve the definition and take its
    // localized name, falling back to the de-underscored key if the ability is
    // missing from the table.
    const abilityKey   = actor ? (actor.unit_data?.ability || actor.unit_data?.active_ability || '') : '';
    const abilityLabel = abilityKey
      ? (abilityName(resolveAbility(abilityKey)) || abilityKey.replace(/_/g, ' '))
      : (actor ? BTx('noAbility') : BTx('btnAbility'));
    const actionLabel  = actor ? getActionLabel(actor) : 'Attack';
    const actionIcon   = actor?.unit_data?.action_icon ?? null;
    const isNoneAction = actor && (typeof actor.unit_data?.action === 'object' ? actor.unit_data.action?.action_type === 'none' : false);

    // The basic action is armed the moment it becomes your turn: valid targets
    // are lit straight away and a unit can be attacked in one tap instead of
    // two. Choosing Ability is the only thing that changes it, and Cancel drops
    // back here rather than to a dead "nothing selected" state.
    //
    // Done in render() rather than at each turn transition on purpose — this is
    // the one place every path passes through (turn start, action resolved,
    // reconnect, snapshot refresh), so there is no route that can land on an
    // unarmed player turn.
    if (!isEnemyTurn && !processing && actor && !pendingAction && !isNoneAction) {
      selectingTarget = actor;
      pendingAction   = 'attack';
    }

    const validTargetKeys = new Set();
    if (selectingTarget && pendingAction) {
      getValidTargetIds(selectingTarget, pendingAction === 'ability').forEach(id => validTargetKeys.add(id));
    }

    const actingOrder = state.combatants
      .filter(c => c.alive && !c.acted_this_round)
      .sort((a, b) => b.initiative - a.initiative);

    renderPowerStrips();

    ui.initQueue.innerHTML = actingOrder.map((c, i) => {
      const portrait = getPortraitUrl(c);
      const isActive = i === 0;
      const side     = c.side;
      // Same frame art as the formation track; the unit acting next wears the
      // lit variant (.portrait-card--selected), exactly as a selected card does.
      return `
        <div class="portrait-card portrait-card--init portrait-card--${side}
                    ${isActive ? 'portrait-card--selected' : ''}"
             title="${cName(c)}">
          ${portrait
            ? `<img class="portrait-art-img" src="${portrait}" alt="${cName(c)}" onerror="this.style.display='none'">`
            : `<div class="portrait-art">${side === 'player' ? '⚔' : '💀'}</div>`
          }
          <div class="init-side-strip"></div>
        </div>
      `;
    }).join('');

    // Both attrition phases are keyed off the round, so this is refreshed
    // wherever the board is — turn transitions, reconnects, snapshot updates.
    applyAttritionAura();

    for (const side of ['player', 'enemy']) {
      const gridEl = side === 'player' ? ui.playerGrid : ui.enemyGrid;
      const existingCells = gridEl.querySelectorAll('.battle-cell[data-id]');
      const existingIds = new Set([...existingCells].map(el => el.dataset.id));
      const expectedIds = new Set(state.combatants.filter(c => c.side === side).map(c => c.id));
      const needsRebuild = existingCells.length === 0 ||
        [...expectedIds].some(id => !existingIds.has(id)) ||
        [...existingIds].some(id => !expectedIds.has(id));
      if (needsRebuild) {
        gridEl.innerHTML = renderSide(side, actor, validTargetKeys);
      } else {
        for (const occ of state.combatants.filter(c => c.side === side)) {
          const cellEl = gridEl.querySelector(`.battle-cell[data-id="${occ.id}"]`);
          if (cellEl) patchCell(cellEl, occ, actor, validTargetKeys);
        }
      }
    }

    ui.actionPanelLabel.innerHTML = processing
      ? '<span style="color:var(--muted)">Processing…</span>'
      : isEnemyTurn
        ? '<span style="color:var(--muted)">Enemy is acting…</span>'
        : `<strong>${cName(actor)}</strong>`;

    // While a target is being picked, the button that started it stays lit —
    // otherwise nothing on screen says whether you are aiming an attack or an
    // ability, and the only way to find out is to tap a unit and see.
    const armed = selectingTarget ? pendingAction : null;

    // Only the icon goes INSIDE the button — the role caption is a sibling
    // below the tile (see .action-slot in the shell markup above). The icon says
    // what the action is; the caption says which button it is.
    const btnFace = (iconSrc, altText, iconClass = 'battle-action-icon-img') =>
      iconSrc ? `<img class="${iconClass}" src="${iconSrc}" alt="${altText}" onerror="this.style.display='none'">` : '';

    // No longer disabled while a target is being picked: with the basic action
    // armed by default that would mean it is permanently greyed out. Tapping it
    // now switches back from Ability.
    ui.mainBtn.className = `action-btn ${armed === 'attack' ? 'action-btn--armed' : ''} ${isEnemyTurn || processing || isNoneAction ? 'action-btn--disabled' : ''}`;
    ui.mainBtn.disabled = isEnemyTurn || processing || isNoneAction;
    ui.mainBtn.innerHTML = btnFace(actionIcon ? `${assetUrl(`/assets/icons/actions/${actionIcon}`)}` : null, actionLabel);
    ui.mainBtn.title = actionLabel;   // the actual action name lives here

    ui.abilityBtn.className = `action-btn ${armed === 'ability' ? 'action-btn--armed' : ''} ${(!hasAbility || (actor && actor.used_active) || isEnemyTurn || processing) ? 'action-btn--disabled' : ''}`;
    ui.abilityBtn.disabled = !hasAbility || (actor && actor.used_active) || isEnemyTurn || processing;
    ui.abilityBtn.innerHTML = btnFace(abilityIconSrc(actor), abilityLabel, 'battle-action-ability-icon');
    ui.abilityBtn.title = abilityLabel;

    ui.defendBtn.className = `action-btn ${isEnemyTurn || processing ? 'action-btn--disabled' : ''}`;
    ui.defendBtn.disabled = isEnemyTurn || processing;
    ui.defendBtn.innerHTML = btnFace(assetUrl('/assets/icons/actions/defend.jpg'), BTx('btnDefend'));

    // Spell: only the hero, only on its turn, only with power banked. The count
    // rides on the face so the player can see what they have without looking
    // away to the strip.
    if (ui.spellBtn) {
      const heroNow  = heroOf('player');
      const haveNow  = Number(state?.power?.player ?? 0);
      const canSpell = !!heroNow?.alive && haveNow > 0 && actor?.id === heroNow.id && !isEnemyTurn && !processing;
      ui.spellBtn.className = `action-btn action-btn--spell ${canSpell ? '' : 'action-btn--disabled'}`;
      ui.spellBtn.disabled  = !canSpell;
      ui.spellBtn.innerHTML = btnFace(assetUrl('/assets/icons/actions/spell.jpg'),
                                      `${BTx('btnSpell')} ${haveNow}`);
    }

    // No Cancel button: the only thing it could undo was an armed Ability, and
    // tapping Action already switches back to the basic attack. A player who
    // wants to do nothing has Defend, which beats a wasted turn.

    // A glyph, not an icon tile: there is no art for this action, and an <img>
    // that 404s would leave the button blank. Shows what the panel will switch
    // TO, matching the title set in applyPanelMode.
    // Never disabled — reading what an ability does is useful on the enemy's
    // turn too, and while an action is resolving.
    ui.panelBtn.innerHTML = `<span class="action-btn-glyph">${panelMode === 'info' ? '📜' : 'ℹ'}</span>`;
    ui.panelBtn.classList.toggle('action-btn--armed', panelMode === 'info');

    if (!processing) {
      ui.battleLog.innerHTML = (state.log || []).slice().reverse().map(formatLogEntry).join('');
    }
    // Whoever is acting has changed, so the breakdown has to follow.
    if (panelMode === 'info') renderBattleInfo();

    const battleHost = root.querySelector('.screen-battle') || root;
    if (!fxInitialized) {
      initBattleFx(battleHost);
      fxInitialized = true;
    } else {
      reattachBattleFx(battleHost);
    }

    const tutorialActor = currentActor();
    const tutorialIsEnemyTurn = !tutorialActor || tutorialActor.side === 'enemy';
    const needsPower  = !isTutorialDone(player, 'battle_power');
    const needsAction = !isTutorialDone(player, 'battle_first_action');
    if (!tutorialIsEnemyTurn && !processing && !selectingTarget && (needsPower || needsAction)) {
      const showAction = () => {
        if (!needsAction) return;
        const mainBtn = ui.mainBtn;
        if (mainBtn) showTutorialSpotlight(player, 'battle_first_action', mainBtn);
      };
      // Power comes first: the action step now names the Spell button, and that
      // button means nothing until the player knows what it spends.
      const strip = ui.powerPlayer;
      if (needsPower && strip) {
        showTutorialSpotlight(player, 'battle_power', strip, {
          showContinue: true,
          onAdvance: () => { markTutorialDone(player, 'battle_power'); showAction(); },
        });
      } else {
        showAction();
      }
    } else {
      hideTutorial();
    }
  }


  async function sendAction(action, actor_id, target_id = null) {
    markTutorialDone(player, 'battle_first_action');
    hideTutorial();
    processing = true;
    selectingTarget = null;
    pendingAction   = null;
    render();
    try {
      const result = await api('/battle/action', { chat_id: player.chat_id, battle_id, action, actor_id, target_id });
      if (result.error) throw new Error(result.error);

      const newLogs = dedupeIncoming(result.logs);
      state = { ...(result.state || state), log: [...(state.log || []), ...newLogs] };

      if (ui?.battleLog) {
        const existingCount = (state.log || []).length - newLogs.length;
        ui.battleLog.innerHTML = (state.log || []).slice(0, existingCount).slice().reverse().map(formatLogEntry).join('');
      }

      if (result.done) {
        await playbackSequence(newLogs);
        if (realtimeController) realtimeController.setLastLogId(lastLogId);
        renderResult(result.winner);
        return;
      }

      await playbackSequence(newLogs);
      if (realtimeController) realtimeController.setLastLogId(lastLogId);
      processing = false;
      render();
        } catch (err) {
          console.error('Action failed:', err);
          processing = false;
          const log = ui?.battleLog;
          if (log) {
            const actorUnit = state.combatants.find(c => c.id === actor_id);
            const targetUnit = target_id ? state.combatants.find(c => c.id === target_id) : null;
            const details = [
              `action: ${action}`,
              `actor: ${actorUnit?.unit_name ?? actor_id} (id=${actor_id})`,
              targetUnit ? `target: ${targetUnit?.unit_name ?? target_id} (id=${target_id})` : null,
              actorUnit ? `ability key: ${actorUnit.unit_data?.ability ?? actorUnit.unit_data?.active_ability ?? 'none'}` : null,
              actorUnit ? `action field: ${JSON.stringify(actorUnit.unit_data?.action)}` : null,
            ].filter(Boolean).join(' | ');

            const el = document.createElement('div');
            el.className = 'log-entry log-entry--error';
            el.innerHTML = `<strong>⚠ ${err.message}</strong><br><span style="font-size:0.75em;opacity:0.8">${details}</span>`;
            log.prepend(el);
          }
          render();
        }
  }

  function attachEvents() {
    if (ui?.screen?._battleHandlersAttached) return;

    // The power strip IS the spell button — the resource and the thing it buys
    // are the same control, so there is nothing to hunt for.
    ui.powerPlayer?.addEventListener('click', () => {
      if (ui.powerPlayer.disabled) return;
      openSpellSheet();
    });
    ui.spellBtn?.addEventListener('click', () => {
      if (ui.spellBtn.disabled) return;
      openSpellSheet();
    });

    // The unit sheet lives on document.body, NOT inside ui.screen, so clicks in
    // it never reached the handler below — tapping an ability in a battle unit
    // card did nothing at all. Inspection is delegated from the sheet body
    // itself, which utils.js reuses across opens, so one listener covers every
    // unit card the battle ever shows. Descriptions open in the SUB-sheet, so
    // they layer over the unit card instead of replacing it.
    const sheetBody = getSheetBody();
    if (sheetBody && !sheetBody._battleInspectAttached) {
      sheetBody._battleInspectAttached = true;
      sheetBody.addEventListener('click', e => { handleUnitInspect(e, openSubSheet); });
    }

    ui.screen.addEventListener('click', event => {
      const actionBtn = event.target.closest('[data-battle-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.battleAction;
        // Handled before the turn guard below: reading what an ability does is
        // just as useful on the enemy's turn, or while an action resolves.
        if (action === 'panel') {
          panelMode = panelMode === 'info' ? 'log' : 'info';
          applyPanelMode();
          return;
        }
        const actor = currentActor();
        if (!actor || actor.side === 'enemy' || processing) return;
        closeStatsModal();
        if (action === 'main') {
          const actionType = typeof actor.unit_data?.action === 'object' ? actor.unit_data.action?.action_type : null;
          if (actionType === 'none') return;
          if (actor.buffs?._mothers_kiss) {
            sendAction('attack', actor.id, actor.id);
            return;
          }
          selectingTarget = actor;
          pendingAction   = 'attack';
          render();
          return;
        }
        if (action === 'ability') {
          const abilityKey = actor.unit_data?.ability || actor.unit_data?.active_ability;
          const def        = abilityKey ? UNIT_ABILITIES[abilityKey] : null;
          const ttype      = def?.target ?? 'enemy';
          if (ttype === 'self' || ttype === 'all_allies' || ttype === 'ally_any' || def?.params?.mothers_kiss) {
            sendAction('ability', actor.id, actor.id);
            return;
          }
          selectingTarget = actor;
          pendingAction   = 'ability';
          render();
          return;
        }
        if (action === 'defend') {
          sendAction('defend', actor.id);
          return;
        }
        return;
      }

      const cell = event.target.closest('.battle-cell[data-id]');
      if (!cell) return;
      const id = cell.dataset.id;
      const combatant = state.combatants.find(c => c.id === id);
      if (!combatant) return;

      // A spell being aimed. Its own reach rules, not the unit's: a single_ally
      // spell wants any living ally and a single_enemy one any living enemy —
      // melee reach has nothing to do with it.
      if (castChoice && pendingAction === 'spell') {
        const wantAlly = castChoice.spell.target_scope === 'single_ally';
        const ok = combatant.alive && (wantAlly ? combatant.side === 'player' : combatant.side === 'enemy');
        if (ok) { sendCast(castChoice.spell.id, castChoice.power, combatant.id); return; }
        return;
      }

      if (selectingTarget && pendingAction) {
        const validIds = getValidTargetIds(selectingTarget, pendingAction === 'ability');
        if (validIds.has(combatant.id)) {
          sendAction(pendingAction, selectingTarget.id, combatant.id);
          return;
        }
      }

      openStatsModal(combatant);
      ui.screen.querySelectorAll('.battle-cell--selected').forEach(c => c.classList.remove('battle-cell--selected'));
      cell.classList.add('battle-cell--selected');
    });

    ui.screen._battleHandlersAttached = true;
  }

  async function renderResult(winner) {
    if (battleResolved) return;
    battleResolved = true;
    if (realtimeController) {
      realtimeController.stop();
      realtimeController = null;
    }

    const won         = winner === 'player';
    const survivors   = won ? state.combatants.filter(c => c.side === 'player' && c.alive && c._rosterId) : [];
    const survivorIds = survivors.map(c => c._rosterId).filter(Boolean);

    // The player has now seen a battle through, win or lose. This is what
    // unlocks errands (see errandsUnlocked in errands.js) — sending a unit away
    // for hours only makes sense once you know what having one is worth. Set on
    // defeat too: the lesson landed either way.
    markTutorialDone(player, 'battle_done');

    // Victory shows the player's faction art (/assets/victory_screens/victory_<c|e|g>.jpg);
    // defeat keeps a random loading screen.
    const FACTION_LETTER = { empire: 'e', choir_of_the_cursed: 'c', grail_of_sorrow: 'g' };
    const bgImage = won
      ? `${assetUrl(`/assets/victory_screens/victory_${FACTION_LETTER[player.faction] || 'e'}.jpg`)}`
      : `${assetUrl(`/assets/loading_screens/loading${Math.floor(Math.random() * 8) + 1}.jpg`)}`;

    root.innerHTML = `
      <!-- The only inline style here is the background URL, which is chosen at
           runtime; everything else lives in .screen-battle-result and friends.
           Inline rules silently outrank the stylesheet, so editing the CSS then
           looked like it did nothing. -->
      <div class="screen screen-battle-result" style="--result-bg: url('${bgImage}');">
        <div class="result-content">
          <div class="result-rewards" id="result-rewards">
            <p class="result-pending">${BTx('calculating')}</p>
          </div>
          <button class="ready-btn ready-btn--result" id="back-to-castle" disabled>${BTx('returnCastle')}</button>
        </div>
      </div>
    `;

    // The outcome is a single word at the head of the rewards panel - the old
    // 3rem emoji banner is gone. Every branch below prefixes it, including the
    // failure paths, so the player is always told how the battle ended.
    const outcomeHtml =
      `<div class="result-outcome ${won ? 'result-outcome--win' : 'result-outcome--loss'}">${won ? BTx('victory') : BTx('defeat')}</div>`;

    rewardRequestInFlight = true;
    try {
      const result = await api('/battle/reward', {
        chat_id:      player.chat_id,
        battle_id,
        survivor_ids: survivorIds,
      });
      // /battle/reward writes gold, crystals, trophies, roster XP and — on a win
      // — the region progress that unlocks the next level. All of that lives in
      // /bootstrap, and nothing here told the cache it was stale: the next
      // screen could serve pre-battle resources from the TTL window. Embark now
      // reads its progress from this cache too, so a newly unlocked level would
      // have been missing from the pips as well.
      bootstrapCache.invalidate();
      const rewardsEl = root.querySelector('#result-rewards');
      if (won) {
        // Icon-forward reward chips: real art for gold, crystals and trophies.
        // Trophy icons are /assets/icons/recources/<trophy_id>.png, named after
        // the id in data/embark.js. No onerror fallback by design - a missing
        // file should show as a hole, not quietly paper over itself.
        const chip = (iconHtml, amount, label = '') =>
          `<div class="reward-chip">
             <span class="reward-chip-icon">${iconHtml}</span>
             <span class="reward-chip-amt">+${amount}</span>
             ${label ? `<span class="reward-chip-label">${label}</span>` : ''}
           </div>`;
        const trophyIcon = id => `<img class="reward-chip-img" src="${assetUrl(`/assets/icons/recources/${id}.png`)}" alt="${id.replace(/_/g, ' ')}">`;
        const trophies = Object.entries(result.trophies_gained || {})
          .map(([id, amt]) => chip(trophyIcon(id), amt, id.replace(/_/g, ' '))).join('');
        // One chip per crystal type, each with its own element icon. Falls back
        // to the old summed chip only for a reward payload from before the
        // server started reporting crystals_gained.
        const crystalEntries = Object.entries(result.crystals_gained || {}).filter(([, amt]) => amt > 0);
        const crystals = crystalEntries.length
          ? crystalEntries.map(([type, amt]) =>
              chip(CRYSTAL_ICONS[type] || '💎', amt, type.replace(/^Crystals_/, ''))).join('')
          : (result.crystal > 0 ? chip('💎', result.crystal) : '');
        // Per-unit XP: who actually earned, and how close it now is to its next
        // tier. The old single "+N XP each" chip hid both — the earner list is
        // not obvious (the fallen can still earn through Unending Servitude, and
        // non-participants earn nothing), and a bare number says nothing about
        // progress. Falls back to the flat chip for a pre-xp_awards payload.
        const xpRows = (result.xp_awards || []).map(a => {
          const def      = resolveUnitDef({ unit_data: { unit_id: a.unit_id } });
          const portrait = getPortraitUrl({ unit_data: { unit_id: a.unit_id } });
          const name     = unitName(def) || a.unit_id;
          const required = def?.xp ?? null;
          const cur      = a.current_xp ?? 0;
          // def.xp is the XP needed to upgrade; null means the unit is max tier
          // and has nothing left to fill a bar toward.
          const pct      = required ? Math.min(100, Math.floor((cur / required) * 100)) : 100;
          const ready    = required != null && cur >= required;
          const meta     = required == null ? BTx('maxTier')
                         : ready            ? BTx('readyToUpgrade')
                         : `${cur} / ${required}`;
          return `
            <div class="reward-xp-row${a.alive ? '' : ' reward-xp-row--fallen'}">
              ${portrait ? `<img class="reward-xp-portrait" src="${portrait}" alt="${name}" onerror="this.style.visibility='hidden'">` : '<span class="reward-xp-portrait"></span>'}
              <div class="reward-xp-body">
                <div class="reward-xp-top">
                  <span class="reward-xp-name">${name}</span>
                  <span class="reward-xp-gain">+${a.xp_gained}</span>
                </div>
                <div class="reward-xp-bar"><div class="reward-xp-fill${ready ? ' reward-xp-fill--ready' : ''}" style="width:${pct}%"></div></div>
                <div class="reward-xp-meta${ready ? ' reward-xp-meta--ready' : ''}">${meta}</div>
              </div>
            </div>`;
        }).join('');

        rewardsEl.innerHTML = `
          ${outcomeHtml}
          <div class="reward-grid">
            ${result.gold > 0 ? chip(GOLD_ICON, result.gold) : ''}
            ${crystals}
            ${!xpRows && result.xp_granted > 0 ? chip('⭐', `${result.xp_granted}`, BTx('xpEach')) : ''}
            ${trophies}
          </div>
          ${xpRows ? `
            <div class="reward-xp-block">
              <div class="reward-xp-head">${BTx('xpGained')}</div>
              ${xpRows}
            </div>` : ''}
          ${result.progress_unlocked ? `<div class="reward-unlock">${BT.unlocked[BL](result.next_level)}</div>` : ''}
        `;
      } else {
        rewardsEl.innerHTML = `${outcomeHtml}<p class="result-pending">${BTx('noRewards')}</p>`;
      }
    } catch (err) {
      // Branch on the CODE, not the prose. This used to read
      // `/already claimed|already/i.test(err.message)`, which meant any rewording
      // of the server's message turned a graceful "already claimed" into a red
      // error on the victory screen — silently, with nothing in the logs. The
      // regex is kept only as a fallback for a client running against an older
      // server during a deploy, and can go once that window has passed.
      const isAlreadyClaimed = err.code === 'battle_rewards_claimed'
        || /already claimed/i.test(err.message || '');
      root.querySelector('#result-rewards').innerHTML = outcomeHtml + (isAlreadyClaimed
        ? `<p class="result-pending">${BTx('claimed')}</p>`
        : `<p class="result-error">${BT.saveFailed[BL](err.message)}</p>`);
    } finally {
      rewardRequestInFlight = false;
    }

    const btn = root.querySelector('#back-to-castle');
    btn.disabled = false;
    btn.addEventListener('click', () => { destroyBattleFx(); navigate('castle', { player }); });
  }

  if (state && state.done) {
    renderResult(state.winner);
  } else {
    render();
    // A freshly created battle already contains round 1's opening enemy turns:
    // POST /battle/create runs engine.runAiTurns() before responding, so every
    // enemy faster than the player has acted by the time this screen mounts.
    // render() dumped those entries straight into the log as static text, which
    // is why round 1 was the one round whose enemy attacks never animated.
    // Replay them here instead. Reconnects keep the plain dump — that log is
    // history the player has already watched.
    if (!reconnect && Array.isArray(logs) && logs.length) {
      processing = true;               // blocks input + the realtime handler during playback
      if (ui?.battleLog) ui.battleLog.innerHTML = '';
      playbackSequence(logs)
        .catch(err => console.error('Initial playback failed:', err))
        .finally(() => { processing = false; render(); });
    }
  }

  if (battle_id && player?.chat_id && !state?.done) {
    realtimeController = createBattleRealtimeController({
      battleId: battle_id,
      playerId: player.chat_id,
      onStateChange: async (data) => {
        if (!data?.state || battleResolved) return;
        // Skip if sendAction is already handling this turn's entries directly.
        // The lastLogId guard means onStateChange will only have genuinely new
        // entries that sendAction didn't receive (e.g. from a second DB write).
        if (processing) return;
        const newLogs = dedupeIncoming(Array.isArray(data.logs) ? data.logs : []);
        if (!newLogs.length) {
          // State update only, no new log entries - just reconcile state
          state = { ...data.state, log: state.log || [] };
          render();
          return;
        }
        state = { ...data.state, log: [...(state.log || []), ...newLogs] };

        if (ui?.battleLog) {
          const existingCount = (state.log || []).length - newLogs.length;
          ui.battleLog.innerHTML = (state.log || []).slice(0, existingCount).slice().reverse().map(formatLogEntry).join('');
        }

        if (data.done) {
          await playbackSequence(newLogs);
          renderResult(data.winner);
          return;
        }

        await playbackSequence(newLogs);
        if (newLogs.length && newLogs[newLogs.length - 1].id != null) {
          lastLogId = newLogs[newLogs.length - 1].id;
        }
        processing = false;
        render();
      },
      onError: (err) => {
        console.error('battle realtime error', err);
        processing = false;
        render();
      },
    });
    if (lastLogId != null) realtimeController.setLastLogId(lastLogId);
    realtimeController.start();
  }
}
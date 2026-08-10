import { api, navigate, itemsCache } from '../api.js';
import { UNIT_ABILITIES } from '../../data/unit_abilities.js';
import { resolveAbility, resolveUnitDef, CRYSTAL_ICONS, GOLD_ICON, openSheet, closeSheet, openSubSheet, getSheetBody, handleUnitInspect, buildUnitCard, renderItemSlotIcon, buildItemModalParts, itemFromDefKey, combatantItem } from '../utils.js';
import { initBattleFx, reattachBattleFx, destroyBattleFx, EFFECTS } from '../battle-fx.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { initSfx, playAbilitySound } from '../sfx.js';
import { createBattleRealtimeController } from '../realtime.js';

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
  return `/assets/character_portraits/${prefix}_${portraitId}.png`;
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
  btnCancel:    { en: 'Cancel',             ru: 'Отмена' },
  // Per-unit XP block on the victory screen.
  xpGained:       { en: 'Experience',        ru: 'Опыт' },
  maxTier:        { en: 'Max tier',          ru: 'Макс. ранг' },
  readyToUpgrade: { en: 'Ready to upgrade',  ru: 'Готов к улучшению' },
  // Unit detail panel: the generic action labels shown when a unit has no named
  // ability, plus the two empty/failure states of the panel itself.
  actSacrifice:  { en: 'Sacrifice',     ru: 'Жертва' },
  actHolyShock:  { en: 'Holy Shock',    ru: 'Священный удар' },
  actMothersKiss:{ en: "Mother's Kiss", ru: 'Поцелуй матери' },
  actPassive:    { en: 'Passive',       ru: 'Пассивная' },
  actHeal:       { en: 'Heal',          ru: 'Лечение' },
  actAttack:     { en: 'Attack',        ru: 'Атака' },
  passiveNone:   { en: 'None',          ru: 'Нет' },
  tapForStats:   { en: 'Tap a unit to see stats', ru: 'Нажмите на юнита, чтобы увидеть характеристики' },
  noUnitData:    { en: 'Unit data unavailable',   ru: 'Данные юнита недоступны' },
};

export function renderBattle(root, { player, battle_id, region_id, level, snapshot, reconnect, selectedSpells, logs }) {
  const BL = player?.settings?.language === 'ru' ? 'ru' : 'en';
  const BTx = k => BT[k][BL];
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
    return def && fileKey ? `/assets/icons/abilities/${fileKey}.jpg` : null;
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
  async function playbackSequence(newEntries) {
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

    const liveUnit = {
      ...def,
      hp:         `${c.battle_hp}/${c.max_hp}`,
      armor:      c.armor ?? def.armor ?? 0,
      initiative: c.initiative ?? def.initiative ?? '—',
      resistances: c.unit_data?.resistances ?? def.resistances ?? {},
    };

    const badge = c.side === 'player' ? 'Ally' : 'Enemy';
    const shield = (c.buffs || []).find(b => b.type === 'shield');
    const burn   = (c.debuffs || []).find(b => b.type === 'burn');
    const poison = (c.debuffs || []).find(b => b.type === 'poison');

    const statusChips = [
      !c.alive ? `<span class="stat-diff-chip stat-diff--down">💀 Dead</span>` : '',
      shield ? `<span class="stat-diff-chip stat-diff--up">🛡 Shield ${shield.value}</span>` : '',
      burn   ? `<span class="stat-diff-chip stat-diff--down">🔥 Burn ${burn.value}</span>`   : '',
      poison ? `<span class="stat-diff-chip stat-diff--down">☠️ Poison ${poison.value}</span>` : '',
    ].filter(Boolean).join('');

    const statusHtml = statusChips ? `<div class="unit-stat-diffs">${statusChips}</div>` : '';

    // Drawn for ANY combatant carrying an item. The player's units resolve
    // through the owned-items table; enemies carry an item_id blueprint key from
    // the encounter (see data/embark.js getEncounter), which is why keying only
    // off _rosterId showed nothing on the enemy side.
    const equippedItem = combatantItem(c, equippedItemFor);
    const itemSlotHtml = equippedItem
      ? renderItemSlotIcon(equippedItem, c._rosterId, { interactive: false, player })
      : (c.side === 'player' ? renderItemSlotIcon(null, c._rosterId, { interactive: false, player }) : '');

    return `<div class="battle-unit-detail" data-roster-id="${c._rosterId ?? ''}">${buildUnitCard(liveUnit, { badge, itemSlotHtml })}${statusHtml}</div>`;
  }

  function formatLogEntry(entry) {
    if (entry.type === 'round') return `<div class="log-entry log-entry--round">── Round ${entry.round} ──</div>`;
    if (entry.type === 'intercept') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      return `<div class="log-entry log-entry--passive"><span class="log-actor">${entry.actorName}</span>${actorLoc} <span class="log-passive">intercepted</span> attack on <span class="log-target">${entry.targetName}</span>${targetLoc}</div>`;
    }
    if (entry.type === 'defend' || entry.type === 'ability') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      const target    = entry.targetName ? ` → <span class="log-target">${entry.targetName}</span>${targetLoc}` : '';
      return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span>${actorLoc}${target} ${entry.message}</div>`;
    }
    if (entry.type === 'shield') {
      const actorLoc = entry.actorCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>` : '';
      return `<div class="log-entry log-entry--shield"><span class="log-actor">${entry.targetName}</span>${actorLoc} 🛡 shield absorbed <span class="log-val-shield">${entry.value}</span>${entry.remaining > 0 ? `, ${entry.remaining} passes through` : ', all blocked'}</div>`;
    }
    if (entry.type === 'status') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span>${actorLoc} applied <span class="log-passive">${entry.passive}</span> to <span class="log-target">${entry.targetName}</span>${targetLoc} <span class="log-dot">(${entry.value}/turn)</span></div>`;
    }
    if (entry.type === 'passive') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      // A stat grant (armor / resistance / max HP) is neither a heal nor a hit.
      // `stat` names it; without that flag the entry would fall through to the
      // heal wording, which is how buff auras came to read as "healed for 3".
      if (entry.stat) {
        return `<div class="log-entry log-entry--passive">
          <span class="log-actor">${entry.actorName}</span>${actorLoc}
          <span class="log-passive"> ${entry.passive}</span>
          granted
          <span class="log-target"> ${entry.targetName}</span>${targetLoc}
          <span class="log-val-heal">+${entry.value}</span> ${entry.stat}
        </div>`;
      }
      const isHeal    = entry.heal !== false;
      return `<div class="log-entry log-entry--passive">
        <span class="log-actor">${entry.actorName}</span>${actorLoc}
        <span class="log-passive"> ${entry.passive}</span>
        ${isHeal ? 'healed' : 'hit'}
        <span class="log-target"> ${entry.targetName}</span>${targetLoc} for
        <span class="${isHeal ? 'log-val-heal' : 'log-val'}">${entry.value}</span>
      </div>`;
    }
    if (entry.type === 'action') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      const verb      = entry.heal ? 'healed' : 'hit';
      const valClass  = entry.heal ? 'log-val-heal' : 'log-val';
      const resistedStr = (!entry.heal && entry.rawDmg != null && entry.resisted > 0)
        ? ` <span class="log-resisted">(${entry.rawDmg} power, ${entry.resisted} resisted)</span>` : '';
      const powerStr = (!entry.heal && entry.rawDmg != null && entry.resisted === 0)
        ? ` <span class="log-resisted">(${entry.rawDmg} power)</span>` : '';
      return `<div class="log-entry">
        <span class="log-actor">${entry.actorName}</span>${actorLoc} ${verb}
        <span class="log-target"> ${entry.targetName}</span>${targetLoc} for
        <span class="${valClass}">${entry.value}</span>${resistedStr}${powerStr}
        ${entry.killed ? ' 💀' : ''}
      </div>`;
    }
    if (entry.type === 'skip') return `<div class="log-entry log-entry--skip">${entry.actorName} skipped</div>`;
    if (entry.type === 'bark') {
      if (player?.settings?.barks_enabled === false) return '';
      return `<div class="log-entry log-entry--bark">${entry.actorName}: "${barkText(entry)}"</div>`;
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
        <div class="binfo-unit">${actor.unit_name}</div>
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
          </div>
          <div class="battle-half battle-half--enemy">
            <div class="battle-grid-wrap">
              <div class="battle-grid" id="battle-grid-enemy"></div>
            </div>
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
            <div class="action-slot">
              <button class="action-btn action-btn--cancel" id="btn-cancel" data-battle-action="cancel"></button>
              <span class="action-slot-label">${BTx('btnCancel')}</span>
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
      playerGrid: root.querySelector('#battle-grid-player'),
      enemyGrid: root.querySelector('#battle-grid-enemy'),
      actionPanelLabel: root.querySelector('#action-panel-label'),
      mainBtn: root.querySelector('#btn-main'),
      abilityBtn: root.querySelector('#btn-ability'),
      defendBtn: root.querySelector('#btn-defend'),
      cancelBtn: root.querySelector('#btn-cancel'),
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

  // Status effects surfaced as small icons on top of a unit's portrait. The
  // engine tracks each on the raw combatant (see getSnapshot). Order here is the
  // left-to-right order the icons appear in. Extend this list to add more.
  // Burn (dot_dmg) and Poison (_poison_dmg) are independent slots now, so a unit
  // can show both icons at once.
  const STATUS_DEFS = [
    { key: 'bleed',  icon: '🩸', active: c => (c._bleed_dmg || 0) > 0 },
    { key: 'chill',  icon: '❄️', active: c => (c._chill_dmg || 0) > 0 },
    { key: 'poison', icon: '☠️', active: c => (c._poison_dmg || 0) > 0 },
    { key: 'burn',   icon: '🔥', active: c => (c.dot_dmg || 0) > 0 },
  ];

  function statusIconsHtml(occ) {
    if (!occ || !occ.alive) return '';
    return STATUS_DEFS
      .filter(s => s.active(occ))
      .map(s => `<span class="bc-status-icon bc-status-icon--${s.key}">${s.icon}</span>`)
      .join('');
  }

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
    const statusEl = cellEl.querySelector('.bc-status-icons');
    if (statusEl) statusEl.innerHTML = statusIconsHtml(occ);
  }

  function renderSide(side, actor, validTargetKeys) {
    const cellMap = {};
    const shadow  = new Set();

    for (const co of state.combatants) {
      if (co.side !== side) continue;
      const anchor = co.cellIndex;
      const size   = co.size ?? 'tile';
      const r      = Math.floor(anchor / COLS);
      const c      = anchor % COLS;
      cellMap[anchor] = co;
      if (size === 'row'    && c === 0)        shadow.add(anchor + 1);
      if (size === 'column' && r <= ROWS - 2)  shadow.add(anchor + COLS);
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
            ${portraitUrl ? `<img class="battle-cell-portrait" src="${portraitUrl}" alt="${occ.unit_name}" onerror="this.style.display='none'">` : ''}
            <div class="bc-status-icons">${statusIconsHtml(occ)}</div>
            <div class="battle-cell-info">
              <span class="battle-cell-name">${occ.unit_name}</span>
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
    const abilityName  = actor ? (actor.unit_data?.ability || actor.unit_data?.active_ability || 'No Ability') : 'Ability';
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

    ui.initQueue.innerHTML = actingOrder.map((c, i) => {
      const portrait = getPortraitUrl(c);
      const isActive = i === 0;
      const side     = c.side;
      // Same frame art as the formation track; the unit acting next wears the
      // lit variant (.portrait-card--selected), exactly as a selected card does.
      return `
        <div class="portrait-card portrait-card--init portrait-card--${side}
                    ${isActive ? 'portrait-card--selected' : ''}"
             title="${c.unit_name}">
          ${portrait
            ? `<img class="portrait-art-img" src="${portrait}" alt="${c.unit_name}" onerror="this.style.display='none'">`
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
        : `<strong>${actor.unit_name}</strong>`;

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
    ui.mainBtn.innerHTML = btnFace(actionIcon ? `/assets/icons/actions/${actionIcon}` : null, actionLabel);
    ui.mainBtn.title = actionLabel;   // the actual action name lives here

    ui.abilityBtn.className = `action-btn ${armed === 'ability' ? 'action-btn--armed' : ''} ${(!hasAbility || (actor && actor.used_active) || isEnemyTurn || processing) ? 'action-btn--disabled' : ''}`;
    ui.abilityBtn.disabled = !hasAbility || (actor && actor.used_active) || isEnemyTurn || processing;
    ui.abilityBtn.innerHTML = btnFace(abilityIconSrc(actor), abilityName, 'battle-action-ability-icon');
    ui.abilityBtn.title = abilityName;

    ui.defendBtn.className = `action-btn ${isEnemyTurn || processing ? 'action-btn--disabled' : ''}`;
    ui.defendBtn.disabled = isEnemyTurn || processing;
    ui.defendBtn.innerHTML = btnFace('/assets/icons/actions/defend.jpg', BTx('btnDefend'));

    // Only meaningful once something OTHER than the default is selected —
    // cancelling the default would just re-arm it, so there is nothing to undo.
    const canCancel = armed === 'ability' && !isEnemyTurn && !processing;
    ui.cancelBtn.className = `action-btn action-btn--cancel ${!canCancel ? 'action-btn--disabled' : ''}`;
    ui.cancelBtn.disabled = !canCancel;
    ui.cancelBtn.innerHTML = btnFace('/assets/icons/actions/cancel.jpg', BTx('btnCancel'));

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
    if (!tutorialIsEnemyTurn && !processing && !selectingTarget && !isTutorialDone(player, 'battle_first_action')) {
      const mainBtn = ui.mainBtn;
      if (mainBtn) showTutorialSpotlight(player, 'battle_first_action', mainBtn);
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

      const newLogs = result.logs || [];
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
        if (action === 'cancel') {
          selectingTarget = null;
          pendingAction   = null;
          render();
        }
        return;
      }

      const cell = event.target.closest('.battle-cell[data-id]');
      if (!cell) return;
      const id = cell.dataset.id;
      const combatant = state.combatants.find(c => c.id === id);
      if (!combatant) return;

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
      ? `/assets/victory_screens/victory_${FACTION_LETTER[player.faction] || 'e'}.jpg`
      : `/assets/loading_screens/loading${Math.floor(Math.random() * 8) + 1}.jpg`;

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
        const trophyIcon = id => `<img class="reward-chip-img" src="/assets/icons/recources/${id}.png" alt="${id.replace(/_/g, ' ')}">`;
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
          const name     = def?.name || a.unit_id;
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
        const newLogs = Array.isArray(data.logs) && data.logs.length ? data.logs : [];
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
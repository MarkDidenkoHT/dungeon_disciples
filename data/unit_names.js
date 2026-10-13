const UNIT_NAME_POOLS = {
  empire: {
    male: {
      givenNames: [
        { id: 'aurelius', en: 'Aurelius', ru: 'Аурилей' },
        { id: 'valerius', en: 'Valerius', ru: 'Валерий' },
        { id: 'lucius', en: 'Lucius', ru: 'Люций' },
        { id: 'hadrian', en: 'Hadrian', ru: 'Адриан' },
        { id: 'cassian', en: 'Cassian', ru: 'Кассиан' },
      ],
      bynames: [
        { id: 'sunborne', en: 'Sunborne', ru: 'Солнцерождённый' },
        { id: 'lightbringer', en: 'Lightbringer', ru: 'Светоносный' },
        { id: 'ironheart', en: 'Ironheart', ru: 'Железносердный' },
        { id: 'dawnshield', en: 'Dawnshield', ru: 'Рассветный Щит' },
        { id: 'oathkeeper', en: 'Oathkeeper', ru: 'Хранитель Клятвы' },
      ],
    },
    female: {
      givenNames: [
        { id: 'aurelia', en: 'Aurelia', ru: 'Аурелия' },
        { id: 'valeria', en: 'Valeria', ru: 'Валерия' },
        { id: 'justina', en: 'Justina', ru: 'Юстина' },
        { id: 'octavia', en: 'Octavia', ru: 'Октавия' },
        { id: 'elisia', en: 'Elisia', ru: 'Элизия' },
      ],
      bynames: [
        { id: 'sunborne', en: 'Sunborne', ru: 'Солнцерождённая' },
        { id: 'lightbringer', en: 'Lightbringer', ru: 'Светоносная' },
        { id: 'ironheart', en: 'Ironheart', ru: 'Железносердная' },
        { id: 'dawnshield', en: 'Dawnshield', ru: 'Рассветный Щит' },
        { id: 'oathkeeper', en: 'Oathkeeper', ru: 'Хранительница Клятвы' },
      ],
    },
  },
  grail_of_sorrow: {
    male: {
      givenNames: [
        { id: 'corvin', en: 'Corvin', ru: 'Корвин' },
        { id: 'vesper', en: 'Vesper', ru: 'Веспер' },
        { id: 'malakor', en: 'Malakor', ru: 'Малакор' },
        { id: 'iskar', en: 'Iskar', ru: 'Искар' },
        { id: 'odran', en: 'Odran', ru: 'Одран' },
      ],
      bynames: [
        { id: 'soulreaper', en: 'Soulreaper', ru: 'Жнец Душ' },
        { id: 'bloodthirst', en: 'Bloodthirst', ru: 'Кровожадный' },
        { id: 'ashbringer', en: 'Ashbringer', ru: 'Пеплоносец' },
        { id: 'gravewarden', en: 'Gravewarden', ru: 'Страж Могилы' },
        { id: 'shadowstalker', en: 'Shadowstalker', ru: 'Теневой Охотник' },
      ],
    },
    female: {
      givenNames: [
        { id: 'isolde', en: 'Isolde', ru: 'Изольда' },
        { id: 'vespera', en: 'Vespera', ru: 'Веспера' },
        { id: 'nereza', en: 'Nereza', ru: 'Нереза' },
        { id: 'caldra', en: 'Caldra', ru: 'Калдра' },
        { id: 'morwen', en: 'Morwen', ru: 'Морвен' },
      ],
      bynames: [
        { id: 'soulreaper', en: 'Soulreaper', ru: 'Жница Душ' },
        { id: 'bloodthirst', en: 'Bloodthirst', ru: 'Кровожадная' },
        { id: 'ashbringer', en: 'Ashbringer', ru: 'Пеплоносица' },
        { id: 'gravewarden', en: 'Gravewarden', ru: 'Стражница Могилы' },
        { id: 'shadowstalker', en: 'Shadowstalker', ru: 'Теневая Охотница' },
      ],
    },
  },
  choir_of_the_cursed: {
    male: {
      givenNames: [
        { id: 'vael', en: 'Vael', ru: 'Ваэль' },
        { id: 'nerion', en: 'Nerion', ru: 'Нерион' },
        { id: 'sythran', en: 'Sythran', ru: 'Ситран' },
        { id: 'thamiel', en: 'Thamiel', ru: 'Тамиэль' },
        { id: 'xavren', en: 'Xavren', ru: 'Заврен' },
      ],
      bynames: [
        { id: 'blackcantor', en: 'Blackcantor', ru: 'Чёрный Певчий' },
        { id: 'hollowvoice', en: 'Hollowvoice', ru: 'Пустоголосый' },
        { id: 'razorchant', en: 'Razorchant', ru: 'Певец Клинков' },
        { id: 'soul_eater', en: 'Soul-Eater', ru: 'Пожиратель Душ' },
        { id: 'voice_of_the_abyss', en: 'Voice of the Abyss', ru: 'Глас Бездны' },
      ],
    },
    female: {
      givenNames: [
        { id: 'vaelira', en: 'Vaelira', ru: 'Ваэлира' },
        { id: 'seraphine', en: 'Seraphine', ru: 'Серафина' },
        { id: 'nythra', en: 'Nythra', ru: 'Нитра' },
        { id: 'khariel', en: 'Khariel', ru: 'Кариэль' },
        { id: 'orissa', en: 'Orissa', ru: 'Орисса' },
      ],
      bynames: [
        { id: 'blackcantor', en: 'Blackcantor', ru: 'Чёрная Певчая' },
        { id: 'hollowvoice', en: 'Hollowvoice', ru: 'Пустоголосая' },
        { id: 'razorchant', en: 'Razorchant', ru: 'Певица Клинков' },
        { id: 'soul_eater', en: 'Soul-Eater', ru: 'Пожирательница Душ' },
        { id: 'voice_of_the_abyss', en: 'Voice of the Abyss', ru: 'Глас Бездны' },
      ],
    },
  },
};

const FACTION_BY_UNIT_CODE = {
  e: 'empire',
  g: 'grail_of_sorrow',
  d: 'choir_of_the_cursed',
};

function factionNamePool(faction, sex) {
  const factionKey = UNIT_NAME_POOLS[faction] ? faction : FACTION_BY_UNIT_CODE[faction];
  const pool = UNIT_NAME_POOLS[factionKey]?.[sex];
  if (!pool) throw new Error(`No unit name pool for faction "${faction}" and sex "${sex}"`);
  return pool;
}

function characterNameKey(identity) {
  return `${identity.given_name_id}:${identity.byname_id}`;
}

function generateUniqueUnitIdentity(faction, sex, usedNames = new Set()) {
  const pool = factionNamePool(faction, sex);
  const candidates = pool.givenNames.flatMap(givenName =>
    pool.bynames.map(byname => ({
      given_name_id: givenName.id,
      byname_id: byname.id,
    })),
  );
  const start = Math.floor(Math.random() * candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[(start + i) % candidates.length];
    if (!usedNames.has(characterNameKey(candidate))) {
      usedNames.add(characterNameKey(candidate));
      return candidate;
    }
  }
  const factionKey = UNIT_NAME_POOLS[faction] ? faction : FACTION_BY_UNIT_CODE[faction];
  throw new Error(`No unused character names remain for faction "${factionKey}" and sex "${sex}"`);
}

function resolveUnitIdentity(faction, sex, identity, language = 'en') {
  if (!identity?.given_name_id || !identity?.byname_id) return '';
  const pool = factionNamePool(faction, sex);
  const givenName = pool.givenNames.find(entry => entry.id === identity.given_name_id);
  const byname = pool.bynames.find(entry => entry.id === identity.byname_id);
  if (!givenName || !byname) return '';
  return `${language === 'ru' ? givenName.ru : givenName.en} ${language === 'ru' ? byname.ru : byname.en}`;
}

function identityFromLegacyNames(faction, sex, identity) {
  const pool = factionNamePool(faction, sex);
  const givenName = pool.givenNames.find(entry => entry.en === identity?.given_name
    || entry.ru === identity?.given_name_ru);
  const byname = pool.bynames.find(entry => entry.en === identity?.byname
    || entry.ru === identity?.byname_ru);
  return givenName && byname
    ? { given_name_id: givenName.id, byname_id: byname.id }
    : null;
}

const exported = {
  UNIT_NAME_POOLS,
  characterNameKey,
  generateUniqueUnitIdentity,
  resolveUnitIdentity,
  identityFromLegacyNames,
};

if (typeof module !== 'undefined') module.exports = exported;
export { UNIT_NAME_POOLS, characterNameKey, generateUniqueUnitIdentity, resolveUnitIdentity, identityFromLegacyNames };

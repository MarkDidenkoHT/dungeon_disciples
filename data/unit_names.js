const UNIT_NAME_POOLS = {
  empire: {
    male: {
      givenNames: [
        { en: 'Aurelius', ru: 'Аурилей' },
        { en: 'Valerius', ru: 'Валерий' },
        { en: 'Lucius', ru: 'Люций' },
        { en: 'Hadrian', ru: 'Адриан' },
        { en: 'Cassian', ru: 'Кассиан' },
      ],
      bynames: [
        { en: 'Sunborne', ru: 'Солнцерождённый' },
        { en: 'Lightbringer', ru: 'Светоносный' },
        { en: 'Ironheart', ru: 'Железносердный' },
        { en: 'Dawnshield', ru: 'Рассветный Щит' },
        { en: 'Oathkeeper', ru: 'Хранитель Клятвы' },
      ],
    },
    female: {
      givenNames: [
        { en: 'Aurelia', ru: 'Аурелия' },
        { en: 'Valeria', ru: 'Валерия' },
        { en: 'Justina', ru: 'Юстина' },
        { en: 'Octavia', ru: 'Октавия' },
        { en: 'Elisia', ru: 'Элизия' },
      ],
      bynames: [
        { en: 'Sunborne', ru: 'Солнцерождённая' },
        { en: 'Lightbringer', ru: 'Светоносная' },
        { en: 'Ironheart', ru: 'Железносердная' },
        { en: 'Dawnshield', ru: 'Рассветный Щит' },
        { en: 'Oathkeeper', ru: 'Хранительница Клятвы' },
      ],
    },
  },
  grail_of_sorrow: {
    male: {
      givenNames: [
        { en: 'Corvin', ru: 'Корвин' },
        { en: 'Vesper', ru: 'Веспер' },
        { en: 'Malakor', ru: 'Малакор' },
        { en: 'Iskar', ru: 'Искар' },
        { en: 'Odran', ru: 'Одран' },
      ],
      bynames: [
        { en: 'Soulreaper', ru: 'Жнец Душ' },
        { en: 'Bloodthirst', ru: 'Кровожадный' },
        { en: 'Ashbringer', ru: 'Пеплоносец' },
        { en: 'Gravewarden', ru: 'Страж Могилы' },
        { en: 'Shadowstalker', ru: 'Теневой Охотник' },
      ],
    },
    female: {
      givenNames: [
        { en: 'Isolde', ru: 'Изольда' },
        { en: 'Vespera', ru: 'Веспера' },
        { en: 'Nereza', ru: 'Нереза' },
        { en: 'Caldra', ru: 'Калдра' },
        { en: 'Morwen', ru: 'Морвен' },
      ],
      bynames: [
        { en: 'Soulreaper', ru: 'Жница Душ' },
        { en: 'Bloodthirst', ru: 'Кровожадная' },
        { en: 'Ashbringer', ru: 'Пеплоносица' },
        { en: 'Gravewarden', ru: 'Стражница Могилы' },
        { en: 'Shadowstalker', ru: 'Теневая Охотница' },
      ],
    },
  },
  choir_of_the_cursed: {
    male: {
      givenNames: [
        { en: 'Vael', ru: 'Ваэль' },
        { en: 'Nerion', ru: 'Нерион' },
        { en: 'Sythran', ru: 'Ситран' },
        { en: 'Thamiel', ru: 'Тамиэль' },
        { en: 'Xavren', ru: 'Заврен' },
      ],
      bynames: [
        { en: 'Blackcantor', ru: 'Чёрный Певчий' },
        { en: 'Hollowvoice', ru: 'Пустоголосый' },
        { en: 'Razorchant', ru: 'Певец Клинков' },
        { en: 'Soul-Eater', ru: 'Пожиратель Душ' },
        { en: 'Voice of the Abyss', ru: 'Глас Бездны' },
      ],
    },
    female: {
      givenNames: [
        { en: 'Vaelira', ru: 'Ваэлира' },
        { en: 'Seraphine', ru: 'Серафина' },
        { en: 'Nythra', ru: 'Нитра' },
        { en: 'Khariel', ru: 'Кариэль' },
        { en: 'Orissa', ru: 'Орисса' },
      ],
      bynames: [
        { en: 'Blackcantor', ru: 'Чёрная Певчая' },
        { en: 'Hollowvoice', ru: 'Пустоголосая' },
        { en: 'Razorchant', ru: 'Певица Клинков' },
        { en: 'Soul-Eater', ru: 'Пожирательница Душ' },
        { en: 'Voice of the Abyss', ru: 'Глас Бездны' },
      ],
    },
  },
};

const FACTION_BY_UNIT_CODE = {
  e: 'empire',
  g: 'grail_of_sorrow',
  d: 'choir_of_the_cursed',
};

function characterNameKey(identity) {
  return `${identity.given_name.toLowerCase()} ${identity.byname.toLowerCase()}`;
}

function generateUniqueUnitIdentity(faction, sex, usedNames = new Set()) {
  const factionKey = UNIT_NAME_POOLS[faction] ? faction : FACTION_BY_UNIT_CODE[faction];
  const pool = UNIT_NAME_POOLS[factionKey]?.[sex];
  if (!pool) throw new Error(`No unit name pool for faction "${faction}" and sex "${sex}"`);

  const candidates = pool.givenNames.flatMap(givenName =>
    pool.bynames.map(byname => ({
      given_name: givenName.en,
      given_name_ru: givenName.ru,
      byname: byname.en,
      byname_ru: byname.ru,
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
  throw new Error(`No unused character names remain for faction "${factionKey}" and sex "${sex}"`);
}

module.exports = { UNIT_NAME_POOLS, characterNameKey, generateUniqueUnitIdentity };

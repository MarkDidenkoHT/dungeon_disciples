// Per-region combat doctrines for enemy units. Keyed by unit id; grouped by
// embark region so a region can be tuned as one encounter set.
const AI_PROFILES = {
  glittering_abyss: {
    mv_e2:   'frost_spreader',
    mv_e21:  'frost_spreader',
    mv_e211: 'frost_spreader',
  },
  chamber_of_unrest: {
    dm_2:   'ward_keeper',
    dm_21:  'ward_keeper',
    dm_211: 'ward_keeper',
  },
};

const DOCTRINE_BY_UNIT = {};
for (const region of Object.values(AI_PROFILES)) {
  for (const [unitId, doctrine] of Object.entries(region)) DOCTRINE_BY_UNIT[unitId] = doctrine;
}

function aiDoctrineFor(unit) {
  const id = unit?.unit_data?.unit_id ?? unit?.unit_data?.id ?? null;
  return id ? (DOCTRINE_BY_UNIT[id] ?? null) : null;
}

module.exports = { AI_PROFILES, aiDoctrineFor };
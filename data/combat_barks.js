// Cosmetic combat barks - zero mechanical effect, purely flavor text shown as a
// toast next to the unit that speaks. Nothing here is ever read by game logic.
//
// A bark is a RULE: a trigger, an optional actor filter, an optional target
// filter, and the lines to pick from. The engine collects every rule that
// matches, keeps only the most specific ones, and picks one line at random.
// See BattleEngine.checkBark() in utils/battle-engine.js.
//
// Filters:
//   name: 'Paladin'        matches unit_name exactly (all tiers share a name)
//   tag:  'Demon'          matches if the unit carries that tag
//   tags: ['Holy','Court'] matches if the unit carries ALL of them
//   not:  'Undead' | []    excludes units carrying any of these tags
//   omit the filter entirely to match anything
//
// Specificity (higher wins, ties are pooled together):
//   +100 name, +2 per tag, +0 per `not` (a gate only), on each of actor and
//   target. A named rule therefore always beats any tag rule.
// So a Paladin-vs-Demon rule beats a Knight-vs-Demon rule, which beats a
// generic Holy-vs-Demon rule. This lets you write broad tag coverage once and
// override it for characterful units without touching the broad rules.
//
// Triggers:
//   attack       actor lands a damaging hit that does NOT kill
//   kill         actor's hit kills the target
//   death        the dying unit's own last words (target filter = the killer)
//   heal_low_hp  actor heals an ally who was below `threshold_pct` HP
//
// Speak chance decays per unit, per trigger, per battle - see BARK_CHANCES.
// Attack barks are the noisiest trigger, so they are tuned lower.

const BARK_CHANCES = {
  attack:      [0.30, 0.12], // 1st bark 30%, 2nd 12%, then silent for the battle
  kill:        [0.55, 0.30],
  death:       [0.60, 0.00], // you only die once, but revives exist
  heal_low_hp: [0.50, 0.25],
};

// Only considered for the heal_low_hp trigger: the ally must have been below
// this % of max HP *before* the heal landed.
const HEAL_BARK_THRESHOLD_PCT = 25;

const COMBAT_BARKS = [
  // ---------------------------------------------------------------------------
  // VAMPIRES - blood is the lens they see everything through. Demon blood burns,
  // undead blood is worthless, holy blood is a delicacy and a dare.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Demon' },
    lines: [
      'Your blood burns going down!',
      'Ash and cinders — is that all you are?',
      'You bleed embers. How disappointing.',
      'Even your veins run hot with spite.',
      'Foul vintage. I will drink it anyway.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Knight' },
    lines: [
      'All that iron, and still so much throat.',
      'Your vows taste of milk, little knight.',
      'Take off the helm. I want to see your face empty.',
      'Chivalry bleeds the same as cowardice.',
      'Such a polished shell. Let us see the meat.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Holy' },
    lines: [
      'Sanctified blood — my favourite vintage.',
      'Pray louder. I want to hear your pulse quicken.',
      'Your god is not watching. I checked.',
      'Consecrated, and still warm. Exquisite.',
      'Light cannot fill a body once it is empty.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Zombie' },
    lines: [
      'Curdled. Spoiled. Utterly beneath me.',
      'There is nothing in you worth the drinking.',
      'You are a corpse that forgot to lie down.',
      'Not even hunger would stoop to you.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Vampire' }, target: { tag: 'Construct' },
    lines: [
      'No blood. No sport. Just work.',
      'Whoever built you denied me my supper.',
      'A body with nothing to give. How rude.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire' }, target: { tag: 'Holy' },
    lines: [
      'Your light is mine now. Every drop.',
      'Sanctity drains as easily as sin.',
      'Sleep. Your god will not miss one more.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire' }, target: { tag: 'Demon' },
    lines: [
      'Back to the ash you crawled from.',
      'Burnt on the tongue — but swallowed all the same.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Vampire' },
    lines: [
      'Still warm. Just how I like it.',
      'You were never anything but a cup.',
      'Thank you. Truly.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Vampire' },
    lines: [
      'I have died before. It never takes.',
      'The night… remembers…',
      'You have merely… postponed… my thirst…',
    ],
  },

  // ---------------------------------------------------------------------------
  // DEMONS - contempt for the divine, delight in ruin, grudging respect for iron.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Holy' },
    lines: [
      'Scream for your god! I want him to hear!',
      'Your prayers are kindling. Nothing more.',
      'Every hymn ends in a wet sound.',
      'Heaven is not listening. I am.',
      'Burn, and call it a blessing.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Knight' },
    lines: [
      'Your oath will not hold the pieces together.',
      'Honour is such a heavy thing to carry. Let me help.',
      'Tin man. Tin heart. Tin end.',
      'I have broken better vows on worse days.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Vampire' },
    lines: [
      'Bloodsucker. You are a parasite on a corpse.',
      'You stole your immortality. I was born to mine.',
      'All that hunger, and nothing to show for it.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Caster' },
    lines: [
      'Borrowed power. Watch me take it back.',
      'You read about fire. I *am* fire.',
      'Put the book down and burn properly.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Demon' }, target: { tag: 'Construct' },
    lines: [
      'Someone made you. That is your first mistake.',
      'Let us see how the seams hold.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Demon' }, target: { tag: 'Holy' },
    lines: [
      'And the light goes out. As it always does.',
      'Tell your god who sent you.',
      'One less voice in the choir.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Demon' },
    lines: [
      'Ash. Ash and quiet.',
      'The abyss thanks you for your donation.',
      'Was that all?',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Demon' },
    lines: [
      'I go back… and I will come again…',
      'The abyss… is patient…',
      'You have killed nothing. You have only sent me home.',
    ],
  },

  // ---------------------------------------------------------------------------
  // HOLY - righteous, and increasingly less patient the worse the target is.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Demon' },
    lines: [
      'Back to the pit, abomination!',
      'The light does not negotiate!',
      'You have no place beneath this sky!',
      'Every wound I give is a prayer answered.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Vampire' },
    lines: [
      'Your hunger ends here, leech!',
      'A stolen life is no life at all!',
      'How many nights until you are done? Answer me!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Undead' },
    lines: [
      'Rest! You have earned it and forgotten it!',
      'This is a mercy, though you cannot know it.',
      'Death was your gift. Stop refusing it!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Zombie' },
    lines: [
      'Someone loved you once. I am sorry for this.',
      'Be still. Please, just be still.',
      'This body is not yours to walk in!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Holy' }, target: { tag: 'Spirit' },
    lines: [
      'Let go! There is nothing left to hold!',
      'Your grief does not excuse this.',
      'The way onward is open. Take it!',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Holy' }, target: { tag: 'Demon' },
    lines: [
      'Feel the might of the righteous!',
      'Back to the abyss with you!',
      'The light purges all!',
      'No mercy for the wicked!',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Holy' }, target: { tag: 'Undead' },
    lines: [
      'Rest now. Truly, this time.',
      'Go where you were always meant to go.',
      'It is finished. Be at peace.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Holy' },
    lines: [
      'Into the light… at last…',
      'I regret… nothing…',
      'Hold the line… without me…',
    ],
  },

  // ---------------------------------------------------------------------------
  // KNIGHTS - discipline and the line. Living knights only; the dead ones below.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Knight', not: ['Undead', 'Zombie', 'Demon', 'Vampire'] },
    lines: [
      'Hold the line!',
      'For the crown!',
      'Steel answers steel!',
      'Give ground and you give everything!',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Knight', not: ['Undead', 'Zombie', 'Demon', 'Vampire'] }, target: { tag: 'Demon' },
    lines: [
      'I have read your name in the old books. It dies today.',
      'You will not pass this shield!',
      'Come on then, hellspawn!',
    ],
  },
  {
    trigger: 'attack', actor: { tags: ['Knight', 'Zombie'] },
    lines: [
      'The… oath… holds…',
      'Still… standing… post…',
      'Orders… were… never… rescinded…',
    ],
  },
  {
    trigger: 'attack', actor: { tags: ['Knight', 'Undead'] },
    lines: [
      'Death did not release me from duty.',
      'I kept my oath. I keep it still.',
      'The grave was a poor barracks.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Knight', not: ['Undead', 'Zombie'] },
    lines: [
      'The line… holds…',
      'Tell them I did not… step back…',
      'Someone… take up the shield…',
    ],
  },

  // ---------------------------------------------------------------------------
  // UNDEAD / ZOMBIES - hollow, patient, faintly sad.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Zombie' }, target: { tag: 'Holy' },
    lines: [
      'Your… light… is… loud…',
      'Stop… singing…',
      'It… hurts… to… look… at… you…',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Zombie' },
    lines: [
      'Warm…',
      'Hungry… always… hungry…',
      'Down… come… down…',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Undead', not: ['Knight', 'Vampire', 'Zombie'] },
    lines: [
      'I remember hands. I remember using them for this.',
      'You will be quiet soon. Everyone is.',
      'The grave is patient. I am not.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Undead' },
    lines: [
      'Welcome. It is crowded, but you will fit.',
      'Now you understand.',
      'One more for the long dark.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Zombie' },
    lines: [
      'Oh… good…',
      'Rest…?',
      'Thank… you…',
    ],
  },

  // ---------------------------------------------------------------------------
  // SPIRITS - grief given a shape.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Spirit' },
    lines: [
      'You are so heavy. So very heavy.',
      'I only want you to be as cold as I am.',
      'Do you hear it too? The weeping?',
      'Stay. Everyone leaves. Stay.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Spirit' }, target: { tag: 'Holy' },
    lines: [
      'You promised me rest. You promised!',
      'I prayed. I prayed and this is what I got.',
      'Where were you? WHERE WERE YOU?',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Spirit' },
    lines: [
      'Finally…',
      'Is it… quiet… where you go…?',
      'I forget… my name… again…',
    ],
  },

  // ---------------------------------------------------------------------------
  // ENGINEERS - shop-floor pragmatism in the middle of a massacre.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Engineer' },
    lines: [
      'Tolerances are within spec!',
      'Hold still, this is calibrated!',
      'Field test! Taking notes!',
      'That is going in the report.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Engineer' }, target: { tag: 'Construct' },
    lines: [
      'Bad welds. Whoever built you was in a hurry.',
      'I can see the seams from here!',
      'Amateur work. Let me show you.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Engineer' }, target: { tag: 'Demon' },
    lines: [
      'Thermally interesting. Structurally not.',
      'Fire is just an engineering problem!',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Engineer' },
    lines: [
      'Performing as designed.',
      'Log it: one confirmed stop.',
      'The math was never in question.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Engineer' },
    lines: [
      'Design flaw… mine…',
      'Check my notes… the third page…',
      'It should have… held…',
    ],
  },

  // ---------------------------------------------------------------------------
  // CONSTRUCTS - flat, literal, unsettling.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Construct' },
    lines: [
      'TARGET ACQUIRED.',
      'COMPLIANCE IS NOT REQUIRED.',
      'PROCEEDING.',
      'OBSTRUCTION NOTED. REMOVING.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Construct' },
    lines: [
      'OBSTRUCTION REMOVED.',
      'TASK COMPLETE. NEXT.',
      'NO FURTHER INPUT DETECTED.',
    ],
  },
  {
    trigger: 'death', actor: { tag: 'Construct' },
    lines: [
      'INTEGRITY… FAIL…',
      'SHUTTING D—',
      'TASK… INCOMPLETE…',
    ],
  },

  // ---------------------------------------------------------------------------
  // COURT / CHOIR - the high and mighty on both sides of the divide.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Court' },
    lines: [
      'You are addressing your betters.',
      'Kneel, or be knelt.',
      'This is beneath me. I will do it anyway.',
      'Do you know what I am? You will.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Court' }, target: { tag: 'Holy' },
    lines: [
      'Your church built me a throne and forgot why.',
      'Titles outlast gods, priest.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Choir' },
    lines: [
      'Sing with us. You have no choice.',
      'We are many voices and one throat.',
      'Harmony demands your silence.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Choir' },
    lines: [
      'And the note resolves.',
      'Your voice is ours now.',
    ],
  },

  // ---------------------------------------------------------------------------
  // ARCHERS / BEASTS - the small specific flavours.
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { tag: 'Archer' },
    lines: [
      'Wind is fair. You are not.',
      'Nocked and gone.',
      'I had you three breaths ago.',
    ],
  },
  {
    trigger: 'kill', actor: { tag: 'Archer' },
    lines: [
      'Clean.',
      'Next quiver, next name.',
    ],
  },
  {
    trigger: 'attack', actor: { tag: 'Beast' },
    lines: [
      '*a low, wet snarl*',
      '*teeth, and nothing behind the eyes*',
      '*it has stopped making sounds you know*',
    ],
  },

  // ---------------------------------------------------------------------------
  // NAMED UNITS - these override the broad tag rules above (name = +4).
  // ---------------------------------------------------------------------------
  {
    trigger: 'attack', actor: { name: 'Paladin' }, target: { tag: 'Demon' },
    lines: [
      'I have hunted your kind since I could lift the blade!',
      'Name yourself, so I may carve it on your marker!',
      'The oath is older than you, and it is heavier!',
    ],
  },
  {
    trigger: 'kill', actor: { name: 'Paladin' }, target: { tag: 'Demon' },
    lines: [
      'Feel the might of the righteous!',
      'Back to the abyss with you!',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Inquisitor' },
    lines: [
      'Confess. It changes nothing, but confess.',
      'I have a list. You are on it.',
      'Doubt is the wound. I am the cautery.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Blood Knight' }, target: { tag: 'Holy' },
    lines: [
      'I wore your colours once. They stained.',
      'Your order cast me out. It made me thorough.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Necromancer' },
    lines: [
      'Do not think of it as dying. Think of it as hiring.',
      'You have such promising bones.',
      'Stand still — you are ruining the specimen.',
    ],
  },
  {
    trigger: 'kill', actor: { name: 'Necromancer' },
    lines: [
      'Welcome to the staff.',
      'Do not get comfortable. You start immediately.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Malgrath the Undying' },
    lines: [
      'I have outlived your gods, your kings, and your grandmother.',
      'Undying is not a boast. It is an inconvenience I have made peace with.',
      'Do continue. I am curious how you think this ends.',
    ],
  },
  {
    trigger: 'attack', actor: { name: 'Imp' },
    lines: [
      'Ha! Missed! Oh — no, that one landed!',
      'I am SO much worse than I look!',
      'Pick on someone your own size! Wait — no!',
    ],
  },
  {
    trigger: 'death', actor: { name: 'Imp' },
    lines: [
      'Not fair! Not FAIR!',
      'Tell the Baron I fought REALLY hard!',
    ],
  },

  // ---------------------------------------------------------------------------
  // HEALING - kept from the original system, broadened to tags.
  // ---------------------------------------------------------------------------
  {
    trigger: 'heal_low_hp', actor: { name: 'Acolyte' },
    lines: [
      'You shall not fall!',
      'Stay with me!',
      'The light will not abandon you!',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { name: 'Priest' },
    lines: [
      'You shall not fall!',
      'Hold on, I have you!',
      'Rise, and fight on!',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Holy' },
    lines: [
      'Not today. Not while I stand!',
      'The light is not finished with you!',
      'Breathe. Just breathe.',
      'I have you. I have you.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Vampire' },
    lines: [
      'I am not saving you. I am protecting my investment.',
      'Take some of mine. You may keep it.',
      'Do not mistake this for kindness.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Demon' },
    lines: [
      'You are no use to me in pieces.',
      'Get up. The bargain is not done.',
      'I decide when you die.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Engineer' },
    lines: [
      'Field repair! Hold still!',
      'Patching you up — do not test the seal!',
      'Structurally sound. Ish. Go.',
    ],
  },
  {
    trigger: 'heal_low_hp', actor: { tag: 'Undead' },
    lines: [
      'Stay on this side a little longer.',
      'The dark can wait for you. I told it so.',
    ],
  },
];

export { COMBAT_BARKS, BARK_CHANCES, HEAL_BARK_THRESHOLD_PCT };
if (typeof module !== 'undefined') module.exports = { COMBAT_BARKS, BARK_CHANCES, HEAL_BARK_THRESHOLD_PCT };
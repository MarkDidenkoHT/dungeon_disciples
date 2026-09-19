// Invites: every player carries a share code, and a player who arrives through
// someone's link pays that someone back over time (see docs/daily-activities-design.md).
//
// The invitee is paid once, on sign-up. The inviter is paid in three moments:
// the sign-up, the invitee's first finished battle, and every daily set the
// invitee completes — so an invite keeps earning only while the friend plays.

// No 0/O/1/I/L: a code is read off a screen and typed by hand.
const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 6;

function generateInviteCode(random = Math.random) {
  let out = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += INVITE_CODE_ALPHABET[Math.floor(random() * INVITE_CODE_ALPHABET.length)];
  }
  return out;
}

// Typed by hand, so case and stray spaces are forgiven; the stored form is upper.
function normalizeInviteCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const ALL_CRYSTALS = ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'];

// What the new player gets for arriving through a link.
const INVITEE_WELCOME = {
  resources: { Gold: 50, ...Object.fromEntries(ALL_CRYSTALS.map(c => [c, 20])) },
  tokens:    { health_potion: 3, tome_of_knowledge: 1 },
};

// What the inviter gets, keyed by the moment that pays it. `crystals` is the
// inviter's own faction crystal, resolved where it is granted.
const INVITER_REWARDS = {
  signup:       { tokens: { tome_of_knowledge: 1 } },
  first_battle: { resources: { Gold: 50 } },
  daily:        { crystals: 5 },
};

// A daily payout for every day the invitee plays would grow without end, so it
// is capped per invitee. 60 dailies is about two months of a friend playing.
const INVITER_DAILY_CAP = 60;

// How many invitees one player can be paid for at all.
const INVITE_MAX_ACCEPTED = 25;

export {
  INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, generateInviteCode, normalizeInviteCode,
  INVITEE_WELCOME, INVITER_REWARDS, INVITER_DAILY_CAP, INVITE_MAX_ACCEPTED,
};
if (typeof module !== 'undefined') module.exports = {
  INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, generateInviteCode, normalizeInviteCode,
  INVITEE_WELCOME, INVITER_REWARDS, INVITER_DAILY_CAP, INVITE_MAX_ACCEPTED,
};

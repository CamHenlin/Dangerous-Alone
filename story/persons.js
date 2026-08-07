/**
 * Underworld person dialogue — the old men who sit between two statues, the
 * bomb-satchel trader, the money-or-life ghost, and Grumble.
 *
 * Keys are `level:textId` (checked first) or plain `textId`. The ROM picks the
 * text id from `PersonTextSelector`; see tools/shared/personText.js for which
 * dungeons share which table:
 *
 *   levels 1, 2, 5, 7 → $28 $26 $2E $30 $32 $3E $3E $34   (40 38 46 48 50 62 52)
 *   levels 3, 4, 6, 8 → $2A $38 $3A $2C $40 $42 $42 $3C   (42 56 58 44 64 66 60)
 *   level  9          → $44 $46 $48 $4A                   (68 70 72 74)
 *   money-or-life     → $36                               (54)
 *   Grumble ($36)     → $24                               (36)
 *
 * See ./README.md for the entry shape and the charset rules.
 */

/** Keyed by `level:textId` — wins over `byTextId`. */
export const byLevelAndTextId = {
  // --- Level 3, the Manji ---------------------------------------------------
  '3:42': {
    pages: [
      'DID YOU GET THE SWORD FROM THE OLD MAN ABOVE THE WATERFALL? GO BACK FOR IT.',
      'WOOD SPLINTERS. THE THINGS BELOW THIS FLOOR DO NOT.',
    ],
  },

  // --- Level 6, the Dragon --------------------------------------------------
  '6:58': {
    pages: [
      'AIM AT THE EYE OF GOHMA. IT SHUTS WHEN IT IS AFRAID, AND IT IS AFRAID OF YOU.',
      'NO BLADE REACHES IT. WAIT FOR THE EYE TO OPEN, THEN LOOSE AN ARROW INTO IT.',
    ],
  },

  // --- Level 8, the Lion ----------------------------------------------------
  '8:64': {
    pages: [
      'THE LION HOARDS TWO THINGS. A KEY THAT NEVER WEARS OUT, AND A BOOK THAT TEACHES THE ROD TO BURN.',
      'LEAVE WITH BOTH OR DO NOT BOTHER LEAVING.',
    ],
  },
  '8:66': {
    pages: [
      'FOUR HEADS ON ONE BODY. CUT THEM ALL AND THE LAST ONE STILL FLIES AT YOU.',
      'DO NOT STOP SWINGING AND DO NOT BACK INTO A CORNER.',
    ],
  },
  '8:60': {
    pages: [
      'WHEN THE 8TH SHARD IS YOURS, GO NORTH TO DEATH MOUNTAIN AND BOMB THE GREY WALL. THAT IS THE LAST DOOR.',
    ],
  },

  // --- Level 9, Death Mountain ---------------------------------------------
  '9:68': {
    pages: [
      'SO YOU CARRY ALL 8. THE TRIFORCE OF WISDOM IS WHOLE AND IT BROUGHT YOU HERE. NOTHING LIVING BUILT THESE WALLS.',
    ],
  },
  '9:70': {
    pages: [
      'GANON FIGHTS UNSEEN. STRIKE WHERE THE AIR IS WRONG UNTIL HE FLICKERS AND HOLDS STILL.',
      'WHILE HE IS STUNNED, LOOSE A SILVER ARROW. NOTHING ELSE WILL FINISH HIM.',
    ],
  },
  '9:72': {
    pages: [
      'THE SILVER ARROW IS HIDDEN IN THIS MOUNTAIN, BEHIND HIS OWN DOOR. HE NEVER BELIEVED ANYONE WOULD GET THIS FAR.',
      'FIND IT BEFORE YOU FIND HIM.',
    ],
  },
  '9:74': {
    pages: [
      'TURN BACK WHILE THERE IS STILL A ROAD BEHIND YOU. NO? THEN KEEP ONE WALL ON YOUR SHOULDER AND DO NOT LET GO OF IT.',
      'ZELDA IS HERE. SHE HAS BEEN HERE SINCE THE DAY SHE BROKE THE RELIC.',
    ],
  },
};

/** Keyed by ROM text id. */
export const byTextId = {
  /** $24 — Hungry Goriya / Grumble (object $36). */
  36: {
    pages: [
      'GRUMBLE, GRUMBLE... I HAVE NOT EATEN SINCE THE ARMY CAME. FEED ME AND I WILL MOVE.',
    ],
  },

  /** $26 — eastmost peninsula. */
  38: {
    pages: [
      'THE EASTMOST PENINSULA IS THE SECRET. WALK THE COAST UNTIL THE LAND RUNS OUT, THEN LOOK ONCE MORE.',
    ],
  },

  /** $28 — Dodongo. */
  40: {
    pages: [
      'DODONGO SWALLOWS WHATEVER IT MEETS, AND IT DISLIKES SMOKE.',
      'PUT A BOMB WHERE ITS MOUTH IS GOING TO BE. TWICE. THEN USE THE BLADE.',
    ],
  },

  /** $2A — the sword above the waterfall. */
  42: {
    pages: [
      'DID YOU GET THE SWORD FROM THE OLD MAN ABOVE THE WATERFALL? A BOY WITH A WOODEN BLADE DIES POLITELY DOWN HERE.',
    ],
  },

  /** $2C — walk into the waterfall. */
  44: {
    pages: [
      'WATER FALLING IS STILL ONLY WATER. WALK INTO THE WATERFALL AND KEEP WALKING.',
    ],
  },

  /** $2E — secret power in the arrow. */
  46: {
    pages: [
      'SECRET POWER IS SAID TO BE IN THE ARROW. SOME EYES CANNOT BE CUT. THEY CAN ONLY BE PIERCED.',
    ],
  },

  /** $30 — Digdogger. Needs the recorder from level 5 (floor item in room $04). */
  48: {
    pages: [
      'DIGDOGGER HATES A CERTAIN KIND OF SOUND. NO BLADE WILL OPEN IT WHILE IT IS WHOLE.',
      'PLAY, AND WHEN IT COMES APART, CUT WHAT IS LEFT.',
    ],
    // CLEAR_CONDITIONS name from mapMarks.js — when false, append the missing pages.
    ifMissing: 'recorder',
    missingPages: [
      'IT LOOKS LIKE YOU DO NOT HAVE THE PROPER ITEM. DIGDOGGER FEARS THE RECORDER.',
      'THE RECORDER HIDES IN THE FIFTH LABYRINTH. GO THERE AND TAKE IT BEFORE YOU FACE HIM.',
    ],
    // Already inside level 5 — point at the room, not the overworld mouth.
    missingPagesByLevel: {
      5: [
        'IT LOOKS LIKE YOU DO NOT HAVE THE PROPER ITEM. DIGDOGGER FEARS THE RECORDER.',
        'THE RECORDER IS STILL IN THIS LABYRINTH. I HAVE MARKED ITS ROOM ON YOUR MAP.',
      ],
    },
    missingMarks: [
      { dungeonLevel: 5, itemType: 0x05, clears: 'recorder', label: 'RECORDER' },
      { level: 5, clears: 'recorder', label: 'RECORDER' },
    ],
  },

  /** $32 — the bomb satchel trader. */
  50: {
    pages: [
      'I BET YOU WOULD LIKE TO CARRY MORE BOMBS. EVERYONE WOULD.',
      'PAY ME AND YOUR SATCHEL HOLDS FOUR MORE. THE LABYRINTHS ONLY GET DARKER FROM HERE.',
    ],
  },

  /** $34 — follow the arrow. */
  52: {
    pages: [
      'IF YOU GO IN THE DIRECTION OF THE ARROW, THE WALL IS THINNER THAN IT LOOKS. BOMBS KNOW THE DIFFERENCE.',
    ],
  },

  /** $36 — money-or-life. */
  54: {
    pages: [
      'LEAVE YOUR LIFE OR YOUR MONEY. I HAVE ALL THE TIME THERE IS AND YOU HAVE NONE OF IT.',
    ],
  },

  /** $38 — where fairies do not live. */
  56: {
    pages: [
      'THERE ARE SECRETS WHERE FAIRIES DO NOT LIVE. A POND WITH NOTHING IN IT IS NOT AN EMPTY POND.',
    ],
  },

  /** $3A — Gohma. */
  58: {
    pages: ['AIM AT THE EYE OF GOHMA. AN ARROW, AND ONLY WHILE THE EYE IS OPEN.'],
  },

  /** $3C — south of the arrow mark. */
  60: {
    pages: [
      'SOUTH OF THE ARROW MARK HIDES A SECRET. THE MASONS WHO BUILT THESE HALLS LEFT SIGNS FOR EACH OTHER.',
    ],
  },

  /** $3E — the tip of the nose. */
  62: {
    pages: [
      'THERE IS A SECRET IN THE TIP OF THE NOSE. LOOK AT THE SHAPE OF THIS PLACE ON YOUR MAP, NOT AT THE WALLS.',
    ],
  },

  /** $40 — generic hollow walls (levels 3, 4, 6, 8). */
  64: {
    pages: [
      'PATIENCE, BOY. THE WALLS HERE ARE HOLLOW IN PLACES. FIND THE ROOM THAT ANSWERS AND SPEND A BOMB ON IT.',
    ],
  },

  /** $42 — generic captains warning (levels 3, 4, 6, 8). */
  66: {
    pages: [
      'GANON\'S CAPTAINS WERE MEN ONCE. THEY STILL REMEMBER FIRE.',
      'CARRY A CANDLE AND CARRY BOMBS. NEITHER ONE IS A WEAPON UNTIL YOU NEED IT TO BE.',
    ],
  },

  /** $44 — generic. */
  68: {
    pages: ['EVERY SHARD YOU CARRY MAKES THE NEXT DOOR LIGHTER. KEEP GOING.'],
  },

  /** $46 — generic. */
  70: {
    pages: ['THE SHARD IS ALWAYS BEHIND THE THING THAT GUARDS THE ROOM. THERE IS NO OTHER WAY ROUND.'],
  },

  /** $48 — generic. */
  72: {
    pages: ['REST HERE IF YOU LIKE. NOTHING FOLLOWS YOU INTO THIS ROOM. NOTHING GOOD, EITHER.'],
  },

  /** $4A — generic. */
  74: {
    pages: ['A MAP IS WORTH MORE THAN A KEY IN A PLACE SHAPED LIKE THIS ONE.'],
  },
};

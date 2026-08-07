/**
 * Dungeon dossiers and the briefing given when a Triforce shard is claimed.
 *
 * Taking the shard in level N shows, in order:
 *   1. `LEVELS[N].onPiece`   — what that shard means for the story
 *   2. `LEVELS[N + 1].brief` — where the next labyrinth is and what waits there
 *   3. warnings, built from what the player actually left behind on the floor
 *
 * Keeping `brief` on the labyrinth it describes means each dungeon's write-up
 * lives in exactly one place. `entrance.screen` is checked against the
 * extracted overworld tables by `npm test`, so a wrong screen id cannot ship.
 *
 * See ./README.md for the entry shape and the charset rules.
 */

/** @type {Array<object>} indexed by level number (index 0 unused). */
export const LEVELS = [
  null,

  // --- 1 ---------------------------------------------------------------------
  {
    level: 1,
    name: 'THE EAGLE',
    guardian: 'AQUAMENTUS',
    treasure: 'THE BOW',
    entrance: { screen: 0x37, how: 'open' },
    brief: [
      'THE FIRST LABYRINTH IS NORTH OF THE CAVE WHERE YOU WOKE, IN THE HIGH GROUND EAST OF THE LAKE. ITS MOUTH STANDS OPEN.',
      'THE EAGLE IS SHALLOW AND HONEST. A ONE HORNED THING CALLED AQUAMENTUS HOLDS THE SHARD. IT SPITS IN THREES.',
      'THE BOW IS IN THERE. TAKE IT EVEN IF YOU HAVE NO ARROWS YET. LATER DOORS DO NOT OPEN WITHOUT IT.',
    ],
    onPiece: [
      'THE SHARD IS WARM IN YOUR HAND. 1 OF 8. SOMEWHERE UNDER DEATH MOUNTAIN, ZELDA FEELS IT COME BACK.',
      'GANON WILL FEEL IT TOO. THE ROADS WILL BE WORSE FROM HERE.',
      'YOUR HEART IS STRONGER THAN IT WAS. THE OLD MAN IN THE CAVE ABOVE THE LAKE WILL TRADE A WHITE BLADE FOR 5 HEART CONTAINERS.',
    ],
    marks: [{ caveId: 0x12, clears: 'whiteSword', label: 'WHITE SWORD' }],
  },

  // --- 2 ---------------------------------------------------------------------
  {
    level: 2,
    name: 'THE MOON',
    guardian: 'DODONGO',
    treasure: 'THE MAGICAL BOOMERANG',
    entrance: { screen: 0x3c, how: 'open' },
    brief: [
      'THE SECOND LABYRINTH IS EAST AND A LITTLE NORTH, WHERE THE MOUNTAINS COME DOWN TO MEET THE ROAD. THE WAY IN IS OPEN.',
      'THE MOON IS NARROW AND IT DOUBLES BACK. DODONGO GUARDS THE SHARD. IT EATS ANYTHING, SO FEED IT SMOKE. BOMBS, THEN THE BLADE.',
      'BRING BOMBS FOR THE WALLS AS WELL. THE MAGICAL BOOMERANG IS INSIDE, AND IT COMES BACK FROM ANY DISTANCE.',
    ],
    onPiece: [
      '2 OF 8. THE SHARDS PULL AT EACH OTHER NOW, FAINTLY, LIKE TWO LODESTONES IN A POCKET.',
      'IMPA SAID THE PRINCESS SPLIT THE RELIC IN ONE NIGHT AND HID EACH PIECE WHERE A DIFFERENT HORROR SLEPT. SHE CHOSE WELL.',
    ],
  },

  // --- 3 ---------------------------------------------------------------------
  {
    level: 3,
    name: 'THE MANJI',
    guardian: 'MANHANDLA',
    treasure: 'THE RAFT',
    entrance: { screen: 0x74, how: 'open' },
    brief: [
      'THE THIRD LABYRINTH IS SOUTH AND WEST, SUNK IN THE OPEN SAND BELOW THE LAKE. WALK THE BEACH AND YOU WILL FIND THE STAIR.',
      'MANHANDLA WAITS AT THE HEART OF IT. FOUR SNAPPING HEADS ON ONE STALK, AND IT GETS FASTER AS YOU CUT THEM OFF.',
      'THE RAFT IS IN THERE. WITHOUT IT THE FOURTH LABYRINTH CANNOT BE REACHED AT ALL, SO DO NOT LEAVE UNTIL YOU HAVE IT.',
    ],
    onPiece: [
      '3 OF 8. THE SAND OVER YOUR HEAD SHIFTS AS THE SHARD LEAVES ITS ROOM, AS IF THE PLACE WERE GLAD TO BE RID OF IT.',
      'WITH THE RAFT YOU ARE NO LONGER STOPPED BY WATER. EVERY DOCK ON THE COAST IS A ROAD NOW, AND SOME OF THEM GO SOMEWHERE.',
    ],
  },

  // --- 4 ---------------------------------------------------------------------
  {
    level: 4,
    name: 'THE SNAKE',
    guardian: 'GLEEOK',
    treasure: 'THE STEPLADDER',
    entrance: { screen: 0x45, how: 'raft' },
    brief: [
      'THE FOURTH LABYRINTH SITS ON THE ISLAND IN THE MIDDLE OF THE GREAT LAKE. NO BRIDGE REACHES IT.',
      'TAKE THE RAFT FROM THE DOCK ON THE LAKE SHORE AND LET IT CARRY YOU ACROSS. THE STAIR IS WAITING ON THE FAR SIDE.',
      'A GLEEOK HOLDS THE SHARD. TWO HEADS ON LONG NECKS, AND A SEVERED HEAD KEEPS FLYING AND KEEPS BITING.',
      'THE STEPLADDER IS INSIDE. IT BRIDGES ANY SINGLE GAP OF WATER, ABOVE GROUND AND BELOW IT.',
    ],
    onPiece: [
      '4 OF 8. HALF. THE SHARD IS COLDER THAN THE LAST THREE AND IT HUMS WHEN YOU HOLD IT STILL.',
      'THE STEPLADDER CHANGES THE MAP. STREAMS THAT TURNED YOU BACK ALL SUMMER ARE ONE STEP WIDE NOW.',
    ],
  },

  // --- 5 ---------------------------------------------------------------------
  {
    level: 5,
    name: 'THE LIZARD',
    guardian: 'DIGDOGGER',
    treasure: 'THE RECORDER',
    entrance: { screen: 0x0b, how: 'open' },
    brief: [
      'THE FIFTH LABYRINTH IS FAR NORTH AND EAST, ON THE HIGH GROUND ABOVE THE GRAVEYARD. THE MOUTH IS OPEN TO ANYONE WHO CLIMBS THAT FAR.',
      'DIGDOGGER IS DOWN THERE. IT CANNOT BE CUT WHILE IT IS WHOLE. IT HATES A CERTAIN KIND OF SOUND, AND SOUND IS THE ONLY KEY.',
      'THE RECORDER IS IN THE SAME LABYRINTH. TAKE IT FIRST AND THE BOSS BECOMES A FIGHT INSTEAD OF A WALL.',
    ],
    onPiece: [
      '5 OF 8. THE AIR IN THE ROOM GOES QUIET, THE WAY IT DOES BEFORE WEATHER.',
      'THE RECORDER IS MORE THAN A KEY. PLAY IT UNDER THE OPEN SKY AND A WHIRLWIND WILL COME AND CARRY YOU TO A LABYRINTH YOU HAVE ALREADY OPENED.',
      'PLAY IT AT STILL WATER AND THE WATER WILL LEAVE. NOT EVERY POND, BUT ONE OF THEM.',
    ],
  },

  // --- 6 ---------------------------------------------------------------------
  {
    level: 6,
    name: 'THE DRAGON',
    guardian: 'GOHMA',
    treasure: 'THE MAGICAL ROD',
    entrance: { screen: 0x22, how: 'open' },
    brief: [
      'THE SIXTH LABYRINTH IS IN THE NORTH WEST, BEYOND THE WOODS THAT TURN TRAVELLERS AROUND. NORTH, WEST, SOUTH, WEST TAKES YOU THROUGH THEM.',
      'GOHMA GUARDS THE SHARD, AND GOHMA IS ONE ARMOURED EYE. NO BLADE TOUCHES IT. AN ARROW THROUGH THE OPEN EYE IS THE WHOLE FIGHT.',
      'SO CARRY THE BOW, CARRY ARROWS, AND CARRY RUPEES. EVERY ARROW YOU LOOSE COSTS ONE.',
      'THE MAGICAL ROD IS INSIDE. IT THROWS THE SAME BEAM YOUR SWORD DOES, AT ANY HEALTH.',
    ],
    onPiece: [
      '6 OF 8. TWO LEFT. THE WEIGHT OF THE OTHER SIX IN YOUR PACK IS NOT THE WEIGHT OF GOLD.',
      'YOU HAVE COME FAR ENOUGH FOR THE LAST BLADE. UNDER ONE OF THE HEADSTONES IN THE GRAVEYARD AN OLD MAN KEEPS THE MAGICAL SWORD.',
      'HE WILL WANT 12 HEART CONTAINERS BEFORE HE PARTS WITH IT. PUSH THE STONES UNTIL ONE OF THEM GIVES.',
    ],
    marks: [{ caveId: 0x13, clears: 'magicSword', label: 'MAGICAL SWORD' }],
  },

  // --- 7 ---------------------------------------------------------------------
  {
    level: 7,
    name: 'THE DEMON',
    guardian: 'AQUAMENTUS',
    treasure: 'THE RED CANDLE',
    entrance: { screen: 0x42, how: 'recorder' },
    brief: [
      'THE SEVENTH LABYRINTH IS IN THE WEST, UNDER A ROUND POND THAT SITS BY ITSELF WITH NOTHING GROWING AT ITS EDGE.',
      'THERE ARE SECRETS WHERE FAIRIES DO NOT LIVE. STAND AT THAT WATER AND PLAY THE RECORDER. THE POND WILL DRAIN AND LEAVE A STAIR.',
      'AQUAMENTUS HOLDS THIS SHARD TOO, AND IT IS NOT THE ONE YOU BEAT IN THE EAGLE. THE HALLS AROUND IT ARE FULL OF THINGS THAT EAT LIGHT.',
      'THE RED CANDLE IS INSIDE. IT BURNS AS OFTEN AS YOU LIKE INSTEAD OF ONCE PER ROOM.',
    ],
    onPiece: [
      '7 OF 8. THE SHARDS ARE LOUD NOW. YOU CAN FEEL THEM TRYING TO CLOSE THE LAST GAP.',
      'ONE MORE AND THE TRIFORCE OF WISDOM IS WHOLE. UNTIL THEN DEATH MOUNTAIN WILL NOT LET YOU PAST ITS DOOR.',
    ],
  },

  // --- 8 ---------------------------------------------------------------------
  {
    level: 8,
    name: 'THE LION',
    guardian: 'GLEEOK',
    treasure: 'THE MAGICAL KEY AND THE BOOK OF MAGIC',
    entrance: { screen: 0x6d, how: 'burn' },
    brief: [
      'THE EIGHTH LABYRINTH IS SOUTH AND EAST, IN THE THIN WOOD ABOVE THE COAST. THERE IS NO DOOR THERE UNTIL YOU MAKE ONE.',
      'BURN THE TREE THAT STANDS APART FROM THE OTHERS. THE STAIR IS UNDER IT.',
      'A GLEEOK WITH FOUR HEADS HOLDS THE LAST SHARD. IT IS THE LONGEST FIGHT IN HYRULE AND IT DOES NOT PAUSE.',
      'TWO PRIZES ARE INSIDE. THE MAGICAL KEY OPENS EVERY LOCK FOREVER, AND THE BOOK OF MAGIC SETS THE ROD ALIGHT. TAKE BOTH.',
    ],
    onPiece: [
      '8 OF 8. THE SHARDS RISE OUT OF YOUR PACK ON THEIR OWN AND FIT THEMSELVES TOGETHER.',
      'THE TRIFORCE OF WISDOM IS WHOLE. IT BURNS STEADY AND GOLD AND IT POINTS NORTH, THE WAY A COMPASS POINTS.',
      'THAT IS WHAT ZELDA BOUGHT WITH HER FREEDOM. NOW GO AND SPEND IT.',
    ],
  },

  // --- 9 ---------------------------------------------------------------------
  {
    level: 9,
    name: 'DEATH MOUNTAIN',
    guardian: 'GANON',
    treasure: 'THE SILVER ARROW',
    entrance: { screen: 0x05, how: 'bomb' },
    brief: [
      'THE LAST DOOR IS AT THE TOP OF DEATH MOUNTAIN, IN THE FAR NORTH. THE PATH THERE IS A MAZE OF GREY ROCK AND IT IS PATROLLED.',
      'THE WAY IN IS A WALL. FIND THE GREY ROCK FACE AND BOMB IT. THE TRIFORCE OF WISDOM WILL LET YOU THROUGH WHAT IS BEHIND IT.',
      'THE SILVER ARROW IS HIDDEN INSIDE THE MOUNTAIN. GANON CANNOT BE KILLED WITHOUT IT, SO FIND IT BEFORE YOU FIND HIM.',
      'HE FIGHTS UNSEEN. CUT AT THE PLACE WHERE THE AIR IS WRONG UNTIL HE HOLDS STILL, THEN LOOSE THE SILVER ARROW INTO HIM.',
      'CARRY THE BEST BLADE YOU OWN, EVERY BOMB YOU CAN, AND ENOUGH RUPEES TO KEEP SHOOTING. ZELDA IS BEHIND HIM.',
    ],
    onPiece: [],
  },
];

/**
 * Warnings for treasure left on a labyrinth floor, keyed by ROM item type.
 * Anything not listed here is treated as small change and never nagged about.
 */
export const ITEM_ADVICE = {
  /** $0A bow */
  0x0a: 'YOU LEFT THE BOW BEHIND. GOHMA AND GANON BOTH DIE TO ARROWS AND TO NOTHING ELSE. GO BACK FOR IT.',
  /** $0C raft */
  0x0c: 'YOU LEFT THE RAFT BEHIND. THE LABYRINTH ON THE LAKE ISLAND CANNOT BE REACHED WITHOUT IT. GO BACK FOR IT.',
  /** $0D stepladder */
  0x0d: 'YOU LEFT THE STEPLADDER BEHIND. WATER GAPS ABOVE AND BELOW GROUND WILL TURN YOU AROUND UNTIL YOU HAVE IT.',
  /** $05 recorder */
  0x05: 'YOU LEFT THE RECORDER BEHIND. WITHOUT IT DIGDOGGER CANNOT BE OPENED AND THE POND OVER THE 7TH LABYRINTH WILL NOT DRAIN.',
  /** $10 magical rod */
  0x10: 'YOU LEFT THE MAGICAL ROD BEHIND. IT THROWS A BEAM AT ANY HEALTH, WHICH YOUR SWORD WILL NOT DO ONCE YOU ARE HURT.',
  /** $11 book of magic */
  0x11: 'YOU LEFT THE BOOK OF MAGIC BEHIND. IT SETS THE ROD ALIGHT AND MAKES IT THE STRONGEST THING YOU CAN CARRY.',
  /** $07 red candle */
  0x07: 'YOU LEFT THE RED CANDLE BEHIND. THE BLUE ONE LIGHTS ONE FIRE PER ROOM. THE RED ONE NEVER RUNS DRY.',
  /** $0B magical key */
  0x0b: 'YOU LEFT THE MAGICAL KEY BEHIND. IT OPENS EVERY LOCKED DOOR IN HYRULE AND IS NEVER USED UP.',
  /** $1E magical boomerang */
  0x1e: 'YOU LEFT THE MAGICAL BOOMERANG BEHIND. IT STUNS ACROSS A WHOLE ROOM, WHICH THE WOODEN ONE CANNOT.',
  /** $1D boomerang */
  0x1d: 'YOU LEFT THE BOOMERANG BEHIND. IT STUNS WHAT YOU CANNOT REACH AND PULLS IN WHAT YOU CANNOT CATCH.',
  /** $09 silver arrow */
  0x09: 'YOU LEFT THE SILVER ARROW BEHIND. GANON CANNOT BE FINISHED WITHOUT IT.',
  /** $13 red ring */
  0x13: 'YOU LEFT THE RED RING BEHIND. IT CUTS EVERY WOUND YOU TAKE TO A QUARTER.',
  /** $12 blue ring */
  0x12: 'YOU LEFT THE BLUE RING BEHIND. IT HALVES EVERY WOUND YOU TAKE.',
  /** $14 power bracelet */
  0x14: 'YOU LEFT THE POWER BRACELET BEHIND. WITHOUT IT THE STANDING ROCKS ABOVE GROUND WILL NOT MOVE.',
  /** $1A heart container */
  0x1a: 'YOU LEFT A HEART CONTAINER ON THE FLOOR. THE OLD MEN WITH THE BETTER BLADES COUNT THOSE.',
  /** $17 map */
  0x17: 'YOU NEVER FOUND THE MAP FOR THIS PLACE. IT IS ONLY PAPER, BUT PAPER IS CHEAPER THAN WALKING IT TWICE.',
  /** $16 compass */
  0x16: 'YOU NEVER FOUND THE COMPASS. IT WOULD HAVE POINTED STRAIGHT AT THE SHARD.',
  /** $1C magical shield */
  0x1c: 'YOU LEFT THE MAGICAL SHIELD BEHIND. IT TURNS THE THINGS A WOODEN SHIELD DOES NOT.',
};

/**
 * Which misses matter most, best first. Anything absent from this list still
 * gets warned about, just after everything listed here.
 */
export const MISSED_PRIORITY = [
  0x0c, // raft — hard-gates level 4
  0x0d, // stepladder
  0x05, // recorder — hard-gates level 7 and Digdogger
  0x0a, // bow — hard-gates Gohma and Ganon
  0x09, // silver arrow
  0x0b, // magical key
  0x11, // book of magic
  0x10, // magical rod
  0x07, // red candle
  0x1e, // magical boomerang
  0x1d, // boomerang
  0x14, // power bracelet
  0x13, // red ring
  0x12, // blue ring
  0x1c, // magical shield
  0x1a, // heart container
  0x17, // map
  0x16, // compass
];

/** At most this many warnings — a briefing should not become an inventory. */
export const MISSED_MAX = 3;

/** Heading page printed before the list of missed treasure. */
export const MISSED_HEADER =
  'ONE MORE THING. YOU DID NOT LEAVE THAT LABYRINTH EMPTY HANDED, BUT YOU DID LEAVE SOMETHING.';

/** How to go back — appended after the warnings. */
export const MISSED_FOOTER =
  'THE DOOR IS STILL OPEN AND THE ROOMS YOU CLEARED STAY CLEARED. GO BACK WHEN YOU CAN.';

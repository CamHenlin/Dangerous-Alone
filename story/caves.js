/**
 * Overworld cave dialogue.
 *
 * `byCaveId` wins over `byTextId`. Cave ids are $10–$23; text ids are the
 * ROM's PersonText offsets (see assets/extracted/tables/caves.json).
 *
 * See ./README.md for the entry shape and the charset rules.
 */

/**
 * One-line blurbs for shop wares. `caveStory` joins the ones currently on the
 * shelf into a second page, so a merchant never pitches a candle he does not
 * sell — or arrows Link already owns.
 *
 * Keys are cave item codes (see `ITEM` in tools/shared/caves.js).
 */
export const shopItemBlurbs = {
  0x00: 'BOMBS OPEN WHAT YOUR SWORD CANNOT',
  0x04: 'BAIT FEEDS THE HUNGRY THING IN THE WAY',
  0x06: 'A CANDLE TURNS DARK ROOMS INTO ROOMS',
  0x08: 'ARROWS NEED A BOW',
  0x12: 'A BLUE RING CUTS THE HURT IN HALF',
  0x19: 'A KEY OPENS DOORS WITHOUT A FIGHT',
  0x1c: 'A SHIELD TURNS ROCKS',
  0x22: 'A HEART PUTS LIFE BACK IN YOUR CHEST',
};

/**
 * Closers for the shelf pitch, keyed by how many blurbs were joined.
 * `many` covers 3+.
 */
export const shopPitchClosers = {
  1: 'CHEAPER THAN DYING.',
  2: 'BOTH ARE CHEAPER THAN DYING.',
  many: 'ALL OF IT IS CHEAPER THAN DYING.',
};

/** Keyed by cave id — use when two caves share one ROM string. */
export const byCaveId = {
  /** $12 — the white sword. Shares text $02 with the magical sword cave. */
  0x12: {
    pages: [
      'A BLADE OF WHITE STEEL SLEEPS IN THIS STONE. IT WAS CARRIED BY A KNIGHT WHO DID NOT COME HOME.',
      'IT WILL NOT ANSWER TO A BOY WHO STILL FLINCHES. MASTER THE SWORD YOU HAVE AND YOU CAN HAVE THIS.',
      'COME BACK WHEN YOUR HEART HOLDS 5 CONTAINERS. THE BLADE COUNTS THEM. I DO NOT.',
    ],
    repeatPages: ['THE WHITE BLADE IS YOURS. CARRY IT BETTER THAN HE DID.'],
  },

  /** $13 — the magical sword, under a gravestone in the graveyard. */
  0x13: {
    pages: [
      'YOU MOVED MY HEADSTONE, BOY. GOOD. THE DEAD KEEP BETTER SECRETS THAN THE LIVING.',
      'THIS IS THE MAGICAL SWORD. IT WAS FORGED TO CUT THINGS THAT ARE NOT QUITE ALIVE. GANON IS ONE OF THEM.',
      'IT ASKS A GREAT DEAL. 12 HEART CONTAINERS, AND NOT ONE LESS. MASTER USING IT AND YOU CAN HAVE THIS.',
    ],
    repeatPages: ['THE MAGICAL SWORD IS YOURS. NOW GO AND FINISH WHAT THE KNIGHTS COULD NOT.'],
  },

  /** $1D — shield / bombs / arrows (Shop Two & Four). */
  0x1d: {
    pages: [
      'BUY SOMETHIN\', WILL YA! I HAULED EVERY PIECE OF THIS DOWN HERE MYSELF.',
    ],
  },

  /** $1E — shield / key / blue candle (Shop One at G7). */
  0x1e: {
    pages: [
      'BUY SOMETHIN\', WILL YA! THE WALLS KEEP THE DAMP IN AND THE PRICES FAIR.',
    ],
  },

  /** $1F — cheap shield / bait / heart. */
  0x1f: {
    pages: [
      'BOY! THIS IS REALLY EXPENSIVE! I KNOW IT. YOU WILL PAY IT ANYWAY, BECAUSE THERE IS NOWHERE ELSE.',
    ],
  },

  /** $20 — key / blue ring / bait. */
  0x20: {
    pages: [
      'BOY! THIS IS REALLY EXPENSIVE! THE RING ALONE COST ME HALF A MOUNTAIN TO BRING DOWN HERE.',
    ],
  },
};

/** Keyed by ROM text id. */
export const byTextId = {
  /** $00 — the first cave. Wooden sword, and the whole reason for the quest. */
  0: {
    pages: [
      'IT IS DANGEROUS TO GO ALONE, BOY. THE ROADS ABOVE BELONG TO GANON NOW.',
      'HE CAME OUT OF THE DESERT WITH AN ARMY AND TOOK THE TRIFORCE OF POWER FROM OUR KING.',
      'PRINCESS ZELDA WOULD NOT LET HIM HAVE THE SECOND RELIC. SHE BROKE THE TRIFORCE OF WISDOM INTO 8 SHARDS.',
      'SHE HID THEM IN 8 LABYRINTHS AND SENT HER NURSE IMPA TO FIND A HERO. GANON TOOK ZELDA FOR IT.',
      'GATHER ALL 8 AND WISDOM IS WHOLE. ONLY THEN WILL DEATH MOUNTAIN LET YOU IN.',
      'THE FIRST LABYRINTH LIES NORTH. TAKE THIS. IT IS ONLY WOOD, BUT IT IS SHARP, AND IT IS YOURS.',
    ],
    repeatPages: [
      'THE SWORD IS YOURS, BOY. THE REST OF HYRULE IS NOT. GO AND TAKE IT BACK.',
    ],
  },

  /** $02 — generic "master using it" (see byCaveId for the two sword caves). */
  2: {
    pages: ['MASTER USING THE BLADE YOU CARRY, AND YOU CAN HAVE THIS.'],
  },

  /** $04 — take any road. */
  4: {
    pages: [
      'FOUR ROADS LEAVE THIS ROOM AND NOT ONE OF THEM IS WATCHED. THE MOBLINS NEVER LEARNED TO COUNT PAST THREE.',
      'TAKE ANY ROAD YOU WANT. THEY ALL COME OUT SOMEWHERE WORTH BEING.',
    ],
  },

  /** $06 — the dead end tree. */
  6: {
    pages: [
      'THE FOREST KEEPS ITS OWN COUNSEL, AND IT DOES NOT LIKE FIRE.',
      'WHERE THE PATH STOPS DEAD, BURN THE TREE THAT STANDS ALONE. A SECRET IS IN THE TREE AT THE DEAD END.',
    ],
  },

  /** $08 — money making game. */
  8: {
    pages: [
      'LET US PLAY THE MONEY MAKING GAME. THREE DOORS, ONE PURSE, NO PROMISES.',
      'GANON PAYS HIS SOLDIERS IN FEAR. I PREFER RUPEES. STEP UP AND CHOOSE.',
    ],
  },

  /** $0A — door repair charge. */
  10: {
    pages: [
      'YOU CAME THROUGH MY DOOR WITH A BOMB, BOY. THAT DOOR WAS THE ONLY THING BETWEEN ME AND THE DARK.',
      'PAY ME FOR THE DOOR REPAIR CHARGE AND WE WILL SAY NO MORE ABOUT IT.',
    ],
  },

  /** $0C — the letter for the old woman. */
  12: {
    pages: [
      'I CANNOT WALK THE ROADS ANY MORE, BUT I CAN STILL WRITE. TAKE THIS LETTER.',
      'SHOW THIS TO THE OLD WOMAN WHO KEEPS THE MEDICINE SHOP. SHE WILL NOT SELL TO A STRANGER, BUT SHE OWES ME A DEBT.',
      'HER POTIONS HAVE CARRIED BETTER MEN OUT OF WORSE LABYRINTHS THAN YOURS.',
    ],
    // $1A sits on several screens; the old woman he means is the one next door.
    marks: [{ screen: 0x0d, clears: 'potionShopOpen', label: 'MEDICINE SHOP' }],
    repeatPages: ['GO ON. THE OLD WOMAN IS WAITING, AND SHE IS NOT PATIENT.'],
  },

  /** $0E — the old man at the grave. */
  14: {
    pages: [
      'THE KNIGHTS OF HYRULE ARE ALL BURIED IN ONE FIELD, AND ONE OF THEM DID NOT STAY DOWN.',
      'MEET THE OLD MAN AT THE GRAVE. PUSH THE HEADSTONES UNTIL ONE OF THEM MOVES. HE KEEPS A SWORD WORTH THE WALK.',
    ],
    marks: [{ caveId: 0x13, clears: 'magicSword', label: 'THE GRAVE' }],
  },

  /** $10 — the medicine shop. */
  16: {
    // Spoken while the shelf is still locked (letter not shown yet).
    lockedPages: [
      'I KEEP MEDICINE, BUT NOT FOR STRANGERS. BRING A LETTER FROM THE OLD MAN WHO STILL WRITES, AND I WILL OPEN THE SHELF.',
    ],
    pages: [
      'MEDICINE, DEARIE. BUY MEDICINE BEFORE YOU GO. THE LABYRINTHS DO NOT SELL IT AND THE MONSTERS DO NOT SHARE.',
      'BLUE FOR ONE BAD DAY. RED FOR TWO. I DO NOT REFILL THEM AND I DO NOT GIVE CREDIT.',
    ],
  },

  /** $12 — pay me and I will talk. */
  18: {
    pages: [
      'PAY ME AND I WILL TALK. I HAVE SAT UNDER THIS HILL SINCE THE ARMY CAME AND I HAVE HEARD EVERYTHING.',
      'CHOOSE ONE OF THE THREE. SOME OF WHAT I KNOW IS WORTH MORE THAN OTHERS.',
    ],
  },

  /** $14 — not enough money to talk. */
  20: {
    pages: ['THIS AIN\'T ENOUGH TO TALK. COME BACK WITH A HEAVIER PURSE.'],
  },

  /** $16 — up the mountain. */
  22: {
    pages: [
      'GO UP! UP! THE MOUNTAIN AHEAD. THE STAIR YOU WANT IS BEHIND ROCK, AND ROCK ANSWERS TO BOMBS.',
    ],
  },

  /** $18 — the lost woods route. */
  24: {
    pages: [
      'THE WOODS TURN YOU AROUND ON PURPOSE. WALK IT IN ORDER OR WALK IT FOREVER.',
      'GO NORTH, WEST, SOUTH, WEST TO PASS THROUGH THE FOREST.',
    ],
  },

  /** $1A — rich. */
  26: {
    pages: ['BOY! YOU ARE RICH! SPEND IT BEFORE A MOBLIN COUNTS IT FOR YOU.'],
  },

  /** $1C — general store fallback (see byCaveId for $1D / $1E). */
  28: {
    pages: [
      'BUY SOMETHIN\', WILL YA! I HAULED EVERY PIECE OF THIS DOWN HERE MYSELF.',
    ],
  },

  /** $1E — expensive store fallback (see byCaveId for $1F / $20). */
  30: {
    pages: [
      'BOY! THIS IS REALLY EXPENSIVE! I KNOW IT. YOU WILL PAY IT ANYWAY, BECAUSE THERE IS NOWHERE ELSE.',
    ],
  },

  /** $20 — take any one you want (heart container or red potion). */
  32: {
    pages: [
      'TWO GIFTS. ONE CHOICE. A HEART CONTAINER TO LENGTHEN YOUR LIFE, OR A RED POTION TO FILL IT ONCE.',
      'TAKE THE HEART. POTIONS CAN BE BOUGHT AGAIN. HEARTS CANNOT. TOUCH ONE AND THE OTHER IS GONE FOREVER.',
    ],
    repeatPages: [
      'YOU ALREADY CHOSE. THIS CAVE KEEPS NOTHING FOR A SECOND VISIT.',
    ],
  },

  /** $22 — it is a secret to everybody. */
  34: {
    pages: [
      'I NEVER SAW YOU. YOU NEVER SAW ME. IT IS A SECRET TO EVERYBODY.',
    ],
  },
};

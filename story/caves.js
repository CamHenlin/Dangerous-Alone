/**
 * Overworld cave dialogue.
 *
 * `byCaveId` wins over `byTextId`. Cave ids are $10–$23; text ids are the
 * ROM's PersonText offsets (see assets/extracted/tables/caves.json).
 *
 * Wording: "DUNGEON", never "LABYRINTH", and "PIECE OF THE TRIFORCE" rather
 * than shard, unit or relic.
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
  0x00: 'BOMBS OPEN WALLS A SWORD CANNOT',
  0x04: 'BAIT FEEDS THE HUNGRY MONSTER IN THE DOORWAY',
  0x06: 'A CANDLE LIGHTS UP A DARK ROOM',
  0x08: 'ARROWS NEED A BOW',
  0x12: 'A BLUE RING HALVES EVERY HIT YOU TAKE',
  0x19: 'A KEY OPENS A LOCKED DOOR',
  0x1c: 'A SHIELD BLOCKS FLYING ROCKS',
  0x22: 'A HEART REFILLS YOUR LIFE',
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
      'A SWORD OF WHITE STEEL SLEEPS IN THIS STONE. IT WAS CARRIED BY A KNIGHT WHO DID NOT COME HOME.',
      'IT IS TOO HEAVY FOR A BOY WHO STILL FLINCHES. GET STRONGER, AND YOU CAN HAVE THIS.',
      'COME BACK WHEN YOU HAVE 5 HEART CONTAINERS. THE SWORD COUNTS THEM. I DO NOT.',
    ],
    repeatPages: ['THE WHITE SWORD IS YOURS. CARRY IT BETTER THAN HE DID.'],
  },

  /** $13 — the magical sword, under a gravestone in the graveyard. */
  0x13: {
    pages: [
      'YOU MOVED MY HEADSTONE, BOY. GOOD. THE DEAD KEEP BETTER SECRETS THAN THE LIVING.',
      'THIS IS THE MAGICAL SWORD. IT WAS MADE TO KILL MONSTERS THAT NO ORDINARY SWORD CAN HURT. GANON IS ONE OF THOSE.',
      'IT ASKS A GREAT DEAL. 12 HEART CONTAINERS, AND NOT ONE LESS. COME BACK WITH THEM AND YOU CAN HAVE THIS.',
    ],
    repeatPages: ['THE MAGICAL SWORD IS YOURS. NOW GO AND FINISH WHAT THE KNIGHTS COULD NOT.'],
  },

  /**
   * $1B / $1C — the two "PAY ME AND I'LL TALK" sellers. One ROM string, two
   * caves, and they are the only overworld men who charge for what the old
   * men in the caves give away. Give them different subjects so paying twice
   * buys two different things.
   */
  0x1b: {
    pages: [
      'PAY ME AND I WILL TALK. I DEAL IN DOORS THAT ARE NOT DOORS YET.',
      'ROCK OPENS TO BOMBS. BUSHES AND TREES BURN. A BOULDER SITTING ALONE ON A ROAD CAN BE PUSHED, IF YOUR ARM IS STRONG ENOUGH.',
      'EVERY ONE OF THOSE IS HIDING SOMETHING SOMEWHERE IN HYRULE. CHOOSE ONE OF THE THREE PRICES. THE MORE YOU PAY, THE SURER I AM.',
    ],
  },
  0x1c: {
    pages: [
      'PAY ME AND I WILL TALK. I DEAL IN THE 8 DUNGEONS, AND IN WHAT IS WAITING AT THE BOTTOM OF EACH.',
      'THEY ARE NOT IN ORDER OF DIFFICULTY. THEY ARE IN ORDER OF WHAT YOU WILL BE CARRYING WHEN YOU GET THERE.',
      'THE THIRD KEEPS THE RAFT, AND THE FOURTH CANNOT BE REACHED WITHOUT IT. THE FIFTH KEEPS THE RECORDER, AND THE SEVENTH HAS NO DOOR WITHOUT IT.',
    ],
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
      'I WILL NOT PRETEND IT IS FAIR. I WILL SAY THAT EVERY MAN WHO WALKED PAST IT TO SAVE THE MONEY IS DEAD.',
    ],
  },

  /**
   * $21 / $22 / $23 — the three Moblin caves. One ROM string covers all of
   * them, but they hold 30, 100 and 10 rupees, and a bribe that size says
   * something different each time.
   */
  0x21: {
    pages: [
      'IN HERE, BOY. QUICKLY. I AM NOT SUPPOSED TO BE TALKING TO YOU AND YOU ARE NOT SUPPOSED TO BE ALIVE.',
      'TAKE THE MONEY. GANON PAYS US IN FEAR AND I HAVE BEEN PAID ENOUGH OF IT.',
      'I NEVER SAW YOU. YOU NEVER SAW ME. IT IS A SECRET TO EVERYBODY.',
    ],
    repeatPages: ['GO. YOU HAVE HAD WHAT I HAD. IT IS STILL A SECRET TO EVERYBODY.'],
  },
  0x22: {
    pages: [
      'DO NOT SWING. LOOK AT THE PILE, NOT AT ME. THAT IS A WHOLE YEAR OF MY PAY SITTING ON THE FLOOR.',
      'THERE WERE FOUR OF US ON THIS ROAD. THE OTHER THREE STILL BELIEVE HIM. I HAVE HAD LONGER TO WATCH.',
      'TAKE IT AND GO NORTH AND DO NOT SAY WHERE IT CAME FROM. IT IS A SECRET TO EVERYBODY.',
    ],
    repeatPages: ['I HAVE NOTHING ELSE. GO AND SPEND IT, AND KEEP MY NAME OUT OF IT.'],
  },
  0x23: {
    pages: [
      'IT IS TEN RUPEES. I KNOW WHAT IT IS. IT IS EVERYTHING I HAVE AND I AM GIVING IT TO A BOY WITH A SWORD.',
      'THAT IS HOW BADLY THINGS ARE GOING FOR US. IT IS A SECRET TO EVERYBODY.',
    ],
    repeatPages: ['NOTHING LEFT. I TOLD YOU IT WAS EVERYTHING.'],
  },
};

/** Keyed by ROM text id. */
export const byTextId = {
  /** $00 — the first cave. Wooden sword, and the whole reason for the quest. */
  0: {
    pages: [
      'IT IS DANGEROUS TO GO ALONE. THE ROADS ABOVE BELONG TO GANON NOW.',
      'HE CAME OUT OF THE DESERT WITH AN ARMY AND TOOK THE TRIFORCE OF POWER FROM OUR KING.',
      'PRINCESS ZELDA WOULD NOT LET HIM HAVE THE OTHER HALF. SHE BROKE THE TRIFORCE OF WISDOM INTO 8 PIECES.',
      'SHE HID THE 8 PIECES IN 8 DUNGEONS AND SENT HER NURSE IMPA TO FIND A HERO. GANON TOOK ZELDA PRISONER FOR IT.',
      'FIND ALL 8 PIECES AND THE TRIFORCE OF WISDOM IS WHOLE. ONLY THEN WILL DEATH MOUNTAIN LET YOU IN.',
      'THE OLD MEN OF HYRULE WENT UNDERGROUND THE WEEK THE ARMY CAME. WE ARE STILL DOWN HERE, AND WE STILL KNOW THINGS.',
      'FIND US. WE SIT IN CAVES AND UNDER GRAVESTONES AND BEHIND WATERFALLS, AND WE HAVE NOTHING LEFT TO GIVE BUT DIRECTIONS.',
      'THE FIRST DUNGEON LIES NORTH. TAKE THIS SWORD. IT IS ONLY WOOD, BUT IT IS SHARP, AND IT IS YOURS.',
    ],
    repeatPages: [
      'THE SWORD IS YOURS, BOY. THE REST OF HYRULE IS NOT. GO AND TAKE IT BACK.',
    ],
  },

  /** $02 — generic "master using it" (see byCaveId for the two sword caves). */
  2: {
    pages: [
      'MASTER THE SWORD YOU CARRY, AND YOU CAN HAVE THIS ONE.',
      'A SWORD IS NOT A GIFT. IT IS A PROMISE, AND EVERY MAN WHO CARRIED THIS ONE BEFORE YOU DIED KEEPING IT.',
    ],
  },

  /** $04 — take any road. */
  4: {
    pages: [
      'FOUR ROADS LEAVE THIS ROOM AND NOT ONE OF THEM IS WATCHED. THE MOBLINS NEVER LEARNED TO COUNT PAST THREE.',
      'WE DUG THESE WHEN THE ARMY TOOK THE ROADS ABOVE. HALF OF HYRULE IS UNDER HYRULE NOW.',
      'TAKE ANY ROAD YOU WANT. THEY ALL COME OUT SOMEWHERE WORTH BEING, AND NONE OF THEM COMES OUT WHERE YOU WENT IN.',
    ],
  },

  /** $06 — the dead end tree. */
  6: {
    pages: [
      'THE FOREST KEEPS ITS OWN SECRETS, AND IT DOES NOT LIKE FIRE. THAT IS EXACTLY WHY FIRE IS THE ANSWER.',
      'WHERE THE PATH STOPS DEAD, BURN THE TREE THAT STANDS ALONE. A SECRET IS IN THE TREE AT THE DEAD END.',
      'ONE OF THE 8 DUNGEONS HAS NO DOOR AT ALL UNTIL SOMEBODY BURNS ITS TREE. NOBODY WILL EVER TELL YOU WHICH TREE.',
    ],
  },

  /** $08 — money making game. */
  8: {
    pages: [
      'LET US PLAY THE MONEY MAKING GAME. THREE DOORS, ONE PURSE, NO PROMISES.',
      'GANON PAYS HIS SOLDIERS IN FEAR. I PREFER RUPEES. IT IS THE ONLY HONEST THING LEFT ABOVE GROUND AND IT IS NOT VERY HONEST.',
      'STEP UP AND CHOOSE. THE ODDS ARE MINE AND THE LOSSES ARE YOURS, AND I HAVE NEVER PRETENDED OTHERWISE.',
    ],
  },

  /** $0A — door repair charge. */
  10: {
    pages: [
      'YOU CAME THROUGH MY DOOR WITH A BOMB, BOY. THAT DOOR WAS THE ONLY THING BETWEEN ME AND THE DARK.',
      'I AM NOT ANGRY. EVERYONE WHO GETS THIS FAR IS BOMBING WALLS BY NOW. BUT SOMEBODY HAS TO HANG A NEW ONE.',
      'PAY ME FOR THE DOOR REPAIR CHARGE AND WE WILL SAY NO MORE ABOUT IT.',
    ],
  },

  /** $0C — the letter for the old woman. */
  12: {
    pages: [
      'I CANNOT WALK THE ROADS ANY MORE, BUT I CAN STILL WRITE. TAKE THIS LETTER.',
      'SHOW IT TO THE OLD WOMAN WHO KEEPS THE MEDICINE SHOP. SHE WILL NOT SELL TO A STRANGER, BUT SHE OWES ME A FAVOUR.',
      'HER MEDICINE HAS CARRIED BETTER MEN OUT OF WORSE DUNGEONS THAN YOURS. HOLD THE LETTER UP WITH THE B BUTTON AND SHE WILL READ IT.',
      'AND WHEN SHE ASKS AFTER ME, TELL HER I AM WELL. IT WILL NOT BE TRUE AND SHE WILL NOT BELIEVE IT, BUT TELL HER ANYWAY.',
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
      'HE WILL WANT 12 HEART CONTAINERS AND HE WILL NOT TAKE ONE LESS. COLLECT MORE HEARTS BEFORE YOU GO AND SEE HIM.',
    ],
    marks: [{ caveId: 0x13, clears: 'magicSword', label: 'THE GRAVE' }],
  },

  /** $10 — the medicine shop. */
  16: {
    // Spoken while the shelf is still locked (letter not shown yet).
    lockedPages: [
      'I KEEP MEDICINE, BUT NOT FOR STRANGERS. BRING ME A LETTER FROM THE OLD MAN WHO STILL WRITES, AND I WILL OPEN THE SHELF.',
      'DO NOT LOOK AT ME LIKE THAT. THE LAST BOY WHO CAME IN HERE WITHOUT ONE WAS WEARING A MOBLIN\'S BOOTS.',
    ],
    pages: [
      'MEDICINE, DEARIE. BUY MEDICINE BEFORE YOU GO. THE DUNGEONS DO NOT SELL IT AND THE MONSTERS DO NOT SHARE.',
      'A BLUE POTION FILLS YOUR HEARTS ONCE. A RED ONE FILLS THEM TWICE. I DO NOT REFILL THEM AND I DO NOT GIVE CREDIT.',
      'IT DRINKS ITSELF WHEN YOUR LAST HEART GOES, SO YOU WILL NOT HAVE TO REMEMBER IT. THAT IS THE POINT OF IT.',
    ],
  },

  /**
   * $12 — pay me and I will talk. Caves $1B and $1C both use this string; the
   * two entries in `byCaveId` give each seller his own subject.
   */
  18: {
    pages: [
      'PAY ME AND I WILL TALK. I HAVE SAT UNDER THIS HILL SINCE THE ARMY CAME AND I HAVE HEARD EVERYTHING.',
      'CHOOSE ONE OF THE THREE PRICES. SOME OF WHAT I KNOW IS WORTH MORE THAN THE REST.',
    ],
  },

  /** $14 — not enough money to talk. */
  20: {
    pages: [
      'THIS AIN\'T ENOUGH TO TALK. COME BACK WITH A HEAVIER PURSE.',
      'THERE ARE RUPEES IN THE GRASS AND RUPEES UNDER THE MOBLINS AND A MAN DOWN THE ROAD RUNNING A GAME HE ALWAYS WINS. GO EARN IT.',
    ],
  },

  /** $16 — up the mountain. */
  22: {
    pages: [
      'GO UP! UP! THE MOUNTAIN AHEAD. THE STAIRS YOU WANT ARE BEHIND ROCK, AND ROCK OPENS TO BOMBS.',
      'THAT IS THE RULE FOR THE WHOLE RANGE. IF A CLIFF FACE IS GREY AND FLAT AND GOES NOWHERE, IT IS A DOOR SOMEBODY FILLED IN.',
    ],
  },

  /** $18 — the lost woods route. */
  24: {
    pages: [
      'THE WOODS TURN YOU AROUND ON PURPOSE. THEY WERE DOING IT LONG BEFORE GANON AND THEY WILL DO IT LONG AFTER.',
      'GO NORTH, WEST, SOUTH, WEST TO PASS THROUGH THE FOREST. IN THAT ORDER, WITHOUT DOUBLING BACK.',
      'GET IT WRONG AND THE TREES PUT YOU BACK WHERE YOU STARTED. THEY DO NOT KILL YOU. THEY JUST WILL NOT LET YOU LEAVE.',
    ],
  },

  /** $1A — rich. */
  26: {
    pages: [
      'BOY! YOU ARE RICH! SPEND IT BEFORE A MOBLIN COUNTS IT FOR YOU.',
      'A FULL PURSE BUYS ARROWS, A RING, A BIGGER BOMB BAG AND A SECOND POTION. A FULL PURSE IN A GRAVE BUYS NOTHING.',
    ],
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
      'TWO GIFTS. ONE CHOICE. A HEART CONTAINER TO MAKE YOUR LIFE LONGER, OR A RED POTION TO FILL IT UP ONCE.',
      'TAKE THE HEART. POTIONS CAN BE BOUGHT AGAIN. HEARTS CANNOT. TOUCH ONE AND THE OTHER IS GONE FOREVER.',
      'AND THE MEN WHO KEEP THE BETTER SWORDS COUNT HEARTS BEFORE THEY COUNT ANYTHING ELSE. THAT IS NOT AN ACCIDENT.',
    ],
    repeatPages: [
      'YOU ALREADY CHOSE. THIS CAVE KEEPS NOTHING FOR A SECOND VISIT.',
    ],
  },

  /** $22 — it is a secret to everybody (see byCaveId for the three Moblins). */
  34: {
    pages: [
      'I NEVER SAW YOU. YOU NEVER SAW ME. IT IS A SECRET TO EVERYBODY.',
    ],
  },
};

/**
 * What an item means, said once, the first time Link holds it over his head.
 *
 * Keyed by the ROM's `Item_codes` (the same numbers `grantRoomItem` switches
 * on and `ITEM` in tools/shared/caves.js names), so one entry covers a
 * dungeon floor, a cave gift and a shop purchase alike.
 *
 * These fire once per save. `firstPages` is the ceremony; there is no repeat
 * form, because a second bow is not a story beat.
 *
 * Say plainly what the thing does before saying anything clever about it —
 * this is the only time the game explains the item at all.
 *
 * Entries may carry `marks`, which drop a hint pin on the overworld radar the
 * moment the item makes a new place reachable — see `CLEAR_CONDITIONS` in
 * tools/shared/mapMarks.js for the names that retire them.
 *
 * See ./README.md for the entry shape and the charset rules.
 */

/**
 * Items worth stopping the game for. Anything absent — keys, rupees, bomb
 * refills, a second heart — passes silently, the way it always has.
 *
 * @type {Record<number, { pages: string[], marks?: object[] }>}
 */
export const ITEMS = {
  // --- Blades ---------------------------------------------------------------

  /** $01 wooden sword — the first cave. */
  0x01: {
    pages: [
      'A WOODEN SWORD. NOTHING MAGIC ABOUT IT. SOMEBODY CUT IT, SANDED IT AND LEFT IT WHERE A BOY WOULD FIND IT.',
      'WHILE ALL YOUR HEARTS ARE FULL IT THROWS A BEAM ACROSS THE ROOM. LOSE ONE HEART AND IT IS ONLY WOOD AGAIN.',
    ],
  },

  /** $02 white sword. */
  0x02: {
    pages: [
      'THE WHITE SWORD COMES OUT OF THE STONE EASILY, NOW THAT IT HAS DECIDED TO. IT IS HEAVIER, AND IT CUTS TWICE AS DEEP.',
      'THE KNIGHT WHO CARRIED IT DIED SOMEWHERE ON THE ROAD TO DEATH MOUNTAIN. YOU ARE WALKING THE SAME ROAD WITH HIS SWORD.',
    ],
  },

  /** $03 magical sword. */
  0x03: {
    pages: [
      'THE MAGICAL SWORD IS COLD ALL THE WAY DOWN THE HANDLE, AND IT CUTS TWICE AS DEEP AGAIN AS THE WHITE ONE.',
      'IT WAS MADE TO KILL MONSTERS THAT ORDINARY SWORDS CANNOT HURT. GANON IS ONE OF THOSE, AND HE IS WAITING IN THE MOUNTAIN.',
    ],
  },

  // --- The bow line ---------------------------------------------------------

  /** $0A bow. */
  0x0a: {
    pages: [
      'THE BOW. IT IS TALLER THAN YOU ARE AND HARD WORK TO PULL, BUT IT HITS THINGS ON THE FAR SIDE OF A ROOM.',
      'IT HAS NO ARROWS OF ITS OWN. BUY THEM FROM A MERCHANT, AND KNOW THAT EVERY SHOT COSTS ONE RUPEE OUT OF YOUR PURSE.',
      'SOME MONSTERS CANNOT BE CUT WITH A SWORD AT ALL. THEY CAN ONLY BE SHOT.',
    ],
  },

  /** $08 wooden arrows. */
  0x08: {
    pages: [
      'WOODEN ARROWS. EVERY ARROW YOU SHOOT COSTS ONE RUPEE, SO AN EMPTY PURSE MEANS AN EMPTY BOW.',
      'KEEP RUPEES ON YOU BEFORE ANY FIGHT THAT NEEDS SHOOTING.',
    ],
  },

  /** $09 silver arrows — the only thing that finishes Ganon. */
  0x09: {
    pages: [
      'THE SILVER ARROW. ONE ARROW, HIDDEN IN THE DEEPEST ROOM OF GANON\'S OWN MOUNTAIN.',
      'HE PUT IT THERE HIMSELF. HE COULD NOT DESTROY IT AND HE COULD NOT BEAR TO LEAVE IT WHERE ANYONE MIGHT FIND IT.',
      'CUT AT GANON UNTIL HE FLICKERS AND HOLDS STILL. THEN SHOOT THIS. NOTHING ELSE IN HYRULE CAN KILL HIM.',
    ],
  },

  // --- Light and fire -------------------------------------------------------

  /** $06 blue candle. */
  0x06: {
    pages: [
      'A BLUE CANDLE. IT LIGHTS ONE FLAME PER ROOM AND NOT A SPARK MORE, SO SPEND IT WHERE IT COUNTS.',
      'IT LIGHTS UP A DARK DUNGEON ROOM, IT BURNS THE BUSHES THAT HIDE STAIRS, AND IT HURTS WHATEVER IS STANDING IN THE FLAME.',
    ],
  },

  /** $07 red candle. */
  0x07: {
    pages: [
      'THE RED CANDLE NEVER RUNS OUT. LIGHT IT AGAIN AND AGAIN IN THE SAME ROOM AND IT KEEPS ANSWERING.',
      'NOW YOU CAN BURN EVERY BUSH AND EVERY LONE TREE IN HYRULE. ONE OF THEM IS HIDING THE 8TH DUNGEON.',
    ],
  },

  // --- Ways past water ------------------------------------------------------

  /** $0C raft. */
  0x0c: {
    pages: [
      'THE RAFT. LASHED TIMBER, NO OARS, NO SAIL. IT ONLY GOES ONE WAY, STRAIGHT OUT AND STRAIGHT BACK AGAIN.',
      'STAND ON A DOCK AND IT CARRIES YOU ACROSS. TWO DOCKS IN HYRULE MATTER. ONE OF THEM ENDS AT THE DUNGEON ON THE ISLAND.',
    ],
  },

  /** $0D stepladder. */
  0x0d: {
    pages: [
      'THE STEPLADDER. IT LAYS ITSELF DOWN OVER ONE SQUARE OF WATER AND PICKS ITSELF UP BEHIND YOU.',
      'ONE SQUARE IS ENOUGH. MOST OF THE STREAMS THAT TURNED YOU BACK ARE THAT NARROW, ABOVE GROUND AND IN THE DUNGEONS TOO.',
    ],
  },

  // --- Sound and magic ------------------------------------------------------

  /** $05 recorder. */
  0x05: {
    pages: [
      'THE RECORDER. A LITTLE SILVER FLUTE, AND THE NOTE IT PLAYS IS OLDER THAN THE DUNGEONS.',
      'DIGDOGGER CANNOT STAND THAT NOTE AND FALLS APART WHEN IT HEARS IT. THAT IS THE SMALLEST THING THIS FLUTE DOES.',
      'PLAY IT OUT UNDER THE SKY AND A WHIRLWIND CARRIES YOU TO A DUNGEON YOU HAVE ALREADY OPENED. PLAY IT AT STILL WATER AND THE WATER DRAINS AWAY.',
    ],
  },

  /** $10 magical rod. */
  0x10: {
    pages: [
      'THE MAGICAL ROD. IT THROWS THE SAME BEAM A FULL-HEALTH SWORD THROWS, EXCEPT IT DOES NOT CARE HOW HURT YOU ARE.',
      'THAT IS THE WHOLE TRICK. THE ROOMS THAT USED TO KILL YOU WERE THE ONES WHERE YOUR SWORD HAD STOPPED THROWING BEAMS.',
    ],
  },

  /** $11 book of magic. */
  0x11: {
    pages: [
      'THE BOOK OF MAGIC. THE PAGES ARE BURNT AT THE EDGES AND THE INK HAS NOT DRIED IN A HUNDRED YEARS.',
      'CARRY IT AND THE ROD STOPS THROWING LIGHT AND STARTS THROWING FIRE. IT IS THE STRONGEST THING YOU WILL EVER HOLD.',
    ],
  },

  // --- Locks and armour -----------------------------------------------------

  /** $0B magical key. */
  0x0b: {
    pages: [
      'THE MAGICAL KEY. A PLAIN LITTLE KEY WITH ALMOST NO TEETH, AND EVERY LOCK IN HYRULE OPENS FOR IT ANYWAY.',
      'IT IS NEVER USED UP. YOU WILL NEVER STAND IN FRONT OF A LOCKED DOOR COUNTING KEYS AGAIN.',
    ],
  },

  /** $12 blue ring. */
  0x12: {
    pages: [
      'THE BLUE RING. IT SITS COOL ON YOUR FINGER AND YOUR TUNIC TURNS THE COLOUR OF DEEP WATER.',
      'FROM NOW ON EVERY HIT YOU TAKE DOES HALF THE DAMAGE. IT IS THE CHEAPEST LIFE YOU WILL EVER BUY.',
    ],
  },

  /** $13 red ring. */
  0x13: {
    pages: [
      'THE RED RING. GANON KEPT IT INSIDE HIS OWN MOUNTAIN, WHICH TELLS YOU WHAT IT IS WORTH.',
      'EVERY HIT YOU TAKE NOW DOES A QUARTER OF THE DAMAGE. WHAT USED TO COST YOU HALF YOUR HEARTS WILL BARELY MARK YOU.',
    ],
  },

  /** $1C magical shield. */
  0x1c: {
    pages: [
      'THE MAGICAL SHIELD. IT BLOCKS THE ROCKS THE MOUNTAIN THROWS, AND FIREBALLS, AND THE MAGIC THE WIZZROBES THROW.',
      'HOLD IT TOWARDS WHAT IS COMING. AND KEEP AWAY FROM LIKE LIKES. THEY SWALLOW SHIELDS AND THEY DO NOT GIVE THEM BACK.',
    ],
  },

  /** $14 power bracelet. */
  0x14: {
    pages: [
      'THE POWER BRACELET WAS UNDER A STATUE THAT WANTED TO KEEP IT. NOW THE BIG STONES OF HYRULE WEIGH WHAT PEBBLES WEIGH.',
      'THE BOULDERS SITTING ALONE ON THE MOUNTAIN ROADS CAN BE PUSHED ASIDE NOW. SOME OF THEM HAVE BEEN SITTING ON STAIRCASES.',
    ],
  },

  // --- Thrown things --------------------------------------------------------

  /** $1D boomerang. */
  0x1d: {
    pages: [
      'THE BOOMERANG. IT WILL NOT KILL MUCH, BUT IT STUNS WHAT IT TOUCHES AND DRAGS BACK ANYTHING LOOSE ON THE FLOOR.',
      'A STUNNED MONSTER IS ONE YOU CAN WALK PAST. IN A CROWDED ROOM THAT IS WORTH MORE THAN DAMAGE.',
    ],
  },

  /** $1E magical boomerang. */
  0x1e: {
    pages: [
      'THE MAGICAL BOOMERANG GOES THE WHOLE LENGTH OF A ROOM AND STILL COMES HOME.',
      'STUN THE FAR HALF OF A ROOM, THEN WALK IN AND FINISH IT. THE WOODEN ONE COULD NEVER REACH THAT FAR.',
    ],
  },

  // --- Small mercies --------------------------------------------------------

  /** $04 bait. */
  0x04: {
    pages: [
      'MONSTER BAIT. IT SMELLS AWFUL, AND THERE IS A HUNGRY GORIYA UNDER ONE OF THE DUNGEONS WHO WILL LOVE IT.',
      'HE IS SITTING IN A DOORWAY AND HE WILL NOT MOVE FOR A SWORD. DROP THIS AND HE FORGETS YOU ENTIRELY.',
    ],
  },

  /** $15 letter. */
  0x15: {
    pages: [
      'THE LETTER. TWO LINES IN A SHAKY HAND, SEALED WITH A THUMBPRINT BECAUSE HE HAS NO RING LEFT TO SEAL IT WITH.',
      'THE OLD WOMAN WHO KEEPS THE MEDICINE SHOP WILL READ IT AND OPEN HER SHELF. SHOW IT TO HER WITH THE B BUTTON.',
    ],
    marks: [{ screen: 0x0d, clears: 'potionShopOpen', label: 'MEDICINE SHOP' }],
  },

  /** $1A heart container. */
  0x1a: {
    pages: [
      'A HEART CONTAINER. IT ADDS ONE MORE HEART TO YOUR LIFE, FOR GOOD. IT DOES NOT JUST FILL YOU UP, IT MAKES YOU BIGGER.',
      'THE OLD MEN WITH THE BETTER SWORDS COUNT YOUR HEARTS BEFORE THEY COUNT ANYTHING ELSE ABOUT YOU.',
    ],
  },

  /** $17 map — said once, for the first dungeon that has one. */
  0x17: {
    pages: [
      'THE MAP OF THIS DUNGEON. EVERY ROOM, DRAWN BY SOMEBODY WHO GOT BACK OUT AGAIN.',
      'IT WILL NOT SHOW YOU THE DOORS AND IT WILL NOT SHOW YOU WHAT IS ALIVE IN THERE. IT ONLY SHOWS YOU THE SHAPE.',
    ],
  },

  /** $16 compass — likewise. */
  0x16: {
    pages: [
      'THE COMPASS. IT DOES NOT POINT NORTH. IT POINTS AT THE PIECE OF THE TRIFORCE HIDDEN IN THIS DUNGEON.',
      'FROM NOW ON, IN THIS PLACE, YOU KNOW WHICH ROOM THE FIGHT IS IN.',
    ],
  },
};

export default ITEMS;

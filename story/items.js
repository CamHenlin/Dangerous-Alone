/**
 * What an item means, said once, the first time Link holds it over his head.
 *
 * Keyed by the ROM's `Item_codes` (the same numbers `grantRoomItem` switches
 * on and `ITEM` in tools/shared/caves.js names), so one entry covers a
 * labyrinth floor, a cave gift and a shop purchase alike.
 *
 * These fire once per save. `firstPages` is the ceremony; there is no repeat
 * form, because a second bow is not a story beat.
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
      'A WOODEN SWORD. NOT AN HEIRLOOM, NOT A RELIC. SOMEBODY CUT IT, SANDED IT AND LEFT IT WHERE A BOY WOULD FIND IT.',
      'HOLD IT AT FULL HEALTH AND IT THROWS ITS OWN EDGE ACROSS THE ROOM. LOSE A HEART AND IT IS ONLY WOOD AGAIN.',
    ],
  },

  /** $02 white sword. */
  0x02: {
    pages: [
      'THE WHITE SWORD COMES OUT OF THE STONE EASILY, NOW THAT IT HAS DECIDED TO. IT IS TWICE THE WEIGHT AND TWICE THE BITE.',
      'THE KNIGHT WHO CARRIED IT DIED SOMEWHERE ON THE ROAD TO DEATH MOUNTAIN. YOU ARE WALKING THE SAME ROAD WITH HIS SWORD.',
    ],
  },

  /** $03 magical sword. */
  0x03: {
    pages: [
      'THE MAGICAL SWORD IS COLD ALL THE WAY DOWN THE HILT. NOTHING IN HYRULE IS BUILT TO STOP IT.',
      'IT WAS FORGED FOR THINGS THAT ARE NOT QUITE ALIVE. THERE IS EXACTLY ONE OF THOSE LEFT, AND HE IS WAITING IN THE MOUNTAIN.',
    ],
  },

  // --- The bow line ---------------------------------------------------------

  /** $0A bow. */
  0x0a: {
    pages: [
      'THE BOW. IT IS TALLER THAN YOU ARE AND THE PULL IS HONEST WORK, BUT IT PUTS A POINT ON THE FAR SIDE OF A ROOM.',
      'IT HAS NO ARROWS OF ITS OWN. BUY THEM FROM A MERCHANT, AND KNOW THAT EVERY SHOT SPENDS A RUPEE OUT OF YOUR PURSE.',
      'SOME THINGS DOWN HERE CANNOT BE CUT. GOHMA IS ONE ARMOURED EYE, AND GANON HAS NO EDGES AT ALL. BOTH ANSWER TO ARROWS.',
    ],
  },

  /** $08 wooden arrows. */
  0x08: {
    pages: [
      'WOODEN ARROWS. THEY DRAW FROM YOUR PURSE INSTEAD OF A QUIVER, SO A POOR HERO IS AN UNARMED ONE.',
      'KEEP RUPEES ON YOU BEFORE ANY FIGHT THAT NEEDS SHOOTING. THE EYE OF GOHMA DOES NOT WAIT WHILE YOU GO EARN MORE.',
    ],
  },

  /** $09 silver arrows — the only thing that finishes Ganon. */
  0x09: {
    pages: [
      'THE SILVER ARROW. ONE SHAFT, BRIGHT AS A NAIL PARING, HIDDEN IN THE DEEPEST ROOM OF GANON\'S OWN MOUNTAIN.',
      'HE PUT IT THERE HIMSELF. HE COULD NOT DESTROY IT AND HE COULD NOT BEAR TO LEAVE IT ABOVE GROUND, SO HE SAT ON IT.',
      'CUT AT HIM UNTIL HE FLICKERS AND HOLDS STILL. THEN LOOSE THIS. NOTHING ELSE IN HYRULE WILL END HIM.',
    ],
  },

  // --- Light and fire -------------------------------------------------------

  /** $06 blue candle. */
  0x06: {
    pages: [
      'A BLUE CANDLE. ONE FLAME PER ROOM AND NOT A SPARK MORE, SO SPEND IT WHERE IT COUNTS.',
      'IT SHOWS YOU A DARK LABYRINTH, IT BURNS THE BUSHES THAT HIDE STAIRS, AND IT HURTS WHATEVER IS STANDING IN THE FIRE.',
    ],
  },

  /** $07 red candle. */
  0x07: {
    pages: [
      'THE RED CANDLE NEVER RUNS DRY. LIGHT IT AGAIN AND AGAIN IN THE SAME ROOM AND IT KEEPS ANSWERING.',
      'EVERY TREE AND BUSH IN HYRULE IS NOW A QUESTION YOU CAN ASK. ONE OF THEM IS HIDING THE EIGHTH LABYRINTH.',
    ],
  },

  // --- Ways past water ------------------------------------------------------

  /** $0C raft. */
  0x0c: {
    pages: [
      'THE RAFT. LASHED TIMBER, NO OARS, NO SAIL. IT GOES WHERE THE WATER ALREADY WANTED TO GO AND IT WILL NOT BE ARGUED WITH.',
      'STAND ON A DOCK AND IT CARRIES YOU. THERE ARE TWO DOCKS IN HYRULE THAT MATTER. ONE OF THEM ENDS AT THE ISLAND LABYRINTH.',
    ],
  },

  /** $0D stepladder. */
  0x0d: {
    pages: [
      'THE STEPLADDER. IT LAYS ITSELF DOWN OVER ONE TILE OF WATER AND PICKS ITSELF UP BEHIND YOU.',
      'ONE TILE IS ENOUGH. HALF THE STREAMS THAT TURNED YOU BACK ARE ONE TILE WIDE, ABOVE GROUND AND BELOW IT BOTH.',
    ],
  },

  // --- Sound and magic ------------------------------------------------------

  /** $05 recorder. */
  0x05: {
    pages: [
      'THE RECORDER. A SPLIT REED IN A SILVER SLEEVE, AND THE NOTE IT MAKES IS OLDER THAN THE LABYRINTHS.',
      'DIGDOGGER CANNOT STAND IT AND COMES APART WHEN IT HEARS IT. THAT IS THE SMALLEST THING THIS REED DOES.',
      'PLAY IT UNDER OPEN SKY AND A WHIRLWIND CARRIES YOU TO A LABYRINTH YOU HAVE ALREADY OPENED. PLAY IT AT STILL WATER AND THE WATER LEAVES.',
    ],
  },

  /** $10 magical rod. */
  0x10: {
    pages: [
      'THE MAGICAL ROD. IT THROWS THE SAME BEAM A FULL-HEALTH SWORD THROWS, EXCEPT IT DOES NOT CARE HOW HURT YOU ARE.',
      'THAT IS THE WHOLE TRICK. THE ROOMS THAT USED TO KILL YOU WERE THE ONES WHERE YOU HAD LOST YOUR REACH.',
    ],
  },

  /** $11 book of magic. */
  0x11: {
    pages: [
      'THE BOOK OF MAGIC. THE PAGES ARE BURNT AT THE EDGES AND THE INK STILL MOVES IF YOU LOOK AT IT SIDEWAYS.',
      'CARRY IT AND THE ROD STOPS THROWING LIGHT AND STARTS THROWING FIRE. IT IS THE STRONGEST THING YOU WILL EVER HOLD.',
    ],
  },

  // --- Locks and armour -----------------------------------------------------

  /** $0B magical key. */
  0x0b: {
    pages: [
      'THE MAGICAL KEY. IT HAS NO WARDS AND NO TEETH WORTH THE NAME, AND EVERY LOCK IN HYRULE OPENS FOR IT ANYWAY.',
      'IT IS NEVER SPENT. YOU WILL NEVER STAND IN FRONT OF A LOCKED DOOR COUNTING KEYS AGAIN.',
    ],
  },

  /** $12 blue ring. */
  0x12: {
    pages: [
      'THE BLUE RING. IT SITS COOL ON THE FINGER AND YOUR TUNIC GOES THE COLOUR OF DEEP WATER.',
      'EVERY WOUND YOU TAKE FROM NOW ON IS HALF THE WOUND IT WOULD HAVE BEEN. IT IS THE CHEAPEST LIFE YOU WILL EVER BUY.',
    ],
  },

  /** $13 red ring. */
  0x13: {
    pages: [
      'THE RED RING. THE LAST LABYRINTH KEPT IT, WHICH TELLS YOU WHAT IT IS WORTH.',
      'A QUARTER OF EVERY WOUND. THE THINGS THAT USED TO TAKE HALF YOUR HEARTS WILL BARELY MARK YOU NOW.',
    ],
  },

  /** $1C magical shield. */
  0x1c: {
    pages: [
      'THE MAGICAL SHIELD. IT TURNS THE ROCKS THE MOUNTAIN THROWS, AND THE FIREBALLS, AND THE THINGS THE WIZZROBES SPIT.',
      'HOLD IT TOWARDS WHAT IS COMING. AND KEEP IT AWAY FROM LIKE LIKES, WHICH EAT SHIELDS AND ARE NOT SORRY.',
    ],
  },

  /** $14 power bracelet. */
  0x14: {
    pages: [
      'THE POWER BRACELET WAS UNDER A STATUE THAT WANTED TO KEEP IT. NOW THE STONES OF HYRULE WEIGH WHAT PEBBLES WEIGH.',
      'THE BOULDERS SITTING ALONE ON THE MOUNTAIN ROADS CAN BE PUSHED ASIDE. SOME OF THEM HAVE BEEN SITTING ON STAIRCASES.',
    ],
  },

  // --- Thrown things --------------------------------------------------------

  /** $1D boomerang. */
  0x1d: {
    pages: [
      'THE BOOMERANG. IT WILL NOT KILL MUCH, BUT IT STUNS WHAT IT TOUCHES AND DRAGS BACK ANYTHING LOOSE ON THE FLOOR.',
      'A STUNNED THING IS A THING YOU CAN WALK PAST. THAT IS WORTH MORE THAN DAMAGE IN A CROWDED ROOM.',
    ],
  },

  /** $1E magical boomerang. */
  0x1e: {
    pages: [
      'THE MAGICAL BOOMERANG GOES THE WHOLE LENGTH OF A ROOM AND STILL COMES HOME.',
      'FREEZE THE FAR HALF OF A ROOM, THEN WALK IN AND FINISH IT. THE WOODEN ONE COULD NEVER REACH THAT FAR.',
    ],
  },

  // --- Small mercies --------------------------------------------------------

  /** $04 bait. */
  0x04: {
    pages: [
      'MONSTER BAIT. IT SMELLS LIKE SOMETHING THAT DIED OWING MONEY, AND THERE IS A GORIYA UNDER A LABYRINTH WHO WILL LOVE IT.',
      'HE IS SITTING IN A DOORWAY AND HE WILL NOT MOVE FOR A SWORD. DROP THIS AND HE FORGETS YOU ENTIRELY.',
    ],
  },

  /** $15 letter. */
  0x15: {
    pages: [
      'THE LETTER. TWO LINES IN A SHAKING HAND AND A SEAL PRESSED WITH A THUMB, BECAUSE HE HAS NO RING LEFT TO PRESS IT WITH.',
      'THE OLD WOMAN WHO KEEPS THE MEDICINE SHOP WILL READ IT AND OPEN HER SHELF. SHOW IT TO HER WITH THE B BUTTON.',
    ],
    marks: [{ screen: 0x0d, clears: 'potionShopOpen', label: 'MEDICINE SHOP' }],
  },

  /** $1A heart container. */
  0x1a: {
    pages: [
      'A HEART CONTAINER. IT DOES NOT HEAL YOU. IT MAKES THERE BE MORE OF YOU TO HEAL.',
      'THE OLD MEN WITH THE BETTER BLADES COUNT THESE BEFORE THEY COUNT ANYTHING ELSE ABOUT YOU.',
    ],
  },

  /** $17 map — said once, for the first labyrinth that has one. */
  0x17: {
    pages: [
      'THE MAP OF THIS LABYRINTH. EVERY ROOM, DRAWN BY SOMEBODY WHO GOT OUT AGAIN.',
      'IT WILL NOT SHOW YOU DOORS AND IT WILL NOT SHOW YOU WHAT IS ALIVE IN THERE. IT ONLY SHOWS YOU THE SHAPE.',
    ],
  },

  /** $16 compass — likewise. */
  0x16: {
    pages: [
      'THE COMPASS. IT DOES NOT POINT NORTH. IT POINTS AT THE TRIFORCE SHARD, AND IT HAS NEVER BEEN WRONG.',
      'FROM NOW ON, IN THIS PLACE, YOU KNOW WHICH ROOM THE FIGHT IS IN.',
    ],
  },
};

export default ITEMS;

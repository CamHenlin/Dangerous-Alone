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
 * The tables make each text look shared, but the levels only ever spawn one
 * person type each, so in practice almost every id belongs to exactly one
 * labyrinth. Resolving the actual spawns for quest 1 gives:
 *
 *   L1 38 | L2 40 | L3 42 | L4 44 | L5 46 48 50 | L6 56 58
 *   L7 36 50 62 | L8 64 66 | L9 68 70 72 74
 *
 * and quest 2 adds 52, 54 and 60. That is why most entries below sit in
 * `byTextId` and name their labyrinth in a comment: a compound key would be
 * redundant. `byLevelAndTextId` is kept for the ids two labyrinths really do
 * share — the bomb trader in 5 and 7.
 *
 * See ./README.md for the entry shape and the charset rules.
 */

/** Keyed by `level:textId` — wins over `byTextId`. */
export const byLevelAndTextId = {
  // --- The bomb-satchel trader, who appears in both 5 and 7 ------------------
  '5:50': {
    pages: [
      'I BET YOU WOULD LIKE TO CARRY MORE BOMBS. EVERYONE WOULD. I USED TO CARRY EIGHT AND I USED TO BE AFRAID ALL THE TIME.',
      'PAY ME AND YOUR SATCHEL HOLDS FOUR MORE. THE WALLS FROM HERE ON ARE HOLLOWER THAN THE ONES BEHIND YOU.',
      'I AM NOT THE LAST OF US, EITHER. THERE IS ANOTHER MAN WITH ANOTHER SATCHEL UNDER A LATER LABYRINTH. TAKE HIS OFFER TOO.',
    ],
  },
  '7:50': {
    pages: [
      'YOU AGAIN. YES, I KNOW WHAT MY BROTHER UNDER THE LIZARD CHARGED YOU. I CHARGE THE SAME AND I GIVE THE SAME.',
      'FOUR MORE BOMBS. THIS IS THE LAST WIDENING THAT SATCHEL WILL EVER TAKE, AND DEATH MOUNTAIN IS ALL BOMBED WALLS.',
    ],
  },
};

/** Keyed by ROM text id. */
export const byTextId = {
  /** $24 — Hungry Goriya / Grumble (object $36). Labyrinth 7 in quest 1. */
  36: {
    pages: [
      'GRUMBLE, GRUMBLE... I HAVE NOT EATEN SINCE THE ARMY CAME THROUGH AND SEALED THE STAIRS ABOVE US.',
      'I AM NOT HERE TO FIGHT YOU AND I WILL NOT LET YOU PAST. THOSE ARE BOTH THINGS I HAVE DECIDED.',
      'FEED ME AND I WILL FORGET YOU ENTIRELY. SOMEBODY ABOVE GROUND SELLS BAIT. IT IS CHEAPER THAN ANOTHER TRIP DOWN HERE.',
    ],
  },

  /** $26 — labyrinth 1's old man. The coast hint the whole map turns on. */
  38: {
    pages: [
      'SO IT IS TRUE. SOMEBODY FINALLY CAME DOWN A STAIR INSTEAD OF BEING DRAGGED DOWN ONE.',
      'THEN LEARN THE FIRST THING. HYRULE HIDES MORE THAN IT SHOWS, AND THE EDGES HIDE MOST OF ALL.',
      'THE EASTMOST PENINSULA IS THE SECRET. WALK THE COAST UNTIL THE LAND RUNS OUT, THEN LOOK ONCE MORE BEFORE YOU TURN AROUND.',
    ],
  },

  /** $28 — labyrinth 2. Dodongo. */
  40: {
    pages: [
      'DODONGO SWALLOWS WHATEVER IT MEETS. THAT IS ITS WHOLE NATURE AND IT IS ALSO ITS WHOLE PROBLEM.',
      'IT DISLIKES SMOKE. PUT A BOMB WHERE ITS MOUTH IS GOING TO BE, NOT WHERE ITS MOUTH IS. TWICE.',
      'WHEN IT STAGGERS, USE THE BLADE. DO NOT STAND IN FRONT OF IT AND HOPE. NOTHING IN THIS LABYRINTH REWARDS HOPE.',
    ],
  },

  /** $2A — labyrinth 3. The white sword, and a warning about wood. */
  42: {
    pages: [
      'DID YOU GET THE SWORD FROM THE OLD MAN ABOVE THE WATERFALL? LOOK AT ME WHEN YOU ANSWER.',
      'A BOY WITH A WOODEN BLADE DIES POLITELY DOWN HERE. WOOD SPLINTERS. THE THINGS UNDER THIS FLOOR DO NOT.',
      'HE KEEPS A WHITE BLADE IN A CAVE ON THE HIGH GROUND ABOVE THE LAKE, AND HE COUNTS HEART CONTAINERS BEFORE HE HANDS IT OVER.',
    ],
    marks: [{ caveId: 0x12, clears: 'whiteSword', label: 'WHITE SWORD' }],
  },

  /** $2C — labyrinth 4. The waterfall cave. */
  44: {
    pages: [
      'WATER FALLING IS STILL ONLY WATER. IT HAS NO OPINION ABOUT WHETHER YOU WALK THROUGH IT.',
      'WALK INTO THE WATERFALL AND KEEP WALKING. THERE IS A ROOM BEHIND IT AND SOMEBODY IN THE ROOM.',
      'THAT IS THE SECOND THING THIS KINGDOM TEACHES. IF A WALL LOOKS PAINTED ON, TRY IT WITH YOUR SHOULDER BEFORE YOU TRY IT WITH A BOMB.',
    ],
  },

  /** $2E — labyrinth 5. Why the bow matters later. */
  46: {
    pages: [
      'SECRET POWER IS SAID TO BE IN THE ARROW. I BELIEVED THAT WAS A SONG UNTIL I WATCHED ONE GO THROUGH SOMETHING A SWORD HAD BOUNCED OFF.',
      'SOME EYES CANNOT BE CUT. THEY CAN ONLY BE PIERCED. YOU WILL MEET ONE UNDER THE DRAGON AND ANOTHER THING WORSE THAN IT AT THE END.',
      'SO KEEP THE BOW, KEEP ARROWS, AND KEEP RUPEES. EVERY SHOT SPENDS ONE.',
    ],
  },

  /** $30 — labyrinth 5. Digdogger. Needs the recorder (floor item, room $04). */
  48: {
    pages: [
      'DIGDOGGER HATES A CERTAIN KIND OF SOUND. NO BLADE WILL OPEN IT WHILE IT IS WHOLE, AND IT IS ALWAYS WHOLE.',
      'PLAY, AND IT COMES APART INTO SOMETHING SMALL AND FURIOUS AND KILLABLE. CUT WHAT IS LEFT.',
    ],
    // CLEAR_CONDITIONS name from mapMarks.js — when false, append the missing pages.
    ifMissing: 'recorder',
    missingPages: [
      'IT LOOKS LIKE YOU DO NOT HAVE THE PROPER ITEM. DIGDOGGER FEARS THE RECORDER AND NOTHING ELSE IN HYRULE.',
      'THE RECORDER HIDES IN THE FIFTH LABYRINTH. GO THERE AND TAKE IT BEFORE YOU FACE HIM, OR THE WALK DOWN IS WASTED.',
    ],
    // Already inside level 5 — point at the room, not the overworld mouth.
    missingPagesByLevel: {
      5: [
        'IT LOOKS LIKE YOU DO NOT HAVE THE PROPER ITEM. DIGDOGGER FEARS THE RECORDER AND NOTHING ELSE IN HYRULE.',
        'THE RECORDER IS STILL IN THIS LABYRINTH. I HAVE MARKED ITS ROOM ON YOUR MAP. GO AND GET IT AND COME BACK.',
      ],
    },
    missingMarks: [
      { dungeonLevel: 5, itemType: 0x05, clears: 'recorder', label: 'RECORDER' },
      { level: 5, clears: 'recorder', label: 'RECORDER' },
    ],
  },

  /** $32 — the bomb satchel trader (see byLevelAndTextId for 5 and 7). */
  50: {
    pages: [
      'I BET YOU WOULD LIKE TO CARRY MORE BOMBS. EVERYONE WOULD.',
      'PAY ME AND YOUR SATCHEL HOLDS FOUR MORE. THE LABYRINTHS ONLY GET DARKER FROM HERE.',
    ],
  },

  /** $34 — follow the arrow (quest 2). */
  52: {
    pages: [
      'IF YOU GO IN THE DIRECTION OF THE ARROW, THE WALL IS THINNER THAN IT LOOKS. BOMBS KNOW THE DIFFERENCE.',
      'THE MASONS WHO BUILT THESE HALLS LEFT SIGNS FOR EACH OTHER IN THE FLOOR. THEY DID NOT EXPECT ANYONE ELSE TO BE READING THEM.',
    ],
  },

  /** $36 — money-or-life. */
  54: {
    pages: [
      'LEAVE YOUR LIFE OR YOUR MONEY. I HAVE ALL THE TIME THERE IS AND YOU HAVE NONE OF IT.',
      'FIFTY RUPEES OR A HEART CONTAINER. STAND ON WHAT YOU ARE PAYING WITH. I DO NOT HAGGLE AND I DO NOT LET PEOPLE PAST.',
    ],
  },

  /** $38 — labyrinth 6. The pond that hides labyrinth 7. */
  56: {
    pages: [
      'THERE ARE SECRETS WHERE FAIRIES DO NOT LIVE. A POND WITH NOTHING IN IT IS NOT AN EMPTY POND.',
      'IT IS A ROOF. FIND THE ROUND WATER IN THE WEST THAT NOTHING GROWS AROUND AND STAND AT ITS EDGE.',
      'YOU WILL NEED SOMETHING TO PLAY. NO BOMB AND NO FIRE HAS EVER OPENED THAT ONE.',
    ],
  },

  /** $3A — labyrinth 6. Gohma. */
  58: {
    pages: [
      'AIM AT THE EYE OF GOHMA. IT SHUTS WHEN IT IS AFRAID, AND IT IS AFRAID OF YOU, WHICH IS THE ONLY GOOD NEWS I HAVE.',
      'NO BLADE REACHES IT. NOT THE WHITE ONE, NOT THE MAGICAL ONE. WAIT FOR THE EYE TO OPEN, THEN LOOSE AN ARROW INTO IT.',
      'IF YOU HAVE NO BOW, THIS LABYRINTH ENDS HERE FOR YOU. THE EAGLE IN THE EAST HAD ONE ON ITS FLOOR.',
    ],
    ifMissing: 'bow',
    missingPages: [
      'AND YOU HAVE NO BOW. I CAN SEE THAT FROM HERE. GO BACK TO THE FIRST LABYRINTH AND TAKE THE ONE IT IS STILL HOLDING.',
      'THEN BUY ARROWS, AND BRING RUPEES TO SHOOT THEM WITH. GOHMA WILL WAIT. IT HAS WAITED LONGER THAN YOU HAVE BEEN ALIVE.',
    ],
    missingMarks: [{ level: 1, clears: 'bow', label: 'THE BOW' }],
  },

  /** $3C — south of the arrow mark (quest 2). */
  60: {
    pages: [
      'SOUTH OF THE ARROW MARK HIDES A SECRET. COUNT THE ROOMS, DO NOT TRUST THE WALLS.',
      'THIS SECOND HYRULE WAS BUILT BY SOMEONE WHO HAD READ THE FIRST ONE AND FOUND IT TOO KIND.',
    ],
  },

  /** $3E — labyrinth 7. The shape of the place on the map. */
  62: {
    pages: [
      'THERE IS A SECRET IN THE TIP OF THE NOSE. NO, NOT MINE. LOOK AT THE SHAPE OF THIS PLACE ON YOUR MAP.',
      'THE MEN WHO DUG THESE HALLS DUG THEM INTO PICTURES. THE PICTURE IS THE INSTRUCTION. WALK TO THE FAR POINT OF IT.',
    ],
  },

  /** $40 — labyrinth 8. What this labyrinth is actually holding. */
  64: {
    pages: [
      'THE LION HOARDS TWO THINGS AND YOU WILL WANT BOTH MORE THAN YOU WANT THE SHARD.',
      'A KEY THAT NEVER WEARS OUT, SO NO LOCKED DOOR EVER STOPS YOU AGAIN. AND A BOOK THAT TEACHES THE ROD TO BURN.',
      'LEAVE WITH BOTH OR DO NOT BOTHER LEAVING. THE PLACE YOU ARE GOING AFTERWARDS IS ALL LOCKS AND ALL DARK.',
    ],
  },

  /** $42 — labyrinth 8. The Gleeok, and the door under Death Mountain. */
  66: {
    pages: [
      'FOUR HEADS ON ONE BODY. CUT THEM ALL AND THE LAST ONE STILL FLIES AT YOU. DO NOT STOP SWINGING AND DO NOT BACK INTO A CORNER.',
      'WHEN THE 8TH SHARD IS YOURS, GO NORTH. SPECTACLE ROCK ON DEATH MOUNTAIN IS AN ENTRANCE TO DEATH, AND I MEAN THAT PLAINLY.',
      'IT IS A GREY WALL WITH NOTHING WRITTEN ON IT. BOMB IT. THAT IS THE LAST DOOR IN HYRULE AND HE IS BEHIND IT.',
    ],
    marks: [{ level: 9, clears: 'triforceOfPower', label: 'DEATH MOUNTAIN' }],
  },

  // --- Level 9, Death Mountain ----------------------------------------------

  /**
   * $44 — the gatekeeper at the entrance. `filterLevel9EntranceGate` deletes
   * this person the instant the Triforce is whole, so these words are only
   * ever heard by someone who is still short of 8 shards. It has to be the
   * refusal; anything congratulatory is spoken to the wrong player.
   */
  68: {
    pages: [
      'STOP. ONE WHO DOES NOT HAVE THE TRIFORCE CANNOT GO IN, AND YOU DO NOT HAVE IT.',
      'I AM NOT GUARDING HIM. I AM GUARDING YOU. WHAT IS PAST THIS ROOM WILL NOT NOTICE KILLING SOMEBODY CARRYING SEVEN PIECES.',
      'GO BACK AND FINISH THE LABYRINTHS. WHEN WISDOM IS WHOLE IN YOUR PACK, THE SHUTTERS OPEN THEMSELVES AND I WILL NOT BE HERE.',
    ],
  },

  /** $46 — how Ganon fights. */
  70: {
    pages: [
      'SO YOU CARRY ALL 8. THE TRIFORCE OF WISDOM IS WHOLE AND IT IS THE ONLY REASON THESE WALLS OPENED FOR YOU.',
      'GANON FIGHTS UNSEEN. STRIKE WHERE THE AIR IS WRONG UNTIL HE FLICKERS AND HOLDS STILL.',
      'WHILE HE IS STUNNED, LOOSE A SILVER ARROW. NOTHING ELSE WILL FINISH HIM. YOU CAN CUT HIM ALL DAY AND HE WILL ONLY GET UP.',
    ],
  },

  /** $48 — the old man with no doors in his room. */
  72: {
    pages: [
      'GO TO THE NEXT ROOM. THAT IS ALL THE ADVICE THERE IS LEFT.',
      'YES, I KNOW THERE ARE NO DOORS. THERE HAVE NOT BEEN DOORS IN THIS ROOM SINCE THE ARMY CAME. USE A BOMB ON THE WALL.',
      'NOTHING FOLLOWS ANYONE INTO THIS ROOM. NOTHING GOOD, EITHER. I HAVE HAD A LONG TIME TO THINK ABOUT THAT.',
    ],
  },

  /** $4A — the last warning, and what is at the bottom. */
  74: {
    pages: [
      'TURN BACK WHILE THERE IS STILL A ROAD BEHIND YOU. NO? THEN KEEP ONE WALL ON YOUR SHOULDER AND DO NOT LET GO OF IT.',
      'THE SILVER ARROW IS HIDDEN IN THIS MOUNTAIN, BEHIND HIS OWN DOOR. HE NEVER BELIEVED ANYONE WOULD GET THIS FAR.',
      'ZELDA IS HERE. SHE HAS BEEN HERE SINCE THE DAY SHE BROKE THE RELIC, AND SHE HAS NOT ONCE TOLD HIM WHERE THE PIECES WENT.',
    ],
  },
};

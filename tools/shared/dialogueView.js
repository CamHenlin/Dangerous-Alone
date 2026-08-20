/**
 * Whether the dialogue panel belongs in this player's picture.
 *
 * A closed box is never drawn — the first split-screen pass used
 * `!active || …` and painted an empty panel in every view, every frame.
 * Story beats (`levelEntry`, `briefing`) appear for everyone; a private
 * conversation appears only for the reader.
 *
 * @param {boolean} active the box has something to say
 * @param {{ story?: boolean, reader?: boolean }} [who]
 */
export function dialogueVisibleFor(active, { story = false, reader = false } = {}) {
  return Boolean(active) && (story || reader);
}

/**
 * Who may press A / B / Start to page or close the box.
 *
 * Cave speech is still a private conversation: the shopper (or grave-keeper's
 * visitor) pages it. Walking while it crawls is a separate question.
 *
 * @param {boolean} active
 * @param {{ story?: boolean, reader?: boolean }} [who]
 */
export function dialogueAcceptsInput(active, { story = false, reader = false } = {}) {
  return dialogueVisibleFor(active, { story, reader });
}

/**
 * Whether this hero is frozen while the box is up.
 *
 * Story beats hold everyone. A private conversation holds only its reader.
 * Cave speech is the NES exception: the nametable crawl runs while you walk.
 *
 * @param {boolean} active
 * @param {{ story?: boolean, reader?: boolean, cave?: boolean }} [who]
 */
export function dialogueFreezesHero(
  active,
  { story = false, reader = false, cave = false } = {},
) {
  if (!dialogueAcceptsInput(active, { story, reader })) return false;
  if (story) return true;
  return !cave;
}

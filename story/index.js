/**
 * The story pack. Engine code reaches this through
 * `tools/shared/storyText.js`, never directly.
 */

import * as caves from './caves.js';
import * as persons from './persons.js';
import * as ending from './ending.js';
import { ITEMS } from './items.js';
import {
  ITEM_ADVICE,
  LEVELS,
  MISSED_FOOTER,
  MISSED_HEADER,
  MISSED_MAX,
  MISSED_PRIORITY,
} from './levels.js';

export const STORY = Object.freeze({
  caves: Object.freeze({
    byCaveId: caves.byCaveId,
    byTextId: caves.byTextId,
    shopItemBlurbs: caves.shopItemBlurbs,
    shopPitchClosers: caves.shopPitchClosers,
  }),
  persons: Object.freeze({
    byLevelAndTextId: persons.byLevelAndTextId,
    byTextId: persons.byTextId,
  }),
  levels: LEVELS,
  items: ITEMS,
  ending: Object.freeze({
    thanks: ending.THANKS,
    peace: ending.PEACE,
    epilogue: ending.EPILOGUE,
  }),
  itemAdvice: ITEM_ADVICE,
  missedPriority: MISSED_PRIORITY,
  missedMax: MISSED_MAX,
  missedHeader: MISSED_HEADER,
  missedFooter: MISSED_FOOTER,
});

export default STORY;

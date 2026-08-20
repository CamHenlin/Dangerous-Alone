import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dialogueAcceptsInput, dialogueFreezesHero, dialogueVisibleFor } from './dialogueView.js';

test('a closed box is hidden from everyone', () => {
  assert.equal(dialogueVisibleFor(false, { story: true, reader: true }), false);
  assert.equal(dialogueVisibleFor(false), false);
});

test('a story beat is in every view', () => {
  assert.equal(dialogueVisibleFor(true, { story: true, reader: false }), true);
  assert.equal(dialogueVisibleFor(true, { story: true, reader: true }), true);
});

test('a private conversation is only in the reader\'s view', () => {
  assert.equal(dialogueVisibleFor(true, { reader: true }), true);
  assert.equal(dialogueVisibleFor(true, { reader: false }), false);
});

test('the cave visitor pages the box; the ally outside does not', () => {
  assert.equal(dialogueAcceptsInput(true, { reader: true }), true);
  assert.equal(dialogueAcceptsInput(true, { reader: false }), false);
  assert.equal(dialogueAcceptsInput(true, { story: true, reader: false }), true);
});

test('cave speech does not freeze the visitor, story beats freeze everyone', () => {
  assert.equal(dialogueFreezesHero(true, { reader: true, cave: true }), false);
  assert.equal(dialogueFreezesHero(true, { reader: true, cave: false }), true);
  assert.equal(dialogueFreezesHero(true, { story: true, reader: true, cave: true }), true);
  assert.equal(dialogueFreezesHero(true, { reader: false, cave: true }), false);
});

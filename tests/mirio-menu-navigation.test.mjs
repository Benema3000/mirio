import assert from 'node:assert/strict';
import test from 'node:test';
import {MenuNavigation, nextMenuIndex} from '../js/menu-navigation.js';

const rectangle = (left, top, width = 100, height = 40) => ({left, top, width, height});

test('controller directions traverse a card grid and reach off-centre settings', () => {
  const cards = [rectangle(0, 0), rectangle(120, 0), rectangle(0, 60), rectangle(120, 60)];
  assert.equal(nextMenuIndex(cards, 0, {x: 1, y: 0}), 1);
  assert.equal(nextMenuIndex(cards, 0, {x: 0, y: 1}), 2);
  assert.equal(nextMenuIndex(cards, 3, {x: 0, y: -1}), 1);
  const raised = [rectangle(0, -6), ...cards.slice(1)];
  assert.equal(nextMenuIndex(raised, 0, {x: 0, y: 1}), 2, 'a raised selected card must not turn down into sideways');
  const settings = [rectangle(0, 0, 320), rectangle(190, 70), rectangle(190, 120), rectangle(0, 190, 320)];
  assert.equal(nextMenuIndex(settings, 0, {x: 0, y: 1}), 1);
});

function fixture() {
  const document = {activeElement: null, defaultView: {Event}};
  const items = Array.from({length: 3}, (_, i) => ({
    id: i, type: 'button', hidden: false, clicks: 0, value: '50',
    classList: {add() {}, remove() {}}, getClientRects: () => [rectangle(0, i * 60)],
    getBoundingClientRect: () => rectangle(0, i * 60), hasAttribute: () => false,
    focus() {document.activeElement = this;}, click() {this.clicks++;},
    stepUp() {this.value = String(Number(this.value) + 5);}, stepDown() {this.value = String(Number(this.value) - 5);},
    dispatchEvent(event) {this.event = event.type;},
  }));
  const root = {ownerDocument: document, querySelectorAll: selector => selector === '.controller-focus' ? [] : items};
  let scope = root, closes = 0;
  const nav = new MenuNavigation({scope: () => scope, back: () => {closes++; scope = null;}});
  return {nav, items, document, root, scope: value => {scope = value;}, closes: () => closes};
}

test('held confirm cannot activate again after a dialog changes scope', () => {
  const {nav, items, scope, root} = fixture();
  nav.update(.016, {confirm: true}); assert.equal(items[0].clicks, 1);
  scope(null); nav.update(.016, {confirm: true});
  scope(root); nav.update(.016, {confirm: true}); assert.equal(items[0].clicks, 1);
  nav.update(.016, {}); nav.update(.016, {confirm: true}); assert.equal(items[0].clicks, 2);
});

test('B closes the active scope once without confirming its focused button', () => {
  const {nav, items, closes} = fixture();
  assert.equal(nav.update(.016, {back: true}), true);
  assert.equal(nav.update(.016, {back: true}), false);
  assert.equal(closes(), 1); assert.equal(items[0].clicks, 0);
});

test('analog drift is ignored; deliberate directions repeat with a delay', () => {
  const {nav, document, items} = fixture();
  nav.update(.016, {y: -.3}); assert.equal(document.activeElement, items[0]);
  nav.update(.016, {y: -1}); assert.equal(document.activeElement, items[1]);
  nav.update(.1, {y: -1}); assert.equal(document.activeElement, items[1]);
  nav.update(.31, {y: -1}); assert.equal(document.activeElement, items[2]);
});

test('left/right adjusts the focused volume and emits the existing input event', () => {
  const {nav, document, items} = fixture(); items[0].type = 'range';
  nav.update(.016, {x: 1}); assert.equal(items[0].value, '55'); assert.equal(items[0].event, 'input');
  nav.update(.016, {}); nav.update(.016, {y: -1}); assert.equal(document.activeElement, items[1]);
});

test('a checkbox stays reachable when its small square sits left of the volume sliders', () => {
  const {nav, document, items} = fixture();
  items[0].type = 'range'; items[1].type = 'checkbox';
  items[0].getBoundingClientRect = () => rectangle(200, 0, 150);
  items[1].getBoundingClientRect = () => rectangle(0, 60, 16);
  for (const [index, item] of items.slice(0, 2).entries()) item.closest = () => ({getBoundingClientRect: () => rectangle(0, index * 60, 400)});
  nav.update(.016, {}); nav.update(.016, {y: -1});
  assert.equal(document.activeElement, items[1]);
});

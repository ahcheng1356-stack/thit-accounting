import test from 'node:test';
import assert from 'node:assert/strict';
import { transportedTons, validateTransportationChange } from '../server/transportation-totals.mjs';

const leg = (id, from, to, tons = 15, orderId = 1) => ({ id, note: JSON.stringify({ fromLocation: from, toLocation: to, tons, orderId }) });
const first = leg(1, 'Forest', 'Village');
const second = leg(2, 'Village', 'Destination');
function database(order = { id: 1, customer: 'Buyer', sold_tons: 15 }) {
  return { from(table) {
    assert.equal(table, 'orders');
    return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: order, error: null }; } };
  } };
}

test('15 sold tons can travel through both legs without any order write', async () => {
  await validateTransportationChange(database(), [], [structuredClone(first)]);
  await validateTransportationChange(database(), [first], [structuredClone(first), structuredClone(second)]);
  assert.equal(transportedTons([first, second]), 15);
});
test('a separate extra load exceeding sold tons is rejected', async () => {
  await assert.rejects(validateTransportationChange(database(), [first], [first, leg(3, 'Forest', 'Village', 1)]), /exceeds the 15 sold tons/);
});
test('a downstream leg cannot exceed the sold quantity', async () => {
  await assert.rejects(validateTransportationChange(database(), [first], [first, leg(2, 'Village', 'Destination', 16)]), /exceeds/);
});
test('unsold and missing orders cannot receive new transportation', async () => {
  await assert.rejects(validateTransportationChange(database({ sold_tons: 0 }), [], [first]), /Record sold tons/);
  await assert.rejects(validateTransportationChange(database(null), [], [first]), /no longer exists/);
});
test('deleting either leg or the last leg requires no order reads or writes', async () => {
  const db = { from() { throw new Error('Deletion must not depend on the order'); } };
  await validateTransportationChange(db, [first, second], [second]);
  await validateTransportationChange(db, [first, second], [first]);
  await validateTransportationChange(db, [first], []);
});
test('unchanged Sheets imports preserve historical records without rewriting sales', async () => {
  await validateTransportationChange({ from() { throw new Error('Unexpected order access'); } }, [first], [structuredClone(first)]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/financialTotals.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { financialTotals } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const order = { soldTons: 15, unitPrice: 1_500_000, paidAmount: 0 };
test('unpaid sale covers recorded costs but does not invent cash received', () => {
  assert.deepEqual(financialTotals([order], 5_000_000, 8_684_500), { sales: 22_500_000, received: 0, due: 22_500_000, profit: 13_815_500, balance: -3_684_500, projectedBalance: 18_815_500 });
});
test('full collection increases cash and clears due without changing profit', () => {
  const totals = financialTotals([{ ...order, paidAmount: 22_500_000 }], 5_000_000, 8_684_500);
  assert.equal(totals.balance, 18_815_500);
  assert.equal(totals.due, 0);
  assert.equal(totals.profit, 13_815_500);
});
test('partial payments reduce outstanding balance', () => {
  const totals = financialTotals([{ ...order, paidAmount: 5_000_000 }], 5_000_000, 8_684_500);
  assert.equal(totals.balance, 1_315_500);
  assert.equal(totals.due, 17_500_000);
});
test('an advance on another order does not erase unpaid sales', () => {
  const totals = financialTotals([order, { soldTons: 0, unitPrice: 0, paidAmount: 1_000_000 }], 0, 0);
  assert.equal(totals.due, 22_500_000);
  assert.equal(totals.projectedBalance, 23_500_000);
});

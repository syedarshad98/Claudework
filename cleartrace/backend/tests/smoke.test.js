/**
 * ClearTrace — test harness smoke test.
 *
 * Proves the runner is wired up and actually discovers this file. Node's
 * test runner exits 0 when it discovers nothing at all, so a green `npm test`
 * means nothing on its own — always read the `# pass` count in the summary.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');

test('test runner discovers and executes this file', () => {
  assert.equal(1 + 1, 2);
});

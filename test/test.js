const assert = require('assert');
const { parseHHMMSSToDecimalHours } = require('../time-utils.js');

assert.strictEqual(parseHHMMSSToDecimalHours('01:30:00'), 1.5);
assert.strictEqual(parseHHMMSSToDecimalHours('99:00:00'), null);
assert.strictEqual(parseHHMMSSToDecimalHours('bad'), null);

console.log('All tests passed.');

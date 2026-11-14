const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IsString, ValidateNested } = require('class-validator');
const { Type } = require('class-transformer');
const { createValidationPipe } = require('../../dist/common/validation');
class Nested { }
IsString()(Nested.prototype, 'name');
class Input { }
IsString()(Input.prototype, 'title');
ValidateNested()(Input.prototype, 'nested');
Type(() => Nested)(Input.prototype, 'nested');
const metadata = { type: 'body', metatype: Input };

test('global pipe transforms a valid DTO', async () => {
  const value = await createValidationPipe().transform({ title: 'valid', nested: { name: 'valid' } }, metadata);
  assert.ok(value instanceof Input);
  assert.ok(value.nested instanceof Nested);
});
test('global pipe rejects unexpected fields and nested invalid fields without values', async () => {
  await assert.rejects(createValidationPipe().transform({ title: 'valid', secret: 'sensitive', nested: { name: 3 } }, metadata), error => {
    const body = error.getResponse();
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.deepEqual(body.details.map(item => item.field).sort(), ['nested.name', 'secret']);
    assert.ok(body.details.every(item => item.rules.length));
    assert.doesNotMatch(JSON.stringify(body), /sensitive/);
    return true;
  });
});

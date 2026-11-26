import assert from 'node:assert/strict';
import {foods, tacoId} from '../foods.js';
import {ibgeMeasures} from '../ibge-measure-data.js';
import {householdMeasures, measureKey, measureOptions, measureDefault} from '../household-measures.js';

assert.equal(foods.length, 574, 'O catálogo deve conter 574 alimentos.');
assert.equal(new Set(foods.map(food => food.id)).size, foods.length, 'IDs TACO duplicados.');
for (const [id, [code, preparation, weights]] of Object.entries(ibgeMeasures)) {
  assert.ok(id === 'geleia' || tacoId(id) !== undefined, `Referência órfã para ID TACO ${id}.`);
  assert.ok(Number.isInteger(code) && Number.isInteger(preparation), `Origem inválida para ${id}.`);
  for (const [unit, [weight, source, kind]] of Object.entries(weights)) {
    assert.ok(householdMeasures.includes(unit) && Number.isFinite(weight) && weight > 0 &&
      typeof source === 'string' && source.length && ['reference', 'estimate'].includes(kind), `Conversão inválida para ${id}: ${unit}.`);
  }
}
const count = {referencia: 0, apenasEstimativa: 0, precisaDePesquisaOuPesagem: 0};
const catalog = foods.map(({id, name}) => {
  const item = {food: id};
  const options = measureOptions(item, {});
  const available = [...options.reference, ...options.estimate].map(unit => {
    const [grams, source, kind] = measureDefault(item, unit, {});
    assert.ok(Number.isFinite(grams) && grams > 0 && source);
    assert.deepEqual(measureDefault({food: String(id)}, unit, {}), [grams, source, kind]);
    return {unit, grams, source, kind};
  });
  assert.equal(measureKey({food: String(id)}), measureKey(item));
  const status = options.reference.length ? 'referencia' : options.estimate.length ? 'apenasEstimativa' : 'precisaDePesquisaOuPesagem';
  count[status]++;
  return {id, name, status, available, needsEvidence: options.manual};
});
assert.equal(measureDefault({food: '54'}, 'fatia média', {})[0], 25, 'Regressão de pão sovado.');
console.log(JSON.stringify({count, catalog}, null, 2));

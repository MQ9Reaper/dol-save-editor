const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function editor(save) {
  const context = vm.createContext({
    window: {addEventListener() {}},
    document: {},
    input: save,
  });
  vm.runInContext(app, context);
  vm.runInContext(`
    STATE.decoded = input;
    STATE.vars = extractVariables(input);
    STATE.baselineVars = cloneJson(STATE.vars);
  `, context);
  return {
    run(code) { return vm.runInContext(code, context); },
    output() { return JSON.parse(JSON.stringify(vm.runInContext('buildSaveObject()', context))); },
  };
}

function sample(index = 1) {
  return {
    id: 'test',
    state: {
      index,
      delta: [
        {title: 'start', variables: {n: 1, nested: {a: 1}, arr: [1, 2], removed: 3}},
        {title: [2, 'middle'], variables: {
          n: [2, 2], nested: {a: [2, 4]}, arr: {'1': [2, 5]},
          removed: 0, added: [2, 'new'],
        }},
        {title: [2, 'future'], variables: {n: [2, 3]}},
      ],
    },
  };
}

test('loads the active moment and leaves an unchanged save intact', () => {
  const save = sample();
  const app = editor(save);
  assert.deepEqual(JSON.parse(JSON.stringify(app.run('STATE.vars'))), {
    n: 2, nested: {a: 4}, arr: [1, 5], added: 'new',
  });
  assert.deepEqual(app.output(), save);
});

test('edits the active moment while retaining earlier history and active index', () => {
  const app = editor(sample());
  app.run('STATE.vars.n = 42; STATE.vars.arr = [9, 8]');
  const output = app.output();
  assert.equal(output.state.index, 1);
  assert.equal(output.state.delta.length, 2);
  assert.equal(output.state.delta[0].variables.n, 1);
  const reopened = editor(output);
  assert.equal(reopened.run('STATE.vars.n'), 42);
  assert.deepEqual(JSON.parse(JSON.stringify(reopened.run('STATE.vars.arr'))), [9, 8]);
  assert.equal(reopened.run('currentMoment(STATE.decoded).title'), 'middle');
});

test('edits a single full frame without changing its position', () => {
  const save = sample(0);
  save.state.delta = [save.state.delta[0]];
  const app = editor(save);
  app.run('STATE.vars.n = 7');
  const output = app.output();
  assert.equal(output.state.index, 0);
  assert.equal(output.state.delta.length, 1);
  assert.equal(output.state.delta[0].variables.n, 7);
});

test('restores SugarCube array splice operations', () => {
  const save = sample();
  save.state.delta[1].variables.arr = {'~': [1, 1, 1]};
  const app = editor(save);
  assert.deepEqual(JSON.parse(JSON.stringify(app.run('STATE.vars.arr'))), [1]);
});

test('rejects an invalid active index', () => {
  const save = sample(9);
  const context = vm.createContext({window: {addEventListener() {}}, document: {}, input: save});
  vm.runInContext(app, context);
  assert.throws(() => vm.runInContext('extractVariables(input)', context), /state.index/);
});

#!/usr/bin/env node
// Checks the "Ask about this report" assistant against a fake AI service, for both the
// Anthropic and the OpenAI-compatible styles. No internet or AI key needed.

import {ask, testConnection, normalizeConfig, estimateCombination} from '../src/ai.js';

let failures = 0;
const expect = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures++;
};

const result = (key, label, verdict, cpu, sig = true) => ({
  key, label, verdict, verdictLabel: verdict, summary: '', extensionKeys: [key],
  headline: {memoryMB: {value: 5}},
  overall: Object.fromEntries(['mainThreadMs', 'load', 'lcp', 'tbt'].map(k => [k, {delta: k === 'mainThreadMs' ? cpu : 0, significant: k === 'mainThreadMs' && sig}])),
  perUrl: [{url: 'https://example.com/', runs: 5, metrics: {mainThreadMs: {delta: cpu}, load: {delta: 0}}}],
});
const data = {
  engine: 'chrome', startedAt: '2026-10-22T00:00:00Z', urls: ['https://example.com/'], settings: {rounds: 5},
  analysis: {
    individual: [result('x1', 'Busy Blocker', 'Heavy impact', 300), result('x2', 'Quiet Helper', 'No clear impact', 10, false)],
    combined: {...result('combined', 'All 2 together', 'Heavy impact', 280), extensionKeys: ['x1', 'x2']},
    warnings: [],
  },
};

const est = estimateCombination(data, ['busy blocker', 'quiet', 'Nope']);
expect(est.estimate.extraWorkMs === 300 && est.unknownNames[0] === 'Nope', `estimate adds only real changes (${est.estimate.extraWorkMs} ms, unknown: ${est.unknownNames})`);
expect(normalizeConfig({provider: 'openai', endpoint: 'ftp://x', model: '', key: ''}).error?.includes('endpoint'), 'set-up form errors name what is missing');

// Fake service: asks for the results, then proposes a test, then answers.
function fakeFetch(style) {
  const seen = [];
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({url, headers: init.headers, body});
    const json = obj => ({ok: true, status: 200, json: async () => obj});
    if (!body.tools) return style === 'anthropic' ? json({content: [{type: 'text', text: 'OK'}]}) : json({choices: [{message: {content: 'OK'}}]});
    const step = seen.filter(s => s.body.tools).length;
    if (style === 'anthropic') {
      if (step === 1) return json({content: [{type: 'tool_use', id: 't1', name: 'get_results', input: {}}]});
      if (step === 2) return json({content: [{type: 'tool_use', id: 't2', name: 'propose_test', input: {extensions: ['Busy Blocker'], websites: ['youtube.com'], thoroughness: 'quick'}}]});
      return json({content: [{type: 'text', text: 'Busy Blocker is the heavy one.'}]});
    }
    if (step === 1) return json({choices: [{message: {content: null, tool_calls: [{id: 'c1', type: 'function', function: {name: 'get_results', arguments: '{}'}}]}}]});
    if (step === 2) return json({choices: [{message: {content: null, tool_calls: [{id: 'c2', type: 'function', function: {name: 'propose_test', arguments: '{"extensions":["Busy Blocker"],"websites":["youtube.com"],"thoroughness":"quick"}'}}]}}]});
    return json({choices: [{message: {content: 'Busy Blocker is the heavy one.'}}]});
  };
  return {fn, seen};
}

for (const style of ['anthropic', 'openai']) {
  const config = {provider: style, style, endpoint: 'https://ai.invalid/v1', model: 'm', key: 'secret-key'};
  const {fn, seen} = fakeFetch(style);
  await testConnection(config, fn);
  const auth = style === 'anthropic' ? seen[0].headers['x-api-key'] : seen[0].headers.authorization;
  expect(auth === (style === 'anthropic' ? 'secret-key' : 'Bearer secret-key'), `${style}: key sent in the right header`);
  const r = await ask({config, data, question: 'Which is slow?', history: [], fetchImpl: fn});
  expect(r.answer === 'Busy Blocker is the heavy one.', `${style}: final answer returned`);
  const action = r.actions[0];
  expect(action?.type === 'run' && action.extensionKeys.join() === 'x1' && action.rounds === 3 && action.urls[0] === 'youtube.com', `${style}: proposed test becomes a button, not a run`);
  const last = seen[seen.length - 1].body;
  const toolResult = style === 'anthropic' ? last.messages.at(-1).content[0].type === 'tool_result' : last.messages.at(-1).role === 'tool';
  expect(toolResult, `${style}: tool results are sent back in the provider's format`);
}

{
  const config = {provider: 'openai', style: 'openai', endpoint: 'https://ai.invalid/v1', model: 'm', key: 'k'};
  const refused = async () => ({ok: false, status: 401, json: async () => ({error: {message: 'invalid key'}})});
  const err = await testConnection(config, refused).catch(e => e);
  expect(/refused the key/.test(err.message), 'a refused key gets a plain explanation');
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);

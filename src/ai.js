// The "Ask about this report" assistant. It talks to an AI service the user connects with their
// own key, and can read results, add up extensions' effects and suggest a new test. A suggested
// test only runs when the user presses its button; the assistant never starts one by itself.

import fs from 'node:fs';
import path from 'node:path';
import {THRESHOLDS} from './analyze.js';

// Defaults offered in the set-up form. Every field stays editable, because providers rename
// models and endpoints often. "openai" style means the OpenAI-compatible chat completions API.
export const AI_PROVIDERS = [
  {id: 'anthropic', name: 'Anthropic (Claude)', style: 'anthropic', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-5-5', keys: 'https://console.anthropic.com/settings/keys', note: 'Paid, small free credit for new accounts.'},
  {id: 'openai', name: 'OpenAI (GPT)', style: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini', keys: 'https://platform.openai.com/api-keys', note: 'Paid.'},
  {id: 'gemini', name: 'Google Gemini', style: 'openai', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', keys: 'https://aistudio.google.com/apikey', note: 'Free tier with daily limits.'},
  {id: 'deepseek', name: 'DeepSeek', style: 'openai', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', keys: 'https://platform.deepseek.com/api_keys', note: 'Low cost.'},
  {id: 'qwen', name: 'Alibaba Qwen (Model Studio, international)', style: 'openai', endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', keys: 'https://modelstudio.console.alibabacloud.com/', note: 'Free token quota for new accounts.'},
  {id: 'glm', name: 'Zhipu GLM (Z.ai)', style: 'openai', endpoint: 'https://api.z.ai/api/paas/v4/chat/completions', model: 'glm-4.5-flash', keys: 'https://z.ai/manage-apikey/apikey-list', note: 'Flash model is free.'},
  {id: 'kimi', name: 'Moonshot Kimi', style: 'openai', endpoint: 'https://api.moonshot.ai/v1/chat/completions', model: 'kimi-k2-turbo-preview', keys: 'https://platform.moonshot.ai/console/api-keys', note: 'Free credit for new accounts.'},
  {id: 'custom', name: 'Other (OpenAI-compatible)', style: 'openai', endpoint: '', model: '', keys: '', note: 'Any service with an OpenAI-style chat endpoint, including a local one such as Ollama.'},
];

const MAX_STEPS = 6;
const TIMEOUT_MS = 90_000;

// ---- saved connection (one per computer, inside the app folder) ----

export function createStore(dir) {
  const file = path.join(dir, 'ai.json');
  return {
    load() {
      try {
        const c = JSON.parse(fs.readFileSync(file, 'utf8'));
        return c && c.key && c.endpoint && c.model ? c : null;
      } catch {
        return null;
      }
    },
    save(config) {
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(file, JSON.stringify(config, null, 2), {mode: 0o600});
      try {
        fs.chmodSync(file, 0o600);
      } catch {
        // Windows has no Unix permissions; the folder is the user's own.
      }
    },
    forget() {
      fs.rmSync(file, {force: true});
    },
  };
}

// What the page may see: everything except the key.
export function publicConfig(config) {
  if (!config) return {connected: false};
  const p = AI_PROVIDERS.find(x => x.id === config.provider);
  return {connected: true, provider: config.provider, providerName: p?.name || 'AI service', model: config.model, endpoint: config.endpoint};
}

export function normalizeConfig(input = {}) {
  const preset = AI_PROVIDERS.find(p => p.id === input.provider) || AI_PROVIDERS[AI_PROVIDERS.length - 1];
  const config = {
    provider: preset.id,
    style: preset.style,
    endpoint: String(input.endpoint || '').trim(),
    model: String(input.model || '').trim(),
    key: String(input.key || '').trim(),
  };
  const missing = [];
  if (!/^https?:\/\/\S+$/i.test(config.endpoint)) missing.push('an endpoint starting with https://');
  if (!config.model) missing.push('a model name');
  if (!config.key) missing.push('your API key');
  return {config, error: missing.length ? `Add ${missing.join(', ')}.` : null};
}

// ---- talking to the AI service ----

function explainHttpError(status, body) {
  const detail = String(body?.error?.message || body?.message || body?.error || '').slice(0, 200);
  if (status === 401 || status === 403) return `The AI service refused the key (HTTP ${status}). Check the key and that it belongs to this service.`;
  if (status === 404) return `The AI service did not recognise the endpoint or the model name (HTTP 404).${detail ? ` It said: ${detail}` : ''}`;
  if (status === 429) return 'The AI service says you have hit a usage limit (HTTP 429). Wait a minute, or check your plan or free quota.';
  return `The AI service answered with an error (HTTP ${status}).${detail ? ` It said: ${detail}` : ''}`;
}

async function post(config, body, fetchImpl) {
  const headers = {'content-type': 'application/json'};
  if (config.style === 'anthropic') {
    headers['x-api-key'] = config.key;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.authorization = `Bearer ${config.key}`;
  }
  let res;
  try {
    res = await fetchImpl(config.endpoint, {method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS)});
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'The AI service took too long to answer. Try again.' : `Could not reach the AI service: ${err.cause?.code || err.message}. Check the endpoint and your internet connection.`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(explainHttpError(res.status, data));
  if (!data) throw new Error('The AI service sent an answer that is not JSON. Check the endpoint.');
  return data;
}

// One request/response turn, in a neutral shape: {text, calls: [{id, name, input}], raw}.
async function complete(config, {system, messages, tools, maxTokens = 1200}, fetchImpl) {
  if (config.style === 'anthropic') {
    const body = {model: config.model, max_tokens: maxTokens, system, messages};
    if (tools?.length) body.tools = tools.map(t => ({name: t.name, description: t.description, input_schema: t.parameters}));
    const data = await post(config, body, fetchImpl);
    const blocks = Array.isArray(data.content) ? data.content : [];
    return {
      text: blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(),
      calls: blocks.filter(b => b.type === 'tool_use').map(b => ({id: b.id, name: b.name, input: b.input || {}})),
      raw: {role: 'assistant', content: blocks},
    };
  }
  const body = {model: config.model, max_tokens: maxTokens, messages: [{role: 'system', content: system}, ...messages]};
  if (tools?.length) body.tools = tools.map(t => ({type: 'function', function: {name: t.name, description: t.description, parameters: t.parameters}}));
  const data = await post(config, body, fetchImpl);
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error('The AI service sent an empty answer. Check the model name.');
  const calls = (msg.tool_calls || []).map(c => {
    let input = {};
    try {
      input = JSON.parse(c.function?.arguments || '{}');
    } catch {
      // A malformed call is answered with an error below.
    }
    return {id: c.id, name: c.function?.name, input};
  });
  return {text: String(msg.content || '').trim(), calls, raw: {role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls ? {tool_calls: msg.tool_calls} : {})}};
}

function toolResults(config, calls, results) {
  if (config.style === 'anthropic') {
    return [{role: 'user', content: calls.map((c, i) => ({type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(results[i])}))}];
  }
  return calls.map((c, i) => ({role: 'tool', tool_call_id: c.id, content: JSON.stringify(results[i])}));
}

export async function testConnection(config, fetchImpl = fetch) {
  const r = await complete(config, {system: 'You are a connection check.', messages: [{role: 'user', content: 'Reply with the single word OK.'}], maxTokens: 20}, fetchImpl);
  if (!r.text) throw new Error('The AI service answered, but with no text. Check the model name.');
  return true;
}

// ---- what the assistant can do ----

const round = v => (v == null || !Number.isFinite(v) ? null : Math.round(v));

// Compact view of a run for the AI: verdicts and the main numbers, no raw page loads.
export function summarizeRun(data) {
  const a = data.analysis;
  const one = r => ({
    name: r.label,
    verdict: r.verdictLabel,
    summary: r.summary,
    extraWorkMs: round(r.overall.mainThreadMs.delta),
    slowerToLoadMs: round(r.overall.load.delta),
    mainContentLaterMs: round(r.overall.lcp.delta),
    pageFrozenMs: round(r.overall.tbt.delta),
    memoryMB: data.engine === 'firefox' ? null : round(r.headline.memoryMB.value),
    withinNoise: Object.entries(r.overall).filter(([, v]) => !v.significant).map(([k]) => k),
    perWebsite: r.perUrl.map(u => ({url: u.url, extraWorkMs: round(u.metrics.mainThreadMs.delta), slowerToLoadMs: round(u.metrics.load.delta), goodLoads: u.runs})),
  });
  return {
    browser: data.engine === 'firefox' ? 'Firefox' : 'Chrome for Testing',
    testedAt: data.startedAt,
    websites: data.urls,
    roundsPerSite: data.settings.rounds,
    extensions: a.individual.map(one),
    allTogetherMeasured: a.combined ? one(a.combined) : null,
    warnings: a.warnings,
  };
}

function findExtensions(data, names) {
  const results = data.analysis.individual;
  const found = [];
  const unknown = [];
  for (const raw of Array.isArray(names) ? names : []) {
    const n = String(raw).toLowerCase().trim();
    const hit = results.find(r => r.label.toLowerCase() === n) || results.find(r => r.label.toLowerCase().includes(n) || n.includes(r.label.toLowerCase()));
    if (hit && !found.includes(hit)) found.push(hit);
    else if (!hit) unknown.push(String(raw));
  }
  return {found, unknown};
}

export function estimateCombination(data, names) {
  const {found, unknown} = findExtensions(data, names);
  const sig = (r, k) => (r.overall[k].significant ? r.overall[k].delta : 0);
  const add = k => round(found.reduce((s, r) => s + sig(r, k), 0));
  const cpu = add('mainThreadMs');
  const slow = Math.max(add('load'), add('lcp'));
  const verdict = cpu >= THRESHOLDS.heavy.cpu || slow >= THRESHOLDS.heavy.slowdown ? 'Heavy impact'
    : cpu >= THRESHOLDS.moderate.cpu || slow >= THRESHOLDS.moderate.slowdown ? 'Noticeable impact'
      : cpu >= THRESHOLDS.light.cpu || slow >= THRESHOLDS.light.slowdown ? 'Small impact' : 'No clear impact';
  const a = data.analysis;
  const calibration = a.combined
    ? {allTogetherAddedUpMs: round(a.individual.reduce((s, r) => s + sig(r, 'mainThreadMs'), 0)), allTogetherMeasuredMs: round(a.combined.overall.mainThreadMs.delta)}
    : null;
  return {
    extensions: found.map(r => r.label),
    unknownNames: unknown,
    estimate: {extraWorkMs: cpu, slowerToLoadMs: add('load'), mainContentLaterMs: add('lcp'), pageFrozenMs: add('tbt'), verdict},
    note: 'Added up from single-extension tests, counting only changes beyond normal variation. Real combined impact can be higher or lower.',
    calibration,
  };
}

const TOOLS = [
  {
    name: 'get_results',
    description: 'Returns the results of the test the user is looking at: each extension\'s verdict and measured effects, per website, and the measured "all together" result.',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    name: 'estimate_combination',
    description: 'Adds up the measured effects of a set of extensions from this test, to estimate their impact when only those are switched on. Use for "what if I keep only A and B" questions. It is an estimate; offer a real test when the answer matters.',
    parameters: {type: 'object', properties: {extensions: {type: 'array', items: {type: 'string'}, description: 'Extension names as they appear in the results.'}}, required: ['extensions'], additionalProperties: false},
  },
  {
    name: 'propose_test',
    description: 'Shows the user a button to run a new real test. Use when the user asks for a test, or when an estimate is not good enough. The test runs only if the user presses the button and takes several minutes; when it finishes you will be given the new results. Only extensions from this test can be used.',
    parameters: {
      type: 'object',
      properties: {
        extensions: {type: 'array', items: {type: 'string'}, description: 'Extension names from the results to switch on.'},
        websites: {type: 'array', items: {type: 'string'}, description: 'Websites to load, for example "youtube.com". Leave out to reuse this test\'s websites.'},
        thoroughness: {type: 'string', enum: ['quick', 'standard', 'thorough'], description: 'quick = 3 loads per site, standard = 5, thorough = 9. Default standard.'},
      },
      required: ['extensions'],
      additionalProperties: false,
    },
  },
];

const ROUNDS = {quick: 3, standard: 5, thorough: 9};

function systemPrompt(data) {
  return `You help a non-technical person understand a test of how much their browser extensions slow down web pages, made with the tool "Chrome Firefox Browser Extensions Impact Analyser".

How the test works: each extension was installed on its own in a clean test browser (${data.engine === 'firefox' ? 'Firefox' : 'Chrome for Testing'}), and each website was loaded several times with and without it. Numbers are the change versus no extensions: "extra work" is extra time the page's main thread was busy; "slower to load" is the change in when the page finished loading; "main content later" is the change in when the largest text or image appeared; "page frozen" is time the page could not respond. Negative means faster. Changes within normal run-to-run variation are not real.
Verdicts: Heavy = at least ${THRESHOLDS.heavy.cpu} ms extra work or ${THRESHOLDS.heavy.slowdown / 1000} s slower; Noticeable = ${THRESHOLDS.moderate.cpu} ms or ${THRESHOLDS.moderate.slowdown} ms; Small = ${THRESHOLDS.light.cpu} ms or ${THRESHOLDS.light.slowdown} ms.

Rules:
- Call get_results before answering anything about the numbers. Never invent numbers.
- For "what if only these extensions" questions, call estimate_combination, say clearly it is an estimate, and mention how well adding up matched the real "all together" test when that is available. Offer a real test with propose_test.
- Only call propose_test when the user wants a test or a decision depends on one. You cannot run tests yourself; the user presses the button.
- Answer in plain English, in a few short sentences or a short list. No tables, no jargon, no markdown headings.`;
}

// Runs one question through the assistant, letting it use the tools. Returns
// {answer, actions}, where actions are test buttons to show the user.
export async function ask({config, data, question, history = [], fetchImpl = fetch}) {
  const actions = [];
  const runTool = call => {
    if (call.name === 'get_results') return summarizeRun(data);
    if (call.name === 'estimate_combination') return estimateCombination(data, call.input.extensions);
    if (call.name === 'propose_test') {
      const {found, unknown} = findExtensions(data, call.input.extensions);
      if (found.length === 0) return {error: 'None of those extensions are in this test. Use names from get_results.', unknownNames: unknown};
      const websites = (Array.isArray(call.input.websites) ? call.input.websites : []).map(String).filter(Boolean).slice(0, 10);
      const rounds = ROUNDS[call.input.thoroughness] || ROUNDS.standard;
      actions.push({
        type: 'run',
        extensionKeys: found.flatMap(r => r.extensionKeys),
        extensionNames: found.map(r => r.label),
        urls: websites,
        rounds,
      });
      return {shownToUser: true, extensions: found.map(r => r.label), unknownNames: unknown, websites: websites.length ? websites : data.urls, loadsPerSite: rounds, note: 'The user sees a button to start this test. Tell them what it will check and that it takes a few minutes.'};
    }
    return {error: `Unknown tool ${call.name}.`};
  };

  const messages = [
    ...history.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content).slice(-12).map(m => ({role: m.role, content: m.content.slice(0, 4000)})),
    {role: 'user', content: String(question).slice(0, 4000)},
  ];
  const system = systemPrompt(data);
  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await complete(config, {system, messages, tools: TOOLS}, fetchImpl);
    if (r.calls.length === 0) return {answer: r.text || 'I could not find an answer to that.', actions};
    messages.push(r.raw);
    messages.push(...toolResults(config, r.calls, r.calls.map(runTool)));
  }
  return {answer: 'That needed more steps than I am allowed. Try asking a narrower question.', actions};
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5vl:3b';

const DEMO_TOKENS = {
  vision: 256,
  classify: 256,
  full: 1024,
  text: 16
};

const PROMPT_1 =
  'You are an archaeology assistant. Look at this image carefully. In one precise sentence, describe what physical object you see. Be specific about material, shape, size estimate, and any visible markings or decorations.';

function prompt2(step1) {
  return (
    `Based on this object description: ${step1}. ` +
    'Is this object a historical, cultural, or antique artifact (pottery, coins, tools, inscribed objects, antique instruments, archaeological specimens)? ' +
    'Answer with exactly: ARTIFACT or NOT_ARTIFACT, then a colon, then one sentence of reasoning.'
  );
}

function prompt3(step1, strict = false) {
  const base =
    `You are an expert archaeologist. Based on this object: ${step1}. ` +
    'Provide a JSON response with exactly these fields: ' +
    '{ identification: string (artifact name and type), ' +
    "ageEstimate: string (probable age/period, e.g. '2nd-3rd century CE, Roman'), " +
    "ageConfidence: 'High' | 'Medium' | 'Low', " +
    'matchName: string (closest known artifact type or named example), ' +
    'matchSourceUrl: string (a real museum or archaeological database URL if known, else null), ' +
    'eraCulture: string (era and culture), ' +
    "condition: 'Pristine' | 'Good' | 'Worn' | 'Damaged' | 'Restored' | 'Fragmentary', " +
    'conditionRationale: string (one sentence visual rationale), ' +
    'origin: string (probable country or region of origin), ' +
    "originConfidence: 'High' | 'Medium' | 'Low', " +
    'summary: string (4-6 sentence plain-language field summary combining age, match, condition, origin) }';
  if (strict) {
    return (
      base +
      ' Respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON. All keys and string values must use double quotes. Use null (no quotes) for unknown URLs.'
    );
  }
  return base + ' Respond with valid JSON only. No markdown, no explanation outside the JSON.';
}

async function ollamaGenerate(prompt, imageBase64, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const body = {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      // RAM-tuned for 16GB Macs: our prompts need hundreds of tokens, not the
      // 128k default context (which reserves gigabytes of KV cache). Short
      // cap on responses keeps generation fast and memory-light.
      options: { num_ctx: 2048, num_predict: opts.numPredict || 1024 },
      keep_alive: '5m',
    };
    if (imageBase64) {
      const clean = String(imageBase64).includes(',')
        ? String(imageBase64).split(',').pop()
        : String(imageBase64);
      body.images = [clean];
    }
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama responded with status ${response.status}`);
    }
    const data = await response.json();
    if (!data || typeof data.response !== 'string') {
      throw new Error('Ollama returned an unexpected response shape.');
    }
    return data.response.trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('AI request timed out. Make sure Ollama is running and try again.');
    }
    if (err.cause && (err.cause.code === 'ECONNREFUSED' || err.message.includes('fetch failed'))) {
      throw new Error('AI unavailable. Make sure Ollama is running on ' + OLLAMA_BASE_URL + '.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonRobust(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty AI response.');
  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in AI response.');
  }
  const candidate = cleaned.slice(start, end + 1);
  return JSON.parse(candidate);
}

const VALID_AGE_CONF = new Set(['High', 'Medium', 'Low']);
const VALID_CONDITION = new Set(['Pristine', 'Good', 'Worn', 'Damaged', 'Restored', 'Fragmentary']);
const VALID_ORIGIN_CONF = new Set(['High', 'Medium', 'Low']);

function sanitizeIdentification(parsed) {
  return {
    identification: String(parsed.identification || 'Unidentified object'),
    ageEstimate: String(parsed.ageEstimate || 'Unknown'),
    ageConfidence: VALID_AGE_CONF.has(parsed.ageConfidence) ? parsed.ageConfidence : 'Low',
    matchName: String(parsed.matchName || 'No close match found'),
    matchSourceUrl:
      typeof parsed.matchSourceUrl === 'string' && parsed.matchSourceUrl.startsWith('http')
        ? parsed.matchSourceUrl
        : null,
    eraCulture: String(parsed.eraCulture || 'Unknown'),
    condition: VALID_CONDITION.has(parsed.condition) ? parsed.condition : 'Worn',
    conditionRationale: String(parsed.conditionRationale || 'Condition could not be determined from the description.'),
    origin: String(parsed.origin || 'Unknown'),
    originConfidence: VALID_ORIGIN_CONF.has(parsed.originConfidence) ? parsed.originConfidence : 'Low',
    summary: String(parsed.summary || 'Identification incomplete. Try capturing a clearer photo.'),
  };
}

async function checkAiStatus() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { status: 'unavailable', model: OLLAMA_MODEL };
    return { status: 'online', model: OLLAMA_MODEL };
  } catch (err) {
    return { status: 'unavailable', model: OLLAMA_MODEL };
  } finally {
    clearTimeout(timeout);
  }
}

async function classifyImage(imageBase64) {
  const step1 = await ollamaGenerate(PROMPT_1, imageBase64, { numPredict: DEMO_TOKENS.vision });
  const step2 = await ollamaGenerate(prompt2(step1), undefined, { numPredict: DEMO_TOKENS.classify });
  const head = step2.trim().toUpperCase();
  const isArtifact = head.startsWith('ARTIFACT') && !head.startsWith('NOT_ARTIFACT');
  return { step1ObjectRead: step1, classification: step2, isArtifact };
}

async function identifyArtifact(imageBase64, options = {}) {
  const { classificationOnly = false } = options;
  let step1;
  try {
    step1 = await ollamaGenerate(PROMPT_1, imageBase64, { numPredict: DEMO_TOKENS.vision });
  } catch (err) {
    throw new Error(err.message || 'AI unavailable.');
  }
  if (!step1) throw new Error('The AI returned an empty description. Try again.');

  let classification = '';
  let isArtifact = true;
  try {
    classification = await ollamaGenerate(prompt2(step1), undefined, { numPredict: DEMO_TOKENS.classify });
    const head = classification.trim().toUpperCase();
    isArtifact = head.startsWith('ARTIFACT') && !head.startsWith('NOT_ARTIFACT');
  } catch (err) {
    classification = 'ARTIFACT: classification step failed, proceeding with identification.';
    isArtifact = true;
  }

  if (classificationOnly) {
    return { step1ObjectRead: step1, classification, isArtifact };
  }

  if (!isArtifact) {
    return {
      step1ObjectRead: step1,
      classification,
      isArtifact: false,
    };
  }

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await ollamaGenerate(prompt3(step1, attempt === 1), undefined, { numPredict: DEMO_TOKENS.full });
      const parsed = parseJsonRobust(raw);
      const clean = sanitizeIdentification(parsed);
      try {
        const matchService = require('./matchService');
        if (!clean.matchSourceUrl && clean.matchName) {
          const found = await matchService.lookupMatch(clean.matchName);
          if (found && found.matchSourceUrl) clean.matchSourceUrl = found.matchSourceUrl;
        }
      } catch (err) {
        // Online match is best-effort; never fail identification because of it.
      }
      return { step1ObjectRead: step1, classification, isArtifact: true, ...clean };
    } catch (err) {
      lastError = err;
    }
  }
  const e = new Error('Identification failed — the AI could not parse the result. Try again.');
  e.cause = lastError;
  throw e;
}

module.exports = {
  identifyArtifact,
  classifyImage,
  checkAiStatus,
  ollamaGenerate,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
};

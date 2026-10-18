const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

function withTimeout(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

async function viaSerpApi(query) {
  const { controller, timeout } = withTimeout(6000);
  try {
    const url =
      'https://serpapi.com/search.json?q=' +
      encodeURIComponent(`${query} museum artifact`) +
      `&api_key=${encodeURIComponent(SERPAPI_KEY)}&num=5`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const first = (data.organic_results || [])[0];
    if (first && first.link) {
      return { matchName: first.title || query, matchSourceUrl: first.link };
    }
    return null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function viaDuckDuckGo(query) {
  const { controller, timeout } = withTimeout(6000);
  try {
    const url =
      'https://html.duckduckgo.com/html/?q=' +
      encodeURIComponent(`${query} museum collection artifact`);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArtifactLens/1.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/uddg=([^"&']+)/);
    if (m && m[1]) {
      return { matchName: query, matchSourceUrl: decodeURIComponent(m[1]) };
    }
    const m2 = html.match(/https?:\/\/(www\.)?(metmuseum\.org|britishmuseum\.org|si\.edu|loc\.gov|archaeology[^"'<>\s]*)/);
    if (m2 && m2[0]) {
      const proto = m2[0].startsWith('http') ? m2[0] : `https://${m2[0]}`;
      return { matchName: query, matchSourceUrl: proto };
    }
    return null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupMatch(query) {
  if (!query || typeof query !== 'string' || !query.trim()) return null;
  try {
    if (SERPAPI_KEY) {
      const viaSerp = await viaSerpApi(query.trim());
      if (viaSerp) return viaSerp;
    }
    const viaDdg = await viaDuckDuckGo(query.trim());
    if (viaDdg) return viaDdg;
    return null;
  } catch (err) {
    return null;
  }
}

module.exports = { lookupMatch };

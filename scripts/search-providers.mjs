/**
 * Live search providers for a read-only pilot. No provider can be used without
 * an explicitly configured key/URL. All search hits remain unverified clues.
 */
const TIMEOUT_MS = 30_000;
function normalize(item, provider) {
  return {
    title: String(item?.title ?? item?.name ?? ''),
    snippet: String(item?.snippet ?? item?.description ?? item?.content ?? ''),
    link: String(item?.link ?? item?.url ?? ''),
    date: String(item?.date ?? item?.publishedDate ?? item?.published_at ?? ''),
    provider,
  };
}
function safeHttpUrl(raw, { localOnly = false } = {}) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid search provider URL'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Search provider URL must be HTTP(S) without embedded credentials');
  }
  if (localOnly && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) {
    throw new Error('Pilot SearXNG URL must be localhost to avoid leaking research queries or API keys');
  }
  return url;
}

export async function braveSearch(key, recipe, fetchFn = fetch) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', recipe.query);
  url.searchParams.set('count', '10');
  url.searchParams.set('country', recipe.gl?.toUpperCase() || 'US');
  const response = await fetchFn(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'Accept':'application/json', 'X-Subscription-Token':key },
  });
  if ([401,403,429].includes(response.status)) {
    throw new Error('Brave Search HTTP ' + response.status + ' (check key, credits or rate limit)');
  }
  if (!response.ok) throw new Error('Brave Search HTTP ' + response.status);
  const data = await response.json();
  const hits = data?.web?.results;
  if (!Array.isArray(hits)) throw new Error('Brave Search response missing web.results');
  return hits.map(x => normalize(x, 'brave'));
}

export async function searxngSearch(baseUrl, recipe, fetchFn = fetch) {
  const base = safeHttpUrl(baseUrl, { localOnly: true });
  const url = new URL('/search', base);
  url.searchParams.set('q', recipe.query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');
  const response = await fetchFn(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (response.status === 403) throw new Error('SearXNG HTTP 403: enable json output under search.formats in settings.yml');
  if (!response.ok) throw new Error('SearXNG HTTP ' + response.status);
  const data = await response.json();
  if (!Array.isArray(data?.results)) throw new Error('SearXNG response missing results array');
  return data.results.slice(0,10).map(x => normalize(x,'searxng'));
}

export async function serpApiSearch(key, recipe, fetchFn = fetch) {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', recipe.query);
  url.searchParams.set('num', '10');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', recipe.gl);
  url.searchParams.set('api_key', key);
  const response = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if ([401,403,429].includes(response.status)) throw new Error('SerpAPI HTTP ' + response.status + ' (check key, account permissions or credits)');
  if (!response.ok) throw new Error('SerpAPI HTTP ' + response.status);
  const data = await response.json();
  if (data?.error) throw new Error('SerpAPI search rejected the request');
  if (!Array.isArray(data?.organic_results)) throw new Error('SerpAPI response missing organic_results');
  return data.organic_results.map(x => normalize(x,'serpapi'));
}

export function configuredProviders(config) {
  const providers=[];
  if (config.braveKey?.trim()) {
    providers.push({name:'brave',search:(recipe,fetchFn)=>braveSearch(config.braveKey,recipe,fetchFn)});
  }
  if (config.searxngUrl?.trim()) {
    safeHttpUrl(config.searxngUrl, {localOnly:true});
    providers.push({name:'searxng',search:(recipe,fetchFn)=>searxngSearch(config.searxngUrl,recipe,fetchFn)});
  }
  if (config.serpApiKey?.trim()) {
    providers.push({name:'serpapi',search:(recipe,fetchFn)=>serpApiSearch(config.serpApiKey,recipe,fetchFn)});
  }
  return providers;
}

/** Stops retrying a provider when its credentials or quota fail. */
export async function searchWithFallback(providers, recipe, fetchFn = fetch) {
  const failures=[];
  for (const p of providers) {
    if (p.disabled) continue;
    try {
      const results=await p.search(recipe,fetchFn);
      return {results,provider:p.name,failures};
    } catch (error) {
      const message=String(error?.message || error).replace(/[\r\n]+/g,' ').slice(0,200);
      failures.push(p.name+': '+message);
      if (/HTTP (401|403|429)/i.test(message)) p.disabled=true;
    }
  }
  return {results:[],provider:'none',failures};
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENT = 'Mozilla/5.0 (compatible; RolloutPlusBot/1.0)';
const TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

// This function fetches a web address chosen by a signed-in member, so it must
// never be tricked into reading internal or private addresses on the server's
// side (SSRF). Only http(s) is allowed, and every address — including each
// redirect — must resolve to a public IP.
const isPrivateV4 = (ip: string) => {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const isPrivateV6 = (ip: string) => {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateV4(mapped[1]) : false;
};

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

const assertPublicHost = async (hostname: string) => {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('blocked address');
  }
  if (IPV4.test(host)) {
    if (isPrivateV4(host)) throw new Error('blocked address');
    return;
  }
  if (host.includes(':')) {
    if (isPrivateV6(host)) throw new Error('blocked address');
    return;
  }
  const addresses: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    try {
      addresses.push(...(await Deno.resolveDns(host, type)));
    } catch {
      // no records of this type
    }
  }
  if (addresses.length === 0) throw new Error('could not resolve address');
  if (addresses.some((ip) => (ip.includes(':') ? isPrivateV6(ip) : isPrivateV4(ip)))) {
    throw new Error('blocked address');
  }
};

const safeFetch = async (start: string, accept: string): Promise<Response> => {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported address');
    await assertPublicHost(parsed.hostname);

    const response = await fetch(current, {
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location')!, current).toString();
      continue;
    }
    return response;
  }
  throw new Error('too many redirects');
};

const readLimited = async (response: Response) => {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
};

function getMeta(html: string, ...props: string[]): string | null {
  for (const prop of props) {
    for (const pattern of [
      new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
      new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, 'i'),
    ]) {
      const m = html.match(pattern);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string' || url.length > 2048) return reply({ error: 'url required' }, 400);

    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return reply({ error: 'unsupported address' }, 400);
    const domain = parsed.hostname.replace(/^www\./, '');

    // YouTube — oEmbed, no API key needed
    if (['youtube.com', 'youtu.be', 'm.youtube.com'].includes(domain)) {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (r.ok) {
        const d = await r.json();
        return reply({
          title: d.title ?? null,
          image: d.thumbnail_url ?? null,
          domain: 'youtube.com',
          description: d.author_name ? `by ${d.author_name}` : null,
        });
      }
    }

    // Spotify — oEmbed
    if (domain === 'open.spotify.com' || domain === 'spotify.com') {
      const r = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
        { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (r.ok) {
        const d = await r.json();
        return reply({
          title: d.title ?? null,
          image: d.thumbnail_url ?? null,
          domain: 'spotify.com',
          description: null,
        });
      }
    }

    // General — OG / Twitter Card scraping
    const r = await safeFetch(url, 'text/html');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const html = await readLimited(r);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    return reply({
      title: getMeta(html, 'og:title', 'twitter:title') ?? titleTag?.[1]?.trim() ?? domain,
      image: getMeta(html, 'og:image', 'twitter:image') ?? null,
      domain,
      description: getMeta(html, 'og:description', 'twitter:description') ?? null,
    });
  } catch (e) {
    return reply({ error: String(e) }, 500);
  }
});

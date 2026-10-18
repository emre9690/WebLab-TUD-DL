// Walks a WebLab folder tree using the user's own logged-in session.
var WLX = globalThis.WLX || (globalThis.WLX = {});

(() => {
  const MAX_DEPTH = 12;

  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('Cancelled', 'AbortError'));
      });
    });

  // Problems that affect every page, so the whole download stops instead of
  // producing a zip full of empty questions.
  const fatal = (message) => Object.assign(new Error(message), { fatal: true });

  async function fetchDoc(url, signal) {
    let res;
    try {
      res = await fetch(url, { credentials: 'include', signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      // A dropped connection, or an expired session redirecting to TU Delft's login site.
      throw fatal("Couldn't reach WebLab. Check that you're online and still logged in, then try again.");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    // Every logged-in WebLab page has the "Sign out" menu; without it we got a login page.
    if (!doc.querySelector('[submitid^="userMenu_signout"]')) {
      throw fatal("You're logged out of WebLab. Log in again, then try once more.");
    }
    return doc;
  }

  function slug(s, max = 40) {
    return (
      String(s)
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, max) || 'figure'
    );
  }

  // Images are referenced in Markdown by a placeholder token; output.js swaps in
  // the right relative path for each file that mentions them.
  class ImageRegistry {
    constructor() {
      this.byUrl = new Map();
      this.list = [];
      this.hint = '';
    }

    register(img, baseUrl) {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return null;
      let url;
      try {
        url = new URL(src, baseUrl).href;
      } catch {
        return null;
      }
      if (!this.byUrl.has(url)) {
        const ext = (url.split(/[?#]/)[0].match(/\.(png|jpe?g|gif|svg|webp|bmp)$/i) || [, 'png'])[1].toLowerCase();
        const n = String(this.list.length + 1).padStart(3, '0');
        const entry = { url, token: `@@WLX_IMG_${n}@@`, file: `${n}-${slug(this.hint)}.${ext}` };
        this.byUrl.set(url, entry);
        this.list.push(entry);
      }
      return this.byUrl.get(url).token;
    }
  }

  // items: [{ url, path: [titles from the course's top folder down to this item] }]
  // opts: { includeMine, delayMs }
  // onProgress({ done, current, errors })
  async function crawl(items, opts, onProgress, signal) {
    const seen = new Set();
    const images = new ImageRegistry();
    const ctx = { onImage: (img, base) => images.register(img, base) };
    const stats = { done: 0, errors: 0 };
    let first = true;

    async function visit(url, trail, depth) {
      const id = WLX.assignmentId(url);
      if (id && seen.has(id)) return null;
      if (id) seen.add(id);
      if (!first) await sleep(opts.delayMs, signal);
      first = false;

      onProgress({ ...stats, current: trail.join(' › ') });
      let node;
      try {
        images.hint = trail[trail.length - 1] || '';
        node = WLX.parsePage(await fetchDoc(url, signal), url, ctx);
      } catch (e) {
        if (e.name === 'AbortError' || e.fatal) throw e;
        stats.errors++;
        return { kind: 'error', title: trail[trail.length - 1] || url, url, error: String(e.message || e) };
      }
      stats.done++;

      if (node.kind === 'folder') {
        node.items = [];
        if (depth < MAX_DEPTH) {
          for (const child of node.children) {
            const sub = await visit(child.url, [...trail, child.title], depth + 1);
            if (sub) node.items.push(sub);
          }
        }
      } else if (node.answerUrl) {
        try {
          await sleep(opts.delayMs, signal);
          node.modelAnswer = WLX.parseAnswer(await fetchDoc(node.answerUrl, signal), node.answerUrl, ctx);
        } catch (e) {
          if (e.name === 'AbortError' || e.fatal) throw e;
          node.modelAnswer = { status: 'error', error: String(e.message || e) };
        }
      }
      return node;
    }

    const sections = [];
    for (const item of items) {
      const node = await visit(item.url, item.path, 0);
      if (node) sections.push({ node, path: item.path });
    }

    // Download images last, so a broken image never stops the crawl.
    for (const [i, img] of (opts.includeImages ? images.list : []).entries()) {
      onProgress({ ...stats, current: `Image ${i + 1} of ${images.list.length}` });
      try {
        const res = await fetch(img.url, { credentials: 'include', signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        img.bytes = new Uint8Array(await res.arrayBuffer());
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        img.error = String(e.message || e);
      }
      await sleep(Math.min(opts.delayMs, 150), signal);
    }

    return { sections, images: images.list, stats };
  }

  // Lists one folder's children (for the folder picker).
  async function listFolder(url, signal) {
    const node = WLX.parsePage(await fetchDoc(url, signal), url, {});
    return { kind: node.kind, title: node.title, children: node.kind === 'folder' ? node.children : [] };
  }

  WLX.crawl = crawl;
  WLX.listFolder = listFolder;
  WLX.slug = slug;
})();

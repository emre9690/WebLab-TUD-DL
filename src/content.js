// Sets the _browser variable according to the browser currently used (chromium/other)
const _browser = typeof browser !== 'undefined' ? browser : chrome;

// Runs inside WebLab tabs: receives "start" from the popup, shows progress, saves the zip.
var WLX = globalThis.WLX || (globalThis.WLX = {});

(() => {
  let running = null; // AbortController while a download is in progress

  const folderCache = new Map();

  // The "Submission" view of the current page (an /info or /answer page has no folder listing).
  function currentUrl() {
    const sub = document.querySelector('#view-mode a[href*="/submission/"]');
    if (sub && WLX.assignmentId(sub.href) === WLX.assignmentId(location.href)) return sub.href;
    return location.href.split('#')[0];
  }

  // Works from any page inside a course: the breadcrumb links back to the top folder.
  function courseInfo() {
    const links = Array.from(document.querySelectorAll('ul.breadcrumb li a[href]'));
    const pick = (re) => links.find((a) => re.test(a.getAttribute('href')));
    const course = pick(/^https?:\/\/[^/]+\/[^/]+\/?$/);
    const edition = pick(/^https?:\/\/[^/]+\/[^/]+\/[^/]+\/?$/);
    const chain = links.filter((a) => WLX.assignmentId(a.href));
    const currentId = WLX.assignmentId(location.href);
    const urlFor = (a) => (WLX.assignmentId(a.href) === currentId ? currentUrl() : a.href);
    return {
      course: course ? course.textContent.trim() : '',
      edition: edition ? edition.textContent.trim() : '',
      rootUrl: chain.length ? urlFor(chain[0]) : null,
      expandIds: chain.slice(1).map((a) => WLX.assignmentId(a.href)),
      currentId,
    };
  }

  // "/cse2520/2026-2027/" when the page belongs to a course; null on the WebLab home
  // page, profile, support etc. (those can link to old activity in other courses).
  function coursePrefix() {
    const m = location.pathname.match(/^\/[^/]+\/[^/]+\//);
    if (!m || /^\/(profile|support|newcourserequest|markdown-cheatsheet)\//i.test(m[0])) return null;
    return m[0];
  }

  // Pages without a breadcrumb chain (e.g. the course home): offer this course's assignments linked on the page.
  function linkedAssignments(prefix) {
    const seen = new Set();
    const out = [];
    for (const a of document.querySelectorAll('#maincontainer a[href*="/assignment/"]')) {
      const id = WLX.assignmentId(a.href);
      const title = a.textContent.replace(/\s+/g, ' ').trim();
      if (!id || !title || seen.has(id) || !new URL(a.href).pathname.startsWith(prefix)) continue;
      seen.add(id);
      out.push({ id, title, url: a.href.split('#')[0], isFolder: null });
    }
    return out;
  }

  async function listFolder(url) {
    if (!folderCache.has(url)) folderCache.set(url, WLX.listFolder(url));
    try {
      return await folderCache.get(url);
    } catch (e) {
      folderCache.delete(url);
      throw e;
    }
  }

  function overlay() {
    const box = document.createElement('div');
    box.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647', 'width:340px',
      'background:#fff', 'color:#222', 'border:1px solid #ccc', 'border-radius:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,.2)', 'padding:12px 14px',
      'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    box.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px">WebLab Downloader</div>
      <div data-status>Starting…</div>
      <div data-current style="color:#666;font-size:12px;margin-top:4px;word-break:break-word"></div>
      <div style="margin-top:10px;text-align:right">
        <button data-close style="font:inherit;padding:3px 10px;cursor:pointer">Cancel</button>
      </div>`;
    document.body.appendChild(box);
    const $ = (sel) => box.querySelector(sel);
    return {
      status: (s) => ($('[data-status]').textContent = s),
      current: (s) => ($('[data-current]').textContent = s),
      done: () => ($('[data-close]').textContent = 'Close'),
      onClose: (fn) => $('[data-close]').addEventListener('click', fn),
      remove: () => box.remove(),
    };
  }

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function run(items, options) {
    const controller = new AbortController();
    running = controller;
    const ui = overlay();
    ui.onClose(() => {
      if (running === controller) controller.abort();
      ui.remove();
    });

    const opts = { includeMine: !!options.includeMine, includeImages: options.includeImages !== false };

    try {
      const result = await WLX.crawl(
        items,
        opts,
        (p) => {
          ui.status(`Downloaded ${p.done} page${p.done === 1 ? '' : 's'}${p.errors ? ` · ${p.errors} failed` : ''}… keep this tab open`);
          ui.current(p.current || '');
        },
        controller.signal
      );
      if (!result.sections.some((s) => s.node.kind !== 'error')) {
        throw new Error(result.sections.length ? result.sections[0].node.error : 'Nothing found');
      }

      ui.status('Building zip…');
      const { zipName, blob, questionCount } = WLX.buildZip(result, opts);
      save(blob, zipName);
      const failed = result.stats.errors + result.images.filter((i) => i.error).length;
      ui.status(`Done: ${questionCount} question${questionCount === 1 ? '' : 's'} saved to ${zipName}${failed ? ` (${failed} item(s) failed, marked in the files)` : ''}`);
      ui.current('');
    } catch (e) {
      if (e.name === 'AbortError') return;
      ui.status(`Failed: ${e.message || e}`);
      console.error('[WebLab Downloader]', e);
    } finally {
      if (running === controller) running = null;
      ui.done();
    }
  }

  async function handle(msg) {
    if (msg.type === 'wlx-course') {
      const prefix = coursePrefix();
      if (!prefix) return { ok: true, running: !!running, inCourse: false };
      const info = courseInfo();
      // The popup loads the top folder itself (rootUrl), so it can use its cache.
      const top = info.rootUrl ? null : linkedAssignments(prefix);
      return { ok: true, running: !!running, inCourse: true, ...info, top };
    }
    if (msg.type === 'wlx-list') return { ok: true, ...(await listFolder(msg.url)) };
    if (msg.type === 'wlx-start') {
      if (running) return { ok: false, error: 'A download is already running in this tab.' };
      if (!msg.items || !msg.items.length) return { ok: false, error: 'Select at least one folder.' };
      run(msg.items, msg.options || {});
      return { ok: true };
    }
    return { ok: false, error: 'Unknown request' };
  }

  _browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !String(msg.type).startsWith('wlx-')) return false;
    handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true; // async response
  });
})();

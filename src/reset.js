// Resets your answers in WebLab folders, doing what you'd do by hand for each
// question: "Re-open your submission" (open its /edit page), click Reset, confirm.
var WLX = globalThis.WLX || (globalThis.WLX = {});

(() => {
  const MAX_DEPTH = 12;
  const MAX_FAILURES_IN_A_ROW = 3;
  const ORIGIN = 'https://weblab.tudelft.nl';

  // ".../assignment/1/submission/2/" -> ".../assignment/1/submission/2/edit"
  function editUrl(url) {
    const clean = url.split(/[?#]/)[0];
    if (/\/submission\/\d+\/edit$/.test(clean)) return clean;
    const m = clean.match(/^(.*\/assignment\/\d+\/submission\/\d+)\/?$/);
    return m ? `${m[1]}/edit` : null;
  }

  // Reads the arguments of WebLab's
  // serverInvoke("url", "action", [{"name":..,"value":..},], "formId", this.nextSibling, true, "placeholder")
  function parseInvoke(onclick) {
    const m = String(onclick).match(
      /serverInvoke\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*\[([\s\S]*?)\]\s*,\s*"([^"]*)"\s*,[^,]*,[^,]*,\s*"([^"]*)"\s*\)/
    );
    if (!m) return null;
    const unquote = (s) => {
      try {
        return JSON.parse(`"${s}"`);
      } catch {
        return s;
      }
    };
    const params = [];
    for (const p of m[3].matchAll(/\{\s*"name"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g)) {
      params.push([unquote(p[1]), unquote(p[2])]);
    }
    return { url: m[1], action: m[2], params, formId: m[4], placeholder: m[5] };
  }

  // Where the answer form lives: the normal question layout, or the code editor layout.
  // (Code questions keep their Reset button in the console panel under the editor.)
  const answerArea = (doc) => doc.querySelector('.sheet-content') || doc.querySelector('#a-sf-container');

  // The confirm "Reset" buttons on a question page (a single-page collection can have several).
  function findResets(doc) {
    const sheet = answerArea(doc);
    if (!sheet) return [];
    const out = new Map();
    for (const el of sheet.querySelectorAll('[submitid]')) {
      const id = el.getAttribute('submitid');
      if (!/_reset/i.test(id) && !/^reset$/i.test(el.textContent.trim())) continue;
      // Either a link that clicks the hidden button before it, or a button that calls the action itself.
      const btn = el.tagName === 'BUTTON' ? el : el.previousElementSibling;
      const call = btn && btn.tagName === 'BUTTON' && parseInvoke(btn.getAttribute('onclick'));
      // Only ever send WebLab's own actions to WebLab.
      if (!call || new URL(call.url, ORIGIN).origin !== ORIGIN) continue;
      out.set(id, call);
    }
    return [...out.values()];
  }

  // Essay questions have no Reset button, so do what you'd do by hand:
  // empty the answer box and click Save. Only for forms without a Reset button.
  function findEssayClears(doc, resets) {
    const sheet = answerArea(doc);
    if (!sheet) return [];
    const handled = new Set(resets.map((c) => c.formId));
    const out = new Map();
    for (const a of sheet.querySelectorAll('a[submitid*="_save"]')) {
      const btn = a.previousElementSibling;
      const call = btn && btn.tagName === 'BUTTON' && parseInvoke(btn.getAttribute('onclick'));
      if (!call || new URL(call.url, ORIGIN).origin !== ORIGIN || handled.has(call.formId)) continue;
      const form = call.formId && doc.getElementById(call.formId);
      const boxes = form ? [...form.querySelectorAll('textarea.inputWikiText[name]')] : [];
      if (!boxes.length) continue;
      out.set(call.formId, { ...call, blank: new Set(boxes.map((t) => t.name)) });
    }
    return [...out.values()];
  }

  // WebLab hides Reset when there's nothing to reset, so tell "already empty" apart from "can't reset".
  function hasAnswer(doc) {
    const area = answerArea(doc);
    if (!area) return true;
    if (area.querySelector('input[type="radio"][checked], input[type="checkbox"][checked]')) return true;
    return [...area.querySelectorAll('textarea.inputWikiText, textarea.inputText')].some((t) => t.textContent.trim());
  }

  // Same fields the browser would send for this form (WebLab uses new FormData(form)).
  function formData(doc, call) {
    const fd = new FormData();
    const form = call.formId ? doc.getElementById(call.formId) : null;
    if (form) {
      for (const el of form.querySelectorAll('input[name], textarea[name], select[name]')) {
        if (el.disabled) continue;
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (['submit', 'button', 'file', 'image', 'reset'].includes(type)) continue;
        if (type === 'radio' || type === 'checkbox') {
          if (el.hasAttribute('checked')) fd.append(el.name, el.getAttribute('value') ?? 'on');
        } else if (el.tagName === 'SELECT') {
          for (const o of el.querySelectorAll('option')) if (o.selected) fd.append(el.name, o.value);
        } else if (el.tagName === 'TEXTAREA') {
          fd.append(el.name, call.blank && call.blank.has(el.name) ? '' : el.textContent);
        } else {
          fd.append(el.name, el.getAttribute('value') ?? '');
        }
      }
    }
    for (const [name, value] of call.params) fd.append(name, value);
    fd.append(call.action, '1');
    fd.append('__ajax_runtime_request__', call.placeholder);
    return fd;
  }

  // items: [{ url, path, isFolder }]. onProgress({ reset, skipped, failed, current })
  async function resetAll(items, onProgress, signal) {
    const seen = new Set();
    const stats = { reset: 0, empty: 0, skipped: 0, failed: 0, problems: [] };
    let failedInARow = 0;

    // Opening /edit is what "Re-open your submission" does. Fall back to the normal page.
    async function openEdit(edit, url) {
      try {
        return await WLX.fetchDoc(edit, signal);
      } catch (e) {
        if (e.name === 'AbortError' || e.fatal) throw e;
        return WLX.fetchDoc(url, signal);
      }
    }

    async function resetQuestion(doc, name) {
      const resets = findResets(doc);
      const calls = [...resets, ...findEssayClears(doc, resets)];
      if (!calls.length) {
        if (!hasAnswer(doc)) {
          stats.empty++;
          return;
        }
        stats.skipped++;
        stats.problems.push(`${name}: no Reset button (closed, or this question type can't be reset)`);
        return;
      }
      for (const call of calls) await WLX.postForm(new URL(call.url, ORIGIN).href, formData(doc, call), signal);
      stats.reset++;
    }

    async function visit(url, trail, isFolder, depth) {
      const id = WLX.assignmentId(url);
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      const name = trail.join(' › ');
      onProgress({ ...stats, current: name });

      try {
        // Questions go straight to /edit; folders (or unknowns) are opened normally first.
        const edit = editUrl(url);
        let doc = isFolder === false && edit ? await openEdit(edit, url) : await WLX.fetchDoc(url, signal);
        const node = WLX.parsePage(doc, url, {});

        if (node.kind === 'folder') {
          if (depth >= MAX_DEPTH) return;
          for (const child of node.children) {
            await visit(child.url, [...trail, child.title], child.isFolder, depth + 1);
          }
          return;
        }
        if (isFolder !== false && edit) doc = await openEdit(edit, url);
        await resetQuestion(doc, name);
        failedInARow = 0;
      } catch (e) {
        if (e.name === 'AbortError' || e.fatal) throw e;
        stats.failed++;
        stats.problems.push(`${name}: ${e.message || e}`);
        // Several errors in a row usually means WebLab is struggling: stop instead of pushing on.
        if (++failedInARow >= MAX_FAILURES_IN_A_ROW) {
          throw Object.assign(new Error('WebLab returned several errors in a row, so the reset was stopped. Please try again later.'), { fatal: true });
        }
      }
    }

    for (const item of items) await visit(item.url, item.path, item.isFolder, 0);
    onProgress({ ...stats, current: '' });
    return stats;
  }

  WLX.resetAll = resetAll;
})();

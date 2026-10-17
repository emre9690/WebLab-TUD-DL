// Converts WebLab's rendered HTML (wikitext) into Markdown that AI tools read well.
var WLX = globalThis.WLX || (globalThis.WLX = {});

(() => {
  const SKIP_TAGS = new Set(['style', 'noscript', 'svg', 'button', 'form', 'input', 'textarea', 'select']);
  const SKIP_CLASSES = ['MathJax_Preview', 'MathJax', 'MathJax_Display', 'MathJax_SVG', 'open-control', 'modal'];

  // ctx: { baseUrl, onImage(imgEl) -> markdown path or null }
  function toMarkdown(node, ctx = {}) {
    if (!node) return '';
    return clean(convert(node, ctx));
  }

  function clean(md) {
    return md
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function absUrl(href, ctx) {
    try {
      return new URL(href, ctx.baseUrl || 'https://weblab.tudelft.nl/').href;
    } catch {
      return href;
    }
  }

  function convert(n, ctx) {
    if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
    if (n.nodeType !== 1 && n.nodeType !== 9 && n.nodeType !== 11) return '';
    if (n.nodeType !== 1) return children(n, ctx);

    const tag = n.tagName.toLowerCase();
    if (tag === 'script') {
      const type = n.getAttribute('type') || '';
      if (!type.startsWith('math/tex')) return '';
      const tex = n.textContent.trim();
      return type.includes('mode=display') ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;
    }
    if (SKIP_TAGS.has(tag)) return '';
    if (n.classList && SKIP_CLASSES.some((c) => n.classList.contains(c))) return '';

    switch (tag) {
      case 'p':
      case 'div':
      case 'section':
      case 'article':
        return block(children(n, ctx).trim());
      case 'br':
        return '\n';
      case 'hr':
        return '\n\n---\n\n';
      case 'strong':
      case 'b':
        return wrap(children(n, ctx), '**');
      case 'em':
      case 'i':
        return wrap(children(n, ctx), '*');
      case 'del':
      case 's':
        return wrap(children(n, ctx), '~~');
      case 'code':
        return inlineCode(n.textContent);
      case 'pre':
        return codeBlock(n);
      case 'a': {
        const text = children(n, ctx).trim();
        const href = n.getAttribute('href');
        if (!href || href.startsWith('javascript') || href.startsWith('#') || !text) return text;
        return `[${text}](${absUrl(href, ctx)})`;
      }
      case 'img': {
        const alt = (n.getAttribute('alt') || 'figure').replace(/[[\]]/g, '');
        const path = ctx.onImage ? ctx.onImage(n) : absUrl(n.getAttribute('src') || '', ctx);
        return path ? `![${alt}](${path})` : '';
      }
      case 'ul':
      case 'ol':
        return list(n, ctx, tag === 'ol');
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        // Bold instead of headings, so question text never breaks the document outline.
        const t = children(n, ctx).trim();
        return t ? block(`**${t}**`) : '';
      }
      case 'blockquote':
        return block(
          clean(children(n, ctx))
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
        );
      case 'table':
        return table(n, ctx);
      default:
        return children(n, ctx);
    }
  }

  function children(n, ctx) {
    let out = '';
    for (const c of n.childNodes) out += convert(c, ctx);
    return out;
  }

  function block(s) {
    return s ? `\n\n${s}\n\n` : '';
  }

  function wrap(s, mark) {
    const t = s.trim();
    if (!t) return s;
    const lead = s.startsWith(' ') ? ' ' : '';
    const trail = s.endsWith(' ') ? ' ' : '';
    return `${lead}${mark}${t}${mark}${trail}`;
  }

  function inlineCode(text) {
    const t = text.replace(/\s+/g, ' ');
    if (!t.trim()) return '';
    const fence = t.includes('`') ? '``' : '`';
    return `${fence}${t}${fence}`;
  }

  function codeBlock(pre) {
    const code = pre.querySelector('code') || pre;
    const langMatch = `${code.className || ''} ${pre.className || ''}`.match(/language-([\w+#-]+)/);
    const lang = langMatch ? langMatch[1] : '';
    // Prism's line-number gutter has no text, so textContent is just the code.
    const text = code.textContent.replace(/^\n+|\s+$/g, '');
    const fence = text.includes('```') ? '````' : '```';
    return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
  }

  function list(n, ctx, ordered) {
    const items = Array.from(n.children).filter((c) => c.tagName.toLowerCase() === 'li');
    const lines = items.map((li, i) => {
      const marker = ordered ? `${i + 1}. ` : '- ';
      const body = clean(children(li, ctx)).replace(/\n/g, '\n' + ' '.repeat(marker.length));
      return marker + body;
    });
    return block(lines.join('\n'));
  }

  function table(n, ctx) {
    const rows = Array.from(n.querySelectorAll('tr'));
    if (!rows.length) return '';
    const cells = rows.map((r) =>
      Array.from(r.children).map((c) => clean(children(c, ctx)).replace(/\n+/g, ' ').replace(/\|/g, '\\|'))
    );
    const width = Math.max(...cells.map((r) => r.length));
    const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] || '').join(' | ')} |`;
    const out = [line(cells[0]), `|${' --- |'.repeat(width)}`, ...cells.slice(1).map(line)];
    return block(out.join('\n'));
  }

  WLX.toMarkdown = toMarkdown;
})();

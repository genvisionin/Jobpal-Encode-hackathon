/**
 * embed.ts — augments a rendered resume HTML document for safe embedding.
 *
 * Three modes:
 * - `paged` (preview + print): paginates the rendered resume into real A4
 *   (or Letter) sheets. On screen the sheets stack like a PDF viewer; on print
 *   each sheet is one physical page, so the downloaded PDF is true A4 with a
 *   content-driven page count. The script reports the stacked height to the
 *   host iframe so there is no clipping and no infinite blank scroll.
 * - `thumb`: scales the full-width page down into a fixed-ratio card.
 * - default: a plain resize reporter (legacy single-sheet preview).
 *
 * The resize message shape is `{ type: "jobpal:resize", height }`.
 */

export interface EmbedOptions {
  thumb?: boolean;
  /** Paginate into A4/Letter sheets for an accurate, paged preview + PDF. */
  paged?: boolean;
  paper?: "letter" | "a4";
  /** Auto-trigger the browser print dialog once pagination completes. */
  autoPrint?: boolean;
  /**
   * Rendered inside a hidden iframe on the app page for an in-page print: use
   * the print layout (native pagination, no JS slicing) but DON'T self-fire
   * print or self-close — the parent page drives the dialog.
   */
  embedPrint?: boolean;
}

/** Page pixel dimensions at 96dpi (CSS px), matching @page physical sizes. */
const PAGE_PX = {
  a4: { w: 794, h: 1123 },
  letter: { w: 816, h: 1056 },
} as const;

/**
 * The printed page margin, applied natively via `@page { margin }`. This is the
 * single most reliable way to get a uniform, breathing margin on EVERY printed
 * page (headless or interactive, regardless of the dialog's "Margins" setting).
 * Values are tuned to match the on-screen sheet padding (~44px/52px) so the PDF
 * is a faithful WYSIWYG of the preview.
 */
const PRINT_MARGIN = "12mm 14mm";

const RESIZE_SCRIPT = `
<script>
(function () {
  function post() {
    try {
      var doc = document.documentElement;
      var h = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
      parent.postMessage({ type: "jobpal:resize", height: h }, "*");
    } catch (e) {}
  }
  window.addEventListener("load", post);
  window.addEventListener("resize", post);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(post);
  setTimeout(post, 150);
  setTimeout(post, 600);
  if (window.ResizeObserver && document.body) new ResizeObserver(post).observe(document.body);
})();
</script>`;

const THUMB_CSS = `
<style>
  html, body { overflow: hidden !important; }
  .page { box-shadow: none !important; }
</style>`;

/** CSS for the paged (A4 sheet) view — screen stacking + print one-per-page. */
function pagedCss(paperKey: "letter" | "a4"): string {
  const { w, h } = PAGE_PX[paperKey];
  const size = paperKey === "a4" ? "A4" : "letter";
  return `
<style>
  html, body { height: auto !important; margin: 0 !important; background: #e9eaf0 !important; }
  #sheets { display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 22px; }
  .sheet {
    width: ${w}px;
    background: #fff;
    box-shadow: 0 4px 22px rgba(0,0,0,.16);
    overflow: hidden;
    position: relative;
    flex: none;
  }
  #sheets.ready .sheet { height: ${h}px; }
  /* The template's .page / .main become the sheet's content surface. */
  .sheet > .page {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    min-height: 0 !important;
    box-shadow: none !important;
    display: block !important;
    position: relative;
  }
  #sheets.ready .sheet > .page { height: ${h}px !important; }
  /* Sidebar template: pin the colored rail full-height, flow the main column. */
  .sheet > .page > .side { position: absolute; left: 0; top: 0; bottom: 0; width: 33%; }
  .sheet > .page > .main { margin-left: 33%; }

  @media print {
    /* Native page margin — the browser applies this uniformly to EVERY page,
       which is the most reliable way to get consistent breathing room (works
       headless and in the interactive dialog regardless of its Margins
       setting). Content flows naturally and the browser breaks pages itself. */
    @page { size: ${size}; margin: ${PRINT_MARGIN}; }
    html, body {
      background: #fff !important;
      height: auto !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Collapse the on-screen sheet scaffolding (only present in the preview
       iframe) so printing flows as one continuous column. */
    #sheets, #sheets.ready { display: block !important; gap: 0 !important; padding: 0 !important; background: #fff !important; }
    .sheet {
      box-shadow: none !important;
      width: auto !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      background: transparent !important;
    }
    /* The template page fills the printable width; its own padding/max-width is
       removed on print because the @page margin already supplies the inset
       (prevents a doubled margin). Targets both the bare .page (print tab) and
       a paginated .sheet > .page (if the preview is printed directly). */
    .page, .sheet > .page {
      width: 100% !important;
      max-width: none !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
    }
    /* Keep logical blocks (a heading + its entries) from splitting awkwardly. */
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
  }
</style>`;
}

/** Client paginator: slices the rendered resume into A4 sheets. */
function pagedScript(paperKey: "letter" | "a4", autoPrint = false, embedPrint = false): string {
  const { w, h } = PAGE_PX[paperKey];
  return `
<script>
(function () {
  var PW = ${w}, PH = ${h}, LIMIT = PH - 2;
  var done = false;
  var AUTO_PRINT = ${autoPrint ? "true" : "false"};
  var EMBED_PRINT = ${embedPrint ? "true" : "false"};
  // Both the print tab and the in-page print iframe rely on NATIVE browser
  // pagination (no JS slicing), so the printed PDF gets uniform @page margins.
  var NATIVE_PAGINATE = AUTO_PRINT || EMBED_PRINT;

  function report() {
    try {
      var docH = document.documentElement.scrollHeight;
      parent.postMessage({ type: "jobpal:resize", height: docH }, "*");
    } catch (e) {}
  }

  function toArr(c) { return Array.prototype.slice.call(c); }
  function over(inner) { return inner.scrollHeight > LIMIT; }

  function run() {
    if (done) return;
    done = true;
    // Print paths (the print tab AND the in-page print iframe) do NOT
    // JS-paginate: they let the browser paginate natively under the @page
    // margin, which is far more reliable for the actual PDF. JS slicing is
    // only for the on-screen preview iframe.
    if (!NATIVE_PAGINATE) {
      try { paginate(); } catch (e) { /* leave original on failure */ }
    }
    report();
    setTimeout(report, 250);
    if (AUTO_PRINT) {
      // Standalone print tab: self-fire the dialog, then close the tab once the
      // user finishes so the download flow leaves nothing behind. (The in-page
      // iframe path, EMBED_PRINT, is driven by the parent page instead.)
      window.addEventListener("afterprint", function () {
        setTimeout(function () { try { window.close(); } catch (e) {} }, 100);
      });
      var fire = function () { try { window.focus(); window.print(); } catch (e) {} };
      // Wait for fonts to load so the printed PDF is exact.
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { setTimeout(fire, 300); });
      } else {
        setTimeout(fire, 500);
      }
    }
  }

  function paginate() {
    var source = document.querySelector(".page");
    if (!source) return;
    var isSidebar = source.querySelector(".side") && source.querySelector(".main");

    var container = document.createElement("div");
    container.id = "sheets";
    source.parentNode.insertBefore(container, source);

    if (isSidebar) {
      var side = source.querySelector(".side");
      var main = source.querySelector(".main");
      var nodes = toArr(main.children);
      var make = function () { return newSidebarSheet(container, side); };
      flow(nodes, make, make());
    } else {
      var cls = source.getAttribute("class") || "page";
      var nodes2 = toArr(source.children);
      var make2 = function () { return newSheet(container, cls); };
      flow(nodes2, make2, make2());
    }

    source.parentNode.removeChild(source);
    container.className = "ready";
  }

  function newSheet(container, innerClass) {
    var sheet = document.createElement("div"); sheet.className = "sheet";
    var inner = document.createElement("div"); inner.className = innerClass;
    sheet.appendChild(inner); container.appendChild(sheet);
    return { sheet: sheet, inner: inner };
  }

  function newSidebarSheet(container, side) {
    var sheet = document.createElement("div"); sheet.className = "sheet";
    var page = document.createElement("div"); page.className = "page";
    page.appendChild(side.cloneNode(true));
    var inner = document.createElement("div"); inner.className = "main";
    page.appendChild(inner);
    sheet.appendChild(page); container.appendChild(sheet);
    return { sheet: sheet, inner: inner };
  }

  // Distribute top-level blocks across sheets; split a block by its children
  // (heading + entries) when it can't fit on a single page.
  function flow(nodes, makeNext, first) {
    var cur = first;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      cur.inner.appendChild(node);
      if (over(cur.inner) && cur.inner.children.length > 1) {
        cur = makeNext();
        cur.inner.appendChild(node);
      }
      if (over(cur.inner) && node.children && node.children.length > 1) {
        cur.inner.removeChild(node);
        cur = splitBlock(node, cur, makeNext);
      }
    }
    return cur;
  }

  function splitBlock(block, cur, makeNext) {
    var shell = block.cloneNode(false);
    cur.inner.appendChild(shell);
    var kids = toArr(block.children);
    for (var j = 0; j < kids.length; j++) {
      var kid = kids[j];
      shell.appendChild(kid);
      if (over(cur.inner) && shell.children.length > 1) {
        cur = makeNext();
        shell = block.cloneNode(false);
        cur.inner.appendChild(shell);
        shell.appendChild(kid);
      }
    }
    return cur;
  }

  // Paginate after fonts/layout settle so heights are accurate.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTimeout(run, 30); });
  }
  window.addEventListener("load", function () { setTimeout(run, 80); });
  setTimeout(run, 800);
})();
</script>`;
}

export function withEmbedScript(html: string, options: EmbedOptions = {}): string {
  let out = html;

  // The paged layout is used for the on-screen preview, the standalone print
  // tab, and the in-page print iframe (embedPrint). All three share the same
  // CSS; the script differs only in whether/how it self-prints.
  if (options.paged || options.embedPrint) {
    const paperKey = options.paper === "letter" ? "letter" : "a4";
    const css = pagedCss(paperKey);
    const script = pagedScript(paperKey, options.autoPrint, options.embedPrint);
    out = out.includes("</head>") ? out.replace("</head>", `${css}</head>`) : css + out;
    out = out.includes("</body>") ? out.replace("</body>", `${script}</body>`) : out + script;
    return out;
  }

  if (options.thumb) {
    out = out.includes("</head>") ? out.replace("</head>", `${THUMB_CSS}</head>`) : THUMB_CSS + out;
  }
  out = out.includes("</body>") ? out.replace("</body>", `${RESIZE_SCRIPT}</body>`) : out + RESIZE_SCRIPT;
  return out;
}

// Web-only PDF text extraction, via a dynamically-imported pdfjs-dist — see
// the comment in `pdfExtract.ts` for why this needs to be a separate file.

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // Importing the worker bundle on the main thread has exactly one
      // top-level effect: it sets `globalThis.pdfjsWorker`. pdfjs checks for
      // that before it does anything else, and when it's there it runs the
      // worker's message handler in-process and never touches the network.
      //
      // This used to point `GlobalWorkerOptions.workerSrc` at a CDN, which
      // meant importing a statement silently required internet — the failure
      // surfaced as a bare "Failed to fetch" and nothing about it suggested
      // the network was the problem. An app that promises your data never
      // leaves the device shouldn't need a CDN to read a file you already
      // have. Parsing now happens on the main thread; for a statement (a
      // handful of text pages) that costs well under a second.
      const [pdfjs] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs'),
      ]);
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * pdfjs's `getTextContent()` returns text items in the order they appear in
 * the PDF's content stream, which for table-heavy documents (bank
 * statements especially) frequently does NOT match visual reading order —
 * a right-aligned "balance" column can be emitted before the row's own
 * description, for instance. Re-deriving line order from each item's actual
 * position (cluster by y, then sort left-to-right by x) turns the stream
 * back into what a person looking at the page would read.
 */
function reconstructLines(items: unknown[]): string {
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
  const tolerance = 2;
  for (const raw of items) {
    const item = raw as { str?: string; transform?: number[] };
    if (!item.str || item.str.trim() === '' || !item.transform) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < tolerance);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str: item.str! });
  }
  rows.sort((a, b) => b.y - a.y); // PDF y grows upward — top of the page first
  return rows
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(' ')
    )
    .join('\n');
}

/**
 * Turns pdfjs's own exception types into something worth reading. A
 * password-protected statement is the single most likely way this fails —
 * banks routinely mail out e-statements locked with your NRIC or date of
 * birth — and "PasswordException" tells nobody what to do about it.
 */
function describe(error: unknown): Error {
  const name = (error as { name?: string })?.name ?? '';
  const message = (error as { message?: string })?.message ?? String(error);

  if (name === 'PasswordException') {
    return new Error(
      'This PDF is password-protected. Open it with your password, save or ' +
        'print it as a new unlocked PDF, then import that — or export the ' +
        'statement as CSV from your bank instead.'
    );
  }
  if (name === 'InvalidPDFException') {
    return new Error(
      "This file isn't a readable PDF. If it was downloaded from internet " +
        'banking, try downloading it again — the copy may be incomplete.'
    );
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return new Error(
      "Couldn't load the PDF reader. Reload the app and try again."
    );
  }
  return error instanceof Error ? error : new Error(message);
}

/**
 * Extracts the plain text of every page of a PDF file, in reading order.
 * Pages are separated with a form-feed (`\f`) — the same convention tools
 * like `pdftotext` use — so callers can tell where one page's furniture
 * (letterhead, page numbers, footers) ends and the next page begins.
 */
export async function extractPdfText(file: Blob): Promise<string> {
  let pdfjs: PdfjsModule;
  let doc: Awaited<ReturnType<PdfjsModule['getDocument']>['promise']>;
  try {
    pdfjs = await loadPdfjs();
    const data = await file.arrayBuffer();
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (error) {
    throw describe(error);
  }

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(reconstructLines(content.items));
  }
  const text = pages.join('\n\f\n');

  // A statement that yields no text at all is a scan, not a document — every
  // "line" in it is part of one big image, and there is nothing to parse.
  if (!text.replace(/[\s\f]/g, '')) {
    throw new Error(
      'This PDF has no readable text in it — it looks like a scan or a photo. ' +
        'Export the statement as CSV from your bank instead.'
    );
  }
  return text;
}

/**
 * Native fallback — see `pdfExtract.web.ts` for the real implementation.
 *
 * PDF text extraction depends on `pdfjs-dist`, a browser-oriented library
 * that reaches for Node builtins (`fs`, `http`, ...) Metro can't resolve for
 * an iOS/Android bundle. Splitting this into `pdfExtract.ts` (this file,
 * used for every non-web platform) and `pdfExtract.web.ts` (web only) is the
 * only way to keep that dependency out of the native bundle graph entirely —
 * Metro picks one file or the other per platform at bundle time, so the
 * import never even gets resolved on native. Do not merge these back into
 * one file with a `Platform.OS` check; a dynamic `import()` behind a runtime
 * check still gets statically resolved into the native bundle.
 */
export async function extractPdfText(_file: Blob): Promise<string> {
  throw new Error(
    "PDF import isn't available on this device yet — export your statement as a CSV file instead."
  );
}

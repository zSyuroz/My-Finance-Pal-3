// The pdfjs worker bundle ships no types — it's imported purely for its one
// side effect (registering `globalThis.pdfjsWorker`), never for its exports.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs';

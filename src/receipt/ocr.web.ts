/**
 * Receipt scanning is not available in a browser.
 *
 * The recogniser is Google's ML Kit, which is native code running on the
 * device. There is no browser equivalent that is both offline and accurate
 * enough for a receipt — the credible web options are cloud APIs, and sending
 * a photo of someone's receipt to a third-party server contradicts the promise
 * the rest of this app makes.
 *
 * Kept as a separate file, like `pdfExtract`, because Metro resolves `.web.ts`
 * ahead of `.ts` and a `Platform.OS` check would not stop the native module
 * being pulled into the web bundle.
 */

export async function recognizeReceipt(_imageUri: string): Promise<string> {
  throw new Error(
    'Receipt scanning needs the camera, so it only works in the app on your phone — not in a browser.'
  );
}

export const RECEIPT_SCAN_AVAILABLE = false;

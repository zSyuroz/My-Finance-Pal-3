import { NativeModules } from 'react-native';
import TextRecognition, { type TextLine } from '@react-native-ml-kit/text-recognition';

/**
 * Reading the text off a photo of a receipt, on the device.
 *
 * ML Kit runs entirely offline — no key, no upload, nothing leaves the phone —
 * which is the only option consistent with the rest of this app. It does need
 * native code, so it works in a development or production build, not in Expo
 * Go. See `ocr.web.ts` for the browser, where it isn't available at all.
 */

type Positioned = { text: string; top: number; left: number; height: number };

/**
 * Rebuilds visual lines from ML Kit's blocks.
 *
 * A receipt is two columns — description on the left, price on the right — and
 * ML Kit usually returns those as separate blocks. Reading `result.text`
 * straight through would therefore give every item name followed by every
 * price, with no way to tell which price belongs to which item. Grouping by
 * vertical position and then sorting left-to-right puts "Chicken Rice" back
 * next to "5.50", which is the whole basis for parsing the thing.
 */
function reconstructLines(lines: Positioned[]): string {
  if (lines.length === 0) return '';

  const medianHeight =
    [...lines.map((l) => l.height)].sort((a, b) => a - b)[Math.floor(lines.length / 2)] || 12;
  // Half a line height: tall enough to absorb a slightly tilted photo, tight
  // enough not to merge two adjacent rows into one.
  const tolerance = Math.max(6, medianHeight * 0.5);

  const rows: { centre: number; parts: Positioned[] }[] = [];
  for (const line of [...lines].sort((a, b) => a.top - b.top)) {
    const centre = line.top + line.height / 2;
    const row = rows.find((r) => Math.abs(r.centre - centre) <= tolerance);
    if (row) {
      row.parts.push(line);
      // Keep the running centre honest as a row accumulates parts.
      row.centre = row.parts.reduce((s, p) => s + p.top + p.height / 2, 0) / row.parts.length;
    } else {
      rows.push({ centre, parts: [line] });
    }
  }

  return rows
    .sort((a, b) => a.centre - b.centre)
    .map((r) =>
      r.parts
        .sort((a, b) => a.left - b.left)
        .map((p) => p.text.trim())
        .filter(Boolean)
        .join('  ')
    )
    .filter(Boolean)
    .join('\n');
}

/**
 * Whether the recogniser is actually compiled into this build.
 *
 * Expo Go ships a fixed set of native modules and ML Kit is not among them, so
 * the app runs but this one call would throw a linking error written for
 * library authors. Checking up front lets the screen say something a user can
 * act on instead.
 */
const NATIVE_OCR_PRESENT = !!NativeModules.TextRecognition;

export async function recognizeReceipt(imageUri: string): Promise<string> {
  if (!NATIVE_OCR_PRESENT) {
    throw new Error(
      'Receipt scanning needs a development build of the app — it uses on-device text ' +
        'recognition that Expo Go does not include. Everything else works here.'
    );
  }
  const result = await TextRecognition.recognize(imageUri);

  const positioned: Positioned[] = [];
  for (const block of result.blocks ?? []) {
    for (const line of (block.lines ?? []) as TextLine[]) {
      if (!line.text?.trim()) continue;
      const frame = line.frame;
      // Without geometry there's nothing to sort by; fall back to the order
      // ML Kit gave, which is better than dropping the line.
      positioned.push({
        text: line.text,
        top: frame?.top ?? positioned.length * 100,
        left: frame?.left ?? 0,
        height: frame?.height ?? 12,
      });
    }
  }

  const reconstructed = reconstructLines(positioned);
  // If a build ever returns blocks without lines, the flat text is still
  // better than nothing.
  return reconstructed || result.text || '';
}

export const RECEIPT_SCAN_AVAILABLE = NATIVE_OCR_PRESENT;

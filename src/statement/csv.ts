/**
 * Delimited-text parsing.
 *
 * Bank exports are not clean CSV. They carry preamble lines above the header
 * (account number, holder name, statement period), quoted fields containing
 * commas, descriptions wrapped onto later rows, and whichever delimiter the
 * exporting system felt like — Maybank and CIMB both ship tab- and
 * semicolon-separated files depending on where you export from.
 *
 * Everything here works on whole text rather than on lines, because a quoted
 * field may itself contain a newline.
 */

const DELIMITERS = [',', ';', '\t', '|'];

/** RFC 4180 with the usual leniency: bare quotes inside unquoted fields are data, and a lone CR is a line break. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const src = String(text).replace(/\r\n?/g, '\n');

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || row.length) endRow();

  return rows.map((r) => r.map((c) => c.trim()));
}

/**
 * Pick the delimiter by which one yields the most *consistent* column count
 * across the busiest lines. Counting raw occurrences is fooled by
 * descriptions full of commas, or by a preamble full of colons.
 */
export function sniffDelimiter(text: string): string {
  const sample = String(text).split(/\r\n?|\n/).slice(0, 60).filter((l) => l.trim());
  let best = { delimiter: ',', score: -1 };

  for (const delimiter of DELIMITERS) {
    const counts = sample
      .map((line) => parseDelimited(line, delimiter)[0]?.length || 0)
      .filter((n) => n > 1);
    if (counts.length < 2) continue;

    const tally = new Map<number, number>();
    for (const n of counts) tally.set(n, (tally.get(n) || 0) + 1);
    let mode = 0;
    let modeCount = 0;
    for (const [n, c] of tally) {
      if (c > modeCount || (c === modeCount && n > mode)) {
        mode = n;
        modeCount = c;
      }
    }
    // Reward agreement first, then more columns as a tiebreak.
    const score = modeCount * 10 + mode;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

/** True when the text looks like a table rather than free prose (a PDF's text layer). */
export function looksDelimited(text: string): boolean {
  const lines = String(text).split(/\r\n?|\n/).filter((l) => l.trim()).slice(0, 40);
  if (lines.length < 2) return false;
  const delimiter = sniffDelimiter(text);
  const widths = lines.map((l) => parseDelimited(l, delimiter)[0]?.length || 0);
  const multi = widths.filter((w) => w >= 3).length;
  return multi >= Math.max(2, Math.floor(lines.length * 0.4));
}

export function toGrid(text: string): { delimiter: string; rows: string[][] } {
  const delimiter = sniffDelimiter(text);
  return {
    delimiter,
    rows: parseDelimited(text, delimiter).filter((r) => r.some((c) => c !== '')),
  };
}

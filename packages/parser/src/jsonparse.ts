const COMMA_SENTINEL_CHARACTER = '@';
function isMarkerChar(code: number): boolean {
  return code === 40 || code === 41 || code === 91 || code === 93; // ()[]
}

function isNumericToken(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    const isDigit = c >= 48 && c <= 57;
    if (
      !isDigit &&
      c !== 45 && // -
      c !== 40 && // (
      c !== 41 && // )
      c !== 46 && // .
      c !== 91 && // [
      c !== 93 // ]
    ) {
      return false;
    }
  }
  return true;
}

function isAllZeros(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) !== 48) {
      return false;
    }
  }
  return true;
}

/*
    function to find commas inside quoted text in a comma-delimited line and replace them with sentinel chars
    example:
    0x548,0x0,322118,"Invoke Yu'lon, the Jade Serpent",0x8
    =>
    0x548,0x0,322118,"Invoke Yu'lon@ the Jade Serpent",0x8
    such that the resulting string can be split using .split(',')

    the pieces will later need to have un_escape_commas(piece) called on each one to replace the commas
*/
function escape_commas(line: string): string {
  const marks = [];
  let inside_quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const prev_c = i > 0 ? line[i - 1] : null;
    if (inside_quoted) {
      // if we are on a quote this might be the start of a quoted string
      // but it could also be a quote-escaped substring
      if (c === '"' && (prev_c == null || prev_c !== '\\')) {
        inside_quoted = false;
        continue;
      }
      if (c === ',') {
        marks.push(i);
      }
    } else {
      if (c === '"') {
        inside_quoted = true;
      }
    }
  }
  if (marks.length === 0) {
    return line;
  }
  const chars = line.split('');
  for (const m of marks) {
    chars[m] = COMMA_SENTINEL_CHARACTER;
  }
  return chars.join('');
}

/*
    reverse function mentioned in escape_commas
*/
function un_escape_commas(line: string): string {
  return line.replace(COMMA_SENTINEL_CHARACTER, ',');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseWowToJSON(logline: string): any {
  /*
    JSON parse strategy:
    re-constitute the string from params but inspect each one to insure
    it's correctly quoted and escaped for JSON.parse to succeed
  */
  const parametersForJson = escape_commas(logline).split(',');
  const outParts = new Array(parametersForJson.length);
  for (let i = 0; i < parametersForJson.length; i += 1) {
    const p = parametersForJson[i];
    // Does the string only contain numbers or ()[], characters?
    if (isNumericToken(p)) {
      // Is it actually a long string of zeros? (json.parse does not like this)
      if (isAllZeros(p)) {
        outParts[i] = '0'; // reduce to a single zero
      } else {
        outParts[i] = p;
      }
    } else {
      if (p[0] === '"') {
        // This is an already quoted string, nothing to do
        outParts[i] = p;
      } else {
        // This is a string that needs quoting

        // Prefix and suffix represent the potential []() characters
        //  that are list separators in the log. Find these and save them.
        let start = 0;
        let end = p.length;
        while (start < end && isMarkerChar(p.charCodeAt(start))) {
          start += 1;
        }
        while (end > start && isMarkerChar(p.charCodeAt(end - 1))) {
          end -= 1;
        }

        const prefix = start > 0 ? p.slice(0, start) : '';
        const suffix = end < p.length ? p.slice(end) : '';
        const tempP = p.slice(start, end);

        // Quote the non-separator bits and add the prefix/suffix back in
        outParts[i] = `${prefix}"${tempP}"${suffix}`;
      }
    }
  }
  let buf = outParts.join(',');
  // Finally, normalize all list terminators
  buf = buf.replace(/\(/g, '[');
  buf = buf.replace(/\)/g, ']');

  // This is a really bad fix
  return JSON.parse(`{"data":[${un_escape_commas(buf).replaceAll('[,[', '[[')}]}`);
}

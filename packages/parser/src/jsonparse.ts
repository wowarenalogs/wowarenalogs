const COMMA_SENTINEL_CHARACTER = '@';

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
      if (c === '"' && prev_c && prev_c !== '\\') {
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
  for (const m of marks) {
    line = replaceAt(line, m, COMMA_SENTINEL_CHARACTER);
  }
  return line;
}

/*
    function to replace a single character in a string
*/
function replaceAt(line: string, index: number, replacement: string): string {
  return line.slice(0, index) + replacement + line.slice(index + replacement.length);
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
  let buf = '';
  for (const p of parametersForJson) {
    if (buf) {
      buf += ',';
    }
    // Does the string only contain numbers or ()[], characters?
    if (/^[-0-9)(.\][]+$/g.test(p)) {
      // Is it actually a long string of zeros? (json.parse does not like this)
      if (/^0+$/g.test(p)) {
        buf += '0'; // reduce to a single zero
      } else {
        buf += p;
      }
    } else {
      if (p[0] === '"') {
        // This is an already quoted string, nothing to do
        buf += p;
      } else {
        // This is a string that needs quoting

        // Prefix and suffix represent the potential []() characters
        //  that are list separators in the log. Find these and save them.
        // eslint-disable-next-line no-useless-escape
        const openingMarkers = /^([\(\)\]\[]+)/g;
        // eslint-disable-next-line no-useless-escape
        const closingMarkers = /([\(\)\]\[]+)$/g;
        let prefix = openingMarkers.exec(p) || '';
        let suffix = closingMarkers.exec(p) || '';
        prefix = prefix ? prefix[0] : '';
        suffix = suffix ? suffix[0] : '';

        // Remove the prefix/suffix from the string needing quotes
        let tempP = p.replace(openingMarkers, '');
        tempP = tempP.replace(closingMarkers, '');

        // Quote the non-separator bits and add the prefix/suffix back in
        buf += `${prefix}"${tempP}"${suffix}`;
      }
    }
  }
  // Finally, normalize all list terminators
  buf = buf.replace(/\(/g, '[');
  buf = buf.replace(/\)/g, ']');

  return JSON.parse(`{"data":[${un_escape_commas(buf)}]}`);
}

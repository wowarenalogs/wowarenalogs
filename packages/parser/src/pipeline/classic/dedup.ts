import { Observable } from 'rxjs';

const LINE_PARSER = /^(.*)? {2}([A-Z_]+),(.+)\s*$/;

export const dedup = () => {
  return (input: Observable<string>) => {
    return new Observable<string>((output) => {
      let lastTimestamp = '';
      const lastTimestampBuffer: Set<string> = new Set<string>();

      input.subscribe({
        next: (line) => {
          const regexMatches = line.match(LINE_PARSER);
          if (regexMatches && regexMatches.length > 0) {
            const timestamp = regexMatches[1];
            if (timestamp === lastTimestamp) {
              if (!lastTimestampBuffer.has(line)) {
                lastTimestampBuffer.add(line);
                output.next(line);
              }
            } else {
              lastTimestampBuffer.clear();
              lastTimestampBuffer.add(line);
              lastTimestamp = timestamp;
              output.next(line);
            }
          } else {
            output.next(line);
          }
        },
        error: (e) => {
          output.error(e);
        },
        complete: () => {
          output.complete();
        },
      });
    });
  };
};

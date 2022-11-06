import { Observable } from 'rxjs';

const LINE_PARSER = /^(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)\.(\d+)(?=\s)/;

export const dedup = () => {
  return (input: Observable<string>) => {
    return new Observable<string>((output) => {
      let lastTimestamp = '';
      const lastTimestampBuffer: Set<string> = new Set<string>();

      input.subscribe({
        next: (line) => {
          const regexMatches = line.match(LINE_PARSER);
          if (regexMatches && regexMatches.length > 0) {
            const timestamp = regexMatches[0];
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

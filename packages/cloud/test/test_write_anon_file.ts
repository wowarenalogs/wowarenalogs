import { handler } from '../src/writeAnonLogHandler';

handler(
  {
    bucket: 'wowarenalogs-log-files-dev',
    name: 'testlogfile.txt',
  },
  {},
);

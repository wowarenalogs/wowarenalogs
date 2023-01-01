import { getTimestamp } from '../src/pipeline/common/utils';

describe('utils tests', () => {
  it('should guess the correct year', () => {
    // machine time is 2023-01-01 00:00:00
    // log time is 12/01 00:00:00
    // expected to guess 2022 as the year and return 2022-12-01 00:00:00
    expect(getTimestamp(12, 1, 0, 0, 0, 0, 'Etc/UTC', 1672531200000)).toBe(1669852800000);

    // machine time is 2023-12-02 00:00:00
    // log time is 12/01 00:00:00
    // expected to guess 2023 as the year and return 2023-12-01 00:00:00
    expect(getTimestamp(12, 1, 0, 0, 0, 0, 'Etc/UTC', 1701475200000)).toBe(1701388800000);

    // machine time is 2022-12-31 23:00:00
    // log time is 01/01 00:00:00
    // expected to guess 2023 as the year and return 2023-01-01 00:00:00
    expect(getTimestamp(1, 1, 0, 0, 0, 0, 'Etc/UTC', 1672527600000)).toBe(1672531200000);

    // machine time is 2022-12-01 00:00:00
    // log time is 01/01 00:00:00
    // expected to guess 2022 as the year and return 2022-01-01 00:00:00
    expect(getTimestamp(1, 1, 0, 0, 0, 0, 'Etc/UTC', 1669852800000)).toBe(1640995200000);
  });
});

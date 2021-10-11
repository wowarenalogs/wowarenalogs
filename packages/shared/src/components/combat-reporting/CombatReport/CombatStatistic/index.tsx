import Text from 'antd/lib/typography/Text';

import { Box } from '../../../common/Box';

interface IProps {
  value: number | string;
  title: string;
  mr?: number;
  valueColor?: string;
}

export function CombatStatistic({ mr, value, title, valueColor }: IProps) {
  return (
    <Box alignItems="center" display="flex" flexDirection="column" mr={mr}>
      <Text style={{ marginBottom: '0px', color: 'rgba(255, 255, 255, 0.45)' }}>{title}</Text>
      <Text style={{ fontSize: '1.6em', color: valueColor }}>{value}</Text>
    </Box>
  );
}

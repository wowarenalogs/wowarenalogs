import { Spin } from 'antd';

import { Box } from '../Box';

export const LoadingScreen = () => {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" flex="1">
      <Spin size="large" />
    </Box>
  );
};

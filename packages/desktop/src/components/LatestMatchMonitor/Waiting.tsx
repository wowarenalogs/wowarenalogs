import { Box } from '@wowarenalogs/shared';
import { Button, Result } from 'antd';
import { useTranslation } from 'next-i18next';

interface IProps {
  processExistingLogs: () => void;
}

export const Waiting = (props: IProps) => {
  const { t } = useTranslation();
  return (
    <Box m={2} p={2}>
      <Result
        status="success"
        title={t('waiting-page-ready-for-battle')}
        subTitle={t('waiting-page-subtitle')}
        extra={
          <Button
            key="analyze"
            size="middle"
            onClick={() => {
              props.processExistingLogs();
            }}
          >
            {t('waiting-page-analyze-existing-logs')}
          </Button>
        }
      />
    </Box>
  );
};

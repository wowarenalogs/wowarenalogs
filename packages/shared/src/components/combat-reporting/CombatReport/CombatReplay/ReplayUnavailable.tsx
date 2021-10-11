import { Result } from 'antd';
import { useTranslation } from 'next-i18next';

export function ReplayUnavailable() {
  const { t } = useTranslation();

  return (
    <Result
      status="warning"
      title={t('combat-report-turn-on-advanced')}
      subTitle={t('combat-report-advanced-logging-description')}
    />
  );
}

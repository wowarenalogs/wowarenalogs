import { Box, logAnalyticsEvent, useAuth } from '@wowarenalogs/shared';
import Title from 'antd/lib/typography/Title';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ICombatData } from 'wow-combat-log-parser';

import { DroppableUploadZone } from './DroppableUploadZone';
import { SubmitCombats } from './SubmitCombats';

const UploadFlow = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [combats, setCombats] = useState<ICombatData[]>([]);

  const combatsUploaded = (combats: ICombatData[]) => {
    setCombats(combats);
    setStep(1);
  };

  const onCombatSubmitted = () => {
    logAnalyticsEvent('event_UploadCombatsSubmitted', { count: combats.length });
    router.push('/my-matches/history');
  };

  const restartUploadFlow = () => {
    logAnalyticsEvent('event_UploadFlowRestarted');
    setStep(0);
    setCombats([]);
  };

  switch (step) {
    case 0:
      return (
        <Box flex={1} flexDirection="column" display="flex">
          <Title level={2}>{t('upload-page-upload-my-matches')}</Title>
          <DroppableUploadZone onCombatsFound={combatsUploaded} />
        </Box>
      );
    case 1:
      return (
        <Box flex={1} flexDirection="column" display="flex">
          <SubmitCombats combats={combats} onCombatSubmitted={onCombatSubmitted} goBack={restartUploadFlow} />
        </Box>
      );
  }
  return <p>Error</p>;
};

export const UploadPage = () => {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.isLoadingAuthData) {
      auth.maybeShowLoginModal();
    }
  }, [auth]);

  return (
    <Box flex={1} display="flex" flexDirection="column">
      <UploadFlow />
    </Box>
  );
};

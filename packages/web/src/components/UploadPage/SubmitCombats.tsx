import { Utils, MatchList, useAuth } from '@wowarenalogs/shared';
import { Button } from 'antd';
import { Spin } from 'antd';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import { ICombatData } from 'wow-combat-log-parser';

type IProps = {
  combats: ICombatData[];
  onCombatSubmitted: () => void;
  goBack: () => void;
};

export const SubmitCombats = ({ combats, onCombatSubmitted, goBack }: IProps) => {
  const { t } = useTranslation();
  const [submitLoading, setSubmitLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const auth = useAuth();

  const submitCombats = async () => {
    setSubmitLoading(true);
    try {
      await Promise.all(combats.map((combat: ICombatData) => Utils.uploadCombatAsync(combat, auth.userId as string)));
      setSubmitLoading(false);
      onCombatSubmitted();
    } catch (error) {
      setSubmitLoading(false);
      setErrorMessage('An error has occurred, please re-try');
    }
  };
  return (
    <>
      <MatchList
        combats={combats}
        header={`Upload ${combats.length} Match${combats.length > 1 ? 'es' : ''}`}
        combatUrlFactory={(id) => {
          return '';
        }}
        goBack={goBack}
      />
      {errorMessage && <p>{errorMessage}</p>}
      {submitLoading && <Spin />}
      <Button
        disabled={submitLoading}
        type="primary"
        size={'large'}
        onClick={submitCombats}
        style={{ marginBottom: '16px' }}
      >
        {t('confirm')}
      </Button>
    </>
  );
};

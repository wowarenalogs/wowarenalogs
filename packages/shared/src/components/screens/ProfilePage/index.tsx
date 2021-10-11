import { CheckOutlined } from '@ant-design/icons';
import { getApolloContext } from '@apollo/client';
import { Button, Input, message, Radio } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import { useTranslation } from 'next-i18next';
import { useContext, useEffect, useState } from 'react';

import styles from './index.module.css';

import { UserSubscriptionTier } from '../../../graphql-server/types';
import { useGetProfileQuery, useSetUserReferrerMutation } from '../../../graphql/__generated__/graphql';
import { useAuth } from '../../../hooks/AuthContext';
import { useClientContext } from '../../../hooks/ClientContext';
import { logAnalyticsEvent } from '../../../utils/analytics';
import { Box } from '../../common/Box';
import { LoadingScreen } from '../../common/LoadingScreen';
import { LoginModal } from '../../common/LoginModal';
import { RareTierModal } from './RareTierModal';

const DEFAULT_ERROR_MESSAGE = 'There was a problem loading the page, please refresh!';

export function ProfilePage() {
  const { t } = useTranslation();
  const context = useContext(getApolloContext());
  const clientContext = useClientContext();
  const auth = useAuth();
  const [referrer, setReferrer] = useState<string>('');
  const [showRecruiterModal, setShowRecruiterModal] = useState(false);

  useEffect(() => {
    logAnalyticsEvent('view_ProfilePage');
  }, []);

  const { loading, data, error } = useGetProfileQuery({
    client: context.client,
    onCompleted: (d) => {
      setReferrer(d.me?.referrer || '');
      if ((d.me?.subscriptionTier || UserSubscriptionTier.Common) === UserSubscriptionTier.Common) {
        setShowRecruiterModal(true);
      }
    },
  });

  const [mutateUserReferrer, mutateUserReferrerState] = useSetUserReferrerMutation({
    client: context.client,
  });

  if (loading || auth.isLoadingAuthData) {
    return <LoadingScreen />;
  }

  // the client should not present an entry point to this page unless user is authenticated
  if (!auth.isAuthenticated) {
    return <LoginModal show={true} />;
  }

  if (error || !data) {
    return (
      <Box flex={1} display="flex" flexDirection="column" alignItems="center" justifyContent={'center'}>
        <Text type={'danger'}>Error: {error?.message || DEFAULT_ERROR_MESSAGE}</Text>
      </Box>
    );
  }

  const onConfirmReferrer = () => {
    if (referrer === (data.me?.referrer || '')) {
      return;
    }
    if (referrer === '') {
      message.error(t('profile-page-enter-valid-battletag'));
      return;
    }
    if (referrer.toLowerCase() === ((auth.battleTag as string) || '').toLowerCase()) {
      message.error(t('profile-page-cannot-refer-yourself'));
      return;
    }

    logAnalyticsEvent('event_ConfirmReferrer');

    mutateUserReferrer({
      variables: {
        referrer,
      },
    }).then(() => {
      message.success(t('profile-page-referrer-updated'));
    });
  };

  return (
    <Box display="flex" flexDirection="column">
      <Title level={2}>{auth.battleTag as string}</Title>
      <Box display="flex" flexDirection="column">
        <Title level={5}>{t('profile-page-feature-tier')}</Title>
        <Radio.Group value={data.me?.subscriptionTier || UserSubscriptionTier.Common} buttonStyle="solid">
          <Radio.Button
            value={UserSubscriptionTier.Common}
            checked={data.me?.subscriptionTier === UserSubscriptionTier.Common}
            disabled={data.me?.subscriptionTier !== UserSubscriptionTier.Common}
          >
            {t('profile-page-feature-tier-common')}
          </Radio.Button>
          <Radio.Button
            value={UserSubscriptionTier.Rare}
            checked={data.me?.subscriptionTier === UserSubscriptionTier.Rare}
            onClick={() => {
              setShowRecruiterModal(true);
            }}
          >
            <span className="feature-rare">{t('profile-page-feature-tier-rare')}</span>
          </Radio.Button>
        </Radio.Group>
      </Box>
      {clientContext.isDesktop && (
        <Box display="flex" flexDirection="column" mt={4}>
          <Title level={5}>{t('profile-page-referred-by')}</Title>
          <Input
            className={styles['text-box-referrer']}
            placeholder={t('profile-page-enter-referrer-battletag')}
            addonAfter={
              <Button
                type="link"
                size="small"
                disabled={mutateUserReferrerState.loading || referrer === (data.me?.referrer || '')}
                onClick={onConfirmReferrer}
              >
                <CheckOutlined />
              </Button>
            }
            value={referrer || ''}
            onChange={(e) => {
              setReferrer(e.target.value);
            }}
            onKeyPress={(e) => {
              if (e.code === 'Enter') {
                onConfirmReferrer();
              }
            }}
          />
        </Box>
      )}
      <RareTierModal
        show={showRecruiterModal}
        onClose={() => {
          setShowRecruiterModal(false);
        }}
      />
    </Box>
  );
}

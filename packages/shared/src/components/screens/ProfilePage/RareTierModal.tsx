import { CopyOutlined, UnlockOutlined } from '@ant-design/icons';
import { Button, Input, Modal } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import { useTranslation, Trans } from 'next-i18next';
import { useState } from 'react';

import { useAuth } from '../../../hooks/AuthContext';
import { useClientContext } from '../../../hooks/ClientContext';
import { Box } from '../../common/Box';

interface IProps {
  show: boolean;
  onClose?: () => void;
}

export function RareTierModal(props: IProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [battletagCopied, setBattletagCopied] = useState(false);
  const clientContext = useClientContext();

  const onClose = () => {
    if (props.onClose) {
      props.onClose();
    }
  };

  return (
    <Modal visible={props.show} title={t('profile-page-upgrade-available')} footer={null} onCancel={onClose}>
      <Box display="flex" flexDirection="column" alignItems="center">
        <Box display="flex" flexDirection="row" justifyContent="center" mb={2}>
          <UnlockOutlined style={{ width: 64, height: 64, fontSize: 64 }} />
        </Box>
        <Title level={2}>
          <Trans i18nKey="profile-page-unlock-rare-features">
            Unlock <span className="feature-rare">[Rare Features]</span>
          </Trans>
        </Title>
        <ul>
          <li>{t('profile-page-rare-benefits-1')}</li>
          <li>{t('profile-page-rare-benefits-2')}</li>
          <li>{t('profile-page-rare-benefits-3')}</li>
        </ul>
        <Box mt={2}>
          <Input
            size="large"
            readOnly
            addonAfter={
              <Button
                type={battletagCopied ? 'text' : 'link'}
                icon={<CopyOutlined />}
                size="small"
                onClick={() => {
                  navigator.clipboard.writeText(auth.battleTag as string).then(() => {
                    setBattletagCopied(true);
                    setTimeout(() => {
                      setBattletagCopied(false);
                    }, 5000);
                  });
                }}
              >
                {battletagCopied ? t('copied') : t('copy')}
              </Button>
            }
            value={auth.battleTag as string}
            onFocus={(e) => {
              e.target.select();
            }}
          />
        </Box>
        <Box mt={2} mb={2} display="flex" flexDirection="column" justifyContent="center">
          <Text type="secondary" style={{ textAlign: 'center' }}>
            {t('profile-page-referral-program-description')}
          </Text>
          <Button
            type="link"
            onClick={() => clientContext.openExternalURL('https://www.patreon.com/bePatron?u=6365218')}
          >
            {t('profile-page-referral-program-patreon-cta')}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}

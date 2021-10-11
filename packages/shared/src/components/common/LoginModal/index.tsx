import { Button, Divider, Image, Modal, Select, Space } from 'antd';
import Text from 'antd/lib/typography/Text';
import { signIn } from 'next-auth/client';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import { useClientContext } from '../../../hooks/ClientContext';
import { logAnalyticsEvent } from '../../../utils/analytics';
import { Box } from '../Box';

interface IProps {
  show: boolean;
  onClose?: () => void;
}

export function LoginModal(props: IProps) {
  const { t } = useTranslation();
  const [region, setRegion] = useState('us');
  const clientContext = useClientContext();

  useEffect(() => {
    if (props.show) {
      logAnalyticsEvent('event_LoginModalShown');
    }
  }, [props.show]);

  const loginProvider = `battlenet-${region}`;

  const onClose = () => {
    logAnalyticsEvent('event_LoginModalClosed');
    if (props.onClose) {
      props.onClose();
    }
  };

  return (
    <Modal visible={props.show} title={t('login')} footer={null} onCancel={onClose}>
      <Box display="flex" flexDirection="column" alignItems="center">
        <Image src="https://images.wowarenalogs.com/common/Blizzard.png" width={341} height={200} preview={false} />
        <Box display="flex" flexDirection="row">
          <Space>
            <Select
              defaultValue={region}
              style={{ width: 80 }}
              onChange={(value) => {
                setRegion(value);
              }}
            >
              <Select.Option value="us">US</Select.Option>
              <Select.Option value="eu">EU</Select.Option>
              <Select.Option value="apac">APAC</Select.Option>
              <Select.Option value="cn">CN</Select.Option>
            </Select>
            {clientContext.isDesktop ? (
              <Button
                type="primary"
                onClick={() => {
                  clientContext.showLoginModalInSeparateWindow(`/login/${loginProvider}`, () => {
                    window.location.reload();
                  });
                }}
              >
                {t('login-modal-login-with-battle-net')}
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={() => {
                  signIn(loginProvider);
                }}
              >
                {t('login-modal-login-with-battle-net')}
              </Button>
            )}
          </Space>
        </Box>
        <Divider />
        <Button onClick={onClose}>{t('login-modal-continue-as-guest')}</Button>
        <Box mt={1}>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
            {t('login-modal-guest-description')}
          </Text>
        </Box>
      </Box>
    </Modal>
  );
}

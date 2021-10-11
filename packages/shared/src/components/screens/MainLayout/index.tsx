import { DownOutlined, TwitterOutlined } from '@ant-design/icons';
import { Button, Divider, Dropdown, Menu } from 'antd';
import Layout, { Content, Footer, Header } from 'antd/lib/layout/layout';
import Text from 'antd/lib/typography/Text';
import _ from 'lodash';
import { signOut } from 'next-auth/client';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Router from 'next/router';
import NProgress from 'nprogress';
import React, { useEffect, useState } from 'react';

import styles from './index.module.css';

import { useAuth } from '../../../hooks/AuthContext';
import { useClientContext } from '../../../hooks/ClientContext';
import { Box } from '../../common/Box';
import { DiscordIcon } from '../../common/DiscordIcon';
import { LoginModal } from '../../common/LoginModal';

interface IProps {
  children?: React.ReactNodeArray | React.ReactNode;
}

export function MainLayout(props: IProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const clientContext = useClientContext();
  const [loginModalShown, setLoginModalShown] = useState(false);

  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') === 0);
  }, []);

  useEffect(() => {
    NProgress.configure({
      easing: 'ease',
      speed: 300,
      showSpinner: false,
    });

    Router.events.on('routeChangeStart', () => NProgress.start());
    Router.events.on('routeChangeComplete', () => NProgress.done());
    Router.events.on('routeChangeError', () => NProgress.done());
  }, []);

  const selectedNavMenuKey = [router.pathname === '' ? '/' : router.pathname];

  const userMenu = (
    <Menu>
      {clientContext.isDesktop && (
        <Menu.Item>
          <Link href="/profile">{t('profile')}</Link>
        </Menu.Item>
      )}
      <Menu.Item
        onClick={() => {
          signOut();
        }}
      >
        {t('logout')}
      </Menu.Item>
    </Menu>
  );

  return (
    <Layout
      className={_.join(clientContext.isDesktop ? [styles.pageLayout, styles.desktop] : [styles.pageLayout], ' ')}
    >
      <Header className={styles.pageHeader}>
        <Box className={styles.pageWidthCapped} flex={1} display="flex" flexDirection="row" alignItems="center">
          {!clientContext.isDesktop && (
            <Link href="/">
              <img
                alt={t('app-name')}
                className={styles.logo}
                src="https://images.wowarenalogs.com/common/title.png"
                width={150}
                height={24}
              />
            </Link>
          )}
          <Box>
            <Menu className={styles.navMenu} theme="dark" mode="horizontal" selectedKeys={selectedNavMenuKey}>
              <Menu.SubMenu title={t('main-layout-my-matches')}>
                {clientContext.isDesktop && (
                  <Menu.Item key="/">
                    <Link href="/">{t('main-layout-my-matches-latest')}</Link>
                  </Menu.Item>
                )}
                {clientContext.isDesktop && (
                  <Menu.Item key="/my-matches/recent">
                    <Link href="/my-matches/recent">{t('main-layout-my-matches-recent')}</Link>
                  </Menu.Item>
                )}
                {!clientContext.isDesktop && (
                  <Menu.Item key="/my-matches/upload">
                    <Link href="/my-matches/upload">{t('upload')}</Link>
                  </Menu.Item>
                )}
                <Menu.Item key="/my-matches/history">
                  <Link href="/my-matches/history">{t('main-layout-my-matches-history')}</Link>
                </Menu.Item>
              </Menu.SubMenu>
              <Menu.SubMenu title={t('main-layout-community-matches')}>
                <Menu.Item key="/community-matches/shadowlands">
                  <Link href="/community-matches/shadowlands">{t('shadowlands')}</Link>
                </Menu.Item>
              </Menu.SubMenu>
              <Menu.SubMenu title={t('main-layout-analysis')}>
                <Menu.Item key="/analysis/reports">
                  <Link href="/analysis/reports">{t('main-layout-analysis-reports')}</Link>
                </Menu.Item>
              </Menu.SubMenu>
            </Menu>
          </Box>
          <Box flex={1} />
          {clientContext.isDesktop && (
            <Button
              type="link"
              onClick={() => clientContext.openExternalURL('https://www.patreon.com/bePatron?u=6365218')}
            >
              Support us on Patreon!
            </Button>
          )}
          {auth.isAuthenticated ? (
            <Dropdown overlay={userMenu}>
              <div>
                <Box display="flex" flexDirection="row" alignItems="center" style={{ cursor: 'pointer' }}>
                  <Box mr={2}>{auth.battleTag as string}</Box>
                  <Text type="secondary">
                    <DownOutlined />
                  </Text>
                </Box>
              </div>
            </Dropdown>
          ) : (
            <Button
              type="text"
              onClick={() => {
                setLoginModalShown(true);
              }}
              disabled={auth.isLoadingAuthData || loginModalShown}
            >
              {t('login')}
            </Button>
          )}
        </Box>
      </Header>
      <Content className={styles.pageContent}>
        <Box className={styles.pageWidthCapped} display="flex" flexDirection="column">
          {props.children}
        </Box>
      </Content>
      {!clientContext.isDesktop && (
        <Footer className={styles.pageFooter}>
          <Box display="flex" flexDirection="row" alignItems="center">
            <Button
              type="link"
              href={`https://storage.googleapis.com/download.wowarenalogs.com/desktop-client/latest-${
                isMac ? 'mac' : 'windows'
              }.zip`}
              target="_blank"
            >
              {t('main-layout-footer-download')}
            </Button>
            <Divider type="vertical" />
            <Button type="text" href="/privacy.html" target="_blank">
              {t('main-layout-footer-privacy')}
            </Button>
            <Divider type="vertical" />
            <Button
              type="text"
              onClick={() => clientContext.openExternalURL('https://discord.gg/NFTPK9tmJK')}
              icon={<DiscordIcon />}
            />
            <Divider type="vertical" />
            <Button
              type="text"
              onClick={() => clientContext.openExternalURL('https://twitter.com/WoWArenaLogs')}
              icon={<TwitterOutlined />}
            />
            <Divider type="vertical" />
            <Button type="link" href="https://www.patreon.com/bePatron?u=6365218" target="_blank">
              Support us on Patreon!
            </Button>
          </Box>
        </Footer>
      )}
      <LoginModal
        show={loginModalShown}
        onClose={() => {
          setLoginModalShown(false);
        }}
      />
    </Layout>
  );
}

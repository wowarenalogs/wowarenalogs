import { ApolloProvider, ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import {
  AuthProvider,
  ClientContextProvider,
  getAnalyticsDeviceId,
  initAnalyticsAsync,
  MainLayout,
} from '@wowarenalogs/shared';
import { env } from '@wowarenalogs/shared';
import { appWithTranslation, useTranslation } from 'next-i18next';
import { DefaultSeo } from 'next-seo';
import { AppProps } from 'next/dist/next-server/lib/router/router';
import Head from 'next/head';
import { useEffect } from 'react';
import CookieConsent from 'react-cookie-consent';
import { Trans } from 'react-i18next';
import { WowVersion } from 'wow-combat-log-parser';

import './globals.css';
import 'antd/dist/antd.dark.css';
import 'nprogress/nprogress.css';

const link = createHttpLink({
  uri: '/api/graphql',
  credentials: env.stage === 'development' ? 'include' : 'same-origin',
});

const client = new ApolloClient({
  cache: new InMemoryCache({
    typePolicies: {
      CombatUnitStub: {
        keyFields: ['id', 'spec'],
      },
    },
  }),
  link,
});

function App({ Component, pageProps }: AppProps) {
  const { t } = useTranslation();

  useEffect(() => {
    initAnalyticsAsync('4e78899d6152f8396a1428ab460877c3', 'G-PQY0HD7157').then(() => {
      import('@sentry/react').then((Sentry) => {
        import('@sentry/tracing').then(({ Integrations }) => {
          Sentry.init({
            dsn: 'https://512c7d988ac34fb7bb1e45674322752d@o516205.ingest.sentry.io/5622372',
            integrations: [new Integrations.BrowserTracing()],
            tracesSampleRate: 1.0,
          });
          const userId = getAnalyticsDeviceId();
          if (userId) {
            Sentry.setUser({
              id: userId,
            });
          }
        });
      });
    });
  }, []);

  return (
    <ApolloProvider client={client}>
      <Head>
        <meta charSet="utf-8" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <link type="text/css" href="https://wow.zamimg.com/css/basic.css?16" rel="stylesheet" />
        <link type="text/css" href="https://wow.zamimg.com/css/global/icon.css?16" rel="stylesheet" />
        <script key="wowhead0">{'window.whTooltips = { colorLinks: true, iconSize: true };'}</script>
        <script key="wowhead1" src="https://wow.zamimg.com/widgets/power.js" />
        <script key="ga0" async src="https://www.googletagmanager.com/gtag/js?id=G-PQY0HD7157"></script>
        <script
          key="ga1"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-PQY0HD7157');`,
          }}
        />
      </Head>
      <ClientContextProvider
        isDesktop={false}
        showLoginModalInSeparateWindow={() => null}
        openExternalURL={(url: string) => {
          window.open(url, '_blank');
        }}
        openArmoryLink={(playerName: string, serverName: string, region: string, locale: string) =>
          window.open(`https://worldofwarcraft.com/${locale}/character/${region}/${serverName}/${playerName}`, '_blank')
        }
        wowInstallations={new Map<WowVersion, string>()}
        launchAtStartup={false}
        updateAppConfig={() => {
          return;
        }}
        setLaunchAtStartup={() => {
          return;
        }}
      >
        <AuthProvider>
          <DefaultSeo
            defaultTitle={t('app-title')}
            titleTemplate={`%s | ${t('app-title')}`}
            description={t('app-description')}
            openGraph={{
              type: 'website',
              title: t('app-name'),
              description: t('app-description'),
            }}
            twitter={{
              site: '@WoWArenaLogs',
              handle: '@WoWArenaLogs',
            }}
          />
          <MainLayout>
            <Component {...pageProps} />
          </MainLayout>
          <CookieConsent
            location="bottom"
            buttonText={t('gotIt')}
            buttonStyle={{ backgroundColor: '#52c41a', color: '#ffffff' }}
            cookieName="cookie-consent"
            expires={365}
          >
            <Trans i18nKey="cookies-notice">
              We use cookies to improve your experience. You can read more about the usage in our{' '}
              <a href="/privacy.html" target="_blank">
                privacy policy
              </a>
              .
            </Trans>
          </CookieConsent>
        </AuthProvider>
      </ClientContextProvider>
    </}

export default appWithTranslation(App);

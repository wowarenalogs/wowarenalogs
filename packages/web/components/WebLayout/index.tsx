import { ClientContextProvider, initAnalyticsAsync, MainLayout } from '@wowarenalogs/shared';
import Head from 'next/head';
import Script from 'next/script';
import { signIn } from 'next-auth/react';
import { DefaultSeo } from 'next-seo';
import { ReactNode, useEffect } from 'react';

const TITLE = 'Wow Arena Logs | World of Warcraft PvP Data Analytics';
const DESCRIPTION =
  'WoW Arena Logs is the best tool available to help you analyze your own arena matches and learn from the community.';

const Page = (props: { children: ReactNode | ReactNode[] }) => {
  useEffect(() => {
    initAnalyticsAsync('G-PQY0HD7157').catch(() => {
      /* no-op */
    });
  });

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-base-300">
      <ClientContextProvider
        isDesktop={false}
        openExternalURL={(url) => {
          window.open(url, '_blank');
        }}
        showLoginModal={() => {
          signIn('battlenet');
        }}
      >
        <MainLayout>
          <Head>
            <meta key="charset" charSet="utf-8" />
            <link key="icon" rel="icon" href="/favicon.ico" />
            <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1" />
            <meta key="theme-color" name="theme-color" content="#000000" />
            <link type="text/css" href="https://wow.zamimg.com/css/basic.css?16" rel="stylesheet" />
            <script key="wowhead0">{'window.whTooltips = { colorLinks: true, iconSize: true };'}</script>
            <script key="wowhead1" async src="https://wow.zamimg.com/widgets/power.js" />
          </Head>
          <Script src="https://www.googletagmanager.com/gtag/js?id=G-PQY0HD7157" strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-PQY0HD7157');
    `}
          </Script>
          <DefaultSeo
            defaultTitle={TITLE}
            titleTemplate={`%s | ${TITLE}`}
            description={DESCRIPTION}
            openGraph={{
              type: 'website',
              title: 'WoW Arena Logs',
              description: DESCRIPTION,
            }}
          />
          {props.children}
        </MainLayout>
      </ClientContextProvider>
    </div>
  );
};

export default Page;

'use client';

import { ClientContextProvider, initAnalyticsAsync, MainLayout } from '@wowarenalogs/shared';
import Script from 'next/script';
import { signIn } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';

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
        localFlags={[]}
      >
        <MainLayout>
          <Script src="https://www.googletagmanager.com/gtag/js?id=G-PQY0HD7157" strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-PQY0HD7157');
    `}
          </Script>
          {props.children}
        </MainLayout>
      </ClientContextProvider>
    </div>
  );
};

export default Page;

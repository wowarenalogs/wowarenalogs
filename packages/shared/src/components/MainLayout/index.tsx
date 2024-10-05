import _ from 'lodash';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Router from 'next/router';
import NProgress from 'nprogress';
import React, { useEffect } from 'react';
import { TbBug, TbChartBar, TbHistory, TbHome, TbSearch, TbSettings, TbSwords, TbTrophy, TbUser } from 'react-icons/tb';

import { useAuth } from '../../hooks/AuthContext';
import { useClientContext } from '../../hooks/ClientContext';
import { canUseFeature, features } from '../../utils/featureFlags';

interface IProps {
  children?: React.ReactNode[] | React.ReactNode;
}

export function MainLayout(props: IProps) {
  const router = useRouter();
  const auth = useAuth();
  const clientContext = useClientContext();

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

  const selectedNavMenuKey = router.pathname === '' ? '/' : router.pathname;

  console.log({ clientContext });
  return (
    <div className={`flex flex-1 flex-row items-stretch relative`}>
      <div className="flex flex-col text-base-content pb-1">
        {!clientContext.isDesktop && (
          <div className={`p-2 hover:text-primary ${selectedNavMenuKey === '/' ? 'bg-base-100 text-primary' : ''}`}>
            <Link href="/" aria-label="Home">
              <a title="Home">
                <TbHome size="32" />
              </a>
            </Link>
          </div>
        )}
        {clientContext.isDesktop && (
          <div
            className={`p-2 hover:text-primary ${selectedNavMenuKey === '/latest' ? 'bg-base-100 text-primary' : ''}`}
          >
            <Link href="/latest" aria-label="Latest match">
              <a title="Latest match">
                <TbSwords size="32" />
              </a>
            </Link>
          </div>
        )}
        <div
          className={`p-2 hover:text-primary ${
            selectedNavMenuKey === '/history' || (router.pathname === '/match' && router.query.source === 'history')
              ? 'bg-base-100 text-primary'
              : ''
          }`}
        >
          <Link href="/history" aria-label="History">
            <a title="History">
              <TbHistory size="32" />
            </a>
          </Link>
        </div>
        <div
          className={`p-2 hover:text-primary ${
            selectedNavMenuKey === '/search' || (router.pathname === '/match' && router.query.source === 'search')
              ? 'bg-base-100 text-primary'
              : ''
          }`}
        >
          <Link href="/search" aria-label="Search matches">
            <a title="Search matches">
              <TbSearch size="32" />
            </a>
          </Link>
        </div>
        <div className={`p-2 hover:text-primary ${selectedNavMenuKey === '/stats' ? 'bg-base-100 text-primary' : ''}`}>
          <Link href="/stats" aria-label="Competitive stats">
            <a title="Competitive stats">
              <TbChartBar size="32" />
            </a>
          </Link>
        </div>
        {canUseFeature(features.awcPreview, undefined, clientContext.localFlags) && (
          <div className={`p-2 hover:text-primary ${selectedNavMenuKey === '/awc' ? 'bg-base-100 text-primary' : ''}`}>
            <Link href="/awc" aria-label="AWC Matches">
              <a title="AWC Matches">
                <TbTrophy size="32" />
              </a>
            </Link>
          </div>
        )}
        <div className="flex-1" />
        {process.env.NODE_ENV === 'development' && clientContext.isDesktop && (
          <div
            className={`p-2 hover:text-primary ${selectedNavMenuKey === '/debug' ? 'bg-base-100 text-primary' : ''}`}
          >
            <Link href="/debug">
              <a>
                <TbBug size="32" />
              </a>
            </Link>
          </div>
        )}
        <div
          className={`p-2 ${
            selectedNavMenuKey === '/profile'
              ? 'bg-base-100 text-primary'
              : auth.isLoadingAuthData || auth.isAuthenticated
              ? ''
              : 'bg-error text-error-content'
          }`}
        >
          {auth.isAuthenticated ? (
            <Link href="/profile" aria-label="Profile">
              <a className="hover:text-primary" title="Profile">
                <TbUser size="32" />
              </a>
            </Link>
          ) : auth.isLoadingAuthData ? (
            <a className="cursor-wait opacity-60" href="#" title="Loading...">
              <TbUser size="32" />
            </a>
          ) : (
            <a
              className="hover:text-white"
              href="#"
              onClick={() => {
                auth.signIn();
              }}
              title="Sign in"
            >
              <TbUser size="32" />
            </a>
          )}
        </div>
        {clientContext.isDesktop && (
          <div
            className={`p-2 hover:text-primary ${selectedNavMenuKey === '/settings' ? 'bg-base-100 text-primary' : ''}`}
          >
            <Link href="/settings" aria-label="Settings">
              <a title="Settings">
                <TbSettings size="32" />
              </a>
            </Link>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col bg-base-100 text-base-content relative">
        <div className="absolute w-full h-full flex flex-col">{props.children}</div>
      </div>
    </div>
  );
}

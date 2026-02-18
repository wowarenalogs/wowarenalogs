import _ from 'lodash';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import NProgress from 'nprogress';
import React, { useEffect, useRef } from 'react';
import { TbBug, TbChartBar, TbHistory, TbHome, TbSearch, TbSettings, TbSwords, TbUser } from 'react-icons/tb';

import { useAuth } from '../../hooks/AuthContext';
import { useClientContext } from '../../hooks/ClientContext';

interface IProps {
  children?: React.ReactNode[] | React.ReactNode;
}

export function MainLayout(props: IProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const clientContext = useClientContext();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    NProgress.configure({
      easing: 'ease',
      speed: 300,
      showSpinner: false,
    });
  }, []);

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      NProgress.done();
      prevPathRef.current = pathname;
    }
  }, [pathname, searchParams]);

  const selectedNavMenuKey = pathname === '' ? '/' : pathname;
  const matchSource = searchParams.get('source');

  return (
    <div className={`flex flex-1 flex-row items-stretch relative`}>
      <div className="flex flex-col text-base-content pb-1">
        {!clientContext.isDesktop && (
          <div className={`p-2 hover:text-primary ${selectedNavMenuKey === '/' ? 'bg-base-100 text-primary' : ''}`}>
            <Link href="/" aria-label="Home" title="Home">
              <TbHome size="32" />
            </Link>
          </div>
        )}
        {clientContext.isDesktop && (
          <div
            className={`p-2 hover:text-primary ${selectedNavMenuKey === '/latest' ? 'bg-base-100 text-primary' : ''}`}
          >
            <Link href="/latest" aria-label="Latest match" title="Latest match">
              <TbSwords size="32" />
            </Link>
          </div>
        )}
        <div
          className={`p-2 hover:text-primary ${
            selectedNavMenuKey === '/history' || (pathname === '/match' && matchSource === 'history')
              ? 'bg-base-100 text-primary'
              : ''
          }`}
        >
          <Link href="/history" aria-label="History" title="History">
            <TbHistory size="32" />
          </Link>
        </div>
        <div
          className={`p-2 hover:text-primary ${
            selectedNavMenuKey === '/search' || (pathname === '/match' && matchSource === 'search')
              ? 'bg-base-100 text-primary'
              : ''
          }`}
        >
          <Link href="/search" aria-label="Search matches" title="Search matches">
            <TbSearch size="32" />
          </Link>
        </div>
        <div className={`p-2 hover:text-primary ${selectedNavMenuKey === '/stats' ? 'bg-base-100 text-primary' : ''}`}>
          <Link href="/stats" aria-label="Competitive stats" title="Competitive stats">
            <TbChartBar size="32" />
          </Link>
        </div>
        <div className="flex-1" />
        {process.env.NODE_ENV === 'development' && clientContext.isDesktop && (
          <div
            className={`p-2 hover:text-primary ${selectedNavMenuKey === '/debug' ? 'bg-base-100 text-primary' : ''}`}
          >
            <Link href="/debug">
              <TbBug size="32" />
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
            <Link href="/profile" aria-label="Profile" className="hover:text-primary" title="Profile">
              <TbUser size="32" />
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
            <Link href="/settings" aria-label="Settings" title="Settings">
              <TbSettings size="32" />
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

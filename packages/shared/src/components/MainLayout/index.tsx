import _ from 'lodash';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Router from 'next/router';
import NProgress from 'nprogress';
import React, { useEffect } from 'react';
import { TbBug, TbHistory, TbSearch, TbSettings, TbSwords, TbUser } from 'react-icons/tb';

import { useAuth } from '../../hooks/AuthContext';
// import { useAuth } from '../../hooks/AuthContext';
import { useClientContext } from '../../hooks/ClientContext';

interface IProps {
  children?: React.ReactNode[] | React.ReactNode;
}

export function MainLayout(props: IProps) {
  const router = useRouter();
  const auth = useAuth();
  const clientContext = useClientContext();
  // const [loginModalShown, setLoginModalShown] = useState(false);

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

  return (
    <div className={`flex flex-1 flex-row items-stretch`}>
      <div className="flex flex-col text-base-content">
        {clientContext.isDesktop && (
          <div
            className={`p-2 hover:text-primary ${selectedNavMenuKey === '/latest' ? 'bg-base-100 text-primary' : ''}`}
          >
            <Link href="/latest" aria-label="Latest match">
              <a>
                <TbSwords size="32" />
              </a>
            </Link>
          </div>
        )}
        <div
          className={`p-2 hover:text-primary ${selectedNavMenuKey === '/history' ? 'bg-base-100 text-primary' : ''}`}
        >
          <Link href="/history" aria-label="History">
            <a>
              <TbHistory size="32" />
            </a>
          </Link>
        </div>
        <div className={`p-2 hover:text-primary ${selectedNavMenuKey === '/search' ? 'bg-base-100 text-primary' : ''}`}>
          <Link href="/search" aria-label="Search matches">
            <a>
              <TbSearch size="32" />
            </a>
          </Link>
        </div>
        <div className="flex-1" />
        <div className={`p-2 hover:text-primary ${selectedNavMenuKey === '/debug' ? 'bg-base-100 text-primary' : ''}`}>
          <Link href="/debug">
            <a>
              <TbBug size="32" />
            </a>
          </Link>
        </div>
        <div
          className={`p-2 hover:text-primary ${
            selectedNavMenuKey === '/profile'
              ? 'bg-base-100 text-primary'
              : auth.isAuthenticated
              ? ''
              : 'bg-error text-error-content'
          }`}
        >
          {auth.isAuthenticated ? (
            <Link href="/profile" aria-label="Profile">
              <a>
                <TbUser size="32" />
              </a>
            </Link>
          ) : (
            <a
              href="javascript:void(0)"
              onClick={() => {
                auth.signIn();
              }}
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
              <a>
                <TbSettings size="32" />
              </a>
            </Link>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col bg-base-100 text-base-content relative">
        <div className="absolute w-full h-full overflow-hidden flex flex-col">{props.children}</div>
      </div>
    </div>
  );
}
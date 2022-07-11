import _ from 'lodash';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Router from 'next/router';
import { useTranslation } from 'next-i18next';
import NProgress from 'nprogress';
import React, { useEffect } from 'react';
import { TbBug, TbHistory, TbSearch, TbSettings, TbSwords, TbUser } from 'react-icons/tb';

// import { useAuth } from '../../hooks/AuthContext';
import { useClientContext } from '../../hooks/ClientContext';

interface IProps {
  children?: React.ReactNode[] | React.ReactNode;
}

export function MainLayout(props: IProps) {
  const { t } = useTranslation();
  const router = useRouter();
  // const auth = useAuth();
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
      <div className="flex flex-col text-zinc-500">
        {clientContext.isDesktop && (
          <div
            key="/my-matches/latest"
            className={`p-2 hover:text-white ${
              selectedNavMenuKey === '/my-matches/latest' ? 'bg-zinc-900 text-white' : ''
            }`}
          >
            <Link href="/my-matches/latest" aria-label={t('main-layout-my-matches-latest')}>
              <a>
                <TbSwords size="32" />
              </a>
            </Link>
          </div>
        )}
        <div key="/my-matches-history" className="p-2 hover:text-white">
          <Link href="/my-matches/history" aria-label={t('main-layout-my-matches-history')}>
            <a>
              <TbHistory size="32" />
            </a>
          </Link>
        </div>
        <div key="/community-matches/shadowlands" className="p-2 hover:text-white">
          <Link href="/community-matches/shadowlands" aria-label={t('main-layout-community-matches')}>
            <a>
              <TbSearch size="32" />
            </a>
          </Link>
        </div>
        <div className="flex-1" />
        <div
          key="/debug"
          className={`p-2 hover:text-white ${selectedNavMenuKey === '/debug' ? 'bg-zinc-900 text-white' : ''}`}
        >
          <Link href="/debug">
            <a>
              <TbBug size="32" />
            </a>
          </Link>
        </div>
        <div key="/profile" className="p-2 hover:text-white">
          <Link href="/profile" aria-label={t('login')}>
            <a>
              <TbUser size="32" />
            </a>
          </Link>
        </div>
        {clientContext.isDesktop && (
          <div key="/settings" className="p-2 hover:text-white">
            <Link href="/settings" aria-label={t('main-layout-my-matches-latest')}>
              <a>
                <TbSettings size="32" />
              </a>
            </Link>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col bg-zinc-900 relative">
        <div className="absolute w-full h-full overflow-hidden">{props.children}</div>
      </div>
    </div>
  );
}

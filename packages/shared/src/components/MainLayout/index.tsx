import _ from 'lodash';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import NProgress from 'nprogress';
import React, { useEffect, useRef, useState } from 'react';
import {
  TbAlertTriangle,
  TbBook,
  TbBrandOpenai,
  TbBug,
  TbChartBar,
  TbHistory,
  TbHome,
  TbSearch,
  TbSettings,
  TbSwords,
  TbUser,
} from 'react-icons/tb';

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
  const [showUpgradeBanner, _setShowUpgradeBanner] = useState(false);
  const [vodDiskWarning, setVodDiskWarning] = useState<{ bytesRemaining: number; driveLabel?: string } | null>(null);
  const [logDiskWarning, setLogDiskWarning] = useState<{ bytesRemaining: number; driveLabel?: string } | null>(null);

  useEffect(() => {
    // Version check intentionally disabled for personal builds.
  }, [clientContext.isDesktop]);

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

  useEffect(() => {
    if (!clientContext.isDesktop || !window.wowarenalogs) {
      return;
    }

    window.wowarenalogs.obs?.diskSpaceBecameCritical?.((_evt: unknown, freeBytes: number, driveLabel?: string) =>
      setVodDiskWarning({ bytesRemaining: freeBytes, driveLabel }),
    );
    window.wowarenalogs.logs?.handleLogStorageDiskSpaceBecameCritical?.(
      (_evt: unknown, _wowVersion: unknown, freeBytes: number, driveLabel?: string) =>
        setLogDiskWarning({ bytesRemaining: freeBytes, driveLabel }),
    );

    return () => {
      window.wowarenalogs.obs?.removeAll_diskSpaceBecameCritical_listeners?.();
      window.wowarenalogs.logs?.removeAll_handleLogStorageDiskSpaceBecameCritical_listeners?.();
    };
  }, [clientContext.isDesktop]);

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
        <div
          className={`p-2 hover:text-primary ${selectedNavMenuKey === '/library' ? 'bg-base-100 text-primary' : ''}`}
        >
          <Link href="/library" aria-label="Spell Library" title="Spell Library">
            <TbBook size="32" />
          </Link>
        </div>
        <div className="flex-1" />
        {process.env.NODE_ENV === 'development' && (
          <>
            <div
              className={`p-2 hover:text-primary ${selectedNavMenuKey === '/local' ? 'bg-base-100 text-primary' : ''}`}
            >
              <Link href="/local" aria-label="Local log viewer" title="Local log viewer (dev)">
                <TbBug size="32" />
              </Link>
            </div>
            <div
              className={`p-2 hover:text-primary ${selectedNavMenuKey === '/local/ai' ? 'bg-base-100 text-primary' : ''}`}
            >
              <Link href="/local/ai" aria-label="AI test" title="AI test (dev)">
                <TbBrandOpenai size="32" />
              </Link>
            </div>
          </>
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
        <div className="absolute w-full h-full flex flex-col overflow-auto">{props.children}</div>
        {(vodDiskWarning || logDiskWarning) && (
          <div className="absolute right-4 top-4 z-40 max-w-sm rounded border border-error/60 bg-base-100 p-3 text-sm shadow-xl">
            <div className="mb-2 flex items-center gap-2 font-semibold text-error">
              <TbAlertTriangle size="18" />
              <span>Low disk space</span>
            </div>
            {vodDiskWarning && (
              <div>
                VOD drive {vodDiskWarning.driveLabel ?? '(unknown)'} {(vodDiskWarning.bytesRemaining / 1e9).toFixed(1)}{' '}
                GB free
              </div>
            )}
            {logDiskWarning && (
              <div>
                Log drive {logDiskWarning.driveLabel ?? '(unknown)'} {(logDiskWarning.bytesRemaining / 1e9).toFixed(1)}{' '}
                GB free
              </div>
            )}
            <button
              className="mt-2 text-xs underline"
              onClick={() => {
                setVodDiskWarning(null);
                setLogDiskWarning(null);
              }}
            >
              dismiss
            </button>
          </div>
        )}
      </div>
      {showUpgradeBanner && (
        <div className="absolute bottom-0 left-0 right-0 z-50 bg-warning text-warning-content text-center py-2 px-4 font-semibold">
          Upgrade to 12.1 or higher immediately for the Midnight patch.
        </div>
      )}
    </div>
  );
}

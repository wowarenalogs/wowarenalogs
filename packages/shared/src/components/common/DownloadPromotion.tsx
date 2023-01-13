import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TbDownload, TbX } from 'react-icons/tb';

import { useClientContext } from '../../hooks/ClientContext';

export const DownloadPromotion = () => {
  const clientContext = useClientContext();
  const [dismissedDownloadPromo, setDismissedDownloadPromo] = useState(false);

  useEffect(() => {
    setDismissedDownloadPromo(localStorage.getItem('dismissedDownloadPromo') === 'true');
  }, []);

  return !clientContext.isDesktop && !dismissedDownloadPromo ? (
    <div className="mb-2 relative hidden md:block">
      <div className="alert alert-info shadow-lg">
        <div>
          <TbDownload className="text-xl" />
          Get WoW Arena Logs and start analyzing your own arena matches today!
        </div>
        <div className="flex-none">
          <Link href="/">
            <a className="btn btn-sm btn-outline">Download</a>
          </Link>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setDismissedDownloadPromo(true);
              localStorage.setItem('dismissedDownloadPromo', 'true');
            }}
          >
            <TbX />
          </button>
        </div>
      </div>
    </div>
  ) : null;
};

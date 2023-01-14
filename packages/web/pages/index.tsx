import type { NextPage } from 'next';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const Home: NextPage = () => {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') === 0);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="hero">
        <div className="hero-content flex-col md:flex-row gap-4">
          <Image alt="WoW Arena Logs" src="/logo512.png" width={256} height={256} />
          <div className="flex flex-col items-start">
            <h1 className="text-5xl font-bold">Learn from every match.</h1>
            <p className="py-6">
              WoW Arena Logs is the best tool available to help you analyze your own arena matches and learn from the
              community.
            </p>
            <div className={`flex gap-x-4 ${isMac ? 'flex-row-reverse' : 'flex-row'}`}>
              <a
                className={`btn ${!isMac ? 'btn-primary' : ''}`}
                href="https://storage.googleapis.com/download.wowarenalogs.com/desktop-client/latest-windows.zip"
                target="_blank"
                rel="noreferrer"
              >
                Download for Windows
              </a>
              <a
                className={`btn ${isMac ? 'btn-primary' : ''}`}
                href="https://storage.googleapis.com/download.wowarenalogs.com/desktop-client/latest-mac.zip"
                target="_blank"
                rel="noreferrer"
              >
                Download for Mac
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;

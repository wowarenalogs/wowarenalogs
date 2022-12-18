import type { NextPage } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const Home: NextPage = () => {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') === 0);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-base-300 p-4">
      <Head>
        <meta key="charset" charSet="utf-8" />
        <title>WoW Arena Logs</title>
        <link key="icon" rel="icon" href="/favicon.ico" />
        <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1" />
        <meta key="theme-color" name="theme-color" content="#000000" />
        <link type="text/css" href="https://wow.zamimg.com/css/basic.css?16" rel="stylesheet" />
        <script key="wowhead0">{'window.whTooltips = { colorLinks: true, iconSize: true };'}</script>
        <script key="wowhead1" async src="https://wow.zamimg.com/widgets/power.js" />
      </Head>
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="hero">
          <div className="hero-content flex-row">
            <Image alt="WoW Arena Logs" src="/logo512.png" width={256} height={256} />
            <div className="ml-4 flex flex-col items-start">
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
    </div>
  );
};

export default Home;

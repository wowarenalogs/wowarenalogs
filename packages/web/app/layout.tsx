import '../styles/globals.css';

import type { Metadata } from 'next';
import Script from 'next/script';

const TITLE = 'WoW Arena Logs | World of Warcraft PvP Data Analytics';
const DESCRIPTION =
  'WoW Arena Logs is the best tool available to help you analyze your own arena matches and learn from the community.';

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: `%s | ${TITLE}`,
  },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    title: TITLE,
    description: DESCRIPTION,
  },
  icons: {
    icon: '/favicon.ico',
  },
  other: {
    'theme-color': '#000000',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="night">
      <head>
        <link type="text/css" href="https://wow.zamimg.com/css/basic.css?16" rel="stylesheet" />
        <Script id="wowhead-config" strategy="beforeInteractive">
          {'window.whTooltips = { colorLinks: true, iconSize: true };'}
        </Script>
        <Script src="https://wow.zamimg.com/widgets/power.js" strategy="afterInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}

import '../styles/globals.css';

import type { AppProps } from 'next/app';

import WebLayout from '../components/WebLayout';

function App({ Component, pageProps }: AppProps) {
  return (
    <WebLayout>
      <Component {...pageProps} />
    </WebLayout>
  );
}

export default App;

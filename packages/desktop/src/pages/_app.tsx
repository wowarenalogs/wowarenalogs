import { appWithTranslation } from 'next-i18next';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';

import './globals.css';
import 'nprogress/nprogress.css';

import IndexHtml from './index.html';

const Main = dynamic(
  () => {
    const promise = import('../components/Main').then((mod) => mod.Main);
    return promise;
  },
  { ssr: false },
);

function App(props: AppProps) {
  const router = useRouter();

  if (router.pathname.startsWith('/index.html')) {
    return <IndexHtml />;
  }

  if (router.pathname.startsWith('/login/')) {
    // bypass main layout when rendering the desktop login page
    return <props.Component {...props.pageProps} />;
  }

  return (
    <>
      <Main {...props} />
    </>
  );
}

export default appWithTranslation(App);

import '../styles/globals.css';

import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Provider } from 'next-auth/client';

const DesktopLayout = dynamic(
  () => {
    const promise = import('../components/DesktopLayout').then((mod) => mod.DesktopLayout);
    return promise;
  },
  { ssr: false },
);

function App(props: AppProps) {
  const router = useRouter();

  if (router.pathname.startsWith('/index.html')) {
    return <div>HTML INDEX?</div>;
  }

  if (router.pathname.indexOf('/login') > -1) {
    // bypass main layout when rendering the desktop login page
    return <props.Component {...props.pageProps} />;
  }

  return (
    <Provider session={props.pageProps.session}>
      <DesktopLayout {...props} />
    </Provider>
  );
}

export default App;

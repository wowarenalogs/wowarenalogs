import '../styles/globals.css';

import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';

const DesktopLayout = dynamic(
  () => {
    const promise = import('../components/DesktopLayout').then((mod) => mod.DesktopLayout);
    return promise;
  },
  { ssr: false },
);

function App(props: AppProps) {
  return <DesktopLayout {...props} />;
}

export default App;

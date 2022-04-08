import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const DesktopLayout = dynamic(
  () => {
    const promise = import('../components/DesktopLayout').then((mod) => mod.DesktopLayout);
    return promise;
  },
  { ssr: false },
);

const Home: NextPage = () => {
  return <DesktopLayout />;
};

export default Home;

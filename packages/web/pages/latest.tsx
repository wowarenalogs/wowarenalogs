import dynamic from 'next/dynamic';

const LatestPageContent = dynamic(() => import('../components/LatestPageContent'), { ssr: false });

const Page = () => {
  return <LatestPageContent />;
};

export default Page;

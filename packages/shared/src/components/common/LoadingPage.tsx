import { useRouter } from 'next/router';
import { TbArrowBigLeft, TbLoader } from 'react-icons/tb';

export function LoadingPage() {
  const router = useRouter();
  return (
    <div className="w-full h-full flex flex-col p-2 animate-loader">
      <div className="flex flex-row items-center px-2">
        <h2 className="text-2xl font-bold">
          <TbArrowBigLeft className="inline mr-4" onClick={() => router.back()} />
          <span>Loading</span>
        </h2>
      </div>
      <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
        <TbLoader color="gray" size={60} className="animate-spin-slow" />
      </div>
    </div>
  );
}

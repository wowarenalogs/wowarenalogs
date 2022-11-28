import { useRouter } from 'next/router';
import { TbChevronLeft, TbLoader } from 'react-icons/tb';

export function LoadingPage() {
  const router = useRouter();
  return (
    <div className="w-full h-full flex flex-col p-2 animate-loader">
      <div className="flex flex-row items-center px-2">
        <div className="pt-1 pr-2">
          <TbChevronLeft className="text-2xl cursor-pointer hover:text-primary" onClick={() => router.back()} />
        </div>
        <h2 className="text-2xl font-bold">
          <span>Loading</span>
        </h2>
      </div>
      <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
        <TbLoader color="gray" size={60} className="animate-spin-slow" />
      </div>
    </div>
  );
}

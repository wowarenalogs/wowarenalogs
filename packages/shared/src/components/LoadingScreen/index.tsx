import { TbLoader } from 'react-icons/tb';

export const LoadingScreen = () => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-base-content">
      <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
        <TbLoader color="gray" size={60} className="animate-spin-slow" />
      </div>
    </div>
  );
};

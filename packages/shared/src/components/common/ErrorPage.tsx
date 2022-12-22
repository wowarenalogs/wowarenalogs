import { useRouter } from 'next/router';
import { TbArrowBigLeft } from 'react-icons/tb';

export function ErrorPage({ message }: { message: string }) {
  const router = useRouter();
  return (
    <div className="w-full h-full flex flex-col p-2 animate-fadein">
      <div className="flex flex-row items-center px-2">
        <h2 className="text-2xl font-bold">
          <TbArrowBigLeft className="inline mr-4" onClick={() => router.back()} />
          <span>Error</span>
        </h2>
      </div>
      <div className="px-2">
        <div className="card bg-error text-error-content p-4 mt-4">{message}</div>
      </div>
      <div className="w-4/12 px-2 mt-4 space-y-4">
        Report this error at{' '}
        <a href="https://discord.gg/NFTPK9tmJK" target="_blank" rel="noreferrer">
          https://discord.gg/NFTPK9tmJK
        </a>
        <div
          className="btn"
          onClick={() => {
            navigator.clipboard.writeText(message);
          }}
        >
          Copy to clipboard
        </div>
      </div>
    </div>
  );
}

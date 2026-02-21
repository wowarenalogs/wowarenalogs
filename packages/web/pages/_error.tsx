import type { NextPageContext } from 'next';

function ErrorPage({ statusCode }: { statusCode?: number }) {
  const code = statusCode ?? 500;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Application error</h1>
      <p className="text-base-content/70">Error code: {code}</p>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};

export default ErrorPage;

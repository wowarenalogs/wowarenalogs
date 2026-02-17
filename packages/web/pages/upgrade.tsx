export default function Page() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="hero">
        <div className="hero-content text-center flex flex-col pb-16">
          <h1 className="text-5xl font-bold">Your app is out of date</h1>
          <p className="py-6">Please install the latest version to enjoy the best experience.</p>
          <a
            className="btn btn-primary"
            onClick={() => {
              window.wowarenalogs.links?.openExternalURL('https://wowarenalogs.com');
            }}
          >
            Download Latest Version
          </a>
        </div>
      </div>
    </div>
  );
}

import { LoadingScreen, useClientContext } from '@wowarenalogs/shared';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { useAppConfig } from '../../hooks/AppConfigContext';

export const FirstTimeSetup = () => {
  const { isLoading, updateAppConfig } = useAppConfig();
  const clientContext = useClientContext();
  const [step, setStep] = useState(0);
  const [acceptTos, setAcceptTos] = useState(true);
  const [launchAtStartup, setLaunchAtStartup] = useState(true);
  const router = useRouter();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="w-full h-full flex flex-col justify-center items-center">
      {step === 0 && (
        <div className="hero">
          <div className="hero-content text-center flex flex-col">
            <h1 className="text-5xl font-bold">Getting started</h1>
            <p className="py-6">First, let&apos;s locate your World of Warcraft game directory.</p>
            <button
              className="btn btn-primary btn-wide"
              onClick={() => {
                window.wowarenalogs.fs
                  ?.selectFolder()
                  .then((wowDirectory) => {
                    updateAppConfig((config) => {
                      return {
                        ...config,
                        wowDirectory,
                      };
                    });
                    setStep(1);
                  })
                  .catch(() => {
                    return;
                  });
              }}
            >
              Select
            </button>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="hero">
          <div className="hero-content flex flex-col items-center">
            <h1 className="text-5xl font-bold">Almost there!</h1>
            <div className="flex flex-col items-start">
              <div className="form-control pt-6">
                <label className="label">
                  <input
                    type="checkbox"
                    className="checkbox mr-2"
                    checked={acceptTos}
                    onChange={(e) => {
                      setAcceptTos(e.target.checked);
                    }}
                  />
                  <span className="label-text">
                    I agree with WoW Arena Logs&apos;{' '}
                    <a
                      href="#"
                      className="link"
                      onClick={() => {
                        clientContext.openExternalURL('https://wowarenalogs.com/privacy.html');
                      }}
                    >
                      privacy policy
                    </a>
                    .
                  </span>
                </label>
              </div>
              <div className="form-control">
                <label className="label">
                  <input
                    type="checkbox"
                    className="checkbox mr-2"
                    checked={launchAtStartup}
                    onChange={(e) => {
                      setLaunchAtStartup(e.target.checked);
                    }}
                  />
                  <span className="label-text">Launch WoW Arena Logs when computer starts.</span>
                </label>
              </div>
            </div>
            {acceptTos ? (
              <button
                className="btn btn-primary btn-wide"
                onClick={() => {
                  updateAppConfig((prev) => {
                    return {
                      ...prev,
                      launchAtStartup,
                      tosAccepted: acceptTos,
                    };
                  });
                  router.push('/latest');
                }}
              >
                Get Started
              </button>
            ) : (
              <label htmlFor="modal-error-tos" className="btn btn-primary btn-wide modal-button">
                Get Started
              </label>
            )}
          </div>
        </div>
      )}
      <input type="checkbox" id="modal-error-tos" className="modal-toggle" />
      <div className="modal">
        <div className="modal-box prose">
          <h3 className="text-error">Oops</h3>
          <p>You must accept our privacy policy in order to use WoW Arena Logs.</p>
          <div className="modal-action">
            <label htmlFor="modal-error-tos" className="btn">
              Okay
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

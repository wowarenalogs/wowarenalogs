import { LoadingScreen } from '@wowarenalogs/shared/src';
import { useState } from 'react';

import { useAppConfig } from '../../hooks/AppConfigContext';

export const FirstTimeSetup = () => {
  const { isLoading, updateAppConfig } = useAppConfig();
  const [step, setStep] = useState(0);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="w-full h-full flex flex-col justify-center items-center">
      {step === 0 && (
        <div className="hero">
          <div className="hero-content text-center">
            <div className="max-w-md">
              <h1 className="text-5xl font-bold">Getting Started</h1>
              <p className="py-6">First, let&apos;s locate your World of Warcraft game directory.</p>
              <button
                className="btn btn-primary"
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
                    .catch(() => {});
                }}
              >
                Select
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

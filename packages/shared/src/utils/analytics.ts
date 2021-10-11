// eslint-disable-next-line @typescript-eslint/no-explicit-any
let amplitude: any;
let googleAnalyticsPropertyId: string;
let googleAnalyticsClientId: string;
let googleAnalyticsSessionId: string;

export const initAnalyticsAsync = (amplitudeAppId: string, gaPropertyId: string): Promise<void> => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && !amplitude) {
      amplitude = require('amplitude-js');
      amplitude.getInstance().init(amplitudeAppId, undefined, {
        includeReferrer: true,
      });
    }
    googleAnalyticsPropertyId = gaPropertyId;
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('get', gaPropertyId, 'client_id', (clientId) => {
        googleAnalyticsClientId = clientId;
        window.gtag('get', gaPropertyId, 'session_id', (sessionId) => {
          googleAnalyticsSessionId = sessionId;
          resolve();
        });
      });
    } else {
      resolve();
    }
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logAnalyticsEvent = (event: string, params?: any) => {
  if (amplitude) {
    amplitude.getInstance().logEvent(event, params);
  }
  if (window.gtag) {
    window.gtag('event', event, params);
  }
};

export const setAnalyticsUserProperties = (userProperties: Record<string, unknown>) => {
  if (amplitude) {
    amplitude.getInstance().setUserProperties(userProperties);
  }
  if (window.gtag) {
    window.gtag('set', 'user_properties', userProperties);
    if (userProperties.id) {
      window.gtag('config', googleAnalyticsPropertyId, {
        user_id: userProperties.id,
      });
    }
  }
};

export const getAnalyticsDeviceId = () => {
  if (amplitude) {
    return amplitude.getInstance().options.deviceId;
  }
  if (googleAnalyticsClientId) {
    return googleAnalyticsClientId;
  }
  return null;
};

export const getAnalyticsSessionId = () => {
  if (amplitude) {
    return amplitude.getInstance().getSessionId().toFixed();
  }
  if (googleAnalyticsSessionId) {
    return googleAnalyticsSessionId;
  }
  return null;
};

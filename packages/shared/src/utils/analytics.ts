import * as amplitude from '@amplitude/analytics-browser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let googleAnalyticsPropertyId: string;
let googleAnalyticsClientId: string;
let googleAnalyticsSessionId: string;
let amplitudeActive = false;

export const initAnalyticsAsync = (gaPropertyId: string, amplitudeApiKey?: string): Promise<void> => {
  if (process.env.NODE_ENV === 'development') {
    return Promise.resolve();
  }

  if (amplitudeApiKey) {
    amplitude.init(amplitudeApiKey);
    amplitudeActive = true;
  }

  return new Promise((resolve) => {
    googleAnalyticsPropertyId = gaPropertyId;
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('get', gaPropertyId, 'client_id', (clientId) => {
        googleAnalyticsClientId = clientId as string;
        window.gtag('get', gaPropertyId, 'session_id', (sessionId) => {
          googleAnalyticsSessionId = sessionId as string;
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
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('Analytics event', event, params);
    return;
  }
  if (window.gtag) {
    window.gtag('event', event, params);
  }
  if (amplitudeActive) {
    amplitude.track(event, params);
  }
};

export const setAnalyticsUserProperties = (userProperties: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'development') {
    return;
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
  if (googleAnalyticsClientId) {
    return googleAnalyticsClientId;
  }
  return null;
};

export const getAnalyticsSessionId = () => {
  if (googleAnalyticsSessionId) {
    return googleAnalyticsSessionId;
  }
  return null;
};

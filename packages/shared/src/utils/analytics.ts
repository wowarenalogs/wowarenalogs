// eslint-disable-next-line @typescript-eslint/no-explicit-any
let googleAnalyticsPropertyId: string;
let googleAnalyticsClientId: string;
let googleAnalyticsSessionId: string;

export const initAnalyticsAsync = (gaPropertyId: string): Promise<void> => {
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
  if (window.gtag) {
    window.gtag('event', event, params);
  }
};

export const setAnalyticsUserProperties = (userProperties: Record<string, unknown>) => {
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

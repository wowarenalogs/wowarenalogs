import React, { useContext } from 'react';

interface IClientContextData {
  isDesktop: boolean;
  openExternalURL: (url: string) => void;
  showLoginModal: (authUrl: string, callback: () => void) => void;
}

const ClientContext = React.createContext<IClientContextData>({
  isDesktop: false,
  openExternalURL: () => null,
  showLoginModal: (_authUrl: string, callback: () => void) => {
    callback();
  },
});

interface IProps {
  isDesktop: boolean;
  openExternalURL: (url: string) => void;
  showLoginModal: (authUrl: string, callback: () => void) => void;
  children: React.ReactNode | React.ReactNode[];
}

export const ClientContextProvider = (props: IProps) => {
  return (
    <ClientContext.Provider
      value={{
        openExternalURL: props.openExternalURL,
        isDesktop: props.isDesktop,
        showLoginModal: props.showLoginModal,
      }}
    >
      {props.children}
    </ClientContext.Provider>
  );
};

export const useClientContext = () => {
  const contextData = useContext(ClientContext);
  return contextData;
};

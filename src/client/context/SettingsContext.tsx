import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { fetchApi } from '../lib/api';

interface PublicSettings {
  appName: string;
}

const SettingsContext = createContext<PublicSettings>({ appName: 'GatherSplit' });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>({ appName: 'GatherSplit' });

  useEffect(() => {
    fetchApi('/settings/public')
      .then((data) => {
        setSettings({ appName: data.settings.appName || 'GatherSplit' });
        document.title = data.settings.appName || 'GatherSplit';
      })
      .catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

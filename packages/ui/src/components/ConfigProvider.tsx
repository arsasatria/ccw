import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { api } from '@/lib/api';
import type { Config, StatusLineConfig } from '@/types';
import { coerceChain } from '@/lib/utils';

interface ConfigContextType {
  config: Config | null;
  setConfig: Dispatch<SetStateAction<Config | null>>;
  save: () => Promise<void>;
  isSaving: boolean;
  saveError: Error | null;
  error: Error | null;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasFetched, setHasFetched] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('apiKey'));

  // Persist the current `config` snapshot to the server via POST /api/config.
  // This is the explicit-Save contract: callers update local state via
  // `setConfig` and then invoke `save()` to commit. Returns a rejected
  // promise on failure so callers can surface errors.
  const save = async (): Promise<void> => {
    if (!config) return;
    setIsSaving(true);
    try {
      await api.saveConfig(config);
      setSaveError(null);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setSaveError(err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Listen for localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      setApiKey(localStorage.getItem('apiKey'));
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      // Reset fetch state when API key changes
      setHasFetched(false);
      setConfig(null);
      setError(null);
    };

    fetchConfig();
  }, [apiKey]);

  useEffect(() => {
    const fetchConfig = async () => {
      // Prevent duplicate API calls in React StrictMode
      // Skip if we've already fetched
      if (hasFetched) {
        return;
      }
      setHasFetched(true);
      
      try {
        // Try to fetch config regardless of API key presence
        const data = await api.getConfig();
        
        // Validate the received data to ensure it has the expected structure
        const validConfig = {
          LOG: typeof data.LOG === 'boolean' ? data.LOG : false,
          LOG_LEVEL: typeof data.LOG_LEVEL === 'string' ? data.LOG_LEVEL : 'debug',
          CLAUDE_PATH: typeof data.CLAUDE_PATH === 'string' ? data.CLAUDE_PATH : '',
          HOST: typeof data.HOST === 'string' ? data.HOST : '127.0.0.1',
          PORT: typeof data.PORT === 'number' ? data.PORT : 3456,
          APIKEY: typeof data.APIKEY === 'string' ? data.APIKEY : '',
          API_TIMEOUT_MS: typeof data.API_TIMEOUT_MS === 'string' ? data.API_TIMEOUT_MS : '600000',
          PROXY_URL: typeof data.PROXY_URL === 'string' ? data.PROXY_URL : '',
          transformers: Array.isArray(data.transformers) ? data.transformers : [],
          Providers: Array.isArray(data.Providers) ? data.Providers : [],
          StatusLine: data.StatusLine && typeof data.StatusLine === 'object' ? {
            enabled: typeof data.StatusLine.enabled === 'boolean' ? data.StatusLine.enabled : false,
            currentStyle: typeof data.StatusLine.currentStyle === 'string' ? data.StatusLine.currentStyle : 'default',
            default: data.StatusLine.default && typeof data.StatusLine.default === 'object' && Array.isArray(data.StatusLine.default.modules) ? data.StatusLine.default : { modules: [] },
            powerline: data.StatusLine.powerline && typeof data.StatusLine.powerline === 'object' && Array.isArray(data.StatusLine.powerline.modules) ? data.StatusLine.powerline : { modules: [] }
          } : { 
            enabled: false,
            currentStyle: 'default',
            default: { modules: [] },
            powerline: { modules: [] }
          },
          Router: data.Router && typeof data.Router === 'object' ? {
            default: coerceChain(data.Router.default),
            background: coerceChain(data.Router.background),
            think: coerceChain(data.Router.think),
            longContext: coerceChain(data.Router.longContext),
            longContextThreshold: typeof data.Router.longContextThreshold === 'number' ? data.Router.longContextThreshold : 60000,
            webSearch: coerceChain(data.Router.webSearch),
            image: coerceChain(data.Router.image)
          } : {
            default: [],
            background: [],
            think: [],
            longContext: [],
            longContextThreshold: 60000,
            webSearch: [],
            image: []
          },
          CUSTOM_ROUTER_PATH: typeof data.CUSTOM_ROUTER_PATH === 'string' ? data.CUSTOM_ROUTER_PATH : '',
          tokenSaver: typeof data.tokenSaver === 'boolean' ? data.tokenSaver : true,
          terseMode: typeof data.terseMode === 'boolean' ? data.terseMode : false
        };

        setConfig(validConfig);
      } catch (err) {
        console.error('Failed to fetch config:', err);
        // On 401 the api client dispatches `unauthorized` from a microtask
        // and the main.tsx top-level listener navigates to /login. We still
        // need to load *something* into state here so the app can render
        // while that navigation is in flight — otherwise AppShell would
        // sit on its skeleton loader until the route swap completes.
        const isAuthError = (err as Error).message === 'Unauthorized';
        setConfig({
          LOG: false,
          LOG_LEVEL: 'debug',
          CLAUDE_PATH: '',
          HOST: '127.0.0.1',
          PORT: 3456,
          APIKEY: '',
          API_TIMEOUT_MS: '600000',
          PROXY_URL: '',
          transformers: [],
          Providers: [],
          StatusLine: undefined,
          Router: {
            default: [],
            background: [],
            think: [],
            longContext: [],
            longContextThreshold: 60000,
            webSearch: [],
            image: []
          },
          CUSTOM_ROUTER_PATH: '',
          tokenSaver: true,
          terseMode: false
        });
        if (!isAuthError) {
          setError(err as Error);
        }
      }
    };

    fetchConfig();
  }, [hasFetched, apiKey]);

  return (
    <ConfigContext.Provider value={{ config, setConfig, save, isSaving, saveError, error }}>
      {children}
    </ConfigContext.Provider>
  );
}

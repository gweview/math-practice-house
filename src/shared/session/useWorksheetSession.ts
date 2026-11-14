import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export interface WorksheetSessionOptions<Config, Result> {
  load: () => Config;
  save: (config: Config) => void;
  defaults: () => Config;
  generate: (config: Config) => Result;
  resultConfig: (result: Result) => Config;
  equivalent?: (draft: Config, rendered: Config) => boolean;
}

export interface WorksheetSession<Config, Result> {
  /** Current editable draft. */
  config: Config;
  setConfig: Dispatch<SetStateAction<Config>>;
  /** The immutable generation result, or null before the first generation. */
  result: Result | null;
  setResult: Dispatch<SetStateAction<Result | null>>;
  /** Configuration snapshot used by the current result. */
  generatedConfig: Config | null;
  renderedConfig: Config;
  previewIsStale: boolean;
  showAnswers: boolean;
  setShowAnswers: Dispatch<SetStateAction<boolean>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  create: (nextConfig?: Config) => Result | null;
  reset: () => void;
}

export function useWorksheetSession<Config, Result>(options: WorksheetSessionOptions<Config, Result>): WorksheetSession<Config, Result> {
  const [config, setConfig] = useState<Config>(() => options.load());
  const [result, setResult] = useState<Result | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [error, setError] = useState('');

  // Consumers often construct the options object inline. Persisting against
  // that object made every render write LocalStorage, even when the draft did
  // not change. Keep the latest callback without making callback identity a
  // persistence dependency.
  const saveRef = useRef(options.save);
  saveRef.current = options.save;
  useEffect(() => {
    try { saveRef.current(config); } catch { /* A custom store must not break the session. */ }
  }, [config]);

  const generatedConfig = result ? options.resultConfig(result) : null;
  const renderedConfig = generatedConfig ?? config;
  const previewIsStale = result
    ? options.equivalent
      ? !options.equivalent(config, renderedConfig)
      : JSON.stringify(config) !== JSON.stringify(renderedConfig)
    : false;

  const create = (nextConfig: Config = config) => {
    setError('');
    try {
      const next = options.generate(nextConfig);
      setResult(next);
      setError('');
      setShowAnswers(false);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成失败');
      return null;
    }
  };

  const reset = () => {
    const next = options.defaults();
    setConfig(next);
    setResult(null);
    setShowAnswers(false);
    setError('');
  };

  return {
    config,
    setConfig,
    result,
    setResult,
    generatedConfig,
    renderedConfig,
    previewIsStale,
    showAnswers,
    setShowAnswers,
    error,
    setError,
    create,
    reset
  };
}

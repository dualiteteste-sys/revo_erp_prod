import { useEffect, useState } from 'react';

type Options<T> = {
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
};

export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  options: Options<T> = {},
) {
  const serialize = options.serialize ?? ((value: T) => JSON.stringify(value));
  const deserialize = options.deserialize ?? ((raw: string) => JSON.parse(raw) as T);

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return deserialize(raw);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, serialize(value));
    } catch {
      // ignore write errors (private mode / quota)
    }
  }, [key, serialize, value]);

  return [value, setValue] as const;
}


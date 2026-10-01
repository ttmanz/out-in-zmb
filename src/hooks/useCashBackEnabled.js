import { useEffect, useState } from 'react';
import { getCashBackEnabled } from '../lib/cashback';

// Whether cash back is switched on. Remembered for the session so screens don't
// flash cash back for a moment before the answer arrives; false until known.
let cached = false;

export const useCashBackEnabled = () => {
  const [enabled, setEnabled] = useState(cached);

  useEffect(() => {
    let cancelled = false;
    getCashBackEnabled().then((value) => {
      cached = value;
      if (!cancelled) setEnabled(value);
    });
    return () => { cancelled = true; };
  }, []);

  return enabled;
};

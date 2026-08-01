import { useState } from 'react';

export function useNotice() {
  const [notice, setNotice] = useState(
    'Demo image is ready. Draw over the image to corrupt RGBA bytes.',
  );

  return { notice, setNotice };
}

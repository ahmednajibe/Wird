import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import React, { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';

// Hold every frame until the fonts the scenes use are actually loaded, so
// no frame is ever rendered in a fallback face.
const FACES = [
  "400 40px 'Plus Jakarta Sans Variable'",
  "800 40px 'Plus Jakarta Sans Variable'",
  "500 40px 'JetBrains Mono Variable'",
  "400 40px 'Amiri'",
  "700 40px 'Amiri'",
  "500 40px 'IBM Plex Sans Arabic'",
  "700 40px 'IBM Plex Sans Arabic'",
];

export const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender('Loading fonts'));
  useEffect(() => {
    Promise.all(FACES.map((f) => document.fonts.load(f, 'Wird وِرد 0123')))
      .then(() => document.fonts.ready)
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);
  return <>{children}</>;
};

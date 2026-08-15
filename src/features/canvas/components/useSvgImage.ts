import { useState, useEffect } from 'react';

// Global SVG image cache — prevents re-parsing SVG data URIs on every render
const svgImageCache = new Map<string, HTMLImageElement>();

export const useSvgImage = (url: string) => {
  const [image, setImage] = useState<HTMLImageElement | undefined>(
    () => svgImageCache.get(url) // initialize from cache synchronously
  );

  useEffect(() => {
    if (!url) return;
    const cached = svgImageCache.get(url);
    if (cached) {
      setImage(cached);
      return;
    }
    const img = new window.Image();
    img.src = url.trim().startsWith('<svg')
      ? `data:image/svg+xml;utf8,${encodeURIComponent(url)}`
      : url;
    img.onload = () => {
      svgImageCache.set(url, img);
      setImage(img);
    };
  }, [url]);

  return image;
};

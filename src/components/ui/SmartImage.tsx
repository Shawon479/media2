import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt: string;
  fallbackLabel?: string;
  containerClassName?: string;
}

/**
 * Image with a graceful two-step fallback: direct URL → server image proxy → placeholder.
 * Many CDNs block hotlinking, so this keeps cards looking intact.
 */
export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt,
  className = '',
  containerClassName = '',
  fallbackLabel,
  ...rest
}) => {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setLoaded(false);
    setFailed(!src);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 text-neutral-600 ${containerClassName}`}
        title={fallbackLabel || alt}
      >
        <div className="flex flex-col items-center gap-1.5 p-3 text-center">
          <ImageOff className="h-6 w-6" />
          {fallbackLabel && <span className="line-clamp-2 text-[10px] leading-tight text-neutral-500">{fallbackLabel}</span>}
        </div>
      </div>
    );
  }

  const resolvedSrc =
    attempt === 0 ? src : `/api/proxy-image?url=${encodeURIComponent(src)}`;

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-neutral-800/60" />}
      <img
        {...rest}
        src={resolvedSrc}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (attempt === 0) {
            setAttempt(1);
          } else {
            setFailed(true);
          }
        }}
        className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      />
    </div>
  );
};

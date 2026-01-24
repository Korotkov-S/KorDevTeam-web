import React, { useEffect, useState } from 'react'

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg=='

type ImageWithFallbackProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string;
  fallbackClassName?: string;
};

export function ImageWithFallback(props: ImageWithFallbackProps) {
  const [didError, setDidError] = useState(false)

  const handleError = () => {
    setDidError(true)
  }

  const { src, alt, style, className, fallbackSrc, fallbackClassName, ...rest } = props

  // Reset error state when src changes (e.g., list re-render or new image)
  useEffect(() => {
    setDidError(false)
  }, [src])

  const finalSrc = didError ? (fallbackSrc || ERROR_IMG_SRC) : src
  const finalAlt = didError ? (fallbackSrc ? (alt || "KorDevTeam") : "Error loading image") : alt
  const finalClassName = didError && fallbackClassName ? fallbackClassName : className

  return (
    <img
      src={finalSrc}
      alt={finalAlt}
      className={finalClassName}
      style={style}
      {...rest}
      data-original-url={src}
      onError={handleError}
    />
  )
}

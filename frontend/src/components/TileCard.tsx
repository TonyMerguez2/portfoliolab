"use client";
import { ReactNode, CSSProperties } from "react";
import { tileData, tileSurface, trackSpecular, releaseSpecular } from "@/lib/tileStyle";

interface Props {
  ticker: string;
  children: ReactNode;
  className?: string;
  radius?: number;
  style?: CSSProperties;
  containerStyle?: CSSProperties;
  onClick?: () => void;
  glowStrength?: number;
  /** Overrides the brand colour — for pages that extract one from the logo. */
  colorHex?: string;
}

export default function TileCard({ ticker, children, className, radius = 12, style, containerStyle, onClick, glowStrength = 1, colorHex }: Props) {
  const { rgb, b1cx, b1cy, b2cx, b2cy } = tileData(ticker);
  const [r, g, b] = rgb;
  const id = `tc-${ticker.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div
      className={className}
      onClick={onClick}
      onPointerMove={trackSpecular}
      onPointerLeave={releaseSpecular}
      style={{
        ...tileSurface(ticker, radius, colorHex),
        position: "relative",
        cursor: onClick ? "pointer" : undefined,
        flexShrink: 0,
        ...containerStyle,
      }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }}
      >
        <defs>
          <filter id={`ga-${id}`} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="28"/>
          </filter>
          <filter id={`gb-${id}`} x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="16"/>
          </filter>
          <filter id={`gb2-${id}`} x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="13"/>
          </filter>
        </defs>
        <circle cx="50" cy="50" r="70" fill={`rgba(${r},${g},${b},${0.38 * glowStrength})`} filter={`url(#ga-${id})`}/>
        <circle cx={b1cx} cy={b1cy} r="42" fill={`rgba(${r},${g},${b},${0.22 * glowStrength})`} filter={`url(#gb-${id})`}/>
        <circle cx={b2cx} cy={b2cy} r="34" fill={`rgba(${r},${g},${b},${0.14 * glowStrength})`} filter={`url(#gb2-${id})`}/>
      </svg>
      {/* style spread here so layout props + font-smoothing apply to the text layer, above the blobs */}
      <div style={{
        position: "relative",
        zIndex: 1,
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        ...style,
      }}>
        {children}
      </div>
    </div>
  );
}

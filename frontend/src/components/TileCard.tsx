"use client";
import { ReactNode, CSSProperties } from "react";
import { tileData } from "@/lib/tileStyle";

interface Props {
  ticker: string;
  children: ReactNode;
  radius?: number;
  style?: CSSProperties;
  containerStyle?: CSSProperties;
  onClick?: () => void;
}

export default function TileCard({ ticker, children, radius = 12, style, containerStyle, onClick }: Props) {
  const { glassBg, borderGrad, rgb, b1cx, b1cy, b2cx, b2cy } = tileData(ticker);
  const [r, g, b] = rgb;
  const id = `tc-${ticker.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div onClick={onClick} style={{
      position: "relative",
      borderRadius: radius,
      cursor: onClick ? "pointer" : undefined,
      background: `${glassBg} padding-box, ${borderGrad} border-box`,
      backdropFilter: "blur(24px) saturate(1.6) brightness(1.06)",
      WebkitBackdropFilter: "blur(24px) saturate(1.6) brightness(1.06)",
      border: "1px solid transparent",
      boxShadow: `0 1px 6px rgba(0,0,0,0.28), inset 1px 1px 0 rgba(255,255,255,0.22), inset -1px -1px 0 rgba(${r},${g},${b},0.20)`,
      overflow: "hidden",
      boxSizing: "border-box",
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
        <circle cx="50" cy="50" r="70" fill={`rgba(${r},${g},${b},0.38)`} filter={`url(#ga-${id})`}/>
        <circle cx={b1cx} cy={b1cy} r="42" fill={`rgba(${r},${g},${b},0.22)`} filter={`url(#gb-${id})`}/>
        <circle cx={b2cx} cy={b2cy} r="34" fill={`rgba(${r},${g},${b},0.14)`} filter={`url(#gb2-${id})`}/>
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

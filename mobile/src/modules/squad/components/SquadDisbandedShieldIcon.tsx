import React from 'react';
import Svg, { Path, Line, Defs, LinearGradient, Stop } from 'react-native-svg';

export function SquadDisbandedShieldIcon({ size = 88 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 88 88" fill="none">
      <Defs>
        <LinearGradient id="dis-l" x1="14" y1="8" x2="44" y2="77" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#2a1010" />
          <Stop offset="100%" stopColor="#110808" />
        </LinearGradient>
        <LinearGradient id="dis-r" x1="46" y1="8" x2="76" y2="77" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#1e0e0e" />
          <Stop offset="100%" stopColor="#0f0808" />
        </LinearGradient>
      </Defs>
      <Path
        d="M44 8L14 21V43C14 57 25 69 44 77L44 8Z"
        fill="url(#dis-l)"
        stroke="rgba(239,68,68,0.3)"
        strokeWidth={1.5}
      />
      <Path
        d="M50 8L80 21V43C80 57 69 69 50 77L50 8Z"
        fill="url(#dis-r)"
        stroke="rgba(239,68,68,0.2)"
        strokeWidth={1.5}
      />
      <Path
        d="M44 8L42 28L46 42L43 60L44 77"
        stroke="rgba(239,68,68,0.6)"
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />
      <Line
        x1={32}
        y1={36}
        x2={56}
        y2={60}
        stroke="rgba(239,68,68,0.4)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <Line
        x1={56}
        y1={36}
        x2={32}
        y2={60}
        stroke="rgba(239,68,68,0.4)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

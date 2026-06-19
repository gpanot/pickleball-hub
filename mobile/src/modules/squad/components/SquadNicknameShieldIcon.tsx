import React from 'react';
import Svg, { Path, Text as SvgText, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

export function SquadNicknameShieldIcon({ size = 80 }: { size?: number }) {
  const scale = size / 80;
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <Defs>
        <LinearGradient id="sh-fill" x1="40" y1="8" x2="40" y2="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#2a1e00" />
          <Stop offset="100%" stopColor="#1a1200" />
        </LinearGradient>
      </Defs>
      {/* Shield body */}
      <Path
        d="M40 6L12 18V40C12 55 24 66 40 74C56 66 68 55 68 40V18L40 6Z"
        fill="url(#sh-fill)"
        stroke="#facc15"
        strokeWidth={2}
      />
      {/* @ symbol */}
      <SvgText
        x="40"
        y="48"
        textAnchor="middle"
        fontSize={26}
        fontWeight="900"
        fill="#facc15"
        fontFamily="System"
      >
        @
      </SvgText>
      {/* Corner sparkle */}
      <Circle cx={64} cy={20} r={3} fill="#facc15" opacity={0.6} />
    </Svg>
  );
}

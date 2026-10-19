import { ImageResponse } from 'next/og';

// iOS home-screen icon: the Wayta cloche on a full-bleed saffron square (iOS rounds the corners itself).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F5A524',
        }}
      >
        <svg width="112" height="78" viewBox="2 14 96 67">
          <path d="M12 66 A38 38 0 0 1 88 66 Z" fill="#1C1205" />
          <rect x="4" y="70" width="92" height="9" rx="4.5" fill="#FBF6EE" />
          <circle cx="50" cy="22" r="6" fill="#1C1205" />
          <circle cx="40" cy="45" r="3.6" fill="#F5A524" />
          <circle cx="60" cy="45" r="3.6" fill="#F5A524" />
          <path d="M37 54 Q50 63 63 54" fill="none" stroke="#F5A524" strokeWidth="5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}

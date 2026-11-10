import { seoText } from '../../lib/public-menu/restaurant-seo';

const WIDTH = 1200;
const HEIGHT = 630;

interface ShareCardInput {
  name: string;
  description: string;
  cover: string | null;
  logo: string | null;
  label: string;
}

/** Visual markup lives outside route.ts: Next recognizes only route.ts/route.js. */
export function shareCardView({ name, description, cover, logo, label }: ShareCardInput) {
  const headline = seoText(name, 55);
  const subtitle = seoText(description, 125);
  const rtl = /[\u0600-\u06ff]/.test(headline);
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', position: 'relative',
        backgroundColor: '#14232b', color: '#ffffff', padding: '56px',
        fontFamily: 'Wayta Arabic, Wayta Latin, sans-serif', overflow: 'hidden',
      }}
    >
      {cover ? (
        // ImageResponse uses ordinary img tags; the source is bounded public image bytes.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" width={WIDTH} height={HEIGHT} style={{
          position: 'absolute', top: 0, left: 0, width: WIDTH, height: HEIGHT,
          objectFit: 'cover', opacity: 0.5,
        }} />
      ) : null}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        background: 'linear-gradient(90deg, rgba(8,19,25,0.96) 0%, rgba(8,19,25,0.72) 72%, rgba(8,19,25,0.35) 100%)',
      }} />
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {logo ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 116, height: 116, backgroundColor: '#ffffff',
              borderRadius: 24, padding: 12,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" width={92} height={92} style={{ objectFit: 'contain' }} />
            </div>
          ) : (
            <div style={{
              width: 104, height: 104, borderRadius: 24, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#e5bb78', color: '#132b30', fontSize: 56, fontWeight: 800,
            }}>W</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 24, letterSpacing: 3, fontWeight: 700, color: '#f0cfa0' }}>{label}</div>
            <div style={{ fontSize: 23, color: '#f4f5f6' }}>waytaapp.com</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1050 }}>
          <div style={{
            fontSize: headline.length > 34 ? 51 : 68, lineHeight: 1.19,
            fontWeight: 600, whiteSpace: 'pre-wrap',
            direction: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left',
          }}>{headline}</div>
          <div style={{
            fontSize: 28, lineHeight: 1.45, color: '#ecedf0',
            whiteSpace: 'pre-wrap',
            direction: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left',
          }}>{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

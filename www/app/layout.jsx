import './globals.css';

// The favicon is the same mark as the nav logo, inlined as a data URI so the
// site still makes no external request for it. Heavier stroke than the nav
// version: at 16px the thin one disappears.
const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0B6E6B" stroke="#0B6E6B">' +
    '<rect x="2.6" y="4.1" width="14.2" height="2.9" rx="1.45"/>' +
    '<path d="M7.4 10.55H14.4V8.5L20.7 12L14.4 15.5V13.45H7.4Z" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<rect x="7.4" y="17" width="8.4" height="2.9" rx="1.45"/></svg>',
  );

export const metadata = {
  metadataBase: new URL('https://arunachalamkalimuthu.github.io/ux-lang/'),
  title: {
    default: 'ux-lang — a language for what your interface means',
    template: '%s — ux-lang',
  },
  description:
    'A small declarative language for what a user interface means. Catches the bugs a compiler cannot, like a screen nobody can leave.',
  icons: { icon: FAVICON },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

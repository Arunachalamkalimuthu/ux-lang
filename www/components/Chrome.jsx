import Link from 'next/link';

export const GITHUB = 'https://github.com/Arunachalamkalimuthu/ux-lang';
export const BLOB = `${GITHUB}/blob/master/`;

// The mark is three lines of `.ux`: a declaration at the left margin, two
// indented under it, and one of those running out as an arrow.
//
// Indentation is this language's only structure and the arrow is its only
// operator, so together they are the shortest possible picture of a `.ux` file
// — and nothing else in the icon vocabulary looks like it.
//
// Three earlier attempts are worth recording as dead ends. An outlined square
// with an arrow leaving it is the standard sign-out glyph and read as "logout".
// A two-row `app.map` motif carried the right idea but collapsed below ~24px. A
// solid tile with the arrow punched through was legible but generic.
export function Logo({ size = 22 }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="2.6" y="4.1" width="14.2" height="2.9" rx="1.45" />
      <path
        d="M7.4 10.55H14.4V8.5L20.7 12L14.4 15.5V13.45H7.4Z"
        stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round"
      />
      <rect x="7.4" y="17" width="8.4" height="2.9" rx="1.45" />
    </svg>
  );
}

const LINKS = [
  ['Overview', '/'],
  ['Syntax', '/syntax'],
  ['Roadmap', '/roadmap'],
  ['Use cases', '/use-cases'],
  ['Blog', '/blog'],
  ['Terms', '/terms'],
];

export function Nav({ current }) {
  return (
    <nav className="nav">
      <Link className="brand" href="/"><Logo /><span>ux-lang</span></Link>
      <div className="nav-links">
        {LINKS.map(([label, href]) => (
          <Link key={href} href={href} aria-current={href === current ? 'page' : undefined}>
            {label}
          </Link>
        ))}
        <a className="nav-gh" href={GITHUB}>GitHub</a>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <div className="wrap">
      <footer>
        <div className="foot-grid">
          <div>
            <div className="brand foot-brand"><Logo size={20} /><span>ux-lang</span></div>
            <p>A small declarative language for what a user interface means.</p>
          </div>
          <div>
            <p className="foot-head">Project</p>
            <p>
              <a href={GITHUB}>GitHub</a><br />
              <Link href="/syntax">Syntax</Link><br />
              <Link href="/roadmap">Roadmap</Link><br />
              <Link href="/use-cases">Use cases</Link><br />
              <Link href="/blog">Blog</Link>
            </p>
          </div>
          <div>
            <p className="foot-head">Legal</p>
            <p><Link href="/terms">Terms</Link><br />Apache-2.0</p>
          </div>
        </div>
        <p className="foot-note">
          The patent grant is deliberate: a format is only worth having if other people can implement
          it without asking.
        </p>
      </footer>
    </div>
  );
}

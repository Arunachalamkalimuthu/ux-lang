import Link from 'next/link';
import { Nav, Footer } from '../components/Chrome';

export const metadata = {
  title: 'Not found',
  description: 'That page does not exist. Here is the way back.',
};

// Next's built-in 404 renders bare: no nav, no footer, no link anywhere on it.
// That is UX202 — a screen with no way out — on the website of the tool that
// reports UX202, and the audit was right to call it out. A 404 is the one page
// a reader arrives at already lost, so it is the page that can least afford to
// be a dead end.
export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="wrap" id="top">
        <header className="hero">
          <div className="eyebrow">404</div>
          <h1>That page isn&apos;t here.</h1>
          <p className="lede">
            The link may be old, or the page may have moved. Nothing is broken on your side —
            here is <b>where to go instead</b>.
          </p>
        </header>

        <section className="band first">
          <div className="label">Ways out</div>
          <div className="body article">
            <p>
              <Link href="/">Overview</Link> — what the language is, in a minute.<br />
              <Link href="/syntax">Syntax</Link> — the full grammar reference.<br />
              <Link href="/roadmap">Roadmap</Link> — what ships next, and what deliberately doesn&apos;t.<br />
              <Link href="/use-cases">Use cases</Link> — what people reach for it to do.<br />
              <Link href="/blog">Blog</Link> — why it works the way it does.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

import Link from 'next/link';
import { Nav, Footer } from '../../components/Chrome';
import { POSTS } from '../../lib/posts';

export const metadata = {
  title: 'Blog',
  description: 'Writing about the problems .ux is meant to solve.',
};

export default function Blog() {
  return (
    <>
      <Nav current="/blog" />
      <main className="wrap" id="top">
        <header className="hero">
          <div className="eyebrow">Blog</div>
          <h1>Problems worth a language.</h1>
          <p className="lede">
            Writing about the failures <code>.ux</code> exists to catch — <b>the ones that ship green</b>,
            with no exception, no failing test, and nothing to grep for.
          </p>
        </header>

        <section className="band first">
          <div className="label">Posts</div>
          <div className="body">
            {POSTS.map(post => (
              <Link key={post.slug} className="post-card" href={`/blog/${post.slug}`}>
                <span className="post-meta">{post.date} · {post.minutes} min</span>
                <span className="post-title">{post.title}</span>
                <span className="post-stand">{post.standfirst}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

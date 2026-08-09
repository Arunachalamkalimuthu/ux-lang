import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav, Footer } from '../../../components/Chrome';
import { localMarkdown } from '../../../lib/markdown';
import { POSTS, findPost } from '../../../lib/posts';

export function generateStaticParams() {
  return POSTS.map(post => ({ slug: post.slug }));
}

export async function generateMetadata({ params }) {
  const post = findPost((await params).slug);
  return post ? { title: post.title, description: post.standfirst } : {};
}

export default async function Post({ params }) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  const body = await localMarkdown(`content/blog/${slug}.md`);

  return (
    <>
      <Nav current="/blog" />
      <main className="wrap" id="top">
        <section className="band first">
          <div className="label">Blog</div>
          <div className="body">
            <article className="article">
              <span className="post-meta">{post.date} · {post.minutes} min</span>
              <h1>{post.title}</h1>
              <p className="stand">{post.standfirst}</p>
              <div dangerouslySetInnerHTML={{ __html: body }} />
              <p style={{ marginTop: '2.5rem' }}><Link href="/use-cases">← All use cases</Link></p>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

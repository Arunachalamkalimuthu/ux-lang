import { Nav, Footer } from '../../components/Chrome';
import { repoMarkdown } from '../../lib/markdown';

export const metadata = {
  title: 'Roadmap',
  description: 'What ships next and why, what is deliberately not planned, and what would change the plan.',
};

export default async function Roadmap() {
  const roadmap = await repoMarkdown('ROADMAP.md');

  return (
    <>
      <Nav current="/roadmap" />
      <main className="wrap" id="top">
        <header className="hero">
          <div className="eyebrow">Roadmap</div>
          <h1>Where this is going.</h1>
          <p className="lede">
            In the order it should get there, and what would change the plan. Dates are deliberately
            absent — <b>this is a small project and inventing a schedule would be the least honest thing
            on the page</b>.
          </p>
        </header>

        <section className="band first">
          <div className="label">Plan</div>
          <div className="body article" dangerouslySetInnerHTML={{ __html: roadmap }} />
        </section>
      </main>
      <Footer />
    </>
  );
}

import { Nav, Footer } from '../../components/Chrome';
import { repoMarkdown } from '../../lib/markdown';

export const metadata = {
  title: 'Syntax',
  description:
    'The complete .ux grammar: declarations, screen elements, flows, the rules the checker enforces, and every diagnostic code.',
};

export default async function Syntax() {
  const grammar = await repoMarkdown('plugin/skills/ux/reference/grammar.md');

  return (
    <>
      <Nav current="/syntax" />
      <main className="wrap" id="top">
        <header className="hero">
          <div className="eyebrow">Reference</div>
          <h1>The whole language.</h1>
          <p className="lede">
            Five declarations, one operator, and a handful of rules the checker refuses to let you break.{' '}
            <b>This page is the same file the Claude Code plugin ships</b>, so it cannot drift from what a
            model is taught.
          </p>
        </header>

        <section className="band first">
          <div className="label">In brief</div>
          <div className="body">
            <h2>If you read nothing else.</h2>
            <p>
              Two-space indentation, no tabs. <code>#</code> starts a comment. No imports — names resolve
              across the whole project.
            </p>
            <pre><code>{`app Tasks                          # or: site example.com

data Task                          # a shape that appears on screen
  title  text  required
  done   bool  = false
  due    date?

screen Inbox                       # a place the user can be
  at /
  intent "See what's due"          # REQUIRED, one line

  list Task where not done
    row   title, due
    tap   -> Detail(task)
    empty   "All clear."           # REQUIRED
    loading skeleton 3 rows        # REQUIRED
    error   "Couldn't load."       # REQUIRED

  action "New task" -> NewTask     # button, link and nav are all \`action\`

flow create(task)                  # what happens when someone acts
  call api.create(task)
    ok   -> toast "Added"
    fail -> error "Couldn't create that."
  go Inbox`}</code></pre>
            <p>
              Three rules cause most first-time errors, and all three are deliberate: every screen needs an{' '}
              <code>intent</code>, every <code>list</code> needs all three states, and every screen needs a
              way out.
            </p>
          </div>
        </section>

        <section className="band">
          <div className="label">Full grammar</div>
          <div className="body article" dangerouslySetInnerHTML={{ __html: grammar }} />
        </section>
      </main>
      <Footer />
    </>
  );
}

import Link from 'next/link';
import { Nav, Footer, GITHUB } from '../components/Chrome';
import Playground from '../components/Playground';

const HERO_SAMPLE = `app Tasks

data Task
  title  text  required
  done   bool  = false
  due    date?

screen Inbox
  at /
  intent "See what's due and clear it"

  list Task where not done
    sort by due
    row   title, due
    tap   -> Detail(task)
    empty   "All clear."
    loading skeleton 3 rows
    error   "Couldn't load." action retry

  action "New task" -> NewTask`;

const APP_MAP = `Inbox   -> Detail | NewTask
Detail  -> Inbox
NewTask -> Inbox`;

const DIAGNOSTIC = `inbox.ux:6  UX202  \`Detail\` has no way out — a user who lands here is stuck.
  fix:  add an action that leaves:  action "Back" -> Inbox`;

const INSTALL = `git clone ${GITHUB}
cd ux-lang && npm link
ux check examples/tasks/ux

# in Claude Code:
/plugin marketplace add /path/to/ux-lang
/plugin install ux-lang@ux-lang`;

function DeadEndFigure() {
  return (
    <figure className="figure" role="group" aria-labelledby="deadend-cap">
      <svg
        viewBox="0 0 700 210"
        className="fig-svg"
        role="img"
        aria-label="Three screens joined by arrows. Cart leads to Checkout, Checkout leads back to Cart and on to Receipt. Receipt has no arrow leaving it, so a person who reaches it cannot go anywhere."
      >
        <defs>
          <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
          </marker>
        </defs>

        <g className="fig-node">
          <rect x="8" y="34" width="168" height="58" rx="4" />
          <text x="92" y="69">Cart</text>
        </g>
        <g className="fig-node">
          <rect x="262" y="34" width="168" height="58" rx="4" />
          <text x="346" y="69">Checkout</text>
        </g>
        <g className="fig-node fig-stuck">
          <rect x="516" y="34" width="168" height="58" rx="4" />
          <text x="600" y="69">Receipt</text>
        </g>

        <g className="fig-edge">
          <path d="M182 55 H256" markerEnd="url(#ar)" />
          <path d="M436 55 H510" markerEnd="url(#ar)" />
          <path d="M330 98 V132 H108 V98" markerEnd="url(#ar)" />
        </g>

        <g className="fig-stuck-mark">
          <path d="M600 98 v26" />
          <path d="M576 124 h48" />
          <text x="600" y="150">no way out</text>
        </g>
      </svg>
      <figcaption id="deadend-cap">
        <code>Receipt</code> compiles, renders and works. It is a room with no door — and the only tool
        that can say so is one that knows where actions lead.
      </figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <>
      <Nav current="/" />
      <main className="wrap" id="top">
        <header className="hero">
          <div className="eyebrow">ux-lang · Apache-2.0</div>
          <div className="hero-grid">
            <div>
              <h1>A language for what your interface means.</h1>
              <p className="lede">
                <code>.ux</code> describes screens, what a person can do on them, and where every action
                leads. Then it catches the bugs a compiler normally can&rsquo;t — <b>like a screen nobody
                can leave</b>.
              </p>
              <div className="actions">
                <a className="btn solid" href={GITHUB}>GitHub</a>
                <a className="btn" href="#playground">Try it below</a>
              </div>
              <p className="note">Node 20+. Zero dependencies — nothing to install after the clone.</p>
            </div>
            <div><pre><code>{HERO_SAMPLE}</code></pre></div>
          </div>
        </header>

        <section className="band">
          <div className="label">The problem</div>
          <div className="body">
            <h2>Nothing records what the app was supposed to be.</h2>
            <p>
              You prompt a screen into existence, then another. The model never sees the app as a system —
              so state contradicts itself across screens, a flow dead-ends, and a regeneration quietly
              drops a step nobody notices until a user does.
            </p>
            <p>
              The generated code can&rsquo;t be the record. It&rsquo;s forty files of implementation, and no
              single one of them states the intent. <strong>A <code>.ux</code> file can be one page</strong> —
              short enough for a person to read in a minute and for a model to hold entirely in context.
            </p>
          </div>
        </section>

        <section className="band" id="playground">
          <div className="label">Try it</div>
          <div className="body">
            <h2>This runs the real checker.</h2>
            <p>
              Not a recording. The lexer, parser, checker and linker below are the same files the CLI
              imports — everything except the filesystem layer is a pure function over strings, so it runs
              here unmodified.
            </p>
            <Playground />
            <p className="note">
              <code>Detail</code> starts with no way out. It would compile, render, and work — it&rsquo;s just
              a room with no door, and nothing but a checker that understands navigation will tell you.
            </p>
          </div>
        </section>

        <section className="band">
          <div className="label">app.map</div>
          <div className="body">
            <h2>The whole app, in four lines.</h2>
            <pre><code>{APP_MAP}</code></pre>
            <p>
              Generated from the arrows. It&rsquo;s small enough to keep in context permanently, which is the
              point: a model editing one screen reads this plus the single file it&rsquo;s changing, and still
              reasons correctly about the entire app. It never has to load everything.
            </p>
            <p>That&rsquo;s what lets this scale past a hundred screens without outgrowing a context window.</p>
          </div>
        </section>

        <section className="band">
          <div className="label">Diagnostics</div>
          <div className="body">
            <h2>Every error names its own fix.</h2>
            <DeadEndFigure />
            <pre><code>{DIAGNOSTIC}</code></pre>
            <div className="cols">
              <div>
                <h3>Built for a model to act on</h3>
                <p>
                  The <code>fix:</code> line exists so a model can self-correct without a human refereeing.
                  Write, check, fix, repeat — the loop closes on its own.
                </p>
              </div>
              <div>
                <h3>34 errors, six warnings</h3>
                <p>
                  <code>ux check</code> reports what&rsquo;s wrong and fails the build. <code>ux lint</code>{' '}
                  reports what&rsquo;s merely suspect — an unused type, an intent that says nothing — and
                  doesn&rsquo;t.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="band">
          <div className="label">Where it fits</div>
          <div className="body">
            <h2>Four places this earns its keep.</h2>
            <div className="cols">
              <div>
                <h3>Building with an AI</h3>
                <p>The <code>.ux</code> is the durable record. Change a line, regenerate, and nothing silently disappears.</p>
              </div>
              <div>
                <h3>Reviewing a flow</h3>
                <p>Navigation becomes a one-page diff a reviewer can actually read, before any code exists.</p>
              </div>
              <div>
                <h3>Joining a codebase</h3>
                <p><code>app.map</code> answers &ldquo;how does this app fit together&rdquo; in four lines instead of forty files.</p>
              </div>
              <div>
                <h3>Guarding CI</h3>
                <p><code>ux check</code> exits non-zero on a dead end, so a stuck user is a failed build.</p>
              </div>
            </div>
            <p style={{ marginTop: '1.5rem' }}><Link href="/use-cases">Read the use cases in full →</Link></p>
          </div>
        </section>

        <section className="band">
          <div className="label">With Claude Code</div>
          <div className="body">
            <h2>There&rsquo;s no compiler. The model is the compiler.</h2>
            <ul className="steps">
              <li>you describe the app</li>
              <li>Claude writes the <code>.ux</code></li>
              <li><code>ux check</code> — and Claude fixes whatever it reports</li>
              <li>Claude generates the React from it</li>
            </ul>
            <p style={{ marginTop: '1.25rem' }}>
              The grammar is 422 tokens, so the entire language ships inside every prompt. The model never
              has to remember it.
            </p>
            <pre><code>{INSTALL}</code></pre>
          </div>
        </section>

        <section className="band">
          <div className="label">Status</div>
          <div className="body">
            <h2>What&rsquo;s built, and what isn&rsquo;t.</h2>
            <p>
              Built: the parser, both checking layers, the linter, the formatter, the CLI, three worked
              example apps, the Claude Code plugin, and an adoption benchmark. The suite is green and the
              examples check clean.
            </p>
            <p>Not built, and worth knowing before you invest:</p>
            <ul>
              <li>
                <strong>The Chrome indexer.</strong> Reading a live page <em>into</em> <code>.ux</code>, so an
                agent navigates a semantic index instead of the DOM. Specified in the design, not started.
              </li>
              <li>
                <strong>Search and filter-by-input.</strong> A list&rsquo;s <code>where</code> clause can&rsquo;t
                reference something the user just typed. The benchmark found this; there&rsquo;s no design for
                it yet.
              </li>
              <li>
                <strong>Drift protection.</strong> Nothing yet verifies that generated code still matches its{' '}
                <code>.ux</code>. It&rsquo;s a convention, not an enforcement.
              </li>
            </ul>
            <p style={{ marginTop: '1.25rem' }}><Link href="/roadmap">The roadmap, and what would change it →</Link></p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

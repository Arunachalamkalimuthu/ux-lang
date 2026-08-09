// Post metadata lives here; the prose lives in `content/blog/*.md`. Keeping the
// two apart means a post is a markdown file anyone can edit without touching a
// component, which is most of the reason the site moved to a framework.
export const POSTS = [
  {
    slug: 'the-regeneration-problem',
    title: 'The regeneration problem',
    standfirst: 'Why an AI rewrite quietly loses a step, and what has to exist for it not to.',
    date: '2026-08-09',
    minutes: 6,
  },
  {
    slug: 'reviewing-a-ui-before-it-exists',
    title: 'Reviewing a UI before it exists',
    standfirst: 'Flows are decisions. They should be reviewable in a pull request, not discovered in staging.',
    date: '2026-08-09',
    minutes: 5,
  },
  {
    slug: 'dead-ends-are-not-crashes',
    title: 'Dead ends are not crashes',
    standfirst: 'The class of defect that ships green: no exception, no failing test, and a user with nowhere to go.',
    date: '2026-08-09',
    minutes: 5,
  },
];

export const findPost = slug => POSTS.find(post => post.slug === slug);

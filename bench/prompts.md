# Adoption benchmark prompts

Twenty one-line app descriptions, deliberately unlike the three `examples/`
apps (`tasks`, `shop`, `notes`). These are the spec's own §9 test corpus.

Four of the task brief's original twenty were replaced — see "Replacements"
below — because they were close enough to `tasks` or `notes` in both domain
and screen shape that a model could produce a clean, correct-looking answer
by pattern-matching the worked example rather than by reading the grammar.
That would inflate the parse-rate score without telling us anything about
whether the language itself is learnable.

1. A gym class booking app: browse classes, book one, see your bookings, cancel.
2. An expense tracker: log an expense, see this month's total, filter by category.
3. A hotel booking app: switch between Search and My trips tabs, view a room, reserve it, cancel a trip.
4. A support desk: list open tickets, open one, reply, close it.
5. A community forum: browse recent posts, open one to read and reply, see related posts alongside it.
6. A job board: search jobs, view a posting, apply, track applications.
7. A parcel tracker: add a tracking number, see status, view history, remove one.
8. A ride-hailing app: request a ride, see the driver's ETA, cancel the request, rate the trip.
9. A team directory: search people, view a profile, see their team, message them.
10. A bug tracker: list bugs by severity, open one, assign it, resolve it.
11. A flight check-in: find booking, pick a seat, add bags, get a boarding pass.
12. An account settings app: view your profile, update your email, change your password, delete your account.
13. A podcast player: browse shows, view episodes, play one, see the queue.
14. A car service log: list services, add one, view a receipt, export history.
15. A poll app: see open polls, vote, view results, create a poll.
16. A pantry tracker: list items, flag low stock, add an item, build a shop list.
17. A leave request app: request leave, see balance, view requests, approve one.
18. A study flashcard app: pick a deck, review a card, grade it, see progress.
19. A restaurant waitlist: join the list, see position, get called, cancel.
20. A donation portal: pick a cause, choose an amount, pay, see past donations.

## Replacements

| # | Brief's original | Why it was replaced | Replacement | What it exercises |
|---|---|---|---|---|
| 3 | "A recipe box: browse recipes, view one, mark a favourite, add a new recipe." | Near-exact restatement of `notes`: browse list, detail, toggle-a-boolean-flag (`favourite` ≈ `pinned`), add form. A model could reshape `notes`' actual files and pass. | Hotel booking app | `tabs` splitting two genuinely different lists (rooms to search vs. existing trips), not a same-list all/flagged filter — the one construct `notes` demonstrates only inside a single screen. |
| 5 | "A habit tracker: see today's habits, tick one off, view a streak, add a habit." | Near-exact restatement of `tasks`: a due/today-filtered list, a "mark it done" action, an add form. The domain noun changes; the shape and even the intent ("see what's due, clear it, add one") do not. | Community forum | A `component` (post summary) that plausibly earns its keep by appearing in more than one place — the browse list and the related-posts strip on a detail screen — which no shipped example actually demonstrates (`notes`' `NoteRow` component has exactly one use site in the checked-in `.ux`, despite `SKILL.md`'s own "only when 3+ screens use it" guidance). |
| 8 | "A reading list: add a book, mark progress, finish it, see finished books." | Hybrid restatement: "finish it" is `tasks`' complete action, "see finished books" is `notes`' filtered second list. Both mechanics already have a worked example. | Ride-hailing app | A flow whose `ok`/`fail` split is the point of the feature, not incidental error handling — "no drivers available" is a real, expected outcome a model has to write a distinct `fail` branch for, not a generic "could not save that." |
| 12 | "A plant care app: list plants, see watering due, mark watered, add a plant." | "See watering due, mark it, add one" is `tasks`' `Inbox` (whose own `intent` is literally "See what's due and clear it") with the noun swapped. | Account settings app | A shape with **no `list` at all** — every other prompt, replaced or not, centers on browsing a collection. This checks whether a model over-applies `list`'s `empty`/`loading`/`error` ceremony where it doesn't belong, and exercises a destructive, non-reversible `action` (delete account) that isn't just a CRUD update. |

The other sixteen were checked against all three examples' actual screen
shapes (not just their domains) and kept: several share a family
resemblance to "browse → detail → act" (that shape is generic to almost
any app with a collection, not unique to this project's examples), but none
maps onto a specific example's screens, fields, and flow structure closely
enough that reproducing the example would pass the prompt.

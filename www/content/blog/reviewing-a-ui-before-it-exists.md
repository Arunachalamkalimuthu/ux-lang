Think about how a navigation decision actually gets made on most teams.

Someone builds a checkout screen. It needs a Cancel button. They write `navigate(-1)`, or they push to `/cart`, or they route home — whichever felt right while they were deep in a payment integration and Cancel was the least interesting thing on screen. It ships. Nine months later a support ticket reveals that cancelling a payment dumps you on the homepage with an abandoned cart and no explanation.

Nobody decided that. It was a side effect of a line of code, in a diff that was reviewed for its payment logic.

## The review problem

Flows are among the most consequential decisions in an app and among the least reviewable. To answer "what happens when I tap Cancel" from a pull request, a reviewer has to read the component, resolve the router config, and hold the screen graph in their head. So they don't. They review the payment logic, which is legible, and the navigation goes through unexamined.

Meanwhile the people who *should* weigh in — whoever owns the product, whoever owns support — can't read the diff at all.

## What it looks like when flow is a first-class thing

In `.ux`, navigation isn't buried in an implementation detail. It's the arrow, and a change to it is a change to one line:

```
  screen Checkout
     needs signed-in
     intent "Take payment and confirm the order"
-    action "Cancel" -> Catalog
+    action "Cancel" -> Cart
```

That diff is reviewable by someone who has never opened a React file. It doesn't require a preview deploy or a walkthrough. And it can happen *before* the screen is built, when changing your mind costs a line instead of a sprint.

## Two things the checker adds to review

First, it catches the changes a reviewer would have to be superhuman to spot. Repoint one arrow and a screen can become unreachable — not broken, just orphaned, with no route to it from anywhere:

```
ux/screens/receipt.ux:3  UX201  Nothing links to `Receipt`, so no one can reach it.
  fix:  add an action on another screen:  action "…" -> Receipt
```

Second, every screen has to say why it exists. `intent` is required — one line, plain language, or the file doesn't check:

```
screen Checkout
  intent "Take payment and confirm the order"
```

That line costs nothing to write and it's the thing a reviewer reads first. It's also what makes the whole file worth reading six months later, when the author has left and the screen is called `CheckoutV2Final`.

## Where this stops working

A `.ux` file describes structure and flow, deliberately not appearance. It will tell you that Cancel goes back to the cart. It will not tell you that the button is the wrong shade of grey, or that the form is unusable on a small screen. Those still need eyes on a real build.

What it buys you is that the decisions which are *structural* get reviewed structurally, instead of being smuggled through inside a payment diff.

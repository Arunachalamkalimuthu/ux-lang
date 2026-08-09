Here is the shape of it. You have a checkout screen. Under the phone field there's a *resend verification code* link, added three weeks ago after someone complained. You ask for an unrelated change: move the order summary above the payment form.

The model rewrites the screen. The summary moves. The resend link is gone.

Nothing errored. TypeScript is happy — the link was markup, not a type. No test failed, because no test knew the link was supposed to exist; it was added by hand, in a hurry, and nobody wrote a test for a link. You find out when a user emails you, or you don't find out.

## Why it happens

Not because the model is careless. Because the only place that link existed was inside forty files of implementation, and the model was shown four of them.

Every regeneration is a lossy round trip: the intent goes in as a prompt, comes out as code, and the prompt is thrown away. Next time, the model has to recover the intent *from the code* — and it only reads the part of the code you handed it. Anything outside that window is not forgotten, exactly. It was never known.

> The generated code cannot be the record of what the app is supposed to be. It's the output. Outputs don't remember their inputs.

## What would have to exist

Something that states the app's shape, that is small enough to be read in full every single time, and that is the thing you edit rather than the thing you regenerate.

Small is the hard requirement. A design document doesn't work, because nobody updates it and no model reads it. A test suite doesn't work, because tests assert behaviour, not structure, and you'd need one per link. It has to be short enough that "read the whole thing" is the default, not an effort.

That is what a `.ux` file is. Twenty lines for a screen, including the link:

```
screen Checkout
  needs signed-in
  intent "Take payment and confirm the order"

  show order.total

  form Order
    phone required
    submit "Pay" -> pay(order)

  action "Resend code" -> resendCode(order)
  action "Back to cart" -> Cart
```

Now the change is a one-line edit to the `.ux`, and the generated code is disposable. Regenerate the whole thing from scratch if you like — the resend action is still declared, so it's still there.

## The part that surprised me

I expected the value to be in generating code. It isn't. The value is that the file is small enough to be read completely, which changes what the model can reason about.

A model editing one screen also reads `app.map` — the navigation graph, four lines for a small app — and can therefore tell that the screen it's editing is the only route to two others. That's a fact about the whole system, available while editing one file. You cannot get that from forty files you didn't load.

## The honest limitation

This only holds while the `.ux` stays ahead of the code. The moment someone hand-edits the generated output and doesn't reflect it back, the source of truth is a lie — and today nothing enforces that. Generated files are marked with a comment and the convention is to regenerate rather than patch, but a convention is not a guarantee.

It's a real weakness, and it's worth knowing before you build a workflow on this.

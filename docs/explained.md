# Lanekeeper, explained plainly

A page for anyone who doesn't write code and wants to know what Lanekeeper is for. The technical details are in the
[README](../README.md).

## The problem

More people now use several AI coding assistants at once, each working on its own copy of the same project. Think of
two builders renovating one house from separate blueprints. Neither touches the other's room, so nothing collides. But
one builder removes a door while the other hangs a curtain on that same door. Each blueprint looks fine on its own.
When the plans are combined, nothing complains. Later, the curtain is hanging on a wall with no door.

That happens in software. The tool that combines the work, Git, only checks whether two people edited the same lines.
It doesn't know whether the work still makes sense together.

## What happened in our demo

- One assistant renamed a function called `charge`.
- A second assistant, working at the same time, wrote new code that calls `charge`.
- Git saw no overlap and would have combined them without a warning. The result would be broken.
- **Lanekeeper spotted it** about half a second after the second assistant wrote the code. It showed a live map with a
  lane for each assistant, highlighted the clash, and said in plain English what was wrong and how to fix it.

## What Lanekeeper does for you

- **Shows you what each assistant is doing:** its task and the files it has touched, all on one screen.
- **Warns you early:** while the work is happening, not after something has broken.
- **Explains the problem in plain words:** no code reading needed, and with a suggested fix.
- **Tells you if Git will notice:** either it will stop and warn you, or it will stay silent. Silent is the dangerous
  case.
- **Suggests a safe order** to combine the work: the safest pieces first.
- **Lets you pass the warning on:** one button copies a note you can paste to each assistant.
- **Leaves you in control:** it never changes your code or combines anything for you.
- **Keeps your work private:** everything stays on your computer, and nothing is sent anywhere.
- **Takes one minute to set up:** install it, run one command.

## What we fixed while building it

- **A demo that wasn't true:** our first example would have made Git complain, so it didn't show the real problem. We
  rebuilt it so Git really merges it silently, and the tests now prove that.
- **Confusing labels:** an assistant's name (A, B, C) used to change as others joined. Now each keeps its label.
- **Overconfident wording:** the tool now says "may" and treats its findings as leads, because it can sometimes be
  wrong.
- **Missing the key fact:** it now tells you whether Git will warn you, which is what you actually need to know.
- **Privacy:** we documented what it records, removed an unneeded setting that passed along the whole environment, and
  passed the directory's checks.
- **Testing:** it now has automated tests and a tested install path.

## Honest limits

- It guesses by recognizing patterns in code, so it can miss problems or raise false alarms. It works best with
  JavaScript, TypeScript, Python, Go and Rust.
- It hasn't been tested on Windows.
- It sees only the work on your own computer.

## In one sentence

Lanekeeper is a safety net for people running several AI coding assistants at once, so you find out that the work
doesn't fit together before it breaks.

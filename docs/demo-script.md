# Demo video script (60 seconds)

Timings come from a recorded dogfood run: task text appears about 1.5 s after a prompt, the first edit about 9 s
after, and the map reacts within 1–2 s of each event.

## Setup (before recording)

- Run `examples/make-demo-repo.sh` for a fresh demo and start the map. It should show only Agent A (stripe) and no
  clashes.
- Split screen: two terminals stacked on the left, the map on the right. Large font, no personal paths visible.
- Pre-type both prompts so you only press Enter:
  - paypal: `Create src/payments/paypal/client.ts with a function enablePayPal(service: PaymentService) that calls service.charge(). Don't change any other file.`
  - product-page: `Add a short description paragraph under the heading in src/product/ProductPage.tsx`

## The 60 seconds

| Time | On screen | Voiceover |
| --- | --- | --- |
| 0–8 s | The map alone: one lane (Agent A, stripe, "renamed `charge` to `createPayment`"), no clashes. | "I run several Claude Code agents in parallel. Git keeps them out of each other's files. It doesn't stop them contradicting each other." |
| 8–16 s | Press Enter in both terminals. Two new lanes appear with their task text and a "working" status. | "Lanekeeper shows a lane per agent: what it's doing, and every file it touches." |
| 16–30 s | The paypal agent creates `paypal/client.ts`, which calls `charge()`. The file lights up and a **High** clash appears. | "One agent renamed `charge`; the other just wrote code that calls it. Git merges these cleanly, and the result is broken." |
| 30–42 s | Click the clash. Read the plain-English explanation and suggested fix, then press **Copy note for agents**. | "It explains the clash in plain English, and gives me a note I can paste to both agents." |
| 42–52 s | Paste the note into the paypal terminal. | "I don't want it fixing things behind my back. It tells me, and I decide." |
| 52–60 s | Show the **suggested merge order** (product page first, stripe last). Then the tagline on screen: "Zero setup. Everything runs on your machine." | "Clash-free work merges first, risky changes last. One command to install, nothing hosted." |

## Notes for the take

- **Trim the waiting.** Each agent needs about 10–20 s. Send both prompts together and cut the dead time, or speed up
  the middle.
- **Record twice.** Agents aren't deterministic. If the paypal agent doesn't call `charge()`, rebuild the demo
  and redo the take.
- **Check the clash note first.** Make sure what **Copy note for agents** produces reads well before filming.
- **Lockfile clash:** left out to keep the video short. Add it as a second beat if there's time (paypal prompt: also
  add `node_modules/@paypal/sdk` 1.4.0 to `package-lock.json`, right after the empty root entry).
- **Light or dark mode:** pick one and keep it for the whole take.

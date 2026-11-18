# Telegram Video Blog Implementation Plan

> **For agentic workers:** Implement these steps in order and verify each test before moving on.

**Goal:** Offer newly published Telegram videos in the existing morning check and give approved video posts a native player and readable blog layout.

**Architecture:** Keep Telegram discovery in the existing local morning check. Use the existing article Markdown, cover and publication lifecycle; a standalone `[Видео, 2:18](https://…/clip.mp4)` block opts into the portrait layout and exposes the format on the blog card.

**Tech Stack:** Telethon, Codex heartbeat, React Router, Markdown, TypeScript.

**Spec:** Owner's approval of the “Видео” filter, morning opt-in without hashtags and portrait playback on the site.

## Global Constraints

- Use the existing 09:15 Europe/Moscow check, public @korotkovsStudio only, and record proposed post IDs.
- Discover without downloading. After approval of a particular post, the existing publication gate applies to its draft.
- Keep published articles, case pages and legacy inline video rendering compatible.

## Review Focus

- Only a standalone, valid video block becomes a portrait post; an example in a code fence never becomes a player.
- Filtering precedes pagination. Pager links retain the active format and switching format resets the page.
- The article shows one native player and its text without overflow at mobile and desktop widths.

## Morning question

- [x] Verify the dedicated metadata reader with the real post 1301.
- [x] Update and reread the active heartbeat preserving the schedule and thread.

## Blog

- [x] Write list and article regression tests and verify they fail.
- [x] Parse the opt-in block once for the server card and use the same parser in the article layout.
- [x] Add the filter and player with mobile reading order and two columns on desktop.
- [x] Verify tests, build, and real playback in Chrome at narrow and wide widths.

The responsive playback check used the real Telegram MP4 in a local fixture at 390 and 1440 pixels. The scheduled run discovers and asks only. The first approved media upload and the production release are separate steps.

# Manual test checklist

Run `npm test` first: it should pass and say `sw.js is up to date`. Test on the deployed HTTPS site, or on
`npm run serve` (http://localhost counts as secure). To start fresh in Chrome DevTools, go to
**Application → Storage → Clear site data**.

## 1. Install as a PWA
- [ ] Desktop Chrome/Edge: an **Install app** button appears in the header. Click it and accept. The app opens in
      its own window with the navy title bar and the David Thompson icon.
- [ ] Android Chrome: **Install app** → Install. The home-screen icon is the logo on navy (the maskable icon isn't cropped).
- [ ] iPhone/iPad Safari: **Install app** opens the Share → **Add to Home Screen** sheet. Follow it. The app
      opens full screen with the black-translucent status bar and the apple-touch-icon.
- [ ] DevTools → Lighthouse (or Application → Manifest) shows the manifest as installable, with no errors.

## 2. Offline
- [ ] With the site loaded once, play a game for a few seconds (for example Aladdin). Back in the library, its card
      shows **✓ Offline**.
- [ ] DevTools → Network → **Offline** (or airplane mode), then reload. The library loads, and the
      **Downloaded** filter shows only the played games.
- [ ] Open the played game: it boots. Open a game you haven't played: the "couldn't be downloaded… offline"
      message shows with a **Back to the library** button.
- [ ] Settings → General → **Remove downloaded games** (press twice). The badges disappear and your saves still load.

## 3. Updates
- [ ] Change any app file, run `npm run build:sw` and deploy (or reload the local server). With the app open,
      reload once. An **"Update available"** toast appears. **Reload** loads the new version and the toast is gone.

## 4. Connect a controller
- [ ] Connect an Xbox, PlayStation or Switch Pro controller (press a button if the browser needs it). A
      **"… connected"** toast shows, the pad rumbles briefly (if supported and Rumble is on), and the touch
      overlay (if shown) hides.
- [ ] In the library, the d-pad or left stick moves a **clearly visible focus ring** between cards. Holding a
      direction repeats. A/✕ opens the game and the menu button (R3/Home) opens Settings.
- [ ] Hints at the bottom right match the controller (A/B on Xbox, ✕/○ on PlayStation).
- [ ] In a game, the d-pad and stick move, A/B/L/R/Start/Select work, triggers act as L/R, and R3/Home opens the
      pause menu, which is navigable with the pad. B closes it and the game resumes.
- [ ] Disconnect the pad: a **"… disconnected"** toast shows and no button stays stuck down.

## 5. Remap a button
- [ ] Settings → **Controls**: press keys and pad buttons; the matching buttons on the controller diagram light up,
      labelled with your controller's glyphs (or key names).
- [ ] LB/RB (or Q/E) switch between the Controls, Touch, Audio & Video, Gameplay and About tabs.
- [ ] Select the **"A"** action, then press a different controller button (for example Y/△) while the countdown
      ring runs. A toast confirms it, and the chip shows the new glyph.
- [ ] Rebind "A" to the button "B" uses: a red banner **"… is already used by B. Swap them?"** appears on the row,
      and **Swap** exchanges them (**Cancel** changes nothing).
- [ ] **+** on the keyboard column for "Start" and press P: Start now has Enter **and** P.
- [ ] Select a binding chip (×) to remove it. **↺** resets one action; **Reset all to defaults** asks to confirm first.
- [ ] Rebind and then wait 5 seconds: it times out and nothing changes. Rebind and press Esc, or hold B for about
      a second: it's cancelled.
- [ ] Gameplay tab: moving the left stick moves the dot in the dead-zone circle, pulling a trigger fills the bar,
      **Test rumble** vibrates the pad, and left/right change sliders and switches.
- [ ] With two controllers connected, pick one in **Controller** on the Controls tab, change a binding,
      and check that the "All controllers" profile is unchanged.
- [ ] Do all of the above using **only the controller**, then **only the keyboard**.

## 6. Reload and confirm the bindings persisted
- [ ] Reload the page (and restart the installed app). Settings → Controls shows your custom bindings
      (rows marked •), and they work in a game.

## 7. Play on a phone with touch controls
- [ ] Open a game on a phone. The on-screen d-pad, A/B, L/R, Select, ☰ and Start appear: below the
      screen in portrait, beside it in landscape (where the toolbar is hidden).
- [ ] Slide a thumb around the d-pad: directions and diagonals change without lifting. Hold B and tap A at the
      same time (multi-touch). Slide from B to A.
- [ ] Nothing zooms on double-tap, there's no pull-to-refresh, no text gets selected, and no long-press menu appears.
- [ ] The notch and home indicator don't cover any control (safe areas), in both orientations.
- [ ] ☰ → **Move touch buttons**: drag groups, then **Swap sides** and **Done**. The layout is kept after a reload.
      Settings → Touch: size and opacity sliders change the controls live, and **Reset positions** works.
- [ ] Haptics: each press gives a short vibration on Android (toggle in Settings → Touch). iOS doesn't support it.

## 8. Switch input types on the fly
- [ ] On a touch laptop or tablet with a keyboard or pad: touch the screen (the overlay appears), press a key
      (the overlay hides and keyboard hints show), press a pad button (pad hints show), touch again (the overlay
      returns). Input works straight away after each switch.

## 9. Accessibility and themes
- [ ] Tab through the library: the skip link appears first, and every control has a visible focus ring.
- [ ] Theme toggle: System → Light → Dark. The logo switches between black and white. The choice is kept after
      a reload and follows the OS when set to System.
- [ ] OS "reduce motion" on: no card lift or dialog animations.
- [ ] A screen reader announces cards as "Play <game title>", the controller-connected toasts, and search result counts.
- [ ] The layout works at 320px wide and on a 4K screen (the grid grows, with no horizontal scrolling).

## 10. Saves
- [ ] Save in-game (for example in Pokémon), then close the tab or app straight away (on a phone, swipe it away).
      Reopen: "Loaded save." appears and the progress is there.

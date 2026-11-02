# Tidal squeeze

Standalone GitHub Pages build of the tidal-heating applet from [physics_demos](https://github.com/MartinAlvarezSergio/physics_demos).

Live: https://martinalvarezsergio.github.io/tidal_squeeze_playground/

A moon on a slightly oval orbit is stretched more when it is close to its planet and less when it
is far, so its tidal bulge grows and shrinks every orbit, and that flexing heats it. Pick **Io**
(kept oval by its resonance with Europa and Ganymede) or **Enceladus** (kept oval by Dione). Watch
the bulge pulse in the close-up and the moon glow. Then switch the resonance off: tides round the
orbit out and the heating fades away.

```bash
npm install
npm run dev
npm run deploy   # build + publish gh-pages
```

The applet code is synchronized from `physics_demos/src/applets/tidal_squeeze`.
Publish source changes on `main`, then run `npm run deploy` to update GitHub Pages.

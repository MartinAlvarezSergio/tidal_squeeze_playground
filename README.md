# Tidal squeeze

Standalone GitHub Pages build of the tidal-heating applet from [physics_demos](https://github.com/MartinAlvarezSergio/physics_demos).

Live: https://martinalvarezsergio.github.io/tidal_squeeze_playground/

A moon on a slightly oval orbit is stretched more when it is close to its planet and less when it
is far, so its tidal bulge grows and shrinks every orbit, and that flexing heats it. Pick **Io**,
**Europa** or **Enceladus**:

- **Find the rhythm**: slide the outer moon's period off the real 2:1 and watch where its tugs
  land. Only when they pile up on one spot do they keep the orbit oval and the moon hot. There is
  a second rhythm that works too.
- **Design your own moon**: set its distance from Jupiter and how oval its orbit is, see whether
  it gets volcanoes, a hidden ocean or freezes through, and tick off the goals.

```bash
npm install
npm run dev
npm run deploy   # build + publish gh-pages
```

The applet code is synchronized from `physics_demos/src/applets/tidal_squeeze`.
Publish source changes on `main`, then run `npm run deploy` to update GitHub Pages.

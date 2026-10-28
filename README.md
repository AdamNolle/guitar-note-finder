# Guitar Note Finder

A browser game that teaches you to find every note on the guitar fretboard.

**Play it:** https://adamnolle.github.io/guitar-note-finder/

## Modes

- **Name it**: a fret is marked with `?`. Name the note.
- **Find it**: you get a note name. Tap any spot on the neck where it lives.
- **One string**: you get a note and a string. Tap that note on that string.
- **Read it**: you get a note on the treble staff. Tap that exact pitch.
- **Mix**: all four at random.

Play with **3 lives** or against a **60-second clock**. Each right answer is worth 1 point, and high scores are saved per mode and length.

## How it teaches

- Questions never show note names. String names and fretboard labels are hidden during a game, so you have to work them out.
- After each answer you get a short explanation, like counting up from the open string or an octave shape that finds the same note somewhere else.
- The game tracks your accuracy for every note and fret. Notes you miss come up more often.
- Between games, click any fret to hear it and see its name. You can also turn on note names and a weak-spots heatmap to study.
- After each answer you hear the note on a synthesized plucked string. You can turn this off.

## Keyboard

`A`–`G` names a note. Add `Shift` for a sharp. `Space` starts a game or moves to the next question, and `Esc` ends the game.

## Running locally

It's a static site with no build step:

```sh
python3 -m http.server
```

Then open http://localhost:8000.

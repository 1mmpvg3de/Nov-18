# Repository overview

This repository contains a small, dependency-free browser game: a Japanese train-stop simulator built with plain HTML, CSS, and JavaScript.

# Working in this repository

- Keep the page in three files: `index.html` for semantic structure, `style.css` for presentation, and `script.js` for simulation behavior.
- The game uses Japanese UI copy; preserve the Japanese-first experience and keep the keyboard and pointer controls usable on mobile as well as desktop.
- The simulation is client-side and has no package manager or external runtime dependencies.

# Build, test, and lint commands

There are no build, test, or lint scripts. Open `index.html` in a browser to play; serve the repository root with a static HTTP server when browser file restrictions make that necessary.

# Architecture

`index.html` loads the stylesheet and deferred script directly, contains the inline SVG side view and parallax scenery, and exposes the eight-notch handle controls. `script.js` owns simulation state: the ordered notches run from EB and brake 3/2/1 through N to power 1/2/3; up/down arrows move one notch at a time, and traveled distance scrolls the SVG scenery at different parallax rates. Stops under a brake notch are scored against the 1,000 m target. `style.css` provides the responsive dashboard, handle, and scene framing. Keep simulation and scoring rules in JavaScript rather than embedding them in the markup.

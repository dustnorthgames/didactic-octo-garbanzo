# Usher Referendum Studio — V4

This is the corrected **REFERENDUM** build.

It is **not** a general-election simulator.

## The referendum question

The fictional country of Usher is deciding its constitutional future:

- **IN** = Usher remains in the United Kingdom
- **OUT** = Usher becomes independent

## 650 constituency declarations

The project uses all **650 current UK parliamentary constituency names** as local referendum counting/declaration areas.

They are loaded from the official UK Parliament Members API:

`https://members-api.parliament.uk/api/Location/Constituency/Search`

The site retrieves every API page and expects exactly 650 results.

## Features

- 650 constituency declaration areas
- Search all 650
- Click any constituency to declare it
- 650-tile equal-area hex map
- Yellow = IN
- Blue = OUT
- Grey = undeclared
- Animated declaration counter
- National IN / OUT vote percentages
- IN / OUT constituency-win counters
- National turnout
- Local turnout
- Local vote counts
- Declaration margins
- Declaration history
- Next declaration
- Random declaration
- Declare 5
- Declare 20
- Declare all
- Closest-result-first declaration order
- Landslide-first declaration order
- Random declaration order
- Alphabetical declaration order

## Projection / winner graphics

Projection screens use:

**USHER PROJECTION**

and then:

**UH VOTES**
**IN**

or:

**UH VOTES**
**OUT**

IN boards are yellow.

OUT boards are deep blue.

## Broadcast styles

The presentation has separate visual eras:

- 1997
- 2001
- 2010
- 2016
- 2024

Years from 1997–2026 automatically select an appropriate era, or the Control Room can override it.

## Other features

- 10-second countdown opener
- Original synthetic sound stings
- Projection sting
- Declaration sting
- Breaking-news sting
- Winner sting
- Countdown ticks
- Breaking-news screen
- Analysis screen
- Turnout screen
- National results screen
- Live ticker
- Control Room ↔ Presentation live sync

## Sound

On the Presentation page, click **Enable sound** once.

Browsers require user interaction before allowing audio.

## GitHub Pages

Upload every file in this ZIP to the repository root:

- `index.html`
- `presentation.html`
- `control-room.html`
- `styles.css`
- `data.js`
- `app.js`
- `README.md`

Then enable:

**Settings → Pages → Deploy from branch → main → root**

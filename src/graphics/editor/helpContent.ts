// All Designer help text in one place: the ⓘ buttons in each panel and the
// quick-start guide read from here.

export interface HelpEntry {
  title: string;
  /** One-line "what is this". */
  intro?: string;
  /** Do this, then this. */
  steps?: string[];
  /** Good to know. */
  tips?: string[];
}

const help = {
  // ── left panel ──
  layers: {
    title: 'How to design',
    intro: 'Everything on the canvas is a layer. The list shows them top-most first.',
    steps: [
      'Open the Insert tab and click what you want to add (text, a shape, an image, a team list).',
      'Click a layer here, or on the canvas, to select it. Drag it to move; drag a corner to resize.',
      'Change how it looks in the panel on the right.',
      'Drag a row up or down to put it in front of or behind other layers.',
    ],
    tips: [
      'Double-click a name to rename it.',
      'The eye hides a layer; the lock stops it from being moved by accident.',
      'Select several layers (Shift+click) and press Ctrl+G to group them, so they move and animate together.',
    ],
  },
  share: {
    title: 'Export and import',
    intro: 'Hand a design to another account as one small file.',
    steps: [
      'Export on a layout (or on a whole theme in the Designer list) downloads a .sstheme file.',
      'The file holds the design and the uploaded fonts it uses — nothing about your tournaments.',
      'Import theme (Designer list, DisplayHud or the desktop app) reads the file, asks for a theme name and saves it into that account, published and ready to use.',
      'A single design can also go out as a package: "Export as package (.zip)" in its ⋯ menu. Anyone imports it with "Import animated package" as a new design.',
    ],
    tips: [
      'Graphics made outside the Designer: "Import HTML + CSS" for pasted code, or "Import animated package" for a .zip with overlay.json, index.html, style.css, assets/ and fonts/.',
      'HTML layers in a package animate with CSS (@keyframes, transitions); scripts in them are removed. JavaScript / TSX travels as an .ssx code layer. "Show package format" in the import dialog has the full manifest, and there is an example to download.',
      'A package keeps its author and licence, and an exported copy carries them on.',
    ],
  },
  insert: {
    title: 'Adding things',
    intro: 'Click an item to put it in the middle of the canvas.',
    steps: [
      'Basic: plain text, shapes, images and icons you place yourself.',
      'Data: pieces that fill themselves from the live match. A Team list or Player list repeats one row for every team or player.',
      'Templates: finished graphics you can drop in and restyle.',
    ],
    tips: [
      'Select a group or list first to insert inside it.',
      'Team and Player lists already react to kills, knocks, recalls and eliminations. See them in the Animate panel.',
    ],
  },
  graphics: {
    title: 'Built-in graphics',
    intro: 'The finished overlays from Theme 1–8, running live. Use them as they are, or recolour them.',
    tips: ['To change the layout itself, start from an editable Template in the Insert tab instead.'],
  },

  // ── animate dock ──
  animate: {
    title: 'How to animate',
    intro: 'An animation is a rule: WHEN something happens → the layer DOES something.',
    steps: [
      'Select the layer you want to animate.',
      'Press “+ Add animation”, or pick one of the suggestions.',
      'Choose WHEN (it appears, this player is knocked, a team is eliminated…).',
      'Choose what it DOES (slide in, pop, grey out, pulse…), and the speed.',
      'Press ▶ Preview to watch it. In SIMULATION, “Test live” makes it really happen.',
    ],
    tips: [
      'Inside a Team or Player list, “this player / this team” rules only animate the row they are about.',
      '“Is knocked”, “is dead”, “is eliminated”, “is firing”, “is outside the zone” are states: the look stays while it is true and undoes itself after.',
      'Milestones are the ones the built-in themes show: FIRST BLOOD, DOMINATION (3 kills), RAMPAGE (5), UNSTOPPABLE (8), 500+ damage. Put {{event.payload.label}} in a text to show the word.',
      '“Recalled” only happens on maps with recalls (Rondo).',
      'Test them with the SIMULATION bar: Firing, Zone out / Zone in, and the Milestone… list.',
      'A layer can have several rules. Group layers first to animate them as one.',
      'Need exact timing? “Edit keyframes” opens the same animation on a timeline.',
    ],
  },
  lifecycle: {
    title: 'On screen: in → stay → out',
    intro: 'How the layer arrives, how long it stays, and how it leaves.',
    steps: [
      'Comes in: the animation it plays when it appears.',
      'Stays: until its “Only show when…” condition hides it — or for a set number of seconds, after which it leaves by itself.',
      'Goes out: the animation it plays on the way out. The layer is only removed once that has finished.',
    ],
    tips: [
      'A set time makes an alert: it appears, stays 5 seconds, and leaves — then shows again the next time its condition becomes true.',
      'With no condition at all, a timed layer is a one-off intro when the overlay loads.',
      'In the editor the layer never takes itself away (you could not select it). Use Preview, or the full-screen Preview, to watch the whole thing.',
    ],
  },
  keyframes: {
    title: 'Keyframe timeline',
    intro: 'Fine control over one animation: each row is a property, each diamond a value at a moment in time.',
    steps: [
      'Drag the ruler to move the playhead and see that moment on the canvas.',
      'Pick “+ Add property…” to animate something new (position, size, opacity, colour…).',
      'Press ◆+ on a row to add a keyframe at the playhead, then set its value below.',
      'Drag a diamond to change when it happens. Shift+click or drag a box to select several and move, copy or ease them together.',
    ],
    tips: [
      'Curve opens the ease as a graph: drag the handles, or press F9 for Easy Ease.',
      'Delay, speed, ping-pong and stagger (each row of a list a little later) are on the timing row.',
      '〰 on a property adds wiggle: gentle random movement on top of its keyframes.',
      'All layers (U) shows every animated layer with its clips as bars.',
      'Space plays, J / K jump between keyframes, P S R T A add a keyframe. Press ? for the full list.',
      'Turn on ● rec, then move or resize the layer on the canvas: it writes the keyframes for you.',
      'Ease shapes how the value travels to the next keyframe.',
      '“Bind to data” makes a keyframe follow a live number.',
    ],
  },

  // ── right panel: element ──
  element: {
    title: 'This layer',
    intro: 'The name is only for you. It shows in the Layers list.',
  },
  layout: {
    title: 'Position and size',
    intro: 'Where the layer sits on the 1920×1080 stage, in pixels from the top-left corner.',
    tips: [
      'Dragging on the canvas changes the same numbers.',
      'Opacity 100 is solid, 0 is invisible.',
      'Order: ▲ ▼ move it in front of or behind its neighbours.',
    ],
  },
  transform: {
    title: 'Transform',
    intro: 'Stretch, slant, mirror or bend the layer without changing its box.',
    tips: [
      'Scale and skew turn around the anchor point (the 3×3 grid); rotation always turns around the centre.',
      'Corner pin moves each corner on its own, for fitting a panel into an angled frame. Use "Distort on canvas" to drag the corners.',
      'Reset puts the layer back to plain: 100%, no skew, no flip, no corner pin.',
      'Published overlays show exactly what you see here.',
    ],
  },
  liveParts: {
    title: 'Live parts',
    intro: 'Ready-made pieces of the built-in overlays, with their live animations already on: dead swipe, knocked, recalled, eliminated, kills.',
    steps: [
      'Click a part to add it. With a team list (or one of its rows) selected, team parts go into each row; with a player list selected, player parts go into each player.',
      'Added anywhere else, a part comes inside a list of its own (a team list, or 4 players) so it shows data straight away.',
      'Everything in a part is ordinary layers: change the look in the panel on the right, and its animations in the Animate panel (WHEN … → DO …).',
    ],
    tips: [
      'Player parts inside a team row become that team’s 4 players, like the photo stack on top of LiveStats.',
      'Press Kill / Knock / Recall / Eliminate in Simulation mode to see each animation play.',
    ],
  },
  shapeText: {
    title: 'Text inside a shape',
    intro: 'A rectangle, circle or drawn shape can hold its own text, so a box and its label move, animate and hide together.',
    steps: [
      'Press “+ Add text”, or double-click the shape on the canvas and type. Enter keeps it, Esc cancels, Shift+Enter starts a new line.',
      'To show live data instead (team name, kills, rank), press “Connect text to data”, or drag a field from the Data tab onto the shape.',
      'Change the font, size, colour and alignment here. “Inner spacing” keeps the text away from the edges.',
      '“Remove text” takes the text (and its data connection) out and leaves the shape as it was.',
    ],
    tips: [
      'Inside a team or player list, connect to item.* fields: every row shows its own team or player.',
      'Right-click a shape for Add text / Edit text / Remove text.',
    ],
  },
  text: {
    title: 'Text',
    intro: 'What it says and how it is written.',
    tips: [
      'To show live data (a team name, a kill count), connect it under Data below. The text typed here is then only used when there is no data.',
      'Inside {{ … }} you can also work with the data: {{ item.isFiring ? \'•\' : rank }}, {{ sum(item.players, \'killNum\') * 10 }}, {{ item.damage | fixed(1) }}, {{ item.teamName ?? \'TBD\' }}.',
      'You can use ? :, + - * /, == != < >, && || !, and helpers: upper, lower, round, fixed, min, max, clamp, pad, if, len, join, sum, count, any, all, percent, plus every format (ordinal, time…).',
      'To swap the text only while something is true (a bullet while firing), use “Change style when…” → Show text instead.',
      'Upload your own .woff2 font from the Font dropdown.',
    ],
  },
  fill: {
    title: 'Colour and outline',
    intro: 'Fill is the inside colour, stroke is the outline, radius rounds the corners.',
    tips: ['A blue tag such as theme.colors.primary means the colour follows the layout theme. Change it once in the Document panel and every layer updates.'],
  },
  bar: {
    title: 'Bar',
    intro: 'A bar that fills according to a number, such as health.',
    tips: ['Connect its Value under Data. Max is the number that means “full”.'],
  },
  image: {
    title: 'Image',
    intro: 'A picture from a web address.',
    tips: [
      'Fallback is shown when the main picture is missing.',
      'For a team logo or player photo, connect Source under Data instead of pasting a link.',
    ],
  },
  icon: { title: 'Icon', intro: 'A built-in symbol. Pick one and give it a colour.' },
  map: {
    title: 'Map (desktop app)',
    intro: 'The minimap for the desktop app. It reads the position feed of the desktop app by itself and needs no bindings.',
    tips: [
      'The minimap for the desktop app: the map picture, the safe zone and a dot for every player, coloured by team. The observed player has a yellow ring, a knocked player a red one.',
      'View: show the whole map, keep the safe zone in the middle, or follow the player on screen (set how far in with Zoom).',
      'Position and size it like any layer, and add your own frame, title or legend around it. It needs no bindings: it reads the position feed of the desktop app by itself.',
      'On the website it shows sample players so you can design; real positions appear once the theme is used in the desktop app.',
    ],
  },
  builtin: {
    title: 'Built-in graphic',
    intro: 'A finished theme overlay running live inside your layout.',
    tips: ['The sliders recolour it. Its own knock / recall / elimination behaviour is already built in.'],
  },
  repeater: {
    title: 'List (repeater)',
    intro: 'Draw one row; the list repeats it for every team or player.',
    steps: [
      'Source: which list to show (teams, standings, players, the kill feed…).',
      'Limit: how many rows. Direction: down, across, or a grid.',
      'Design the row by selecting the layers inside it.',
    ],
    tips: ['Inside the row, use item.… data (item.teamName, item.playerName) so each row shows its own team or player.'],
  },
  effects: {
    title: 'Effects',
    intro: 'Photoshop-style looks added on top: shadow, glow, outline, colour overlay, blur.',
    tips: ['Effects do not change the layer itself. Switch one off to compare.'],
  },
  mask: {
    title: 'Mask',
    intro: 'Hide part of a layer by cutting it to a shape.',
    tips: ['“Clip to layer below” shows this layer only where the layer under it is, e.g. a photo inside a circle.'],
  },
  data: {
    title: 'Connect to data',
    intro: 'Make this layer show something from the live match instead of fixed content.',
    steps: [
      'Press “Connect to live data” next to what you want to connect (the text, the image, the colour…).',
      'Pick a value from the list. It shows what that value is right now.',
      'Optionally choose how to show it (UPPERCASE, 1st/2nd, 1,234) or add text before / after it.',
    ],
    tips: [
      'Green “= …” means the value was found. Amber says why it is not: no match selected, still loading, disconnected, a list that is too short, or a field that does not exist (with a “Did you mean”).',
      '“Text when data is missing” (the fallback) shows while the value is empty or missing. A real 0 is always shown as 0.',
    ],
  },
  showWhen: {
    title: 'Only show when…',
    intro: 'Hide the layer unless a condition about the match is true.',
    steps: ['Press “Add rule” and pick a value.', 'Choose how to compare it (equals, greater than…) and the value to compare with.'],
    tips: ['Example: show a “FINAL CIRCLE” label only when teams alive is 4 or less.', 'To animate the change instead of just hiding, use the Animate panel.'],
  },
  styleWhen: {
    title: 'Change style when…',
    intro: 'Give the layer a different colour, gradient or text while a condition about the match is true.',
    steps: [
      'Pick a ready-made rule (team eliminated, player firing → bullet…) or press “+ Rule” and choose a value.',
      'Set what changes: fill, gradient, text colour, outline, opacity — and on a layer with text, “Show text instead” (e.g. •).',
    ],
    tips: [
      'Rules are checked top to bottom; when several match, the lower one wins.',
      'Inside a team list use item.* values (item.isAllDead, rank…) so each row changes on its own.',
    ],
  },
  customCss: {
    title: 'Custom CSS',
    intro: 'Any CSS for this layer, written as property: value; lines.',
    steps: [
      'Type the declarations, then click outside the box (or press Ctrl+Enter).',
      'Press “+ Data” to put a live value into the CSS as {{path}}.',
      'Pick a value from data: color: {{ item.isFiring ? \'#ff5a1f\' : \'#ffffff\' }};',
      'Apply several lines only while something is true: @when item.isFiring && !item.bHasDied { background: #ff5a1f; transform: scale(1.1); }',
    ],
    tips: [
      'A {{ … }} on its own is not CSS: it has to be the value of a property, or the condition of an @when block.',
      '@when blocks are applied after the plain lines, in order; a later one wins.',
      'Position and size always come from the canvas — left, top, width and height here are ignored.',
      'For rules that style several layers, use the layout stylesheet in the Document panel (nothing selected).',
      'For a whole graphic written in HTML + CSS, use Insert → Code.',
    ],
  },
  stylesheet: {
    title: 'Layout stylesheet',
    intro: 'CSS rules for the whole design. They only ever reach this overlay.',
    tips: [
      'Target a layer by its name: [data-layer="Score"] { … } — or by id: [data-element-id="…"].',
      '@keyframes and @media work. @import is not allowed: upload fonts in the Font picker.',
    ],
  },
  animation: {
    title: 'Animation',
    intro: 'Animations live in the Animate panel at the bottom of the screen.',
    tips: ['“When it hides” (exit) is the one animation set here, under Classic presets.'],
  },
  multi: {
    title: 'Several layers',
    intro: 'Type a number to give every selected layer the same position or size.',
    tips: ['Use the alignment buttons above to line them up or space them evenly. Ctrl+G groups them.'],
  },

  // ── right panel: document ──
  document: {
    title: 'Document',
    intro: 'Settings for the whole overlay. Shown when no layer is selected.',
    tips: ['1920×1080 matches a Full HD OBS scene.', 'Leave Background empty: the overlay is transparent in OBS.'],
  },
  theme: {
    title: 'Theme',
    intro: 'The colours and font the whole layout shares.',
    tips: ['Layers that use a theme colour change together when you change it here. That is how one layout is re-skinned for another tournament.'],
  },
  liveData: {
    title: 'Live data',
    intro: 'Which tournament and round this overlay shows.',
    steps: ['Pick the tournament, then the round.', 'Switch the top bar to LIVE to design against the real match.'],
    tips: ['SIMULATION needs none of this. It plays a sample match with buttons to fire kills, knocks and eliminations.'],
  },
  customTheme: {
    title: 'Custom theme',
    intro: 'Put this layout into one of your own themes (Theme 9, 10…), in the slot for the view it replaces.',
    tips: ['It appears in the display controller after you publish.'],
  },
  canvas: {
    title: 'Canvas',
    intro: 'The size and background of the finished graphic.',
    tips: [
      'Positions are in canvas pixels: a layer at 200, 150 is there at any zoom.',
      'Leave the background empty for a transparent overlay (the normal case in OBS).',
      'Grid, guides, margins and the safe area only help you place things; they are never published.',
    ],
  },
  textStyle: {
    title: 'Text style',
    intro: 'Outline, shadow and gradient for the letters, and what long text does.',
    tips: [
      'Player and team names vary in length. “Shrink to fit the box” keeps a long name inside its box; “end with …” cuts it.',
      'A gradient replaces the text colour.',
    ],
  },
  assets: {
    title: 'Images',
    intro: 'Your uploaded pictures: portraits, logos, backgrounds. Every design in your account can use them.',
    steps: [
      'Press Upload images, or drop files here or straight onto the canvas.',
      'Click an image to use it: into the selected shape or image layer, otherwise as a new layer.',
      'To put a picture inside a shape (a circle, a hexagon, a slanted panel), select the shape first or drop the file onto it.',
    ],
    tips: [
      'PNG, JPEG, WebP or SVG, up to 4 MB each.',
      'An image a published design uses cannot be deleted, so nothing on air ever loses a picture.',
    ],
  },
  dataPanel: {
    title: 'Data',
    intro: 'Every value the overlay can show, with what it is right now.',
    steps: [
      'Select a layer on the canvas.',
      'Find a field here (search by name) and press Bind, or drag it onto the layer.',
      'Choose which property it drives: the text, the picture, a colour, whether the layer is visible.',
    ],
    tips: [
      'SIMULATION shows made-up sample data so you can design without a tournament running. It is always labelled.',
      'A field that says “not in current data” will still work when the live match provides it; give it a fallback value for the meantime.',
    ],
  },
  cssImport: {
    title: 'Import a CSS animation',
    intro: 'Paste @keyframes from a CSS file and use it on a layer.',
    steps: [
      'Paste the @keyframes block (and, if you have it, the animation line with its duration and easing).',
      'Fix anything listed under Problems, then press Preview.',
      'Assign it to the selected layer, or save it as a preset for this design.',
    ],
    tips: [
      'Supported: opacity, transform (translate, scale, rotate, skew), transform-origin, filter (blur, grayscale, brightness, saturate, contrast, hue-rotate), color, background-color, letter-spacing.',
      'Anything else is refused with its line number rather than silently dropped. No CSS is ever injected into the page: the keyframes become an ordinary animation clip.',
    ],
  },
  history: {
    title: 'History',
    intro: 'Every publish is kept as a revision.',
    tips: ['Restore copies an old revision into your draft. Nothing changes on air until you publish again.'],
  },
};

export type HelpTopic = keyof typeof help;

export const HELP: Record<HelpTopic, HelpEntry> = help;

export const QUICK_START: Array<{ title: string; body: string }> = [
  { title: '1 · Add', body: 'Open Insert on the left and click a text, shape, image, Team list or Player list. Or start from a Template.' },
  { title: '2 · Connect data', body: 'Select a layer, then under Data on the right press “Connect to live data” to show a live value such as a team name or kill count.' },
  { title: '3 · Animate', body: 'In the Animate panel at the bottom, add a rule: WHEN this player is knocked → pulse. Press Preview to watch it.' },
  { title: '4 · Publish', body: 'Press Publish and paste the link into an OBS Browser Source. Later edits stay in your draft until you publish again.' },
];

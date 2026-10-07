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
      '“Is knocked”, “is dead”, “is eliminated” are states: the look stays while it is true and undoes itself after.',
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
  text: {
    title: 'Text',
    intro: 'What it says and how it is written.',
    tips: [
      'To show live data (a team name, a kill count), connect it under Data below. The text typed here is then only used when there is no data.',
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
      'Press “Select data” next to what you want to connect (the text, the image, the colour…).',
      'Pick a value from the list. It shows what that value is right now.',
      'Optionally choose a format (UPPERCASE, 1st/2nd, 1,234) or add a prefix / suffix.',
    ],
    tips: [
      'Green “= …” means the value was found. Amber means it is not in the current data. Check LIVE / SIMULATION.',
      'Fallback is what shows when the value is empty.',
    ],
  },
  showWhen: {
    title: 'Only show when…',
    intro: 'Hide the layer unless a condition about the match is true.',
    steps: ['Press “Add rule” and pick a value.', 'Choose how to compare it (equals, greater than…) and the value to compare with.'],
    tips: ['Example: show a “FINAL CIRCLE” label only when teams alive is 4 or less.', 'To animate the change instead of just hiding, use the Animate panel.'],
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
  { title: '2 · Connect data', body: 'Select a layer, then under Data on the right press “Select data” to show a live value such as a team name or kill count.' },
  { title: '3 · Animate', body: 'In the Animate panel at the bottom, add a rule: WHEN this player is knocked → pulse. Press Preview to watch it.' },
  { title: '4 · Publish', body: 'Press Publish and paste the link into an OBS Browser Source. Later edits stay in your draft until you publish again.' },
];

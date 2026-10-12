// A steady colour per team: the same slot always gets the same hue. Used for
// the desktop feed's teams (graphics/bindings/local.ts) and the website's
// derived teams (hooks/unsortteams.ts), so a Designer layer that follows a
// team's colour looks the same in both places. Pure, no React.

export const teamSlotColor = (slot: number): string => `hsl(${(Math.abs(Math.round(slot)) * 47) % 360}, 82%, 58%)`;

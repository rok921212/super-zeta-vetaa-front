// Home page showcase mode. The home simulator turns it on before any theme
// view mounts. While it is on, theme code must not open sockets or fetch
// anything: every number comes from the in-browser simulation, so a visitor
// costs no server bandwidth. Hooks that would otherwise show blanks (no relay
// on the home page) use fixed sample data instead.

let on = false;

export function setHomeDemo(value: boolean): void {
  on = value;
}

export function isHomeDemo(): boolean {
  return on;
}

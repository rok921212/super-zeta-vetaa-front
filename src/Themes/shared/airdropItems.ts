// PUBG Mobile item ids, as the game's airdrop feed sends them
// (POST /setairdropboxinfo -> relay /local/airdrops), for the Airdrop Info
// overlay. Seeded from every id seen in the server.exe logs of
// 2026-11-13 … 2026-11-16 (30 ids). The ammo each gun arrives with confirms
// the mapping (AWM + .300 Magnum ×20, AMR + .50 Cal ×10, P90 + 5.7mm ×200,
// FAMAS + 5.56mm ×60, Groza/Mk14 + 7.62mm ×60, MG3 + 7.62mm ×100).
//
// Every item is drawn by AirdropIcons.tsx from its `icon` kind (a rifle for a
// rifle, a vest for a vest …). To use a real picture instead, put it in
// front/public/airdrop-items/ and set `image: '/airdrop-items/<file>'`.
// An id missing from this table still shows, as "Item <id>" with the icon of
// its id family.

export type AirdropCategory = 'gun' | 'ammo' | 'armor' | 'scope' | 'attachment' | 'meds' | 'outfit' | 'other';

export type AirdropIconKind =
  | 'ar' | 'bullpup' | 'groza' | 'smg' | 'sniper' | 'dmr' | 'lmg' | 'amr'
  | 'ammo' | 'ammoLarge'
  | 'vest' | 'helmet' | 'backpack'
  | 'scope' | 'suppressor' | 'mag' | 'stock' | 'cheekpad'
  | 'syringe' | 'painkiller' | 'firstaid' | 'medkit'
  | 'ghillie' | 'item';

export interface AirdropItem {
  name: string;
  category: AirdropCategory;
  icon: AirdropIconKind;
  /** Armour level / scope zoom, drawn on the icon. */
  level?: number;
  zoom?: string;
  /** Optional real picture that replaces the drawn icon. */
  image?: string;
}

export const AIRDROP_ITEMS: Record<number, AirdropItem> = {
  // Guns
  101005: { name: 'Groza', category: 'gun', icon: 'groza' },
  101100: { name: 'FAMAS', category: 'gun', icon: 'bullpup' },
  102105: { name: 'P90', category: 'gun', icon: 'smg' },
  103003: { name: 'AWM', category: 'gun', icon: 'sniper' },
  103007: { name: 'Mk14', category: 'gun', icon: 'dmr' },
  103012: { name: 'AMR', category: 'gun', icon: 'amr' },
  105010: { name: 'MG3', category: 'gun', icon: 'lmg' },
  // Ammo
  301002: { name: '5.7mm', category: 'ammo', icon: 'ammo' },
  302001: { name: '7.62mm', category: 'ammo', icon: 'ammo' },
  303001: { name: '5.56mm', category: 'ammo', icon: 'ammo' },
  306001: { name: '.300 Magnum', category: 'ammo', icon: 'ammoLarge' },
  306002: { name: '.50 Cal', category: 'ammo', icon: 'ammoLarge' },
  // Attachments
  201007: { name: 'Suppressor (Sniper)', category: 'attachment', icon: 'suppressor' },
  201011: { name: 'Suppressor (AR)', category: 'attachment', icon: 'suppressor' },
  204009: { name: 'Extended QuickDraw Mag (Sniper)', category: 'attachment', icon: 'mag' },
  204013: { name: 'Extended QuickDraw Mag (AR)', category: 'attachment', icon: 'mag' },
  205002: { name: 'Tactical Stock', category: 'attachment', icon: 'stock' },
  205003: { name: 'Cheek Pad (Sniper)', category: 'attachment', icon: 'cheekpad' },
  // Scopes
  203004: { name: '4x Scope', category: 'scope', icon: 'scope', zoom: '4x' },
  203005: { name: '8x Scope', category: 'scope', icon: 'scope', zoom: '8x' },
  // Armour
  501003: { name: 'Backpack (Level 3)', category: 'armor', icon: 'backpack', level: 3 },
  502003: { name: 'Spetsnaz Helmet (Level 3)', category: 'armor', icon: 'helmet', level: 3 },
  503003: { name: 'Military Vest (Level 3)', category: 'armor', icon: 'vest', level: 3 },
  // Meds
  601002: { name: 'Adrenaline Syringe', category: 'meds', icon: 'syringe' },
  601003: { name: 'Painkiller', category: 'meds', icon: 'painkiller' },
  601005: { name: 'First Aid Kit', category: 'meds', icon: 'firstaid' },
  601006: { name: 'Med Kit', category: 'meds', icon: 'medkit' },
  // Outfits: the airdrop ghillie suit (a different colour per map)
  403045: { name: 'Ghillie Suit', category: 'outfit', icon: 'ghillie' },
  403187: { name: 'Ghillie Suit', category: 'outfit', icon: 'ghillie' },
  403992: { name: 'Ghillie Suit', category: 'outfit', icon: 'ghillie' },
};

/** Shown in this order inside a crate: the gun first, armour last. */
export const CATEGORY_ORDER: AirdropCategory[] = ['gun', 'ammo', 'scope', 'attachment', 'meds', 'outfit', 'other', 'armor'];

export function airdropItem(id: number): AirdropItem {
  return AIRDROP_ITEMS[id] ?? guessFromId(id);
}

/** A best guess for ids not in the table, from the id's family (first digits). */
function guessFromId(id: number): AirdropItem {
  const s = String(id);
  const name = `Item ${id}`;
  if (s.startsWith('101')) return { name, category: 'gun', icon: 'ar' };
  if (s.startsWith('102')) return { name, category: 'gun', icon: 'smg' };
  if (s.startsWith('103')) return { name, category: 'gun', icon: 'sniper' };
  if (s.startsWith('10')) return { name, category: 'gun', icon: 'lmg' };
  if (s.startsWith('30')) return { name, category: 'ammo', icon: 'ammo' };
  if (s.startsWith('201')) return { name, category: 'attachment', icon: 'suppressor' };
  if (s.startsWith('203')) return { name, category: 'scope', icon: 'scope' };
  if (s.startsWith('204')) return { name, category: 'attachment', icon: 'mag' };
  if (s.startsWith('205')) return { name, category: 'attachment', icon: 'stock' };
  if (s.startsWith('501')) return { name, category: 'armor', icon: 'backpack', level: Number(s.slice(-1)) || undefined };
  if (s.startsWith('502')) return { name, category: 'armor', icon: 'helmet', level: Number(s.slice(-1)) || undefined };
  if (s.startsWith('503')) return { name, category: 'armor', icon: 'vest', level: Number(s.slice(-1)) || undefined };
  if (s.startsWith('60')) return { name, category: 'meds', icon: 'firstaid' };
  if (s.startsWith('40')) return { name, category: 'outfit', icon: 'ghillie' };
  return { name, category: 'other', icon: 'item' };
}

/** Wide icons (guns) are drawn 2:1; everything else square. */
export const isWideIcon = (id: number) => airdropItem(id).category === 'gun';

// Une cadence telle que le serveur l'envoie (server/services/cadences.js) : base et incrément en secondes.
export type Cadence = { id: string; categorie: "bullet" | "blitz" | "rapide" | "quotidien"; base: number; increment: number };

export const categoriesCadences = { bullet: "Bullet", blitz: "Blitz", rapide: "Rapide", quotidien: "Quotidien" };

// "3 min + 2 s", "10 min", ou "1 jour par coup" en quotidien
export function formaterCadence(c: Cadence): string {
  if (c.categorie === "quotidien") return `${c.base / 86400} jour par coup`;
  return c.increment > 0 ? `${c.base / 60} min + ${c.increment} s` : `${c.base / 60} min`;
}

// "Blitz 3 min + 2 s" : le libellé complet affiché sur les pages
export function libelleCadence(c: Cadence): string {
  return `${categoriesCadences[c.categorie]} ${formaterCadence(c)}`;
}

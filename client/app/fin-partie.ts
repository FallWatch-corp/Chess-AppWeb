// Ce qui sert à afficher une fin de partie, sur la page de la partie et dans l'historique.

export const CAUSES: Record<string, string> = {
  mat: "par échec et mat",
  pat: "par pat",
  abandon: "par abandon",
  repetition: "par répétition",
  materiel_insuffisant: "par matériel insuffisant",
  cinquante_coups: "par la règle des 50 coups",
};

export function formaterVariation(variation: number) {
  return variation > 0 ? `+${variation}` : String(variation);
}

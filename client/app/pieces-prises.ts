// Pièces prises et avantage matériel, calculés à partir de la FEN.
// Pas besoin de l'historique des coups : une pièce prise est une pièce
// qui manque sur l'échiquier par rapport à la position de départ.

export type TypePiece = "p" | "n" | "b" | "r" | "q";
export type Materiel = { prises: TypePiece[]; avantage: number };

type Couleur = "blanc" | "noir";
type Compte = Record<TypePiece, number>;

// Ordre d'affichage : des plus petites aux plus fortes (le roi ne se prend jamais)
export const ORDRE: TypePiece[] = ["p", "n", "b", "r", "q"];

// Valeur de chaque pièce, en pions
const VALEUR: Record<TypePiece, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

// Nombre de pièces de chaque type au départ, pour une couleur
const DEPART: Record<TypePiece, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

// Compte les pièces de chaque couleur qui sont encore sur l'échiquier.
function compter(fen: string): Record<Couleur, Compte> {
  const comptes = {
    blanc: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    noir: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };
  // Le premier champ de la FEN décrit les cases, rangée par rangée :
  // "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
  const cases = fen.split(" ")[0];
  for (const lettre of cases) {
    const type = lettre.toLowerCase();
    if (!(type in VALEUR)) continue; // chiffres, "/" et rois : on ignore
    // majuscule = pièce blanche, minuscule = pièce noire
    const couleur = lettre === type ? "noir" : "blanc";
    comptes[couleur][type as TypePiece] += 1;
  }
  return comptes;
}

export function calculerMateriel(fen: string): Record<Couleur, Materiel> {
  const sur = compter(fen);

  // Pièces qui manquent à une couleur : elles ont été prises par l'adversaire.
  function manquantes(couleur: Couleur): TypePiece[] {
    // Une promotion ajoute une pièce et retire un pion, sans qu'aucun pion soit pris.
    let promotions = 0;
    for (const type of ORDRE) {
      if (type !== "p") promotions += Math.max(0, sur[couleur][type] - DEPART[type]);
    }

    const liste: TypePiece[] = [];
    for (const type of ORDRE) {
      let nombre = Math.max(0, DEPART[type] - sur[couleur][type]);
      if (type === "p") nombre = Math.max(0, nombre - promotions);
      for (let i = 0; i < nombre; i++) liste.push(type);
    }
    return liste;
  }

  // Valeur totale des pièces qui restent à une couleur
  function valeur(couleur: Couleur): number {
    return ORDRE.reduce((total, type) => total + VALEUR[type] * sur[couleur][type], 0);
  }

  // > 0 : les Blancs ont plus de matériel ; < 0 : les Noirs
  const difference = valeur("blanc") - valeur("noir");

  return {
    // les Blancs ont pris les pièces qui manquent aux Noirs, et inversement
    blanc: { prises: manquantes("noir"), avantage: Math.max(0, difference) },
    noir: { prises: manquantes("blanc"), avantage: Math.max(0, -difference) },
  };
}
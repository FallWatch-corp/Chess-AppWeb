import { Chessboard } from "react-chessboard";
import { THEMES, type IdTheme } from "./themes";

type Props = {
  fen: string;
  couleur: "blanc" | "noir" | null;
  theme: IdTheme;
};

// Affiche la position de la partie, vue du côté du joueur.
// On ne peut pas encore bouger les pièces : ce sera pour l'issue sur les coups.
export function Echiquier({ fen, couleur, theme }: Props) {
  const { caseClaire, caseFoncee } = THEMES[theme];

  return (
    <div className="w-full max-w-140">
      <Chessboard
        options={{
          id: "echiquier-partie",
          position: fen,
          boardOrientation: couleur === "noir" ? "black" : "white",
          allowDragging: false,
          lightSquareStyle: { backgroundColor: caseClaire },
          darkSquareStyle: { backgroundColor: caseFoncee },
          // les lettres et chiffres prennent la couleur de l'autre case pour rester lisibles
          lightSquareNotationStyle: { color: caseFoncee },
          darkSquareNotationStyle: { color: caseClaire },
        }}
      />
    </div>
  );
}

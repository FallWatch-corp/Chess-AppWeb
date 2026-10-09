import { Chessboard } from "react-chessboard";
import { THEMES, type IdTheme } from "./themes";

type Props = {
  fen: string;
  couleur: "blanc" | "noir" | null;
  theme: IdTheme;
  // absent = échiquier en lecture seule (pas mon tour, partie finie, coup en cours d'envoi)
  onCoup?: (coup: { de: string; vers: string; promotion?: "q" }) => boolean;
};

// Affiche la position de la partie, vue du côté du joueur.
export function Echiquier({ fen, couleur, theme, onCoup }: Props) {
  const { caseClaire, caseFoncee } = THEMES[theme];
  const monPrefixe = couleur === "noir" ? "b" : "w";

  return (
    <div className="w-full max-w-140">
      <Chessboard
        options={{
          id: "echiquier-partie",
          position: fen,
          boardOrientation: couleur === "noir" ? "black" : "white",
          allowDragging: onCoup !== undefined,
          // on ne peut prendre que ses propres pièces ("wP", "bK"…)
          canDragPiece: ({ piece }) => piece.pieceType.startsWith(monPrefixe),
          onPieceDrop: ({ piece, sourceSquare, targetSquare }) => {
            if (!onCoup || !targetSquare || targetSquare === sourceSquare) return false;
            // un pion qui arrive sur la dernière rangée devient une dame
            const promotion =
              piece.pieceType.endsWith("P") && /[18]$/.test(targetSquare) ? "q" : undefined;
            return onCoup({ de: sourceSquare, vers: targetSquare, promotion });
          },
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

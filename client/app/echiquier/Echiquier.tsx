import { useMemo, useState, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Square } from "chess.js";
import { THEMES, type IdTheme } from "./themes";

type Coup = { de: string; vers: string; promotion?: "q" };

type Props = {
  fen: string;
  couleur: "blanc" | "noir" | null;
  theme: IdTheme;
  // absent = échiquier en lecture seule (pas mon tour, partie finie, coup en cours d'envoi)
  onCoup?: (coup: Coup) => boolean;
};

const STYLE_SELECTION: CSSProperties = { background: "rgba(255, 213, 0, 0.45)" };
// un point au centre d'une case vide, un anneau autour d'une pièce qu'on peut prendre
const STYLE_CIBLE: CSSProperties = {
  background: "radial-gradient(circle, rgba(0, 0, 0, 0.25) 22%, transparent 24%)",
  cursor: "pointer",
};
const STYLE_PRISE: CSSProperties = {
  background: "radial-gradient(circle, transparent 62%, rgba(0, 0, 0, 0.25) 64%)",
  cursor: "pointer",
};

// Affiche la position de la partie, vue du côté du joueur.
// On joue en glissant une pièce, ou en cliquant sur la pièce puis sur la case d'arrivée.
export function Echiquier({ fen, couleur, theme, onCoup }: Props) {
  const { caseClaire, caseFoncee } = THEMES[theme];
  const monPrefixe = couleur === "noir" ? "b" : "w";
  // On retient la position au moment du clic : si elle change (mon coup, celui de
  // l'adversaire) ou si l'échiquier est verrouillé, la sélection ne vaut plus rien.
  const [choix, setChoix] = useState<{ fen: string; case: Square } | null>(null);
  const selection = onCoup && choix?.fen === fen ? choix.case : null;
  const setSelection = (c: Square | null) => setChoix(c ? { fen, case: c } : null);

  // les coups possibles de la pièce sélectionnée, d'après les règles (chess.js)
  // c'est seulement pour l'affichage : le serveur valide quand même le coup
  const coupsPossibles = useMemo(() => {
    if (!selection) return [];
    try {
      return new Chess(fen).moves({ square: selection, verbose: true });
    } catch {
      return [];
    }
  }, [fen, selection]);

  const squareStyles: Record<string, CSSProperties> = {};
  if (selection) {
    squareStyles[selection] = STYLE_SELECTION;
    for (const coup of coupsPossibles) {
      squareStyles[coup.to] = coup.captured ? STYLE_PRISE : STYLE_CIBLE;
    }
  }

  function cliquerCase({ piece, square }: { piece: { pieceType: string } | null; square: string }) {
    if (!onCoup) return;

    const coup = selection ? coupsPossibles.find((c) => c.to === square) : undefined;
    if (selection && coup) {
      onCoup({ de: selection, vers: square, promotion: coup.promotion ? "q" : undefined });
      setSelection(null);
    } else if (piece?.pieceType.startsWith(monPrefixe) && square !== selection) {
      // une de mes pièces : on la sélectionne (ou on change de pièce)
      setSelection(square as Square);
    } else {
      setSelection(null);
    }
  }

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
          onPieceDrag: () => setSelection(null),
          onPieceDrop: ({ piece, sourceSquare, targetSquare }) => {
            if (!onCoup || !targetSquare || targetSquare === sourceSquare) return false;
            // un pion qui arrive sur la dernière rangée devient une dame
            const promotion =
              piece.pieceType.endsWith("P") && /[18]$/.test(targetSquare) ? "q" : undefined;
            return onCoup({ de: sourceSquare, vers: targetSquare, promotion });
          },
          onSquareClick: cliquerCase,
          squareStyles,
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

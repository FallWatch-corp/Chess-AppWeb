import { useEffect, useState } from "react";
import { estIdTheme, THEME_PAR_DEFAUT, type IdTheme } from "../echiquier/themes";

const CLE = "theme-echiquier";

// Le thème choisi est gardé dans le navigateur (localStorage).
// Le serveur n'y a pas accès : on affiche le thème par défaut au premier rendu,
// puis on lit le choix enregistré une fois dans le navigateur.
export function useThemeEchiquier() {
  const [theme, setTheme] = useState<IdTheme>(THEME_PAR_DEFAUT);

  useEffect(() => {
    try {
      const enregistre = localStorage.getItem(CLE);
      if (estIdTheme(enregistre)) setTheme(enregistre);
    } catch {
      // localStorage peut être bloqué (navigation privée) : on garde le défaut
    }
  }, []);

  function changerTheme(nouveau: IdTheme) {
    setTheme(nouveau);
    try {
      localStorage.setItem(CLE, nouveau);
    } catch {
      // tant pis, le choix ne sera pas retenu
    }
  }

  return [theme, changerTheme] as const;
}

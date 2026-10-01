import { useEffect } from "react";
import { useRevalidator } from "react-router";

// Relance les loaders de la page toutes les X millisecondes tant que "actif" est vrai.
// Le clearInterval arrete tout quand on quitte la page ou quand actif devient faux.
export function useInterrogation(actif: boolean, delai = 2000) {
  const revalidator = useRevalidator();

  useEffect(() => {
    if (!actif) return;

    const minuterie = setInterval(() => {
      // on attend que la requete d'avant soit finie
      if (revalidator.state === "idle") revalidator.revalidate();
    }, delai);

    return () => clearInterval(minuterie);
  }, [actif, delai, revalidator]);
}

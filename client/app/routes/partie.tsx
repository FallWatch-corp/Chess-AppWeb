import { useState } from "react";
import { redirect, useFetcher } from "react-router";
import { Chess } from "chess.js";
import type { Route } from "./+types/partie";
import { appelerApi } from "../api.server";
import { CAUSES, formaterVariation } from "../fin-partie";
import { useInterrogation } from "../hooks/useInterrogation";
import { useThemeEchiquier } from "../hooks/useThemeEchiquier";
import { Echiquier } from "../echiquier/Echiquier";
import { SelecteurTheme } from "../echiquier/SelecteurTheme";
import { ORDRE, calculerMateriel, type Materiel, type TypePiece } from "../pieces-prises";

type Couleur = "blanc" | "noir";
type JoueurPartie = { nom: string; elo: number };

type Partie = {
  id: number;
  code: string;
  statut: string;
  couleur: Couleur | null;
  fen: string;
  trait: Couleur;
  blanc: JoueurPartie | null;
  noir: JoueurPartie | null;
  coups: string[];
  fin: Fin | null;
};

type EloPartie = { avant: number; apres: number };
type Fin = {
  resultat: Couleur | "nulle";
  cause: string;
  eloBlanc: EloPartie;
  eloNoir: EloPartie;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Partie privée · Chess-AppWeb" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const reponse = await appelerApi(request, `/api/parties/${params.id}`);
  if (reponse.status === 401) throw redirect("/");
  if (!reponse.ok) {
    const { erreur } = await reponse.json();
    throw new Response(erreur, { status: reponse.status });
  }

  const partie: Partie = await reponse.json();
  return { partie };
}

// Envoie le coup à l'API. Après l'action, React Router relance le loader :
// la page reçoit la FEN validée par le serveur (ou l'ancienne si le coup est refusé).
export async function action({ request, params }: Route.ActionArgs) {
  const formulaire = await request.formData();
  const coup = {
    de: formulaire.get("de"),
    vers: formulaire.get("vers"),
    promotion: formulaire.get("promotion") || undefined,
  };

  const reponse =
    formulaire.get("intent") === "abandon"
      ? await appelerApi(request, `/api/parties/${params.id}/abandon`, { method: "POST" })
      : await appelerApi(request, `/api/parties/${params.id}/coups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(coup),
        });
  if (reponse.status === 401) throw redirect("/");
  if (!reponse.ok) {
    // 409 hors tour / partie terminée, 422 coup illégal, 403… : l'API donne le message
    const { erreur } = await reponse.json();
    return { erreur: erreur as string };
  }
  return { erreur: null };
}

export default function PagePartie({ loaderData }: Route.ComponentProps) {
  const { partie } = loaderData;

  // On redemande l'état de la partie à l'API toutes les 2 s : en attente pour voir
  // l'adversaire arriver, puis pendant la partie pour voir ses coups.
  // Ça s'arrête quand la partie est terminée, ou quand on quitte la page (nettoyage du hook).
  useInterrogation(partie.statut !== "terminee");

  if (partie.statut !== "en_attente") {
    return <PartieEnCours partie={partie} />;
  }

  return (
    <main className="container mx-auto flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Partie privée</h1>
      <p>Donnez ce code à la personne contre qui vous voulez jouer :</p>
      <div className="flex items-center gap-3">
        <span className="rounded border px-4 py-2 font-mono text-3xl tracking-widest">
          {partie.code}
        </span>
        <BoutonCopier texte={partie.code} />
      </div>
      <p className="text-gray-500">En attente de votre adversaire…</p>
    </main>
  );
}

function PartieEnCours({ partie }: { partie: Partie }) {
  const [theme, setTheme] = useThemeEchiquier();
  const fetcher = useFetcher<typeof action>();
  // comme sur l'échiquier : l'adversaire en haut, moi en bas
  const moi = partie.couleur ?? "blanc";
  const adversaire = moi === "blanc" ? "noir" : "blanc";
  const camp = partie.trait === "blanc" ? "blancs" : "noirs";
  const enCours = partie.statut === "en_cours";
  const messageTrait = partie.trait === partie.couleur ? "À vous de jouer" : `Trait aux ${camp}`;
  // une fois la partie terminée, plus personne n'est au trait
  const trait = enCours ? partie.trait : null;

  // Pendant l'envoi, on affiche déjà la position après le coup (affichage optimiste).
  // Dès que le loader a répondu, c'est la FEN du serveur qui s'affiche :
  // si le coup est refusé, la pièce revient donc à sa place.
  // (fenApres est vide quand le coup nous paraît illégal : on garde alors la position actuelle)
  const fenOptimiste = fetcher.formData?.get("fenApres");
  const fen = typeof fenOptimiste === "string" && fenOptimiste !== "" ? fenOptimiste : partie.fen;
  const peutJouer = enCours && partie.trait === partie.couleur && fetcher.state === "idle";
    // Pièces prises et avantage matériel, calculés sur la position affichée
  const materiel = calculerMateriel(fen);

  function abandonner() {
    if (!window.confirm("Abandonner la partie ? Elle sera comptée comme perdue.")) return;
    void fetcher.submit({ intent: "abandon" }, { method: "post" });
  }

  function jouer(coup: { de: string; vers: string; promotion?: "q" }) {
    // chess.js sert seulement à calculer la position à afficher en attendant ;
    // c'est le serveur qui décide si le coup est légal (même s'il nous paraît illégal ici)
    let fenApres = "";
    try {
      fenApres = new Chess(partie.fen).move({ from: coup.de, to: coup.vers, promotion: coup.promotion }).after;
    } catch {
      // coup illégal : on l'envoie quand même, le serveur répondra 422
    }
    // pas besoin d'attendre : la page se met à jour quand le loader a rechargé la partie
    void fetcher.submit(
      { de: coup.de, vers: coup.vers, promotion: coup.promotion ?? "", fenApres },
      { method: "post" },
    );
    return fenApres !== "";
  }

  const erreur = fetcher.state === "idle" ? fetcher.data?.erreur : null;

  return (
    <main className="container mx-auto flex flex-col items-center gap-4 p-8">
      {partie.fin ? (
        <ResultatPartie partie={partie} fin={partie.fin} />
      ) : (
        <p className="text-lg font-medium">{messageTrait}</p>
      )}
      <BandeauJoueur joueur={partie[adversaire]} couleur={adversaire} trait={trait} materiel={materiel[adversaire]} />
      <Echiquier
        fen={fen}
        couleur={partie.couleur}
        theme={theme}
        onCoup={peutJouer ? jouer : undefined}
      />
            <BandeauJoueur joueur={partie[moi]} couleur={moi} trait={trait} materiel={materiel[moi]} />
      {enCours && partie.couleur && (
        <button
          type="button"
          onClick={abandonner}
          disabled={fetcher.state !== "idle"}
          className="rounded border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Abandonner
        </button>
      )}
      {erreur && (
        <p role="alert" className="text-red-600">
          {erreur}
        </p>
      )}
      <SelecteurTheme theme={theme} onChange={setTheme} />
    </main>
  );
}

// Le résultat est donné du point de vue du joueur qui regarde la page.
function ResultatPartie({ partie, fin }: { partie: Partie; fin: Fin }) {
  let titre = "Nulle";
  if (fin.resultat !== "nulle") {
    titre = fin.resultat === partie.couleur ? "Victoire" : "Défaite";
  }
  const lignes = [
    { couleur: "Blancs", joueur: partie.blanc, elo: fin.eloBlanc },
    { couleur: "Noirs", joueur: partie.noir, elo: fin.eloNoir },
  ];

  return (
    <section
      role="status"
      className="flex w-full max-w-140 flex-col items-center gap-2 rounded border p-4"
    >
      <h1 className="text-xl font-semibold">
        {titre} {CAUSES[fin.cause] ?? ""}
      </h1>
      <ul className="font-mono">
        {lignes.map(({ couleur, joueur, elo }) => (
          <li key={couleur}>
            <span className="font-sans">
              {couleur} · {joueur?.nom ?? "?"} :
            </span>{" "}
            {elo.avant} → {elo.apres} ({formaterVariation(elo.apres - elo.avant)})
          </li>
        ))}
      </ul>
    </section>
  );
}

function BandeauJoueur({
  joueur,
  couleur,
  trait,
  materiel,
}: {
  joueur: JoueurPartie | null;
  couleur: Couleur;
  trait: Couleur | null;
  materiel: Materiel;
}) {
  return (
    <div className="flex w-full max-w-140 items-center justify-between">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={`inline-block size-3 rounded-full border border-gray-500 ${
              couleur === "blanc" ? "bg-white" : "bg-gray-900"
            }`}
          />
          <span className="sr-only">{couleur === "blanc" ? "Blancs :" : "Noirs :"}</span>
          <span className="font-semibold">{joueur?.nom ?? "?"}</span>
          <span className="font-mono text-gray-500">({joueur?.elo ?? "?"})</span>
        </span>
        <PiecesPrises prises={materiel.prises} avantage={materiel.avantage} />
      </div>
      {trait === couleur && <span className="text-sm text-gray-500">au trait</span>}
    </div>
  );
}

// Symboles des pièces prises (le "\uFE0E" empêche le pion d'apparaître en emoji)
const SYMBOLES: Record<TypePiece, string> = { p: "♟\uFE0E", n: "♞", b: "♝", r: "♜", q: "♛" };
const NOMS: Record<TypePiece, string> = { p: "pion", n: "cavalier", b: "fou", r: "tour", q: "dame" };

function PiecesPrises({ prises, avantage }: { prises: TypePiece[]; avantage: number }) {
  // Texte pour les lecteurs d'écran : "2 pions, 1 cavalier"
  const description = ORDRE.filter((type) => prises.includes(type))
    .map((type) => {
      const nombre = prises.filter((p) => p === type).length;
      return `${nombre} ${NOMS[type]}${nombre > 1 ? "s" : ""}`;
    })
    .join(", ");

  return (
    // hauteur minimale : l'échiquier ne bouge pas à la première prise
    <span className="flex min-h-6 items-center gap-2">
      {prises.length > 0 && (
        <>
          <span aria-hidden className="text-lg leading-none">
            {prises.map((type) => SYMBOLES[type]).join("")}
          </span>
          <span className="sr-only">Pièces prises : {description}</span>
        </>
      )}
      {avantage > 0 && (
        <span className="font-mono text-sm text-gray-500">
          <span aria-hidden>+{avantage}</span>
          <span className="sr-only">Avantage matériel : {avantage}</span>
        </span>
      )}
    </span>
  );
}

function BoutonCopier({ texte }: { texte: string }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    await navigator.clipboard.writeText(texte);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copier}
      className="rounded border px-3 py-2 hover:bg-gray-100"
    >
      {copie ? "Copié !" : "Copier"}
    </button>
  );
}

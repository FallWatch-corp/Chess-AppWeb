import { useEffect, useRef, useState, type ReactNode } from "react";
import { redirect, useFetcher, useRevalidator, useRouteLoaderData } from "react-router";
import { Chess } from "chess.js";
import type { Route } from "./+types/partie";
import { appelerApi } from "../api.server";
import { CAUSES, formaterVariation } from "../fin-partie";
import { useThemeEchiquier } from "../hooks/useThemeEchiquier";
import { Echiquier } from "../echiquier/Echiquier";
import { SelecteurTheme } from "../echiquier/SelecteurTheme";
import { ORDRE, calculerMateriel, type Materiel, type TypePiece } from "../pieces-prises";
import { usePartieEnDirect, type Presence } from "../hooks/usePartieEnDirect";
import { Clavardage } from "../clavardage/Clavardage";
import type { loader as rootLoader } from "../root";
import { libelleCadence, type Cadence } from "../cadence";

type Couleur = "blanc" | "noir";
type JoueurPartie = { nom: string; elo: number };

type Partie = {
  id: number;
  // null pour un spectateur : seul le créateur reçoit le code d'invitation
  code: string | null;
  statut: string;
  couleur: Couleur | null;
  fen: string;
  trait: Couleur;
  blanc: JoueurPartie | null;
  noir: JoueurPartie | null;
  coups: string[];
  fin: Fin | null;
  cadence: Cadence;
  echeance: string | null; // instant où le joueur au trait perd au temps (texte ISO), null en salle d'attente
  // temps restant de chaque joueur en millisecondes, mesuré à l'envoi ; null en salle d'attente et en quotidien
  pendule: { blanc: number; noir: number } | null;
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
  // Lecture publique : sans compte, ou sans être dans la partie, on la reçoit en spectateur.
  const reponse = await appelerApi(request, `/api/parties/${params.id}`);
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
  // L'adresse publique de l'API vient du loader racine (lue au démarrage, pas figée au build).
  const racine = useRouteLoaderData<typeof rootLoader>("root");
  // L'état affiché est mis à jour en direct : coups de l'adversaire, arrivée, fin de partie,
  // ainsi que les messages du clavardage (même socket, même salon).
  const { partie, presence, messages, envoyerMessage, connecte, dejaConnecte } = usePartieEnDirect(racine!.urlApi, loaderData.partie);
  const connexionPerdue = dejaConnecte && !connecte;

  const revalidator = useRevalidator();
  const terminee = partie.statut === "terminee";
  const etaitTerminee = useRef(terminee);
  useEffect(() => {
    if (terminee && !etaitTerminee.current) revalidator.revalidate();
    etaitTerminee.current = terminee;
  }, [terminee, revalidator]);

  // Construit une seule fois, affiché en salle d'attente comme pendant et après la partie.
  // estConnecte vient de la session (loader racine) : un anonyme lit, mais est invité à se connecter.
  const clavardage = (
    <Clavardage
      messages={messages}
      estConnecte={Boolean(racine!.joueur)}
      ferme={terminee}
      urlConnexion={racine!.urlConnexion}
      envoyer={envoyerMessage}
    />
  );

  if (partie.statut !== "en_attente") {
    return (
      <PartieEnCours partie={partie} presence={presence} connexionPerdue={connexionPerdue}>
        {clavardage}
      </PartieEnCours>
    );
  }

  if (partie.code === null) {
    return (
      <main className="container mx-auto flex flex-col items-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">Partie privée</h1>
        <p className="text-gray-500">Vous êtes spectateur. La partie n'a pas encore commencé…</p>
        <p className="text-gray-500">Cadence : {libelleCadence(partie.cadence)}</p>
        {clavardage}
      </main>
    );
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
      <p className="text-gray-500">Cadence : {libelleCadence(partie.cadence)}</p>
      <p className="text-gray-500">En attente de votre adversaire…</p>
      {clavardage}
    </main>
  );
}

// children : le panneau de clavardage, affiché sous l'échiquier.
function PartieEnCours({
  partie,
  presence,
  children,
  connexionPerdue,
}: {
  partie: Partie;
  presence: Presence | null;
  children: ReactNode;
  connexionPerdue: boolean;
}) {
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
      <div role="status" className="text-amber-700 dark:text-amber-400 empty:hidden">
        {connexionPerdue && "Connexion perdue, reconnexion…"}
      </div>
      {partie.fin ? (
        <ResultatPartie partie={partie} fin={partie.fin} />
      ) : (
        <p className="text-lg font-medium">{messageTrait}</p>
      )}
      {/* toutes les cadences ont une échéance, mais seul le quotidien l'affiche ainsi ; les autres ont la pendule */}
      {enCours && partie.cadence.categorie === "quotidien" && partie.echeance && (
        <TempsPourJouer echeance={partie.echeance} />
      )}
      <p className="text-sm text-gray-500">{libelleCadence(partie.cadence)}</p>
      {!partie.couleur && <p className="text-sm text-gray-500">Vous regardez cette partie en spectateur.</p>}
      <BandeauJoueur
        joueur={partie[adversaire]}
        couleur={adversaire}
        trait={trait}
        materiel={materiel[adversaire]}
        enLigne={presence ? presence[adversaire] === "en_ligne" : undefined}
        echeance={enCours ? presence?.echeances[adversaire] : null}
        pendule={partie.pendule?.[adversaire]}
      />
      <Echiquier
        fen={fen}
        couleur={partie.couleur}
        theme={theme}
        onCoup={peutJouer ? jouer : undefined}
      />
      <BandeauJoueur
        joueur={partie[moi]}
        couleur={moi}
        trait={trait}
        materiel={materiel[moi]}
        enLigne={presence && !partie.couleur ? presence[moi] === "en_ligne" : undefined}
        echeance={enCours && !partie.couleur ? presence?.echeances[moi] : null}
        pendule={partie.pendule?.[moi]}
      />
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
      {children}
    </main>
  );
}

// Le résultat est donné du point de vue du joueur qui regarde la page
// (un spectateur, sans couleur, voit simplement quel camp a gagné).
function ResultatPartie({ partie, fin }: { partie: Partie; fin: Fin }) {
  let titre = "Nulle";
  if (fin.resultat !== "nulle") {
    if (!partie.couleur) titre = fin.resultat === "blanc" ? "Victoire des blancs" : "Victoire des noirs";
    else titre = fin.resultat === partie.couleur ? "Victoire" : "Défaite";
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
  enLigne,
  echeance,
  pendule,
}: {
  joueur: JoueurPartie | null;
  couleur: Couleur;
  trait: Couleur | null;
  materiel: Materiel;
  enLigne?: boolean;
  echeance?: number | null;
  pendule?: number;
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
          {enLigne !== undefined && (
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <span
                aria-hidden
                className={`inline-block size-2 rounded-full ${enLigne ? "bg-green-500" : "bg-gray-400"}`}
              />
              {enLigne ? "en ligne" : "hors ligne"}
            </span>
          )}
        </span>
        {enLigne === false && echeance && <CompteARebours echeance={echeance} />}
        <PiecesPrises prises={materiel.prises} avantage={materiel.avantage} />
      </div>
      <div className="flex items-center gap-3">
        {trait === couleur && <span className="text-sm text-gray-500">au trait</span>}
        {pendule !== undefined && <Pendule restant={pendule} tourne={trait === couleur} couleur={couleur} />}
      </div>
    </div>
  );
}

// « 18 h 42 min pour jouer » en quotidien. Calculé seulement dans le navigateur :
// le serveur et le navigateur n'ont pas la même heure, React refuserait deux rendus différents.
function TempsPourJouer({ echeance }: { echeance: string }) {
  const [heure, setHeure] = useState<number | null>(null);

  useEffect(() => {
    setHeure(Date.now()); // tout de suite, sans attendre les 30 premières secondes
    const minuterie = setInterval(() => setHeure(Date.now()), 30_000);
    return () => clearInterval(minuterie);
  }, []);

  if (heure === null) return null; // pendant le rendu serveur

  const reste = Date.parse(echeance) - heure;
  if (reste <= 0) return <p className="text-sm text-red-600">Temps écoulé</p>;

  // Arrondi à la minute supérieure : « 1 min » jusqu'à la dernière seconde, jamais « 0 min ».
  // Plafonné à 24 h : l'horloge du serveur, un peu en avance, donnerait sinon « 24 h 1 min » juste après un coup.
  const minutes = Math.min(Math.ceil(reste / 60_000), 24 * 60);

  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  const texte = h > 0 ? `${h} h ${min} min` : `${min} min`;
  return <p className="text-sm text-gray-500">{texte} pour jouer</p>;
}

function CompteARebours({ echeance }: { echeance: number }) {
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(minuterie);
  }, []);

  const secondes = Math.max(0, Math.ceil((echeance - maintenant) / 1000));
  const affichage = `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, "0")}`;

  return (
    <span role="timer" className="text-sm text-red-600">
      Déconnecté : <span className="font-mono">{affichage}</span> pour revenir, sinon défaite par abandon
    </span>
  );
}

// La pendule d'un joueur. restant est le temps mesuré par le serveur à l'envoi de l'état :
// on enlève le temps écoulé depuis sa réception, mesuré avec l'horloge locale. Une horloge
// décalée ne fausse donc rien, car seule la durée compte. Le premier rendu affiche restant tel quel,
// le même côté serveur et navigateur : pas d'erreur d'hydratation.
function Pendule({ restant, tourne, couleur }: { restant: number; tourne: boolean; couleur: Couleur }) {
  const [ecoule, setEcoule] = useState(0);

  // À chaque nouvel état (un coup, un retour sur la page), on repart de la nouvelle mesure.
  useEffect(() => {
    setEcoule(0);
    if (!tourne) return;
    const recuLe = Date.now();
    const minuterie = setInterval(() => setEcoule(Date.now() - recuLe), 100);
    return () => clearInterval(minuterie);
  }, [restant, tourne]);

  const ms = Math.max(0, restant - (tourne ? ecoule : 0));
  // Arrondi vers le bas : une pendule n'affiche jamais plus que ce qui reste.
  const secondes = Math.floor(ms / 1000);
  const mmss = `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, "0")}`;
  // sous 10 s, les dixièmes, pour voir la fin arriver
  const affichage = ms < 10_000 ? `${mmss}.${Math.floor((ms % 1000) / 100)}` : mmss;

  const couleurs = !tourne
    ? "bg-gray-100 text-gray-500"
    : ms < 20_000
      ? "bg-red-600 text-white"
      : "bg-gray-900 text-white";
  return (
    <span
      role="timer"
      aria-label={`Pendule des ${couleur === "blanc" ? "blancs" : "noirs"}`}
      className={`rounded px-3 py-1 font-mono text-xl tabular-nums ${couleurs}`}
    >
      {affichage}
    </span>
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

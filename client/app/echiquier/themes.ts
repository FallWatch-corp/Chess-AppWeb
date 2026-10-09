// Les thèmes de l'échiquier : juste la couleur des cases claires et foncées.
// Pour en ajouter un, il suffit d'ajouter une entrée ici.
export type Theme = {
  nom: string;
  caseClaire: string;
  caseFoncee: string;
};

export const THEMES = {
  bois: { nom: "Bois", caseClaire: "#f0d9b5", caseFoncee: "#b58863" },
  vert: { nom: "Vert", caseClaire: "#eeeed2", caseFoncee: "#769656" },
  bleu: { nom: "Bleu", caseClaire: "#dee3e6", caseFoncee: "#8ca2ad" },
  ardoise: { nom: "Ardoise", caseClaire: "#9ca3af", caseFoncee: "#4b5563" },
} satisfies Record<string, Theme>;

export type IdTheme = keyof typeof THEMES;

export const THEME_PAR_DEFAUT: IdTheme = "bois";

export function estIdTheme(valeur: unknown): valeur is IdTheme {
  return typeof valeur === "string" && Object.hasOwn(THEMES, valeur);
}

import { THEMES, type IdTheme } from "./themes";

type Props = {
  theme: IdTheme;
  onChange: (theme: IdTheme) => void;
};

// Une pastille par thème, avec ses deux couleurs de cases.
export function SelecteurTheme({ theme, onChange }: Props) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">Thème de l'échiquier</legend>
      {(Object.keys(THEMES) as IdTheme[]).map((id) => {
        const { nom, caseClaire, caseFoncee } = THEMES[id];
        const actif = id === theme;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={actif}
            className={`flex items-center gap-2 rounded border px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 ${
              actif ? "border-gray-900 dark:border-gray-100" : ""
            }`}
          >
            <span
              aria-hidden
              className="inline-block size-4 rounded-sm"
              style={{
                background: `linear-gradient(135deg, ${caseClaire} 50%, ${caseFoncee} 50%)`,
              }}
            />
            {nom}
          </button>
        );
      })}
    </fieldset>
  );
}

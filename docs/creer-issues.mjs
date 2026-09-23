#!/usr/bin/env node
/**
 * Crée les labels, les jalons (sprints) et les issues du backlog à partir de scripts/issues.json,
 * relie les dépendances (Blocked by) et génère docs/02-backlog.md avec les vrais numéros.
 *
 * Prérequis : Node 18+, GitHub CLI (`gh`) authentifié (`gh auth login`).
 *
 * Usage :
 *   node scripts/creer-issues.mjs --dry-run            # aperçu, rien n'est envoyé à GitHub
 *   node scripts/creer-issues.mjs                      # création réelle
 *   node scripts/creer-issues.mjs --repo compte/depot  # autre dépôt
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '..');

// --- Arguments ---------------------------------------------------------------
const argv = process.argv.slice(2);
const option = (nom, defaut) => {
  const i = argv.indexOf(nom);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : defaut;
};
const dryRun = argv.includes('--dry-run');
const repo = option('--repo', 'FallWatch-corp/Chess-AppWeb');
const backlogPath = path.resolve(option('--backlog', path.join(racine, 'docs', '02-backlog.md')));

const data = JSON.parse(readFileSync(path.join(ici, 'issues.json'), 'utf8'));

// --- gh ------------------------------------------------------------------------
function gh(args, { tolerant = false } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    if (tolerant) return null;
    throw new Error(`Échec : gh ${args.join(' ')}\n${e.stderr || e.message}`);
  }
}

if (!dryRun) {
  if (gh(['--version'], { tolerant: true }) === null) {
    console.error('GitHub CLI introuvable. Installation : https://github.com/cli/cli#installation');
    console.error('  Debian/Ubuntu : sudo apt install gh    Fedora : sudo dnf install gh');
    process.exit(1);
  }
  if (gh(['auth', 'status'], { tolerant: true }) === null) {
    console.error('Non authentifié. Lancer : gh auth login');
    process.exit(1);
  }
}

// --- Labels --------------------------------------------------------------------
for (const l of data.labels) {
  console.log(`Label ${l.name}`);
  if (!dryRun) {
    gh(['label', 'create', l.name, '--color', l.color, '--description', l.description, '--force', '-R', repo]);
  }
}

// --- Jalons (un par sprint) ------------------------------------------------------
const sprints = [...new Set(data.issues.map((i) => i.sprint).filter((s) => s !== '—'))].sort();
let existantes = [];
if (!dryRun) {
  const jalons = gh(['api', '--paginate', `repos/${repo}/milestones?state=all`, '--jq', '.[].title']).split('\n');
  for (const s of sprints) {
    const titre = `Sprint ${s}`;
    if (!jalons.includes(titre)) {
      console.log(`Jalon ${titre}`);
      gh(['api', `repos/${repo}/milestones`, '-f', `title=${titre}`]);
    }
  }
  existantes = JSON.parse(
    gh(['issue', 'list', '-R', repo, '--state', 'all', '--limit', '500', '--json', 'number,title']),
  );
}

// --- Issues --------------------------------------------------------------------
const numeros = {};
let prochainFictif = 1;
const dossierTmp = mkdtempSync(path.join(tmpdir(), 'issues-'));
const fichierCorps = path.join(dossierTmp, 'corps.md');

for (const i of data.issues) {
  const deps = i.deps.map((k) => numeros[k]);

  const lignes = [i.recit, '', `**${data.criteresLabel}**`, ...i.criteres.map((c) => `- ${c}`)];
  if (deps.length > 0) {
    lignes.push('', `*${data.dependLabel} ${deps.map((n) => `#${n}`).join(', ')}*`);
  }
  lignes.push(
    '',
    '---',
    `**Points** : ${i.points} — **Épique** : ${i.epique} — **Sprint** : ${i.sprint} — **MoSCoW** : ${i.moscow}`,
  );
  const corps = lignes.join('\n');

  const labels = deps.length > 0 ? [...i.labels, 'blocked'] : i.labels;
  const dejaLa = existantes.find((e) => e.title === i.titre);
  let n;

  if (dryRun) {
    n = prochainFictif++;
    console.log(`\n===== #${n} ${i.titre}  [${labels.join(', ')}]`);
    console.log(corps);
  } else if (dejaLa) {
    n = dejaLa.number;
    console.log(`#${n} existe déjà : ${i.titre}`);
  } else {
    writeFileSync(fichierCorps, corps, 'utf8');
    const args = ['issue', 'create', '-R', repo, '--title', i.titre, '--body-file', fichierCorps, '--label', labels.join(',')];
    if (i.sprint !== '—') args.push('--milestone', `Sprint ${i.sprint}`);
    const url = gh(args).split('\n').pop();
    n = Number(url.split('/').pop());
    console.log(`#${n} créée : ${i.titre}`);

    // Relation « Blocked by » native de GitHub
    for (const d of deps) {
      const id = gh(['api', `repos/${repo}/issues/${d}`, '--jq', '.id']);
      const ok = gh(['api', '-X', 'POST', `repos/${repo}/issues/${n}/dependencies/blocked_by`, '-F', `issue_id=${id}`], { tolerant: true });
      if (ok === null) console.warn(`  Attention : relation Blocked by #${d} -> #${n} non créée (à ajouter à la main).`);
    }
  }
  numeros[i.key] = n;
}
rmSync(dossierTmp, { recursive: true, force: true });

// --- docs/02-backlog.md ----------------------------------------------------------
const lien = (n) => `[#${n}](../../../issues/${n})`;
const md = ['# Backlog', '', '## Must', '', '| Issue | Titre | Épique | Points | Sprint |', '|---|---|---|---|---|'];
for (const i of data.issues.filter((x) => x.moscow === 'Must')) {
  md.push(`| ${lien(numeros[i.key])} | ${i.titre} | ${i.epique} | ${i.points} | ${i.sprint} |`);
}
md.push('', '## Should / Could', '', '| Issue | Titre | Épique | MoSCoW | Points | Sprint |', '|---|---|---|---|---|---|');
for (const i of data.issues.filter((x) => x.moscow !== 'Must')) {
  md.push(`| ${lien(numeros[i.key])} | ${i.titre} | ${i.epique} | ${i.moscow} | ${i.points} | ${i.sprint} |`);
}
md.push('', "## Won't (hors portée)", '', ...data.wont.map((w) => `- ${w}`));

md.push('', '## Points par sprint', '', '| Sprint | Points |', '|---|---|');
for (const s of [...sprints, '—']) {
  const total = data.issues.filter((i) => i.sprint === s).reduce((t, i) => t + i.points, 0);
  if (total > 0) md.push(`| ${s} | ${total} |`);
}

md.push('', '## Branches suggérées', '', '| Issue | Branche |', '|---|---|');
for (const i of data.issues) {
  const n = numeros[i.key];
  md.push(`| ${lien(n)} | \`${i.branche.replace('{n}', n)}\` |`);
}

mkdirSync(path.dirname(backlogPath), { recursive: true });
writeFileSync(backlogPath, md.join('\n') + '\n', 'utf8');
console.log(`\nBacklog écrit dans ${backlogPath}`);
if (dryRun) console.log("(dry-run : numéros fictifs, rien n'a été envoyé à GitHub)");

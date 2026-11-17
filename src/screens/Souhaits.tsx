import { Check, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Bouton } from '../components/Bouton';
import { coteDe, pluriel } from '../components/classeur/calculs';
import { LienBouton } from '../components/classeur/Controles';
import { useMemoireDefilement } from '../components/classeur/defilement';
import { AttenteDonnees } from '../components/classeur/EtatDonnees';
import { Eventail } from '../components/classeur/Eventail';
import { Ecran } from '../components/Ecran';
import { Feuille } from '../components/Feuille';
import { annoncer } from '../components/fiche/annonce';
import { numeroCarte } from '../components/fiche/outils';
import { Vide } from '../components/Vide';
import { Visuel } from '../components/Visuel';
import { imageCarte, prixCarte, prixScelle, useDonnees, variante, type Carte, type Donnees } from '../data/catalogue';
import { objetDe, type ObjetCatalogue } from '../data/valeur';
import { useSouhaits } from '../db/collection';
import { db, type Souhait } from '../db/schema';
import { euros } from '../lib/format';

interface LigneSouhaitDonnees {
  souhait: Souhait;
  objet: ObjetCatalogue | null;
  nom: string;
  cote: number | null;
  /** La cote est au prix max ou en dessous */
  sous: boolean;
}

function decrire(d: Donnees, s: Souhait): LigneSouhaitDonnees {
  const objet = objetDe(d, s.type, s.ref);
  const cote = !objet ? null : coteDe(objet.type === 'carte' ? prixCarte(d, objet.carte, s.variante) : prixScelle(d, objet.scelle));
  const nom = !objet ? 'Objet introuvable' : objet.type === 'carte' ? objet.carte.nom : objet.scelle.nom;
  return { souhait: s, objet, nom, cote, sous: cote != null && s.prixMax != null && cote <= s.prixMax };
}

/** Ce qu'on veut acheter : cote du jour, prix max facultatif, et signal quand la cote passe dessous. */
export function Souhaits() {
  const etat = useDonnees();
  const souhaits = useSouhaits();
  const [edition, setEdition] = useState<LigneSouhaitDonnees | null>(null);

  const d = etat.statut === 'pret' ? etat.donnees : null;
  const lignes = useMemo(() => {
    if (!d || !souhaits) return null;
    return souhaits
      .map((s) => decrire(d, s))
      .sort((a, b) => Number(b.sous) - Number(a.sous) || b.souhait.ajouteLe.localeCompare(a.souhait.ajouteLe));
  }, [d, souhaits]);
  useMemoireDefilement('souhaits', lignes != null);

  if (etat.statut !== 'pret' || !lignes) {
    return (
      <Ecran titre="Souhaits" retour>
        {etat.statut === 'pret' ? null : <AttenteDonnees etat={etat} forme="liste" />}
      </Ecran>
    );
  }

  const retirer = async (l: LigneSouhaitDonnees) => {
    const copie = l.souhait;
    if (copie.id == null) return;
    await db.souhaits.delete(copie.id);
    annoncer(`${l.nom} retiré des souhaits.`, {
      libelle: 'Annuler',
      faire: () => db.souhaits.put(copie),
    });
  };

  const sous = lignes.filter((l) => l.sous);
  const autres = lignes.filter((l) => !l.sous);
  // Un bloc blanc par groupe ; les premières lignes apparaissent en cascade
  const liste = (ls: LigneSouhaitDonnees[]) => (
    <ul className="bloc cascade -mx-1 px-4">
      {ls.map((l) => (
        <LigneSouhait key={l.souhait.id} ligne={l} onPrixMax={() => setEdition(l)} onRetirer={() => void retirer(l)} />
      ))}
    </ul>
  );
  const section = (id: string, titre: string, ls: LigneSouhaitDonnees[]) => (
    <section aria-labelledby={id} className="mt-6">
      <h2 id={id} className="flex items-baseline justify-between gap-3 px-1 pb-2.5">
        <span className="truncate text-lg leading-tight font-bold">{titre}</span>
        <span className="shrink-0 font-sans text-petit font-normal tracking-normal text-encre-2">{pluriel(ls.length, 'souhait')}</span>
      </h2>
      {liste(ls)}
    </section>
  );

  return (
    <Ecran titre="Souhaits" retour>
      {lignes.length === 0 ? (
        <Vide
          titre="Aucun souhait pour l’instant"
          texte="Sur la fiche d’une carte ou d’un scellé, touche le cœur : il apparaîtra ici avec sa cote du jour."
          action={
            <LienBouton href="/recherche" icone={<Search size={18} aria-hidden />}>
              Chercher une carte
            </LienBouton>
          }
        />
      ) : (
        <div className="pb-6">
          <ResumeSouhaits lignes={lignes} nbSous={sous.length} />
          {sous.length > 0 ? (
            <>
              {section('souhaits-sous', 'Sous ton prix max', sous)}
              {autres.length > 0 && section('souhaits-autres', 'Tes autres souhaits', autres)}
            </>
          ) : (
            <div className="mt-4">{liste(lignes)}</div>
          )}
        </div>
      )}

      <FeuillePrixMax ligne={edition} onFermer={() => setEdition(null)} />
    </Ecran>
  );
}

function nombreSous(n: number): string {
  return n > 1 ? `${n} sous ton prix max` : '1 sous ton prix max';
}

/** Bloc résumé : ce que coûteraient tous les souhaits à la cote du jour, combien passent sous le prix max. */
function ResumeSouhaits({ lignes, nbSous }: { lignes: LigneSouhaitDonnees[]; nbSous: number }) {
  let total = 0;
  let sansCote = 0;
  for (const l of lignes) {
    if (l.cote == null) sansCote++;
    else total += l.cote;
  }
  // Les cartes les plus chères de la liste, en éventail : ce qu'on a envie d'avoir
  const top = useMemo(
    () =>
      lignes
        .filter((l): l is LigneSouhaitDonnees & { objet: { type: 'carte'; carte: Carte } } => l.objet?.type === 'carte' && l.cote != null)
        .sort((a, b) => (b.cote ?? 0) - (a.cote ?? 0))
        .map((l) => l.objet.carte)
        // une même carte peut être souhaitée en deux versions
        .filter((c, i, t) => t.findIndex((x) => x.id === c.id) === i)
        .slice(0, 3),
    [lignes],
  );
  return (
    <section aria-label="Résumé" className="bloc -mx-1 mt-1 flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-petit text-encre-2">Tes souhaits à la cote du jour</p>
        <p className="font-titre chiffres mt-0.5 truncate text-[2.125rem] leading-[1.1] font-bold tracking-[-0.025em]">{euros(total)}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-petit text-encre-2">
          <span>{pluriel(lignes.length, 'souhait')}</span>
          {sansCote > 0 && <span className="text-encre-3">{sansCote > 1 ? `${sansCote} sans cote` : '1 sans cote'}</span>}
        </p>
        {nbSous > 0 && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-hausse-doux px-2 py-0.5 text-xs font-semibold text-hausse">
            <Check size={13} strokeWidth={3} aria-hidden />
            {nombreSous(nbSous)}
          </p>
        )}
      </div>
      <Eventail cartes={top} />
    </section>
  );
}

function LigneSouhait({ ligne, onPrixMax, onRetirer }: { ligne: LigneSouhaitDonnees; onPrixMax: () => void; onRetirer: () => void }) {
  const { souhait: s, objet, nom, cote, sous } = ligne;
  const href = !objet ? null : objet.type === 'carte' ? `/carte/${encodeURIComponent(objet.carte.id)}` : `/scelle/${encodeURIComponent(objet.scelle.ref)}`;
  const visuel = !objet ? (
    <Visuel src={null} alt={nom} repli="?" />
  ) : objet.type === 'carte' ? (
    <Visuel src={imageCarte(objet.carte)} alt={nom} repli={objet.carte.num} />
  ) : (
    <Visuel src={objet.scelle.image} alt={nom} forme="scelle" repli={objet.scelle.type ?? 'Scellé'} />
  );
  const ecart = cote != null && s.prixMax != null ? s.prixMax - cote : null;

  // Ligne de détail : extension et numéro (ou type), version visée
  let detail: ReactNode = 'Retiré du catalogue';
  if (objet?.type === 'carte') {
    const c = objet.carte;
    const v = s.variante ? variante(c, s.variante) : undefined;
    detail = (
      <>
        <span className="truncate">{c.ext.nom}</span>
        {/* « 025/165 », mais « DP01 » ou « 001 » (promos sans total imprimé) */}
        <span className="etroit shrink-0">{numeroCarte(c.num, c.ext.officiel)}</span>
        {v && v.cle !== c.variantes[0]?.cle && <span className="shrink-0">{v.libelle}</span>}
      </>
    );
  } else if (objet?.type === 'scelle') {
    detail = (
      <>
        {objet.scelle.type && <span className="shrink-0">{objet.scelle.type}</span>}
        {objet.scelle.ext && <span className="truncate">{objet.scelle.ext.nom}</span>}
      </>
    );
  }

  const titre = (
    <>
      <span className="line-clamp-2 text-corps leading-snug font-semibold">{nom}</span>
      <span className="mt-0.5 flex min-w-0 gap-x-2 text-xs text-encre-2">{detail}</span>
    </>
  );

  return (
    // filet entre les lignes, dans le bloc
    <li className="flex gap-3.5 border-t border-trait py-3.5 first:border-t-0">
      {href ? (
        <Link href={href} tabIndex={-1} aria-hidden className="appui w-14 shrink-0">
          {visuel}
        </Link>
      ) : (
        <div className="w-14 shrink-0">{visuel}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          {href ? (
            <Link href={href} className="block min-w-0 flex-1 active:opacity-70">
              {titre}
            </Link>
          ) : (
            <div className="min-w-0 flex-1">{titre}</div>
          )}
          <div className="shrink-0 text-right">
            <div className="font-titre chiffres text-lg leading-tight font-bold tracking-[-0.01em]">{euros(cote)}</div>
            <div className="text-micro text-encre-2">{cote == null ? 'pas de cote' : 'cote du jour'}</div>
          </div>
        </div>

        {sous && ecart != null ? (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-hausse-doux px-2 py-0.5 text-xs font-semibold text-hausse">
            <Check size={13} strokeWidth={3} aria-hidden />
            {ecart > 0.004 ? `${euros(ecart)} sous ton prix max` : 'Pile à ton prix max'}
          </p>
        ) : ecart != null ? (
          <p className="mt-2 text-xs text-encre-2">{euros(-ecart)} au-dessus de ton prix max</p>
        ) : null}

        <div className="mt-1 flex items-center justify-between gap-2">
          {objet ? (
            // 44 px pour le doigt, pilule de 34 px à l'œil
            <button
              type="button"
              onClick={onPrixMax}
              aria-label={s.prixMax != null ? `Modifier le prix max de ${nom}, ${euros(s.prixMax)}` : `Fixer un prix max pour ${nom}`}
              className="group appui -ml-0.5 flex min-h-11 min-w-0 items-center focus-visible:outline-none"
            >
              <span className="flex h-[34px] min-w-0 items-center gap-1.5 rounded-full bg-surface px-3 text-petit shadow-[inset_0_0_0_1px_var(--trait)] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-encre group-active:bg-surface-2">
                {s.prixMax != null ? (
                  <>
                    <span className="shrink-0 text-encre-2">Prix max</span>
                    <span className="chiffres truncate font-semibold">{euros(s.prixMax)}</span>
                    <Pencil size={13} strokeWidth={2.2} aria-hidden className="shrink-0 text-encre-2" />
                  </>
                ) : (
                  <>
                    <Plus size={15} strokeWidth={2.4} aria-hidden className="shrink-0" />
                    <span className="truncate font-semibold">Fixer un prix max</span>
                  </>
                )}
              </span>
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onRetirer}
            aria-label={`Retirer ${nom} des souhaits`}
            title="Retirer des souhaits"
            className="appui -mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-full text-encre-3 active:bg-surface-2 active:text-baisse"
          >
            <Trash2 size={19} aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

/** « 12,5 » ou « 12,50 € » → 12.5 ; vide → null ; sinon 'invalide'. */
function lirePrix(texte: string): number | null | 'invalide' {
  const t = texte.replace(/[\s €]/g, '').replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 && v < 1_000_000 ? Math.round(v * 100) / 100 : 'invalide';
}

function FeuillePrixMax({ ligne, onFermer }: { ligne: LigneSouhaitDonnees | null; onFermer: () => void }) {
  return (
    <Feuille ouverte={ligne != null} onFermer={onFermer} titre="Prix max">
      {ligne && <FormulairePrixMax key={ligne.souhait.id} ligne={ligne} onFini={onFermer} />}
    </Feuille>
  );
}

function FormulairePrixMax({ ligne, onFini }: { ligne: LigneSouhaitDonnees; onFini: () => void }) {
  const actuel = ligne.souhait.prixMax;
  const [texte, setTexte] = useState(actuel != null ? String(actuel).replace('.', ',') : '');
  const [erreur, setErreur] = useState<string | null>(null);
  const id = ligne.souhait.id;

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    const v = lirePrix(texte);
    if (v === 'invalide') {
      setErreur('Écris un prix en euros, par exemple 40 ou 12,50.');
      return;
    }
    if (id != null) await db.souhaits.update(id, { prixMax: v ?? undefined });
    onFini();
  };
  const effacer = async () => {
    if (id != null) await db.souhaits.update(id, { prixMax: undefined });
    onFini();
  };

  return (
    <form onSubmit={(e) => void enregistrer(e)} className="flex flex-col gap-4 pt-1">
      <p className="text-petit text-encre-2">
        <span className="font-semibold text-encre">{ligne.nom}</span>
        <br />
        Cote du jour : <span className="chiffres font-semibold text-encre">{euros(ligne.cote)}</span>
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-petit font-semibold">Le prix le plus haut que tu veux payer</span>
        <span className="relative flex items-center">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            autoFocus
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value);
              setErreur(null);
            }}
            placeholder="ex. 40"
            aria-invalid={erreur != null}
            aria-describedby="prix-max-aide"
            className="chiffres h-12 w-full rounded-xl bg-surface-2 pr-10 pl-3 text-encre shadow-[inset_0_0_0_1px_var(--trait)] placeholder:text-encre-3"
          />
          <span aria-hidden className="pointer-events-none absolute right-3 font-semibold text-encre-2">
            €
          </span>
        </span>
        <span id="prix-max-aide" className={`text-petit ${erreur ? 'font-semibold text-baisse' : 'text-encre-2'}`}>
          {erreur ?? 'La liste te signale quand la cote passe sous ce prix.'}
        </span>
      </label>
      <div className="flex flex-col gap-2">
        <Bouton type="submit" plein>
          Enregistrer le prix max
        </Bouton>
        {actuel != null && (
          <Bouton genre="discret" plein onClick={() => void effacer()}>
            Enlever le prix max
          </Bouton>
        )}
      </div>
    </form>
  );
}

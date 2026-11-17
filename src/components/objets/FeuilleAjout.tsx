// Feuille d'ajout d'une carte ou d'un scellé à la collection.
// API FIXE : utilisée par les fiches, la recherche, les autres écrans et le scanner.
// Cas courant en 3 taps au plus : ouvrir, (choisir la version), « Ajouter à ma collection ».
import { useEffect, useMemo, useState } from 'react';
import { imageCarte, prixScelle, prixVariante, useDonneesPretes, variante as varianteDe } from '../../data/catalogue';
import { valoriser, type ObjetCatalogue } from '../../data/valeur';
import { ajouterLot, dernierPrixAchat, retirer, useLotsDe, type NouveauLot } from '../../db/collection';
import { useReglages } from '../../db/reglages';
import type { Etat, Gradation } from '../../db/schema';
import { aujourdhui, euros } from '../../lib/format';
import { Bouton } from '../Bouton';
import { Feuille } from '../Feuille';
import { Visuel } from '../Visuel';
import { annoncer } from '../fiche/annonce';
import { DejaPossede } from '../fiche/Elements';
import { Champ, ChampMontant, ChoixEtat, Compteur, Erreur, PuceAction, Puces, Rubrique } from '../fiche/Formulaire';
import { CLASSE_CHAMP, formatSaisie, lireGradation, lireMontant, numeroCarte, useCleOuverture, type SaisieGradation } from '../fiche/outils';

interface Props {
  objet: ObjetCatalogue | null;
  ouverte: boolean;
  onFermer: () => void;
  /** Clé de la variante proposée au départ (fiche, scanner) */
  varianteInitiale?: string;
}

const refDe = (o: ObjetCatalogue) => (o.type === 'carte' ? o.carte.id : o.scelle.ref);

export function FeuilleAjout(props: Props) {
  // Formulaire neuf à chaque ouverture et à chaque nouvel objet (scanner en rafale).
  const cle = useCleOuverture(props.ouverte);
  return <FormulaireAjout key={`${cle}:${props.objet ? refDe(props.objet) : ''}`} {...props} />;
}

function FormulaireAjout({ objet, ouverte, onFermer, varianteInitiale }: Props) {
  const d = useDonneesPretes();
  const r = useReglages();
  const carte = objet?.type === 'carte' ? objet.carte : null;
  const scelle = objet?.type === 'scelle' ? objet.scelle : null;
  const ref = objet ? refDe(objet) : '';
  const lots = useLotsDe(objet?.type ?? 'carte', ref);
  const deja = lots?.reduce((s, l) => s + l.quantite, 0) ?? 0;

  const [cleVariante, setCleVariante] = useState<string | null>(() => (carte ? (varianteDe(carte, varianteInitiale)?.cle ?? null) : null));
  const [etatChoisi, setEtatChoisi] = useState<Etat | null>(null);
  const etat = etatChoisi ?? r.etatParDefaut;
  const [gradation, setGradation] = useState<SaisieGradation | null>(null);
  const [quantite, setQuantite] = useState(1);
  const [prix, setPrix] = useState('');
  const [dateAchat, setDateAchat] = useState(aujourdhui);
  const [lieu, setLieu] = useState('');
  const [note, setNote] = useState('');
  const [valeurPerso, setValeurPerso] = useState('');
  const [dernier, setDernier] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let vivant = true;
    void dernierPrixAchat().then((p) => vivant && setDernier(p));
    return () => {
      vivant = false;
    };
  }, []);

  // Cote de l'exemplaire tel qu'il est décrit (version + décote d'état si réglée) : ce que la collection affichera.
  const cote = useMemo(() => {
    if (!d || !objet) return null;
    if (objet.type === 'scelle') {
      const p = prixScelle(d, objet.scelle);
      return p?.tendance ?? p?.moy30 ?? null;
    }
    const v = valoriser(d, { type: 'carte', ref, variante: cleVariante ?? undefined, etat }, r).unitaire;
    return v == null ? null : Math.round(v * 100) / 100;
  }, [d, objet, ref, cleVariante, etat, r]);

  const options = useMemo(
    () =>
      carte && d
        ? carte.variantes.map((v) => {
            const p = prixVariante(d, v);
            return { id: v.cle, nom: v.libelle, detail: euros(p?.tendance ?? p?.moy30 ?? null) };
          })
        : [],
    [carte, d],
  );

  const prixLu = lireMontant(prix);
  const valeurLue = lireMontant(valeurPerso);

  const valider = async () => {
    if (!objet || enCours) return;
    if (prixLu === null) return setErreur('Le prix d’achat n’est pas un montant. Écris par exemple 12,40.');
    if (valeurLue === null) return setErreur('La valeur estimée n’est pas un montant. Écris par exemple 80 ou 79,90.');
    let g: Gradation | undefined;
    if (carte && gradation) {
      const lu = lireGradation(gradation);
      if ('erreur' in lu) return setErreur(lu.erreur);
      g = lu.gradation;
    }
    const lot: NouveauLot = { type: objet.type, ref, quantite, langue: 'fr' };
    if (carte) {
      if (cleVariante) lot.variante = cleVariante;
      if (g) lot.gradation = g;
      else lot.etat = etat;
    }
    if (prixLu !== undefined) lot.prixAchat = prixLu;
    if (dateAchat) lot.dateAchat = dateAchat;
    if (lieu.trim()) lot.lieu = lieu.trim();
    if (note.trim()) lot.note = note.trim();
    if (scelle && valeurLue !== undefined) lot.valeurManuelle = valeurLue;

    setErreur(null);
    setEnCours(true);
    try {
      const id = await ajouterLot(lot);
      navigator.vibrate?.(12);
      setEnCours(false);
      onFermer();
      const texte =
        quantite > 1
          ? `${quantite} exemplaires ajoutés à ta collection.`
          : carte
            ? 'Carte ajoutée à ta collection.'
            : 'Produit ajouté à ta collection.';
      annoncer(texte, { libelle: 'Annuler', faire: () => retirer(id, quantite) });
    } catch (e) {
      setEnCours(false);
      setErreur(`L’ajout n’a pas marché (${e instanceof Error ? e.message : String(e)}). Réessaie.`);
    }
  };

  const libelleBouton = enCours
    ? 'Ajout…'
    : deja > 0
      ? quantite > 1
        ? `Ajouter ${quantite} exemplaires`
        : 'Ajouter un exemplaire'
      : 'Ajouter à ma collection';

  return (
    <Feuille
      ouverte={ouverte && !!objet}
      onFermer={onFermer}
      titre={carte?.nom ?? scelle?.nom ?? 'Ajouter'}
      pied={
        <div>
          {erreur && <Erreur>{erreur}</Erreur>}
          <Bouton plein disabled={enCours || !objet} onClick={() => void valider()}>
            {libelleBouton}
          </Bouton>
        </div>
      }
    >
      {objet && (
        <>
          {/* Rappel de l'objet */}
          <div className="flex items-center gap-3">
            {carte ? (
              <Visuel src={imageCarte(carte)} alt="" className="w-11 shrink-0" repli={carte.num} />
            ) : (
              <Visuel src={scelle?.image} alt="" forme="scelle" className="w-12 shrink-0" repli="" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-petit text-encre-2">
                {carte ? (
                  <>
                    {carte.ext.nom} <span className="etroit chiffres">{numeroCarte(carte.num, carte.ext.officiel)}</span>
                  </>
                ) : (
                  [scelle?.type, scelle?.ext?.nom].filter(Boolean).join(', ')
                )}
              </p>
              {deja > 0 ? <DejaPossede quantite={deja} /> : <p className="text-petit text-encre-2">Pas encore dans ta collection</p>}
            </div>
          </div>

          {carte && options.length > 1 && (
            <Rubrique titre="Version">
              <Puces label="Version de la carte" options={options} valeur={cleVariante} onChange={setCleVariante} />
            </Rubrique>
          )}

          {carte && <ChoixEtat etat={etat} onEtat={setEtatChoisi} gradation={gradation} onGradation={setGradation} />}

          <div className="mt-5 grid grid-cols-[8.5rem_1fr] gap-3">
            <div>
              <span className="mb-1.5 block text-petit font-semibold" aria-hidden>
                Quantité
              </span>
              <Compteur valeur={quantite} onChange={setQuantite} />
            </div>
            <Champ label={quantite > 1 ? 'Prix d’achat à l’unité' : 'Prix d’achat'}>
              {(id) => <ChampMontant id={id} valeur={prix} onChange={setPrix} placeholder="facultatif" invalide={prixLu === null} />}
            </Champ>
          </div>
          {((cote != null && !gradation) || dernier != null) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {cote != null && !gradation && <PuceAction onClick={() => setPrix(formatSaisie(cote))}>Mettre la cote : {euros(cote)}</PuceAction>}
              {dernier != null && <PuceAction onClick={() => setPrix(formatSaisie(dernier))}>Dernier prix : {euros(dernier)}</PuceAction>}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Champ label="Date d’achat">
              {(id) => (
                <input id={id} type="date" value={dateAchat} max={aujourdhui()} onChange={(e) => setDateAchat(e.target.value)} className={`${CLASSE_CHAMP} chiffres`} />
              )}
            </Champ>
            <Champ label="Lieu (facultatif)">
              {(id) => (
                <input id={id} value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Boutique, Vinted…" autoComplete="off" enterKeyHint="next" className={CLASSE_CHAMP} />
              )}
            </Champ>
          </div>

          {scelle && (
            <Champ className="mt-5" label="Valeur estimée (facultatif)" aide="Remplace la cote Cardmarket pour ce produit dans ta collection.">
              {(id) => <ChampMontant id={id} valeur={valeurPerso} onChange={setValeurPerso} placeholder="cote Cardmarket" invalide={valeurLue === null} />}
            </Champ>
          )}

          <Champ className="mt-5" label="Note (facultatif)">
            {(id) => (
              <input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tirée d’un booster, échange…" autoComplete="off" enterKeyHint="done" className={CLASSE_CHAMP} />
            )}
          </Champ>
        </>
      )}
    </Feuille>
  );
}

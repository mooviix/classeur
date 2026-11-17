// Feuille « Modifier » d'un lot : version, état ou gradation, quantité, achat, valeur estimée ; suppression.
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { prixVariante, useDonneesPretes } from '../../data/catalogue';
import { valoriser, type ObjetCatalogue } from '../../data/valeur';
import { modifierLot, type NouveauLot } from '../../db/collection';
import { useReglages } from '../../db/reglages';
import { db, type Etat, type Gradation, type Possession } from '../../db/schema';
import { aujourdhui, euros } from '../../lib/format';
import { Bouton } from '../Bouton';
import { Feuille } from '../Feuille';
import { annoncer } from '../fiche/annonce';
import { Champ, ChampMontant, ChoixEtat, Compteur, Erreur, PuceAction, Puces, Rubrique } from '../fiche/Formulaire';
import {
  CLASSE_CHAMP,
  descriptionLot,
  erreurDate,
  formatSaisie,
  lireGradation,
  lireMontant,
  useCleOuverture,
  versSaisieGradation,
  type SaisieGradation,
} from '../fiche/outils';

interface Props {
  lot: Possession | null;
  objet: ObjetCatalogue | null;
  ouverte: boolean;
  onFermer: () => void;
}

export function FeuilleLot(props: Props) {
  const cle = useCleOuverture(props.ouverte);
  return <FormulaireLot key={`${cle}:${props.lot?.id ?? ''}`} {...props} />;
}

/** Remet un lot exactement comme avant (même id) : « Annuler » après une modification ou une suppression. */
function restaurer(lot: Possession) {
  return db.possessions.put(lot);
}

function FormulaireLot({ lot, objet, ouverte, onFermer }: Props) {
  const d = useDonneesPretes();
  const r = useReglages();
  const carte = objet?.type === 'carte' ? objet.carte : null;

  const [erreur, setErreur] = useState<string | null>(null);
  // Toute modification efface le message d'erreur de la tentative précédente (il est revérifié à l'envoi).
  const champ =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setErreur(null);
      set(v);
    };
  const [cleVariante, setCleVarianteBrut] = useState<string | null>(lot?.variante ?? carte?.variantes[0]?.cle ?? null);
  const setCleVariante = champ(setCleVarianteBrut);
  const [etat, setEtatBrut] = useState<Etat>(lot?.etat ?? r.etatParDefaut);
  const setEtat = champ(setEtatBrut);
  const [gradation, setGradationBrut] = useState<SaisieGradation | null>(lot?.gradation ? versSaisieGradation(lot.gradation) : null);
  const setGradation = champ(setGradationBrut);
  const [quantite, setQuantiteBrut] = useState(lot?.quantite ?? 1);
  const setQuantite = champ(setQuantiteBrut);
  const [prix, setPrixBrut] = useState(lot?.prixAchat != null ? formatSaisie(lot.prixAchat) : '');
  const setPrix = champ(setPrixBrut);
  const [dateAchat, setDateAchatBrut] = useState(lot?.dateAchat ?? '');
  const setDateAchat = champ(setDateAchatBrut);
  const [valeurPerso, setValeurPersoBrut] = useState(lot?.valeurManuelle != null ? formatSaisie(lot.valeurManuelle) : '');
  const setValeurPerso = champ(setValeurPersoBrut);
  const [lieu, setLieuBrut] = useState(lot?.lieu ?? '');
  const setLieu = champ(setLieuBrut);
  const [note, setNoteBrut] = useState(lot?.note ?? '');
  const setNote = champ(setNoteBrut);
  const [enCours, setEnCours] = useState(false);

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

  // Cote Cardmarket de l'exemplaire tel qu'il est décrit (sans la valeur estimée).
  const cote = useMemo(() => {
    if (!d || !lot) return null;
    const v = valoriser(d, { type: lot.type, ref: lot.ref, variante: cleVariante ?? undefined, etat, gradation: gradation ? { societe: '', note: '' } : undefined }, r).unitaire;
    return v == null ? null : Math.round(v * 100) / 100;
  }, [d, lot, cleVariante, etat, gradation, r]);

  const prixLu = lireMontant(prix);
  const valeurLue = lireMontant(valeurPerso);

  const enregistrer = async () => {
    if (!lot?.id || enCours) return;
    if (prixLu === null) return setErreur('Le prix d’achat n’est pas un montant. Écris par exemple 12,40, ou laisse vide.');
    if (valeurLue === null) return setErreur('La valeur estimée n’est pas un montant. Écris par exemple 80, ou laisse vide.');
    const dateKo = erreurDate(dateAchat, aujourdhui(), 'La date d’achat');
    if (dateKo) return setErreur(dateKo);
    let g: Gradation | undefined;
    if (carte && gradation) {
      const lu = lireGradation(gradation);
      if ('erreur' in lu) return setErreur(lu.erreur);
      g = lu.gradation;
    }
    // undefined = champ effacé : Dexie retire la propriété du lot.
    const changements: Partial<NouveauLot> = {
      quantite,
      prixAchat: prixLu,
      dateAchat: dateAchat || undefined,
      valeurManuelle: valeurLue,
      lieu: lieu.trim() || undefined,
      note: note.trim() || undefined,
    };
    if (carte) {
      changements.variante = cleVariante ?? undefined;
      changements.gradation = g;
      changements.etat = g ? undefined : etat;
    }
    setErreur(null);
    setEnCours(true);
    try {
      await modifierLot(lot.id, changements);
      onFermer();
      annoncer('Modifications enregistrées.', { libelle: 'Annuler', faire: () => restaurer(lot) });
    } catch (e) {
      setEnCours(false);
      setErreur(`Les modifications n’ont pas été enregistrées (${e instanceof Error ? e.message : String(e)}). Réessaie.`);
    }
  };

  const supprimer = async () => {
    if (!lot?.id || enCours) return;
    setEnCours(true);
    try {
      await db.possessions.delete(lot.id);
      navigator.vibrate?.(12);
      onFermer();
      annoncer(lot.quantite > 1 ? `${lot.quantite} exemplaires retirés de ta collection.` : 'Exemplaire retiré de ta collection.', {
        libelle: 'Annuler',
        faire: () => restaurer(lot),
      });
    } catch (e) {
      setEnCours(false);
      setErreur(`La suppression n’a pas marché (${e instanceof Error ? e.message : String(e)}). Réessaie.`);
    }
  };

  const nom = carte?.nom ?? (objet?.type === 'scelle' ? objet.scelle.nom : '');

  return (
    <Feuille
      ouverte={ouverte && !!lot}
      onFermer={onFermer}
      titre="Modifier"
      pied={
        <div>
          {erreur && <Erreur>{erreur}</Erreur>}
          <Bouton plein disabled={enCours} onClick={() => void enregistrer()}>
            Enregistrer les changements
          </Bouton>
        </div>
      }
    >
      {lot && (
        <>
          <div className="text-petit">
            <p className="truncate font-semibold">{nom}</p>
            <p className="text-encre-2">{descriptionLot(lot, objet)}</p>
          </div>

          {carte && options.length > 1 && (
            <Rubrique titre="Version">
              <Puces label="Version de la carte" options={options} valeur={cleVariante} onChange={setCleVariante} />
            </Rubrique>
          )}

          {carte && <ChoixEtat etat={etat} onEtat={setEtat} gradation={gradation} onGradation={setGradation} />}

          <div className="mt-5 grid grid-cols-[8.5rem_1fr] gap-3">
            <div>
              <span className="mb-1.5 block text-petit font-semibold" aria-hidden>
                Quantité
              </span>
              <Compteur valeur={quantite} onChange={setQuantite} />
            </div>
            <Champ label={quantite > 1 ? 'Prix d’achat à l’unité' : 'Prix d’achat'}>
              {(id) => <ChampMontant id={id} valeur={prix} onChange={setPrix} placeholder="inconnu" invalide={prixLu === null} />}
            </Champ>
          </div>
          {cote != null && !gradation && (
            <div className="mt-2 flex flex-wrap gap-2">
              <PuceAction onClick={() => setPrix(formatSaisie(cote))}>Mettre la cote : {euros(cote)}</PuceAction>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Champ label="Date d’achat">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={dateAchat}
                  max={aujourdhui()}
                  aria-invalid={erreurDate(dateAchat, aujourdhui(), '') != null || undefined}
                  onChange={(e) => setDateAchat(e.target.value)}
                  className={`${CLASSE_CHAMP} chiffres`}
                />
              )}
            </Champ>
            <Champ label="Lieu">
              {(id) => <input id={id} value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="facultatif" autoComplete="off" className={CLASSE_CHAMP} />}
            </Champ>
          </div>

          <Champ
            className="mt-5"
            label="Valeur estimée (facultatif)"
            aide={`Remplace la cote Cardmarket${cote != null ? ` (${euros(cote)})` : ''} pour ce lot. Laisse vide pour suivre la cote.`}
          >
            {(id) => <ChampMontant id={id} valeur={valeurPerso} onChange={setValeurPerso} placeholder="cote Cardmarket" invalide={valeurLue === null} />}
          </Champ>

          <Champ className="mt-5" label="Note">
            {(id) => <input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="facultatif" autoComplete="off" className={CLASSE_CHAMP} />}
          </Champ>

          <div className="mt-6 border-t border-trait pt-4">
            <Bouton genre="danger" plein disabled={enCours} onClick={() => void supprimer()} icone={<Trash2 size={18} aria-hidden />}>
              {lot.quantite > 1 ? `Retirer ces ${lot.quantite} exemplaires` : 'Retirer cet exemplaire'}
            </Bouton>
            <p className="mt-2 text-center text-micro text-encre-2">Sans vente : rien n’est compté dans tes bénéfices.</p>
          </div>
        </>
      )}
    </Feuille>
  );
}

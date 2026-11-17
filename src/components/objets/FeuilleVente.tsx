// Feuille « Vendre » : sortie d'exemplaires d'un lot contre de l'argent, avec le bénéfice estimé.
import { useState } from 'react';
import { useDonneesPretes } from '../../data/catalogue';
import { valoriser, type ObjetCatalogue } from '../../data/valeur';
import { vendre } from '../../db/collection';
import { useReglages } from '../../db/reglages';
import { db, type Possession } from '../../db/schema';
import { aujourdhui, euros, sens } from '../../lib/format';
import { Bouton } from '../Bouton';
import { Feuille } from '../Feuille';
import { Montant } from '../Montant';
import { annoncer } from '../fiche/annonce';
import { Champ, ChampMontant, Compteur, Erreur, PuceAction, Puces, Rubrique } from '../fiche/Formulaire';
import { CLASSE_CHAMP, descriptionLot, formatSaisie, lireMontant, PLATEFORMES, useCleOuverture } from '../fiche/outils';

interface Props {
  lot: Possession | null;
  objet: ObjetCatalogue | null;
  ouverte: boolean;
  onFermer: () => void;
}

export function FeuilleVente(props: Props) {
  const cle = useCleOuverture(props.ouverte);
  return <FormulaireVente key={`${cle}:${props.lot?.id ?? ''}`} {...props} />;
}

function FormulaireVente({ lot, objet, ouverte, onFermer }: Props) {
  const d = useDonneesPretes();
  const r = useReglages();
  const max = lot?.quantite ?? 1;
  const [quantite, setQuantite] = useState(1);
  const [prix, setPrix] = useState('');
  const [frais, setFrais] = useState('');
  const [date, setDate] = useState(aujourdhui);
  const [plateforme, setPlateforme] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const cote = d && lot ? valoriser(d, lot, r).unitaire : null;
  const coteArrondie = cote == null ? null : Math.round(cote * 100) / 100;
  const prixLu = lireMontant(prix);
  const fraisLu = lireMontant(frais);
  const fraisTotal = typeof fraisLu === 'number' ? fraisLu : 0;
  const recette = typeof prixLu === 'number' ? prixLu * quantite - fraisTotal : null;
  const benefice = typeof prixLu === 'number' && lot?.prixAchat != null ? (prixLu - lot.prixAchat) * quantite - fraisTotal : null;

  const valider = async () => {
    if (!lot?.id || enCours) return;
    if (prixLu === undefined) return setErreur('Indique le prix de vente d’un exemplaire.');
    if (prixLu === null) return setErreur('Le prix de vente n’est pas un montant. Écris par exemple 12,40.');
    if (fraisLu === null) return setErreur('Les frais ne sont pas un montant. Écris par exemple 1,50, ou laisse vide.');
    setErreur(null);
    setEnCours(true);
    try {
      const venteId = await vendre(lot.id, {
        quantite,
        prixVente: prixLu,
        ...(fraisLu !== undefined ? { frais: fraisLu } : {}),
        date: date || aujourdhui(),
        ...(plateforme ? { plateforme } : {}),
      });
      navigator.vibrate?.(12);
      onFermer();
      // « Annuler » remet le lot exactement comme avant (date, lieu, note compris) et efface la vente.
      const avant = { ...lot };
      annoncer(quantite > 1 ? `Vente de ${quantite} exemplaires enregistrée.` : 'Vente enregistrée.', {
        libelle: 'Annuler',
        faire: () =>
          db.transaction('rw', db.possessions, db.ventes, async () => {
            await db.ventes.delete(venteId);
            await db.possessions.put(avant);
          }),
      });
    } catch (e) {
      setEnCours(false);
      setErreur(`La vente n’a pas été enregistrée (${e instanceof Error ? e.message : String(e)}). Réessaie.`);
    }
  };

  const nom = objet?.type === 'carte' ? objet.carte.nom : objet?.type === 'scelle' ? objet.scelle.nom : '';

  return (
    <Feuille
      ouverte={ouverte && !!lot}
      onFermer={onFermer}
      titre="Vendre"
      pied={
        <div>
          {erreur && <Erreur>{erreur}</Erreur>}
          <Bouton plein disabled={enCours} onClick={() => void valider()}>
            {enCours ? 'Enregistrement…' : 'Enregistrer la vente'}
          </Bouton>
        </div>
      }
    >
      {lot && (
        <>
          <div className="text-petit">
            <p className="truncate font-semibold">{nom}</p>
            <p className="text-encre-2">
              {descriptionLot(lot, objet)}, <span className="chiffres">×{lot.quantite}</span> en collection
              {lot.prixAchat != null && (
                <>
                  , payé <Montant valeur={lot.prixAchat} className="chiffres" />
                  {lot.quantite > 1 ? ' l’unité' : ''}
                </>
              )}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-[8.5rem_1fr] gap-3">
            <div>
              <span className="mb-1.5 block text-petit font-semibold" aria-hidden>
                Quantité vendue
              </span>
              <Compteur valeur={quantite} onChange={setQuantite} max={max} label="Quantité vendue" />
            </div>
            <Champ label={quantite > 1 ? 'Prix à l’unité' : 'Prix de vente'}>
              {(id) => <ChampMontant id={id} valeur={prix} onChange={setPrix} invalide={prixLu === null} />}
            </Champ>
          </div>
          {coteArrondie != null && (
            <div className="mt-2 flex flex-wrap gap-2">
              <PuceAction onClick={() => setPrix(formatSaisie(coteArrondie))}>Mettre la cote : {euros(coteArrondie)}</PuceAction>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Champ label="Frais (facultatif)" aide="Port, commission : le total.">
              {(id) => <ChampMontant id={id} valeur={frais} onChange={setFrais} invalide={fraisLu === null} />}
            </Champ>
            <Champ label="Date de vente">
              {(id) => <input id={id} type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value)} className={`${CLASSE_CHAMP} chiffres`} />}
            </Champ>
          </div>

          <Rubrique titre="Vendu sur (facultatif)">
            <Puces label="Plateforme de vente" options={PLATEFORMES.map((p) => ({ id: p as string, nom: p }))} valeur={plateforme} onChange={(p) => setPlateforme(p === plateforme ? null : p)} />
          </Rubrique>

          <div className="mt-5 border-t border-trait pt-3">
            {benefice != null ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">Bénéfice estimé</span>
                <Montant
                  valeur={benefice}
                  signe
                  className={`chiffres text-titre font-bold ${sens(benefice) === 'hausse' ? 'text-hausse' : sens(benefice) === 'baisse' ? 'text-baisse' : ''}`}
                />
              </div>
            ) : recette != null ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">Tu reçois</span>
                  <Montant valeur={recette} className="chiffres text-titre font-bold" />
                </div>
                <p className="mt-1 text-micro text-encre-2">Pas de prix d’achat pour ce lot : le bénéfice ne peut pas être calculé.</p>
              </>
            ) : (
              <p className="text-petit text-encre-2">Le bénéfice estimé s’affiche dès que tu indiques le prix de vente.</p>
            )}
            {benefice != null && (
              <p className="mt-1 text-micro text-encre-2">
                (Prix de vente − prix d’achat) × {quantite}
                {fraisTotal > 0 ? ' − frais' : ''}
              </p>
            )}
          </div>
        </>
      )}
    </Feuille>
  );
}

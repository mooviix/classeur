// « Mes exemplaires » : une ligne par lot (version, état ou gradation, quantité, achat, cote, gain ou perte),
// avec modifier / vendre / retirer. Les feuilles de vente et de modification sont gérées ici.
import { HandCoins, Minus, Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useDonneesPretes } from '../../data/catalogue';
import { valoriser, type ObjetCatalogue } from '../../data/valeur';
import { retirer } from '../../db/collection';
import { useReglages } from '../../db/reglages';
import { db, type Possession } from '../../db/schema';
import { date as dateLongue, sens } from '../../lib/format';
import { Montant } from '../Montant';
import { annoncer } from '../fiche/annonce';
import { TitreSection } from '../fiche/Elements';
import { descriptionLot } from '../fiche/outils';
import { FeuilleLot } from './FeuilleLot';
import { FeuilleVente } from './FeuilleVente';

interface Props {
  objet: ObjetCatalogue;
  /** Les lots de cet objet (useLotsDe) */
  lots: Possession[];
}

export function ListeLots({ objet, lots }: Props) {
  const [action, setAction] = useState<{ mode: 'modifier' | 'vendre'; lot: Possession } | null>(null);
  const [ouverte, setOuverte] = useState(false);

  const total = lots.reduce((s, l) => s + l.quantite, 0);
  const ouvrir = (mode: 'modifier' | 'vendre', lot: Possession) => {
    setAction({ mode, lot });
    setOuverte(true);
  };
  const tries = [...lots].sort((a, b) => a.ajouteLe.localeCompare(b.ajouteLe));

  // Les feuilles restent montées (même place dans l'arbre) quand il n'y a plus de lot :
  // vendre ou retirer le dernier exemplaire ne doit pas les arracher en cours de route.
  return (
    <>
      {lots.length > 0 && (
        <section aria-label="Mes exemplaires">
          <TitreSection droite={<span className="chiffres">{total > 1 ? `${total} exemplaires` : '1 exemplaire'}</span>}>Mes exemplaires</TitreSection>
          <ul className="bloc divide-y divide-grille">
            {tries.map((lot) => (
              <LigneLot key={lot.id} lot={lot} objet={objet} onModifier={() => ouvrir('modifier', lot)} onVendre={() => ouvrir('vendre', lot)} />
            ))}
          </ul>
        </section>
      )}
      <FeuilleVente lot={action?.mode === 'vendre' ? action.lot : null} objet={objet} ouverte={ouverte && action?.mode === 'vendre'} onFermer={() => setOuverte(false)} />
      <FeuilleLot lot={action?.mode === 'modifier' ? action.lot : null} objet={objet} ouverte={ouverte && action?.mode === 'modifier'} onFermer={() => setOuverte(false)} />
    </>
  );
}

function LigneLot({ lot, objet, onModifier, onVendre }: { lot: Possession; objet: ObjetCatalogue; onModifier: () => void; onVendre: () => void }) {
  const d = useDonneesPretes();
  const r = useReglages();
  const v = d ? valoriser(d, lot, r) : null;
  const cote = v?.unitaire ?? null;
  const gain = cote != null && lot.prixAchat != null ? (cote - lot.prixAchat) * lot.quantite : null;
  const plusieurs = lot.quantite > 1;
  const s = sens(gain);

  // Pour un scellé, la date d'achat est déjà le titre de la ligne (voir descriptionLot).
  const details = [lot.dateAchat && objet.type === 'carte' ? `acheté le ${dateLongue(lot.dateAchat)}` : null, lot.lieu, lot.note].filter(Boolean).join(', ');

  const retirerUn = async () => {
    if (lot.id == null) return;
    const avant = { ...lot };
    await retirer(lot.id, 1);
    navigator.vibrate?.(8);
    annoncer('Un exemplaire retiré de ta collection.', { libelle: 'Annuler', faire: () => db.possessions.put(avant) });
  };

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="chiffres mt-px shrink-0 rounded-full bg-encre px-2 text-petit leading-5 font-bold text-pochette">×{lot.quantite}</span>
        <div className="min-w-0 flex-1">
          <p className="leading-snug font-semibold">{descriptionLot(lot, objet)}</p>
          {details && <p className="truncate text-[0.75rem] leading-4 text-encre-2">{details}</p>}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 px-3 py-2.5">
        <Valeur nom={plusieurs ? 'Achat à l’unité' : 'Prix d’achat'}>
          {lot.prixAchat != null ? <Montant valeur={lot.prixAchat} /> : <span className="font-normal text-encre-3">non indiqué</span>}
        </Valeur>
        <Valeur nom={v?.source === 'manuelle' ? (plusieurs ? 'Ta valeur (unité)' : 'Ta valeur') : plusieurs ? 'Cote à l’unité' : 'Cote'}>
          {cote != null ? <Montant valeur={cote} /> : <span className="font-normal text-encre-3">sans cote</span>}
        </Valeur>
        <Valeur nom={gain == null ? 'Gain' : s === 'baisse' ? (plusieurs ? 'Perte totale' : 'Perte') : plusieurs ? 'Gain total' : 'Gain'}>
          {gain == null ? (
            <span className="font-normal text-encre-3">—</span>
          ) : (
            <Montant valeur={gain} signe className={s === 'hausse' ? 'text-hausse' : s === 'baisse' ? 'text-baisse' : ''} />
          )}
        </Valeur>
      </dl>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <ActionLot onClick={onModifier} icone={<Pencil size={15} aria-hidden />}>
          Modifier
        </ActionLot>
        <ActionLot onClick={onVendre} icone={<HandCoins size={16} aria-hidden />}>
          Vendre
        </ActionLot>
        <ActionLot onClick={() => void retirerUn()} icone={<Minus size={16} aria-hidden />} discret>
          {plusieurs ? 'Retirer 1' : 'Retirer'}
        </ActionLot>
      </div>
    </li>
  );
}

function Valeur({ nom, children }: { nom: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.75rem] leading-4 text-encre-2">{nom}</dt>
      <dd className="chiffres mt-0.5 truncate text-petit font-semibold">{children}</dd>
    </div>
  );
}

function ActionLot({ onClick, icone, children, discret }: { onClick: () => void; icone: ReactNode; children: ReactNode; discret?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`appui inline-flex min-h-10 items-center gap-1.5 rounded-full border border-trait bg-surface px-3.5 text-petit font-semibold active:bg-surface-2 ${
        discret ? 'text-encre-2' : 'text-encre'
      }`}
    >
      {icone}
      {children}
    </button>
  );
}

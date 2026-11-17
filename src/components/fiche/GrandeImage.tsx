// Grande image de la fiche carte : le seul moment « expressif » de l'app.
// Glisser le doigt sur la carte fait courir un reflet holographique dessous (avec une très légère inclinaison) ;
// un tap ouvre le zoom plein écran. Si le téléphone demande moins d'animations : ni reflet ni inclinaison.
// touch-action: pan-y → un glisser vertical fait toujours défiler la page ; seul un départ horizontal anime le reflet.
import { useRef, useState, type CSSProperties } from 'react';
import { useMoinsDAnimations } from './outils';

// Reflet blanc sous le doigt (lumière) et fines bandes irisées faites des seules couleurs-jetons,
// limitées à une zone autour du doigt. Réglages choisis à l'œil : visible sans délaver la carte.
const ECLAT: CSSProperties = {
  backgroundImage:
    'radial-gradient(circle at var(--hx) var(--hy), rgb(255 255 255 / 0.5) 0%, rgb(255 255 255 / 0.15) 22%, rgb(255 255 255 / 0) 45%)',
  mixBlendMode: 'overlay',
};
const MASQUE = 'radial-gradient(circle at var(--hx) var(--hy), #000 0%, rgb(0 0 0 / 0.6) 25%, rgb(0 0 0 / 0.15) 45%, transparent 62%)';
const IRISE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(118deg, var(--baisse) 0%, var(--serie-2) 2.5%, var(--hausse) 5%, var(--dos) 7.5%, var(--baisse) 10%)',
  backgroundSize: '200% 200%',
  backgroundPosition: 'var(--hx) var(--hy)',
  mixBlendMode: 'hard-light',
  maskImage: MASQUE,
  WebkitMaskImage: MASQUE,
};

interface Props {
  /** Image haute définition (fiche) */
  haute: string | null;
  /** Image basse définition, souvent déjà en cache : affichée en attendant la haute */
  basse: string | null;
  alt: string;
  /** Texte montré dans la pochette s'il n'y a aucune image */
  repli: string;
  onZoom: () => void;
  className?: string;
}

export function GrandeImage({ haute, basse, alt, repli, onZoom, className = '' }: Props) {
  const reduit = useMoinsDAnimations();
  const zone = useRef<HTMLButtonElement>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const geste = useRef<{ id: number; x: number; y: number; glisse: boolean } | null>(null);
  const aGlisse = useRef(false);
  const trame = useRef(0);
  const [haut, setHaut] = useState<'attente' | 'ok' | 'erreur'>(haute ? 'attente' : 'erreur');
  const [basseKo, setBasseKo] = useState(!basse);

  const poser = (x: number, y: number) => {
    cancelAnimationFrame(trame.current);
    trame.current = requestAnimationFrame(() => {
      const el = cadre.current;
      const z = zone.current;
      if (!el || !z) return;
      const r = z.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (x - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (y - r.top) / r.height));
      el.style.setProperty('--hx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--hy', `${(py * 100).toFixed(1)}%`);
      el.style.transform = `perspective(1000px) rotateY(${((px - 0.5) * 8).toFixed(2)}deg) rotateX(${((0.5 - py) * 8).toFixed(2)}deg)`;
      el.dataset.reflet = '1';
    });
  };

  const finir = () => {
    geste.current = null;
    cancelAnimationFrame(trame.current);
    const el = cadre.current;
    if (!el) return;
    el.style.transform = '';
    el.dataset.reflet = '0';
  };

  const aucuneImage = haut === 'erreur' && basseKo;

  return (
    <button
      ref={zone}
      type="button"
      data-holo
      aria-label={`${alt} : voir en grand`}
      onPointerDown={(e) => {
        aGlisse.current = false;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        geste.current = { id: e.pointerId, x: e.clientX, y: e.clientY, glisse: false };
      }}
      onPointerMove={(e) => {
        const g = geste.current;
        if (!g || g.id !== e.pointerId) return;
        if (!g.glisse) {
          if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 8) return;
          g.glisse = true;
          aGlisse.current = true;
          if (reduit) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // pointeur déjà relâché : rien à capturer
          }
        }
        if (!reduit) poser(e.clientX, e.clientY);
      }}
      onPointerUp={finir}
      onPointerCancel={finir}
      onLostPointerCapture={finir}
      onClick={() => {
        if (aGlisse.current) {
          aGlisse.current = false;
          return;
        }
        onZoom();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: 'pan-y' }}
      className={`block select-none [-webkit-touch-callout:none] ${className}`}
    >
      <div
        ref={cadre}
        data-reflet="0"
        className="group relative transition-transform duration-500 ease-out will-change-transform data-[reflet=1]:duration-75"
        style={{ '--hx': '50%', '--hy': '50%' } as CSSProperties}
      >
        <div className="pochette format-carte coins-carte relative overflow-hidden">
          {haut !== 'ok' && !basseKo && basse && (
            <img src={basse} alt="" aria-hidden draggable={false} onError={() => setBasseKo(true)} className="absolute inset-0 size-full object-cover" />
          )}
          {haute && haut !== 'erreur' && (
            <img
              src={haute}
              alt={alt}
              draggable={false}
              fetchPriority="high"
              onLoad={() => setHaut('ok')}
              onError={() => setHaut('erreur')}
              className={`absolute inset-0 size-full object-cover transition-opacity duration-200 ${haut === 'ok' ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
          {aucuneImage && (
            <span role="img" aria-label={alt} className="absolute inset-0 flex items-center justify-center p-3 text-center text-petit font-semibold text-encre-3">
              {repli}
            </span>
          )}
          {!reduit && !aucuneImage && (
            <>
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-data-[reflet=1]:opacity-30" style={IRISE} />
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-data-[reflet=1]:opacity-100" style={ECLAT} />
            </>
          )}
          {/* reflet fixe de la pochette plastique, comme les vignettes */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgb(255_255_255/0.16)_0%,rgb(255_255_255/0)_38%)]" />
        </div>
      </div>
    </button>
  );
}

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** Image en plein écran (tap n'importe où, Échap ou ✕ pour fermer). Le pincement du navigateur reste possible. */
export function Zoom({ src, alt, ouvert, onFermer, forme = 'carte' }: { src: string | null; alt: string; ouvert: boolean; onFermer: () => void; forme?: 'carte' | 'scelle' }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    if (!ouvert && d.open) d.close();
  }, [ouvert]);

  return (
    <dialog
      ref={ref}
      onClose={onFermer}
      onClick={onFermer}
      aria-label={`${alt}, en grand`}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-pochette/97 p-0 text-encre backdrop:bg-transparent"
    >
      {ouvert && src && (
        <div className="pt-sur pb-sur flex size-full items-center justify-center">
          <img
            src={src}
            alt={alt}
            draggable={false}
            className={`max-h-[calc(100%-5rem)] max-w-[calc(100%-1.5rem)] object-contain ${forme === 'carte' ? 'coins-carte shadow-[0_18px_50px_-20px_rgb(0_0_0/0.6)]' : 'rounded-pochette'}`}
          />
        </div>
      )}
      <button
        type="button"
        autoFocus
        aria-label="Fermer l’image"
        onClick={onFermer}
        className="absolute top-[calc(env(safe-area-inset-top)+0.5rem)] right-3 flex size-11 items-center justify-center rounded-full bg-surface text-encre shadow-[inset_0_0_0_1px_var(--trait)]"
      >
        <X size={22} aria-hidden />
      </button>
    </dialog>
  );
}

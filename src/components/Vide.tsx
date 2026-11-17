import type { ReactNode } from 'react';

/** État vide : dit quoi faire, pas comment on se sent. */
export function Vide({ titre, texte, action }: { titre: string; texte?: ReactNode; action?: ReactNode }) {
  return (
    <div className="pochette mx-auto my-6 flex max-w-sm flex-col items-center gap-2 px-6 py-8 text-center">
      <p className="font-semibold">{titre}</p>
      {texte && <p className="text-petit text-encre-2">{texte}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

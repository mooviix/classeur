import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Genre = 'principal' | 'secondaire' | 'discret' | 'danger';

const STYLES: Record<Genre, string> = {
  principal: 'bg-dos text-sur-dos active:brightness-95',
  secondaire: 'bg-surface text-encre border border-trait active:bg-surface-2',
  discret: 'text-dos active:bg-dos-doux',
  danger: 'bg-baisse-doux text-baisse active:brightness-95',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  genre?: Genre;
  plein?: boolean;
  icone?: ReactNode;
}

export function Bouton({ genre = 'principal', plein, icone, className = '', children, type = 'button', ...reste }: Props) {
  return (
    <button
      type={type}
      className={`appui inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] px-4 font-semibold transition-[filter,background-color,transform] disabled:opacity-45 ${
        STYLES[genre]
      } ${plein ? 'w-full' : ''} ${className}`}
      {...reste}
    >
      {icone}
      {children}
    </button>
  );
}

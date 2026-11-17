// Formats français : 1 284,50 €, +2,6 %, 13 nov. 2026.

const fmtEuros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtEurosRond = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtPourcent = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateCourte = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtNombre = new Intl.NumberFormat('fr-FR');

const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** « 1 284,50 € », ou « — » si pas de prix. Au-delà de 10 000 €, sans centimes. */
export function euros(v: number | null | undefined): string {
  if (!estNombre(v)) return '—';
  return Math.abs(v) >= 10_000 ? fmtEurosRond.format(v) : fmtEuros.format(v);
}

/** « +12,40 € » / « −3,10 € » (signe toujours affiché). */
export function eurosSigne(v: number | null | undefined): string {
  if (!estNombre(v)) return '—';
  if (v === 0) return euros(0);
  return (v > 0 ? '+' : '−') + euros(Math.abs(v));
}

/** Variation relative : 0.026 → « +2,6 % ». */
export function pourcent(ratio: number | null | undefined): string {
  if (!estNombre(ratio)) return '—';
  return fmtPourcent.format(ratio).replace('-', '−');
}

/** Variation entre deux valeurs, en ratio (null si incalculable). */
export function variation(avant: number | null | undefined, apres: number | null | undefined): number | null {
  if (!estNombre(avant) || !estNombre(apres) || avant <= 0) return null;
  return (apres - avant) / avant;
}

export function nombre(v: number): string {
  return fmtNombre.format(v);
}

/** 'YYYY-MM-DD' ou ISO → « 13 nov. 2026 ». */
export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : fmtDate.format(d);
}

export function dateCourte(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : fmtDateCourte.format(d);
}

/** Date du jour au format 'YYYY-MM-DD' (heure locale). */
export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sens d'une variation pour choisir la couleur. */
export function sens(v: number | null | undefined): 'hausse' | 'baisse' | 'stable' {
  if (!estNombre(v) || Math.abs(v) < 1e-9) return 'stable';
  return v > 0 ? 'hausse' : 'baisse';
}

/** Recherche tolérante : minuscules, sans accents, espaces normalisés. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim();
}

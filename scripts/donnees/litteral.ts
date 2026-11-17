// Lecture TEXTUELLE des fichiers TypeScript du dépôt tcgdex/cards-database : on analyse le littéral objet
// (`const card: Card = { … }`) comme des données, sans jamais exécuter ni importer ce code.
// Grammaire acceptée : objets, tableaux, chaînes '…' "…" `…` (sans ${}), nombres, true/false/null/undefined,
// identifiants (renvoyés comme { $ident: 'nom' }), commentaires, virgules finales, concaténation 'a' + 'b'.

export type Valeur = string | number | boolean | null | undefined | Valeur[] | { [cle: string]: Valeur };

export interface Identifiant {
  $ident: string;
}

export class ErreurLecture extends Error {}

class Lecteur {
  readonly s: string;
  i: number;
  constructor(s: string, i: number) {
    this.s = s;
    this.i = i;
  }

  erreur(msg: string): never {
    const ligne = this.s.slice(0, this.i).split('\n').length;
    throw new ErreurLecture(`${msg} (ligne ${ligne})`);
  }

  blancs(): void {
    const s = this.s;
    for (;;) {
      const c = s.charCodeAt(this.i);
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xfeff || c === 0xa0) this.i++;
      else if (c === 47 && s.charCodeAt(this.i + 1) === 47) {
        const fin = s.indexOf('\n', this.i);
        this.i = fin < 0 ? s.length : fin + 1;
      } else if (c === 47 && s.charCodeAt(this.i + 1) === 42) {
        const fin = s.indexOf('*/', this.i + 2);
        if (fin < 0) this.erreur('commentaire non fermé');
        this.i = fin + 2;
      } else return;
    }
  }

  valeur(): Valeur {
    this.blancs();
    let v = this.valeurSimple();
    // Concaténation de chaînes et « as const » / « as Type »
    for (;;) {
      this.blancs();
      if (this.s[this.i] === '+' && typeof v === 'string') {
        this.i++;
        const suite = this.valeurSimple();
        if (typeof suite !== 'string') this.erreur('concaténation non textuelle');
        v += suite;
      } else if (/^as\b/.test(this.s.slice(this.i, this.i + 3))) {
        this.i += 2;
        this.blancs();
        this.identifiant();
      } else return v;
    }
  }

  valeurSimple(): Valeur {
    this.blancs();
    const c = this.s[this.i];
    if (c === '{') return this.objet();
    if (c === '[') return this.tableau();
    if (c === '"' || c === "'") return this.chaine(c);
    if (c === '`') return this.gabarit();
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) return this.nombre();
    const id = this.identifiant();
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'null') return null;
    if (id === 'undefined') return undefined;
    // Identifiant, éventuellement suivi d'un accès membre (Set.id) : on le garde comme marqueur.
    let nom = id;
    while (this.s[this.i] === '.' && /[A-Za-z_$]/.test(this.s[this.i + 1] ?? '')) {
      this.i++;
      nom += `.${this.identifiant()}`;
    }
    return { $ident: nom } as unknown as Valeur;
  }

  identifiant(): string {
    const m = /^[A-Za-z_$][\w$]*/.exec(this.s.slice(this.i, this.i + 200));
    if (!m) this.erreur(`caractère inattendu « ${this.s[this.i] ?? 'fin'} »`);
    this.i += m[0].length;
    return m[0];
  }

  nombre(): number {
    const m = /^[+-]?(?:0x[0-9a-f]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:e[+-]?\d+)?)/i.exec(this.s.slice(this.i, this.i + 64));
    if (!m) this.erreur('nombre invalide');
    this.i += m[0].length;
    const n = Number(m[0].replace(/_/g, ''));
    if (Number.isNaN(n)) this.erreur(`nombre invalide ${m[0]}`);
    return n;
  }

  chaine(q: string): string {
    const s = this.s;
    let r = '';
    this.i++;
    for (;;) {
      const c = s[this.i];
      if (c === undefined) this.erreur('chaîne non fermée');
      if (c === q) {
        this.i++;
        return r;
      }
      if (c === '\\') {
        r += this.echappement();
        continue;
      }
      if (c === '\n' && q !== '`') this.erreur('retour à la ligne dans une chaîne');
      r += c;
      this.i++;
    }
  }

  echappement(): string {
    const s = this.s;
    const c = s[this.i + 1];
    this.i += 2;
    switch (c) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'v':
        return '\v';
      case '0':
        return '\0';
      case '\n':
        return '';
      case '\r':
        if (s[this.i] === '\n') this.i++;
        return '';
      case 'x': {
        const h = s.slice(this.i, this.i + 2);
        this.i += 2;
        return String.fromCharCode(parseInt(h, 16));
      }
      case 'u': {
        if (s[this.i] === '{') {
          const fin = s.indexOf('}', this.i);
          const h = s.slice(this.i + 1, fin);
          this.i = fin + 1;
          return String.fromCodePoint(parseInt(h, 16));
        }
        const h = s.slice(this.i, this.i + 4);
        this.i += 4;
        return String.fromCharCode(parseInt(h, 16));
      }
      default:
        return c ?? '';
    }
  }

  gabarit(): string {
    const debut = this.i;
    const r = this.chaine('`');
    if (this.s.slice(debut, this.i).includes('${')) this.erreur('gabarit avec expression');
    return r;
  }

  objet(): { [cle: string]: Valeur } {
    const o: { [cle: string]: Valeur } = {};
    this.i++; // {
    for (;;) {
      this.blancs();
      const c = this.s[this.i];
      if (c === '}') {
        this.i++;
        return o;
      }
      if (this.s.startsWith('...', this.i)) {
        this.i += 3;
        this.valeur(); // propagation : ignorée
      } else {
        let cle: string;
        if (c === '"' || c === "'") cle = this.chaine(c);
        else if (c >= '0' && c <= '9') cle = String(this.nombre());
        else if (c === '[') this.erreur('clé calculée');
        else cle = this.identifiant();
        this.blancs();
        if (this.s[this.i] === ':') {
          this.i++;
          o[cle] = this.valeur();
        } else if (this.s[this.i] === ',' || this.s[this.i] === '}') {
          o[cle] = { $ident: cle } as unknown as Valeur; // raccourci { set }
        } else this.erreur(`« : » attendu après ${cle}`);
      }
      this.blancs();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== '}') this.erreur('« , » ou « } » attendu');
    }
  }

  tableau(): Valeur[] {
    const t: Valeur[] = [];
    this.i++; // [
    for (;;) {
      this.blancs();
      if (this.s[this.i] === ']') {
        this.i++;
        return t;
      }
      t.push(this.valeur());
      this.blancs();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== ']') this.erreur('« , » ou « ] » attendu');
    }
  }
}

/**
 * Trouve `const xxx: <Type> = {` dans le texte et lit l'objet qui suit.
 * Lève ErreurLecture si le motif est absent ou si l'objet sort de la grammaire acceptée.
 */
export function lireObjetDeclare(texte: string, type: 'Card' | 'Set' | 'Serie'): { [cle: string]: Valeur } {
  const re = new RegExp(`(?:const|let|var)\\s+[\\w$]+\\s*:\\s*${type}\\s*=\\s*\\{`);
  const m = re.exec(texte);
  if (!m) throw new ErreurLecture(`déclaration « : ${type} = { » introuvable`);
  const l = new Lecteur(texte, m.index + m[0].length - 1);
  return l.objet();
}

export function estIdentifiant(v: unknown): v is Identifiant {
  return typeof v === 'object' && v !== null && typeof (v as Identifiant).$ident === 'string';
}

export const enTexte = (v: Valeur | undefined): string | undefined => (typeof v === 'string' ? v : undefined);
export const enNombre = (v: Valeur | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const enObjet = (v: Valeur | undefined): { [cle: string]: Valeur } | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !estIdentifiant(v) ? v : undefined;

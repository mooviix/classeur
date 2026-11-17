// Vérification réelle des images publiées (requête HEAD), avec un cache disque : .cache/verifications.json.
//   - une URL présente (200) n'est plus jamais revérifiée ;
//   - une URL absente (403, 404, 410…) est retestée au plus une fois par semaine ;
//   - une erreur passagère (réseau, 429, 5xx) n'est pas mémorisée : le verdict reste « inconnu » et l'appelant garde
//     l'avis de la source (champ de l'API TCGdex, correspondance trouvée…).
// Les requêtes passent par http.ts : au plus 4 par seconde et par hôte (0,8 s entre deux requêtes vers Poképédia).
import { join } from 'node:path';
import { CACHE, ecrireJson, journal, lireJson } from './commun.ts';
import { ErreurHttp, requete } from './http.ts';

const FICHIER = join(CACHE, 'verifications.json');
/** Une URL absente est retestée après 7 jours. */
const REESSAI_ABSENTE_MS = 7 * 24 * 3600 * 1000;

export interface Verdict {
  /** true = image servie (200), false = absente */
  ok: boolean;
  /** date de la vérification (ISO) */
  le: string;
  /** empreinte et taille renvoyées par le serveur (détection des images génériques) */
  etag?: string;
  taille?: number;
}

export class Verificateur {
  private readonly cache: Record<string, Verdict>;
  private readonly enCours = new Map<string, Promise<boolean | null>>();
  private modifie = false;
  readonly stats = { requetes: 0, presentes: 0, absentes: 0, erreurs: 0 };
  /** false : seulement le cache (aucune requête), par exemple avec --sans-images. */
  readonly reseau: boolean;

  constructor(reseau: boolean) {
    this.reseau = reseau;
    const brut = lireJson<Record<string, Verdict>>(FICHIER);
    this.cache = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  }

  /** Verdict encore valable (présente : toujours ; absente : moins de 7 jours), sinon undefined. */
  connu(url: string): Verdict | undefined {
    const v = this.cache[url];
    if (!v || typeof v.ok !== 'boolean') return undefined;
    if (v.ok) return v;
    return Date.now() - Date.parse(v.le) < REESSAI_ABSENTE_MS ? v : undefined;
  }

  /** Dernier verdict connu, même périmé (pour les statistiques et l'empreinte des images). */
  info(url: string): Verdict | undefined {
    return this.cache[url];
  }

  /**
   * true = présente, false = absente, null = inconnue (pas de réseau autorisé, ou erreur passagère).
   * `reseau` permet de limiter les requêtes à une partie des URL (le reste ne lit que le cache).
   */
  async verifier(url: string, reseau = this.reseau): Promise<boolean | null> {
    const v = this.connu(url);
    if (v) return v.ok;
    if (!reseau) {
      // Absente il y a plus de 7 jours et pas de requête permise : on s'en tient au dernier verdict.
      const ancien = this.cache[url];
      return ancien && typeof ancien.ok === 'boolean' ? ancien.ok : null;
    }
    let p = this.enCours.get(url);
    if (!p) {
      p = this.tester(url).finally(() => this.enCours.delete(url));
      this.enCours.set(url, p);
    }
    return p;
  }

  /**
   * Vérifie une liste d'URL : les hôtes différents avancent en parallèle, et 3 requêtes au plus sont en cours par hôte
   * (l'espacement de http.ts garantit toujours 4 requêtes par seconde au plus).
   */
  async verifierTout(urls: Iterable<string>, reseau = this.reseau): Promise<void> {
    const parHote = new Map<string, string[]>();
    for (const u of new Set(urls)) {
      if (this.connu(u)) continue;
      const h = new URL(u).hostname;
      let l = parHote.get(h);
      if (!l) parHote.set(h, (l = []));
      l.push(u);
    }
    await Promise.all(
      [...parHote.values()].flatMap((l) => {
        let i = 0;
        const ouvrier = async () => {
          while (i < l.length) await this.verifier(l[i++], reseau);
        };
        return [ouvrier(), ouvrier(), ouvrier()];
      }),
    );
  }

  private async tester(url: string): Promise<boolean | null> {
    this.stats.requetes++;
    if (this.stats.requetes % 500 === 0) journal(`Vérification des images : ${this.stats.requetes} requêtes…`);
    try {
      const rep = await requete(url, { methode: 'HEAD', essais: 3, delaiMaxMs: 30_000 });
      await rep.body?.cancel();
      const type = rep.headers.get('content-type') ?? '';
      const taille = Number(rep.headers.get('content-length') ?? NaN);
      // Une page HTML servie en 200 (page d'erreur) ou un fichier vide ne sont pas des images.
      const ok = rep.status === 200 && !/^text\/html/i.test(type) && taille !== 0;
      const verdict: Verdict = { ok, le: new Date().toISOString() };
      const etag = rep.headers.get('etag');
      if (ok && etag) verdict.etag = etag.replace(/^W\//, '').replace(/"/g, '');
      if (ok && Number.isFinite(taille)) verdict.taille = taille;
      this.noter(url, verdict);
      return ok;
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut >= 400 && e.statut < 500 && e.statut !== 408 && e.statut !== 429) {
        this.noter(url, { ok: false, le: new Date().toISOString() });
        return false;
      }
      this.stats.erreurs++;
      return null;
    }
  }

  private noter(url: string, v: Verdict): void {
    this.cache[url] = v;
    this.modifie = true;
    if (v.ok) this.stats.presentes++;
    else this.stats.absentes++;
    // Sauvegarde régulière : un passage interrompu ne perd pas tout.
    if ((this.stats.presentes + this.stats.absentes) % 250 === 0) this.sauver();
  }

  sauver(): void {
    if (!this.modifie) return;
    ecrireJson(FICHIER, this.cache);
    this.modifie = false;
  }
}

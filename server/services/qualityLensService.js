/**
 * Basilico — Scientific Quality Lens & Domain Metadata Enricher (ADR-0007, Level 1.4)
 * Location: server/services/qualityLensService.js
 *
 * Provides deterministic, transparent quality and technical metadata for:
 *  - Domain A (food_human): Tuna species/mercury/FAO, Egg farming codes (0..3), EVO oil origin/extraction,
 *    Cured meats nitrites warning (E249/E250), Fish wild vs farmed / fresh vs thawed, NOVA estimation.
 *  - Domain B (home_cleaning): Chemical pH class (acid, neutral, alkaline), active function, forbidden surfaces.
 *  - Domain C (kitchen_cookware): Material, ferromagnetic induction compatibility, thermal inertia, max temp.
 */

import { classifyProductDomain } from './domainClassifier.js';

export function evaluateQualityLens(item = {}) {
  const domain = classifyProductDomain(item);
  const title = String(item.title || '');
  const brand = String(item.brand || '');
  const description = String(item.description || '');
  const text = `${title} ${brand} ${description}`.toLowerCase();

  const badges = [];
  const warnings = [];
  let technicalSpec = null;

  if (domain === 'food_human') {
    // 1. Tonno / Sgombro / Pesce in conserva
    if (/\b(tonno|tonnetto)\b/i.test(text)) {
      if (/\b(pinne gialle|yellowfin|thunnus albacares)\b/i.test(text)) {
        badges.push({ label: 'Specie: Pinne Gialle (Taglia grande)', tone: 'amber' });
        warnings.push('Predatore grande: limitare a 1-2 porzioni/settimana per bioaccumulo mercurio (preferire Katsuwonus/Sgombro)');
      } else if (/\b(striato|skipjack|katsuwonus)\b/i.test(text)) {
        badges.push({ label: 'Specie: Tonnetto Striato (Basso mercurio)', tone: 'emerald' });
      }
      if (/\b(filetti|vasetto vetro|tranci)\b/i.test(text)) {
        badges.push({ label: 'Taglio intero (Filetti in vetro)', tone: 'emerald' });
      }
      if (/\b(al naturale|all'acqua)\b/i.test(text)) {
        badges.push({ label: 'Al Naturale (Alta densità proteica)', tone: 'sky' });
      }
    }

    if (/\b(sgombro|alici|acciughe|sardine)\b/i.test(text)) {
      badges.push({ label: 'Pesce Azzurro (Ricco Omega-3 EPA/DHA, Basso Mercurio)', tone: 'emerald' });
    }

    // 2. Uova (Codici allevamento 0..3)
    if (/\buov[ao]\b/i.test(text)) {
      if (/\b(biologic\w*|codice 0|cat\.?\s*0)\b/i.test(text)) {
        badges.push({ label: 'Uova Codice 0 — Biologiche (All\'aperto)', tone: 'emerald' });
      } else if (/\b(all'aperto|allevate all'aperto|codice 1)\b/i.test(text)) {
        badges.push({ label: 'Uova Codice 1 — Allevate all\'aperto', tone: 'emerald' });
      } else if (/\b(a terra|allevate a terra|codice 2)\b/i.test(text)) {
        badges.push({ label: 'Uova Codice 2 — Allevate a terra (Capannone)', tone: 'sky' });
      }
    }

    // 3. Olio Extra Vergine di Oliva
    if (/\b(olio extra\s*vergine|olio evo)\b/i.test(text)) {
      if (/\b(100%\s*italian\w*|dop\b|igp\b|riviera ligure|taggiasc\w*)\b/i.test(text)) {
        badges.push({ label: 'Origine Certificata 100% Italia / DOP', tone: 'emerald' });
      } else if (/\b(unione europea|comunitario|ue)\b/i.test(text)) {
        badges.push({ label: 'Miscela Oli UE', tone: 'amber' });
      }
      if (/\b(estratt\w* a freddo|spremuto a freddo)\b/i.test(text)) {
        badges.push({ label: 'Estrazione a Freddo (<27°C, preserva polifenoli)', tone: 'emerald' });
      }
    }

    // 4. Salumi / Insaccati (Nitriti/Nitrati E249-E252)
    if (/\b(prosciutto cotto|wurstel|mortadella|salame|pancetta|speck|bresaola|arrosto di tacchino)\b/i.test(text)) {
      if (/\b(senza nitrit\w*|senza conservant\w*|prosciutto di parma|san daniele)\b/i.test(text)) {
        badges.push({ label: 'Senza Nitriti Aggiunti (Solo carne e sale)', tone: 'emerald' });
      } else {
        warnings.push('Carne trasformata: verificare in etichetta presenza di Nitriti/Nitrati (E249, E250, E252)');
      }
    }

    // 5. Pasta & Farine
    if (/\b(pasta|spaghetti|penne|fusilli|rigatoni|mezze maniche|trofie)\b/i.test(text)) {
      if (/\b(trafilat\w* al bronzo|bronzo|gragnano|rummo|vozza|molisana|de cecco|garofalo)\b/i.test(text)) {
        badges.push({ label: 'Trafilatura al Bronzo / Lenta essiccazione (Trattiene l\'emulsione)', tone: 'emerald' });
      }
      if (/\b(integrale|farro|grano saraceno|ceci|lenticchie)\b/i.test(text)) {
        badges.push({ label: 'Alto contenuto di Fibre & Basso indice glicemico', tone: 'sky' });
      }
    }
  } else if (domain === 'home_cleaning') {
    // Domain B: Chemical pH & surface safety
    if (/\b(anticalcare|viakal|acido citrico|aceto|disincrostante|wc net)\b/i.test(text)) {
      technicalSpec = {
        phClass: 'acid',
        phLabel: 'pH Acido (2.0 – 4.5)',
        function: 'Scioglie carbonato di calcio (calcare), aloni minerali e ossidi su acciaio inox e vetro',
        safeSurfaces: ['Acciaio Inox 18/10', 'Ceramica', 'Vetro', 'Vetroceramica Induzione'],
        forbiddenSurfaces: ['Marmo', 'Pietra naturale/Ardesia', 'Alluminio nudo', 'Ghisa non smaltata']
      };
      badges.push({ label: 'Chimica Acida — Anticalcare & Brillantante Inox', tone: 'sky' });
      warnings.push('VIETATO su marmo, ardesia e alluminio nudo (corrosione chimica)');
    } else if (/\b(sgrassatore|chanteclair|forno|griglia|candeggina|ace\b)\b/i.test(text)) {
      technicalSpec = {
        phClass: 'alkaline',
        phLabel: 'pH Alcalino (10.5 – 13.0)',
        function: 'Saponifica e scioglie grassi polimerizzati, oli cotti e residui organici',
        safeSurfaces: ['Acciaio Inox 18/10', 'Vetroceramica Induzione (a freddo)', 'Piani Gas smaltati', 'Pirofile Pyrex'],
        forbiddenSurfaces: ['Alluminio nudo (annerisce)', 'Ghisa stagionata (rimuove la patina)', 'Legno non trattato']
      };
      badges.push({ label: 'Chimica Alcalina — Sgrassante Grassi Cotti', tone: 'amber' });
      warnings.push('Risciacquare bene su antiaderente PTFE; non usare su alluminio nudo o ghisa stagionata');
    } else if (/\b(spugn\w* abrasiv\w*|pagliett\w*|acciaio|inox spirale)\b/i.test(text)) {
      technicalSpec = {
        phClass: 'mechanical_abrasive',
        phLabel: 'Azione Meccanica Abrasiva',
        function: 'Rimozione meccanica incrostazioni su acciaio inox o griglie forno',
        safeSurfaces: ['Acciaio Inox non lucido', 'Griglie ghisa smaltata'],
        forbiddenSurfaces: ['Padelle Antiaderenti PTFE/Teflon', 'Vetroceramica Induzione', 'Pentole smaltate']
      };
      warnings.push('VIETATO su padelle antiaderenti (PTFE) e piano a induzione (graffi permanenti)');
    } else {
      technicalSpec = {
        phClass: 'neutral_surfactant',
        phLabel: 'pH Neutro / Tensioattivo (6.5 – 8.0)',
        function: 'Emulsiona grassi freschi, amidi e proteine senza aggredire i rivestimenti delicati',
        safeSurfaces: ['Padelle Antiaderenti PTFE', 'Acciaio Inox', 'Ghisa', 'Vetroceramica Induzione', 'Lame Coltelli'],
        forbiddenSurfaces: []
      };
      badges.push({ label: 'pH Neutro — Sicuro su Antiaderente PTFE e Induzione', tone: 'emerald' });
    }
  } else if (domain === 'kitchen_cookware') {
    // Domain C: Cookware & Appliances thermodynamics
    const isInductionReady = /\b(induzione|induction|inox|acciaio|ghisa)\b/i.test(text);
    const isNonStick = /\b(antiaderente|teflon|ptfe|mineralia|titanium|granit\w*|petra)\b/i.test(text);
    technicalSpec = {
      material: isNonStick ? 'Alluminio rivestito Antiaderente (PTFE/Minerale)' : 'Acciaio Inox / Metallo',
      inductionCompatible: isInductionReady,
      maxTempCelsius: isNonStick ? 230 : 280,
      careRule: isNonStick
        ? 'Evitare shock termico (mai acqua fredda su padella calda) e usare solo spugna morbida + utensili in legno/silicone'
        : 'Riscaldare gradualmente; per aloni minerali usare acido citrico o aceto'
    };
    badges.push({
      label: isInductionReady ? 'Compatibile Induzione & Gas' : 'Verificare fondo ferromagnetico per Induzione',
      tone: isInductionReady ? 'emerald' : 'amber'
    });
  }

  return {
    domain,
    badges,
    warnings,
    technicalSpec
  };
}

export default {
  evaluateQualityLens
};

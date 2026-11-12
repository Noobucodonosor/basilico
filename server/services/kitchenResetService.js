/**
 * Basilico — Chemical Kitchen Reset Protocol & Tigotà/PiùMe Offer Matcher (ADR-0010 / TASK-M4-01)
 * Location: server/services/kitchenResetService.js
 *
 * Generates post-cooking chemical & physical care protocols ("Kitchen Reset")
 * for the cookware used (`Surface Material x Target Soil`) and matches required
 * cleaning products against the user's under-sink inventory and live Rapallo offers
 * from Tigotà, PiùMe, and local supermarkets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenInventoryService } from './kitchenInventoryService.js';
import { offerService, enrichOfferRecord, normalizeSearchToken } from './offerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLEANING_SEED_PATH = path.resolve(__dirname, '../../data/seed/cleaning_chemistry.json');

const MATERIAL_PROTOCOLS = {
  alluminio_rivestito_ptfe: {
    materialLabel: 'Alluminio Forgiato Rivestito PTFE (Antiaderente)',
    cooldownMinutes: 5,
    thermalShockWarning:
      'ANTI-SHOCK TERMICO: Attendere che la padella scenda sotto i 60°C prima del contatto con l\'acqua. Il PTFE ha un coefficiente di dilatazione termica ~4,5 volte superiore all\'alluminio: il raffreddamento brusco crea sforzi di taglio interfacciali che delaminano il rivestimento.',
    prohibitions: [
      'VIETATO usare il lato verde abrasivo della spugna o pagliette metalliche',
      'VIETATO usare sgrassatori caustici aggressivi ad alta temperatura'
    ],
    steps: [
      'Lasciare intiepidire naturalmente la padella sul piano per 5 minuti.',
      'Rimuovere l\'eccesso di lipidi con carta assorbente.',
      'Lavare con acqua tiepida, detersivo piatti a pH neutro (6.5–7.5) e il lato morbido in cellulosa della spugna antigraffio.',
      'Asciugare con panno in microfibra.'
    ],
    requiredCleaningKeys: ['spugna_delicata', 'detersivo_piatti', 'panno_microfibra']
  },
  acciaio_inox_18_10: {
    materialLabel: 'Acciaio Inossidabile Austenitico 18/10 (Triplo Fondo)',
    cooldownMinutes: 2,
    thermalShockWarning:
      'PASSIVAZIONE Cr2O3: Non lasciare sale grosso indisciolto sul fondo freddo per evitare vaiolatura (pitting da ioni cloruro). Per rimuovere gli aloni iridescenti di amido/calcare usare acido citrico debole (pH 2.5).',
    prohibitions: [
      'VIETATO usare candeggina/cloro puro sull\'acciaio inox',
      'Non lasciare asciugare all\'aria l\'acqua calcarea per evitare macchie minerali'
    ],
    steps: [
      'Se presenti residui proteici caramellati (fond), deglassare a caldo con poca acqua tiepida.',
      'Lavare con detersivo piatti neutro o sgrassatore per il fondo esterno.',
      'In caso di aloni bianchi/iridescenti di calcare o amido, nebulizzare Acido Citrico (chelante del carbonato di calcio) per 30 secondi e risciacquare.',
      'Asciugare subito con panno in microfibra.'
    ],
    requiredCleaningKeys: ['detersivo_piatti', 'anticalcare_citrico', 'panno_microfibra']
  },
  ghisa_stagionata: {
    materialLabel: 'Ghisa Stagionata (Polimero Lipidico Termico)',
    cooldownMinutes: 8,
    thermalShockWarning:
      'TUTELA DELLA PATINA POLIMERICA: I detergenti fortemente alcalini (pH > 11) e la lavastoviglie saponificano gli acidi grassi polimerizzati esponendo il ferro nudo alla ruggine.',
    prohibitions: [
      'DIVIETO ASSOLUTO di lavastoviglie e ammollo in acqua',
      'DIVIETO di sgrassatori alcalini caustici e acidi sulla superficie di cottura'
    ],
    steps: [
      'Lasciare intiepidire la bistecchiera, poi rimuovere i residui con acqua calda e spugna morbida (o sale grosso come abrasivo dolce solubile).',
      'Asciugare immediatamente rimettendo la ghisa sul fuoco basso per 60 secondi finché tutta l\'umidità evapora.',
      'Applicare a caldo un velo micrometrico di olio con carta da cucina.'
    ],
    requiredCleaningKeys: ['spugna_delicata', 'panno_microfibra']
  },
  acciaio_inossidabile_martensitico: {
    materialLabel: 'Acciaio Martensitico ad Alto Carbonio (Coltello da Chef)',
    cooldownMinutes: 0,
    thermalShockWarning:
      'INTEGRITÀ DEL FILO (r < 0.5 μm): I getti caldi e i sali alcalini della lavastoviglie provocano micro-corrosione del bisello tagliente.',
    prohibitions: [
      'DIVIETO ASSOLUTO di lavastoviglie',
      'Non lasciare la lama bagnata o a contatto con limone/acidi nel lavello'
    ],
    steps: [
      'Lavare subito dopo l\'uso sotto acqua tiepida con spugna morbida, passando sempre dal dorso (costola) verso il filo.',
      'Asciugare all\'istante con panno in microfibra e riporre su barra magnetica o ceppo.'
    ],
    requiredCleaningKeys: ['spugna_delicata', 'detersivo_piatti', 'panno_microfibra']
  },
  marmo_naturale: {
    materialLabel: 'Marmo Naturale di Carrara & Legno di Bosso (Mortaio)',
    cooldownMinutes: 0,
    thermalShockWarning:
      'CHIMICA DEL CARBONATO DI CALCIO (CaCO3): Il marmo reagisce istantaneamente con qualsiasi acido (aceto, limone, acido citrico) subendo corrosione superficiale e perdita di lucidatura; il marmo poroso assorbe i tensioattivi profumati.',
    prohibitions: [
      'DIVIETO ASSOLUTO di detersivi profumati (contaminano il basilico successivo)',
      'DIVIETO ASSOLUTO di anticalcare e acidi sul marmo'
    ],
    steps: [
      'Sciacquare mortaio e pestello esclusivamente con acqua tiepida e panno morbido subito dopo aver preparato il pesto.',
      'Asciugare con panno in microfibra pulito.'
    ],
    requiredCleaningKeys: ['panno_microfibra']
  },
  rame_puro: {
    materialLabel: 'Rame Puro Non Rivestito / Terracotta Tradizionale',
    cooldownMinutes: 10,
    thermalShockWarning:
      'CHIMICA DEL RAME (Cu) & POROSITÀ TERRACOTTA: Sul rame nudo evitare ossidazione verde (verderame / acetato-carbonato rameico Cu2+ solubile negli acidi alimentari); sulla terracotta evitare shock termici bruschi e ammollo prolungato con tensioattivi profumati assorbiti dai micropori.',
    prohibitions: [
      'DIVIETO ASSOLUTO di candeggina/cloro, sgrassatori caustici e anticalcare chimici aggressivi',
      'DIVIETO di lavastoviglie e ammollo prolungato in acqua saponata (specialmente per terracotta porosa)',
      'Mai cuocere o conservare cibi acidi (pomodoro, limone, vino) su rame nudo ossidato'
    ],
    steps: [
      'Lasciare raffreddare gradualmente lontano da superfici bagnate o fredde per prevenire cricche termiche.',
      'Lavare rapidamente a mano con acqua tiepida, spugna morbida in cellulosa e pochissimo detergente neutro (solo acqua calda e spazzola morbida su terracotta non smaltata).',
      'Solo per l\'esterno del rame ossidato: lucidare delicatamente con pasta naturale di sale fino e succo di limone, risciacquando subito a fondo.',
      'Asciugare immediatamente con panno in microfibra e far aerare prima di riporre.'
    ],
    requiredCleaningKeys: ['spugna_delicata', 'detersivo_piatti', 'panno_microfibra']
  },
  rame_stagnato_gres: {
    materialLabel: 'Rame Stagnato Ligure (Testo da Farinata) / Pirofila in Gres',
    cooldownMinutes: 8,
    thermalShockWarning:
      'TUTELA STAGNATURA ALIMENTARE (Sn, T_fus = 232°C) & GRES VETRIFICATO: Lo strato interno di stagno vergine è tenero (durezza Mohs 1.5) e teme qualsiasi abrasivo; il gres teme lo shock termico da acqua fredda su pirofila rovente.',
    prohibitions: [
      'DIVIETO ASSOLUTO di pagliette metalliche, spugne verdi abrasive o polveri raschianti sullo stagno interno',
      'DIVIETO di sgrassatori alcalini caustici, anticalcare acidi e lavastoviglie sul rame stagnato',
      'Non versare acqua fredda nella teglia/pirofila appena estratta dal forno a 220°C'
    ],
    steps: [
      'Attendere che il testo in rame stagnato o la pirofila in gres scenda sotto i 55°C.',
      'Ammorbidire eventuali residui di farinata o arrosti con sola acqua tiepida per alcuni minuti.',
      'Lavare delicatamente con detersivo piatti a pH neutro (6.5–7.5) e il lato in cellulosa morbida della spugna antigraffio.',
      'Asciugare accuratamente con panno in microfibra (sul testo da farinata stendere un velo protettivo d\'olio con carta assorbente).'
    ],
    requiredCleaningKeys: ['spugna_delicata', 'detersivo_piatti', 'panno_microfibra']
  }
};

export const CHEMICAL_SAFETY_MATRIX = [
  {
    id: 'p0-bleach-acid',
    severity: 'P0-LETHAL',
    reagentA: 'Ipoclorito di Sodio (Candeggina / Ace / Disinfettanti Clorati)',
    reagentB: 'Acidi (Anticalcare, Acido Citrico, Viakal, Aceto, Disincrostanti WC)',
    hazardFormula: 'NaClO + 2H+ + Cl- -> Cl2 (gas) + H2O + Na+',
    toxicProduct: 'Gas Cloro (Cl2) molecolare tossico',
    clinicalRisk:
      'Sviluppo istantaneo di vapori giallo-verdi altamente corrosivi per alveoli polmonari e mucose anche in piccole quantità nel lavello.',
    mandatoryRule: 'MAI miscelare né applicare in sequenza senza abbondante risciacquo intermedio con sola acqua fredda.'
  },
  {
    id: 'p0-bleach-ammonia',
    severity: 'P0-LETHAL',
    reagentA: 'Ipoclorito di Sodio (Candeggina)',
    reagentB: 'Ammoniaca / Sgrassatori Ammoniacali per Pavimenti o Vetri',
    hazardFormula: 'NaClO + NH3 -> NH2Cl / NHCl2 (clorammine volatili) + NaOH',
    toxicProduct: 'Clorammine gassose irritanti e idrazina in tracce',
    clinicalRisk: 'Broncospasmo acuto, lacrimazione severa e intossicazione inalatoria in cucine poco aerate.',
    mandatoryRule: 'Usare esclusivamente un singolo principio attivo per sessione di pulizia.'
  },
  {
    id: 'p0-bleach-peroxide',
    severity: 'P0-CRITICAL',
    reagentA: 'Ipoclorito / Acidi Concentrati',
    reagentB: 'Perossido di Idrogeno / Additivi ad Ossigeno Attivo',
    hazardFormula: 'NaClO + H2O2 -> O2 (effervescenza violenta) + NaCl + H2O + calore',
    toxicProduct: 'Reazione esotermica rapida / Acido peracetico irritante (se con acido acetico)',
    clinicalRisk: 'Schizzi caustici agli occhi e sovrappressione se chiusi in flaconi.',
    mandatoryRule: 'Non travasare né combinare mai additivi ossigenati con candeggina o acidi.'
  },
  {
    id: 'p1-acid-marble-castiron',
    severity: 'P1-DAMAGE',
    reagentA: 'Acido Citrico / Anticalcare / Limone / Aceto (pH < 4)',
    reagentB: 'Mortaio in Marmo di Carrara (CaCO3) o Ghisa Stagionata',
    hazardFormula: 'CaCO3 + 2H+ -> Ca2+ + CO2 + H2O',
    toxicProduct: 'Dissoluzione chimica irreversibile del cristallo marmoreo / decappaggio patina ferro',
    clinicalRisk: 'Perdita permanente della levigatura interna del mortaio ligure e ossidazione (ruggine) immediata sulla ghisa.',
    mandatoryRule: 'Lavare il mortaio solo con acqua tiepida e panno; sulla ghisa solo acqua calda e spugna morbida.'
  }
];

const CLEANING_FUNCTION_MATCHERS = {
  spugna_delicata: {
    include: /\b(spugn\w*|abrasiv\w*\s+delicat\w*|scotch\s*brite|spontex|arix)\b/i,
    exclude: /\b(bagno|corpo|doccia|cotoneve|esfoliant\w*|pagliett\w*|inox|acciaio)\b/i,
    maxPromoPrice: 4.50
  },
  detersivo_piatti: {
    include: /\b(detersiv\w*\s+(?:per\s+)?(?:piatti|stoviglie)|svelto\b|nelsen\b|fairy\s+(?:piatti|liquido|limone)|winni['’]?s\s+piatti|sole\s+.*piatti)\b/i,
    exclude: /\b(lavastoviglie|tabs|caps|capsule|gel\s+lavastoviglie|brillantante|cura\s*lavastoviglie|pril\b|finish\b)\b/i,
    maxPromoPrice: 4.20
  },
  anticalcare_citrico: {
    include: /\b(anticalcare|acido\s+citrico|viakal|disincrostant\w*|winni['’]?s\s+.*bagno|quasar\s+bagno)\b/i,
    exclude: /\b(lavastoviglie|curalavatrice)\b/i,
    maxPromoPrice: 5.50
  },
  sgrassatore_alcalino: {
    include: /\b(sgrassator\w*|chanteclair|cif\b|fornet|mastro\s+lindo|ajax|pulitore)\b/i,
    exclude: /\b(lavatrice|ammorbident\w*|bucato)\b/i,
    maxPromoPrice: 5.50
  },
  panno_microfibra: {
    include: /\b(microfibra|pann[oi]|vileda\s+(?:pann\w*|microfibra|attiva)|asciugatutto|tutto\s*-?\s*asciugatutto|scottex|carta\s+casa)\b/i,
    exclude: /\b(sistema\s+pulizia|turbo\s+smart|mocio|scopa|secchio|pavimenti\s+liquido)\b/i,
    maxPromoPrice: 6.50
  }
};

const GENUINE_KITCHEN_CLEANING_OFFER_REGEX =
  /\b(detersiv\w*|ammorbident\w*|sgrassator\w*|candeggina|anticalcare|disincrostant\w*|igienizzant\w*|lavastoviglie|curalavatrice|stoviglie|spugn\w*|microfibra|vileda|asciugatutto|scottex|pellicola|domopak|alluminio\s+cucina|carta\s+forno|nelsen|svelto|fairy|finish|chanteclair|viakal|ace\b|cif\b)\b/i;

const PERSONAL_BATH_EXCLUSION_REGEX =
  /\b(spugna\s+bagno|bagno\s+soft|corpo|doccia|viso|capelli|cotoneve|esfoliant\w*|shampoo|balsamo|tinta|oleo\s+intense|dentifric\w*|deodorant\w*|profum\w*|parfum)\b/i;

export class KitchenResetService {
  constructor() {
    this._catalog = null;
  }

  getCleaningCatalog() {
    if (!this._catalog) {
      this._catalog = JSON.parse(fs.readFileSync(CLEANING_SEED_PATH, 'utf8'));
    }
    return this._catalog;
  }

  async _getKitchenCleaningOffers() {
    const raw = await offerService.getRawOffers();
    return raw
      .map((o) => enrichOfferRecord(o))
      .filter((o) => {
        if (!o || o.domain !== 'home_cleaning' || o.isNamelessTile) return false;
        const txt = `${o.title || ''} ${o.brand || ''}`;
        if (PERSONAL_BATH_EXCLUSION_REGEX.test(txt)) return false;
        return GENUINE_KITCHEN_CLEANING_OFFER_REGEX.test(txt);
      });
  }

  matchOffersForSupplyKey(key, activeCleaningOffers = []) {
    const spec = CLEANING_FUNCTION_MATCHERS[key];
    if (!spec) return [];
    const matched = activeCleaningOffers.filter((off) => {
      const txt = `${off.title || ''} ${off.brand || ''}`;
      if (!spec.include.test(txt)) return false;
      if (spec.exclude && spec.exclude.test(txt)) return false;
      if (spec.maxPromoPrice && Number(off.promoPrice) > spec.maxPromoPrice) return false;
      return true;
    });
    matched.sort((a, b) => (Number(a.promoPrice) || 99) - (Number(b.promoPrice) || 99));
    return matched.slice(0, 3).map((off) => ({
      id: off.id,
      title: off.title,
      brand: off.brand || null,
      storeId: off.storeId,
      storeName: off.storeName || off.chainId,
      promoPrice: off.promoPrice
    }));
  }

  /**
   * Generates a complete Kitchen Reset protocol for a list of used tool IDs
   * and matches cleaning supplies against the user's under-sink inventory and live Tigotà/PiùMe/GDO offers,
   * including the mandatory P0-Safety Chemical Incompatibility Matrix.
   */
  async generateProtocol(toolIds = ['padella_antiaderente', 'coltello_chef']) {
    const archetypes = kitchenInventoryService.getArchetypes();
    const kitchenState = kitchenInventoryService.getKitchenState();
    const cleaningCatalog = this.getCleaningCatalog();
    const activeCleaningOffers = await this._getKitchenCleaningOffers();

    const protocols = [];
    for (const tid of toolIds) {
      const normalizedTid = normalizeSearchToken(tid) === 'mortaio marmo'
        ? 'mortaio'
        : normalizeSearchToken(tid) === 'bistecchiera ghisa'
          ? 'bistecchiera'
          : tid;
      const arch = archetypes.find((a) => a.id === normalizedTid) || {
        id: normalizedTid,
        name: normalizedTid,
        material: 'acciaio_inox_18_10'
      };
      const proto = MATERIAL_PROTOCOLS[arch.material] || MATERIAL_PROTOCOLS.acciaio_inox_18_10;

      const requiredSupplies = proto.requiredCleaningKeys.map((key) => {
        const refProd = cleaningCatalog.find((c) => c.key === key) || cleaningCatalog[0];
        const ownedInUnderSink = kitchenState.ownedCleaningKeys.includes(key);
        const matchedOffers = this.matchOffersForSupplyKey(key, activeCleaningOffers);
        return {
          ...refProd,
          ownedInUnderSink,
          matchedOffers
        };
      });

      protocols.push({
        toolId: arch.id,
        toolName: arch.name,
        material: arch.material,
        materialLabel: proto.materialLabel,
        cooldownMinutes: proto.cooldownMinutes,
        thermalShockWarning: proto.thermalShockWarning,
        prohibitions: proto.prohibitions,
        steps: proto.steps,
        requiredSupplies
      });
    }

    return {
      protocols,
      chemicalSafetyMatrix: CHEMICAL_SAFETY_MATRIX,
      underSinkCatalog: cleaningCatalog.map((item) => ({
        ...item,
        ownedInUnderSink: kitchenState.ownedCleaningKeys.includes(item.key),
        matchedOffers: this.matchOffersForSupplyKey(item.key, activeCleaningOffers)
      })),
      liveRapalloCleaningOffers: activeCleaningOffers.slice(0, 16)
    };
  }
}

export const kitchenResetService = new KitchenResetService();
export default kitchenResetService;

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
import { offerService } from './offerService.js';

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
  }
};

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

  /**
   * Generates a complete Kitchen Reset protocol for a list of used tool IDs
   * and matches cleaning supplies against the user's under-sink inventory and live Tigotà/PiùMe offers.
   */
  async generateProtocol(toolIds = ['padella_antiaderente', 'coltello_chef']) {
    const archetypes = kitchenInventoryService.getArchetypes();
    const kitchenState = kitchenInventoryService.getKitchenState();
    const cleaningCatalog = this.getCleaningCatalog();

    // Fetch live/seed home_cleaning offers in Rapallo (Tigotà, PiùMe, etc.)
    const cleaningOffersRes = await offerService.getOffers({
      domain: 'home_cleaning',
      limit: 50
    });
    const activeCleaningOffers = cleaningOffersRes.offers || [];

    const protocols = [];
    for (const tid of toolIds) {
      const arch = archetypes.find((a) => a.id === tid) || {
        id: tid,
        name: tid,
        material: 'acciaio_inox_18_10'
      };
      const proto = MATERIAL_PROTOCOLS[arch.material] || MATERIAL_PROTOCOLS.acciaio_inox_18_10;

      const requiredSupplies = proto.requiredCleaningKeys.map((key) => {
        const refProd = cleaningCatalog.find((c) => c.key === key) || cleaningCatalog[0];
        const ownedInUnderSink = kitchenState.ownedCleaningKeys.includes(key);
        return {
          ...refProd,
          ownedInUnderSink
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
      underSinkCatalog: cleaningCatalog.map((item) => ({
        ...item,
        ownedInUnderSink: kitchenState.ownedCleaningKeys.includes(item.key)
      })),
      liveRapalloCleaningOffers: activeCleaningOffers.slice(0, 12)
    };
  }
}

export const kitchenResetService = new KitchenResetService();
export default kitchenResetService;

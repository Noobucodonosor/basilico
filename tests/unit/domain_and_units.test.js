/**
 * Unit Tests for TASK-M1-01 (ADR-0007):
 * - 6 Store Categories, Data Channels, Logistics & Loyalty Cards in Rapallo
 * - 5 Closed Domains Classifier (food_human, home_cleaning, kitchen_cookware, personal_care, pet_care)
 * - Unit Price & Edible/Drained Weight Normalizer (€/kg, x10 etto, multipack, guardrails)
 * - Scientific Quality Lens (Tuna mercury/species, Egg codes, EVO oil, Nitrites, pH chemistry, Cookware induction)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyProductDomain,
  classifyCanonicalCategory,
  isHumanFoodOffer,
  VALID_PRODUCT_DOMAINS
} from '../../server/services/domainClassifier.js';
import {
  extractPackMetrics,
  normalizeUnitPricing
} from '../../server/services/unitPriceExtractor.js';
import { evaluateQualityLens } from '../../server/services/qualityLensService.js';
import { offerService, filterActiveAndDeduplicateOffers } from '../../server/services/offerService.js';
import { FlyerModalCoordinator } from '../../src/components/FlyerModalCoordinator.js';
import { loadLocalObservedShops } from '../../server/routes/stores.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORES_SEED_PATH = path.resolve(__dirname, '../../data/seed/rapallo_stores.json');

describe('TASK-M1-01: Multi-Domain Taxonomy, Edible €/kg Normalizer & Quality Lens (ADR-0007)', () => {
  describe('Level 0: Rapallo Store Directory Metadata & Local Shops', () => {
    it('ensures all 14 canonical Rapallo stores include storeCategory, dataChannel, loyaltyCard, and logistics', () => {
      const stores = JSON.parse(fs.readFileSync(STORES_SEED_PATH, 'utf8'));
      assert.equal(stores.length, 14);
      for (const s of stores) {
        assert.ok(['gdo', 'bottega_freschi', 'casalinghi_cucina', 'cura_casa_persona', 'elettronica_cucina', 'pet'].includes(s.storeCategory));
        assert.equal(s.dataChannel, 'flyer_live');
        assert.ok(s.loyaltyCard && typeof s.loyaltyCard === 'object');
        assert.ok(s.logistics && typeof s.logistics.distanceKmFromHarbor === 'number');
        assert.ok(typeof s.logistics.avgVisitMinutes === 'number');
      }
    });

    it('loads local observed Rapallo shops (pescheria, macelleria, panificio, casalinghi) with receipt_observed channel', () => {
      const localShops = loadLocalObservedShops();
      assert.ok(localShops.length >= 4);
      assert.ok(localShops.some((s) => s.storeCategory === 'bottega_freschi'));
      assert.ok(localShops.some((s) => s.storeCategory === 'casalinghi_cucina'));
      assert.ok(localShops.every((s) => s.dataChannel === 'receipt_observed'));
    });
  });

  describe('Level 1.4: 5 Closed Domains Classifier (Zero Contamination)', () => {
    it('classifies human food and beverages strictly as food_human', () => {
      assert.equal(
        classifyProductDomain({ title: 'Tonno Rio Mare all\'Olio di Oliva 3x80g', category: 'Dispensa e Pasta', chainId: 'basko' }),
        'food_human'
      );
      assert.equal(
        classifyProductDomain({ title: 'Filetto di Orata Fresca', category: 'Carne e Pesce', chainId: 'coop' }),
        'food_human'
      );
      assert.equal(isHumanFoodOffer({ title: 'Pasta Rummo 500g', chainId: 'gulliver' }), true);
    });

    it('classifies detergents and surface cleaners strictly as home_cleaning (never food_human)', () => {
      const sgrassatore = { title: 'Chanteclair Sgrassatore Universale Marsiglia 600ml', chainId: 'tigota' };
      assert.equal(classifyProductDomain(sgrassatore), 'home_cleaning');
      assert.equal(isHumanFoodOffer(sgrassatore), false);

      const detersivoInSupermarket = { title: 'Dash Pods Detersivo Lavatrice 36 lavaggi', category: 'Cura Casa e Bucato', chainId: 'basko' };
      assert.equal(classifyProductDomain(detersivoInSupermarket), 'home_cleaning');
    });

    it('classifies cookware, knives, and appliances strictly as kitchen_cookware', () => {
      const padella = { title: 'Lagostina Padella Antiaderente Induzione 28cm', chainId: 'unieuro' };
      assert.equal(classifyProductDomain(padella), 'kitchen_cookware');
      assert.equal(isHumanFoodOffer(padella), false);
    });

    it('classifies hygiene products as personal_care and pet food as pet_care', () => {
      const shampoo = { title: 'Shampoo Pantene Rigenera 250ml', category: 'Cura Persona e Igiene', chainId: 'piume' };
      assert.equal(classifyProductDomain(shampoo), 'personal_care');

      const crocchette = { title: 'Monge Crocchette Cane Adulto Salmone 2.5kg', chainId: 'arcaplanet' };
      assert.equal(classifyProductDomain(crocchette), 'pet_care');
      assert.equal(isHumanFoodOffer(crocchette), false);
    });

    it('keeps "da forno / forno a legna" foods in food_human while routing bedding/apparel/toys out of food_human (ADR-0013)', () => {
      assert.equal(
        classifyProductDomain({ title: 'Forno a legna - 2 Pizze Margherita Classica', brand: 'Forno a legna', chainId: 'basko' }),
        'food_human'
      );
      assert.equal(
        classifyProductDomain({ title: 'Patatine Da Forno In Vassoio Passione & Natura', chainId: 'despar' }),
        'food_human'
      );
      assert.equal(
        classifyProductDomain({ title: 'Bassetti - Completo Letto Trendy', chainId: 'carrefour' }),
        'home_cleaning'
      );
      assert.equal(
        classifyProductDomain({ title: 'Peluche Orso', chainId: 'carrefour' }),
        'home_cleaning'
      );
    });
  });

  describe('Level 1.2: Unit Price & Edible/Drained Weight Normalizer', () => {
    it('multiplies "all\'etto / per 100g" prices by 10 to compute true €/kg', () => {
      const res = normalizeUnitPricing({
        title: 'Prosciutto Crudo di Parma DOP all\'etto',
        promoPrice: 2.49
      });
      assert.equal(res.isPerEtto, true);
      assert.equal(res.pricePerKg, 24.90);
      assert.equal(res.ediblePricePerKg, 24.90);
      assert.ok(res.formattedNormalizedPrice.includes('24,90 €/kg'));
    });

    it('computes multipack total weight and drained edible €/kg for canned food', () => {
      const res = normalizeUnitPricing({
        title: 'Tonno Rio Mare in Olio di Oliva 3x80g (sgocciolato 156g)',
        promoPrice: 3.90
      });
      assert.equal(res.packWeightGrams, 240);
      assert.equal(res.drainedWeightGrams, 156);
      assert.equal(res.pricePerKg, 16.25); // 3.90 / 0.240
      assert.equal(res.ediblePricePerKg, 25.00); // 3.90 / 0.156
    });

    it('flags suspiciously low €/kg on premium meats/cheeses as priceAnomalyFlag', () => {
      const anomaly = normalizeUnitPricing({
        title: 'Bresaola della Valtellina IGP 1kg',
        promoPrice: 1.89
      });
      assert.equal(anomaly.priceAnomalyFlag, true);
      assert.ok(anomaly.priceAnomalyReasons.length > 0);
    });

    it('parses explicit egg counts ("10 Uova") and keeps referencePackEstimate transparent when text omits weight (ADR-0013)', () => {
      const eggs = normalizeUnitPricing({
        title: 'Latte tigullio - 10 Uova Fresche Fiordovo',
        promoPrice: 3.09
      });
      assert.equal(eggs.eggCount, 10);
      assert.equal(eggs.packWeightGrams, 600);
      assert.equal(eggs.drainedWeightGrams, 530);
      assert.equal(eggs.pricePerKg, 5.15);
      assert.equal(eggs.ediblePricePerKg, 5.83);

      const pastaNoWeight = normalizeUnitPricing({
        title: 'Barilla - Pasta Di Semola',
        promoPrice: 0.99,
        domain: 'food_human'
      });
      // Explicit pricePerKg stays null per ADR-0006, while referencePackEstimate provides transparent GDO format
      assert.equal(pastaNoWeight.pricePerKg, null);
      assert.equal(pastaNoWeight.formattedNormalizedPrice, null);
      assert.ok(pastaNoWeight.referencePackEstimate);
      assert.equal(pastaNoWeight.referencePackEstimate.isEstimatedPackSize, true);
      assert.equal(pastaNoWeight.referencePackEstimate.estimatedPackGrams, 500);
      assert.equal(pastaNoWeight.referencePackEstimate.estimatedEdiblePricePerKg, 1.98);
    });
  });

  describe('Level 1.4: Scientific Quality Lens & Domain Filtering in OfferService', () => {
    it('evaluates quality badges and chemical pH specs accurately across domains', () => {
      const sgombro = evaluateQualityLens({ title: 'Filetti di Sgombro al Naturale in vetro', chainId: 'coop' });
      assert.equal(sgombro.domain, 'food_human');
      assert.ok(sgombro.badges.some((b) => b.label.includes('Pesce Azzurro')));

      const viakal = evaluateQualityLens({ title: 'Viakal Anticalcare Spray 500ml', chainId: 'tigota' });
      assert.equal(viakal.domain, 'home_cleaning');
      assert.equal(viakal.technicalSpec.phClass, 'acid');
      assert.ok(viakal.technicalSpec.forbiddenSurfaces.includes('Marmo'));

      const padella = evaluateQualityLens({ title: 'Padella Antiaderente PTFE Induzione 24cm', chainId: 'unieuro' });
      assert.equal(padella.domain, 'kitchen_cookware');
      assert.equal(padella.technicalSpec.inductionCompatible, true);
    });

    it('supports filtering offers by domain in OfferService.processQuery', () => {
      const seedOffers = offerService.getSeedOffersSync();
      const resFood = offerService.processQuery({ domain: 'food_human', limit: 25 }, seedOffers);
      assert.ok(resFood.offers.length > 0);
      assert.ok(resFood.offers.every((o) => o.domain === 'food_human'));
      assert.ok(resFood.facets.domains && typeof resFood.facets.domains.food_human === 'number');
    });
  });

  describe('TASK-REAL-06: Room 1 Lexical Taxonomy, Unit Price Guardrails, Quality Lens & Flyer Page Jump', () => {
    it('prevents substring false positives ("sCREMAto", "verGINe", "MELEgatti", "-te", "Miele" dishwasher, "letto")', () => {
      // Milk, coffee, spreads & pumpkin soup must NEVER leak into personal_care
      const milk = { title: 'Granarolo Latte Parzialmente Scremato 1L', category: 'Cura Persona e Igiene', chainId: 'basko' };
      assert.equal(classifyProductDomain(milk), 'food_human');
      assert.equal(classifyCanonicalCategory(milk), 'Latticini e Formaggi');

      const coffee = { title: 'Lavazza Caffè Crema e Gusto 2x250g', category: 'Cura Persona e Igiene', chainId: 'coop' };
      assert.equal(classifyProductDomain(coffee), 'food_human');
      assert.equal(classifyCanonicalCategory(coffee), 'Colazione e Dolci');

      const zucca = { title: 'Zerbinati Crema Zucca Fresca', category: 'Cura Persona e Igiene', chainId: 'gulliver' };
      assert.equal(classifyProductDomain(zucca), 'food_human');
      assert.equal(classifyCanonicalCategory(zucca), 'Frutta e Verdura');

      // Olive oil must NEVER match "gin" -> Acqua e Bevande; Prosecco/Spumante must NEVER match "-te" -> Colazione
      const evo = { title: 'Dante Olio Extra Vergine Di Oliva 100% Italiano', chainId: 'basko' };
      assert.equal(classifyCanonicalCategory(evo), 'Dispensa e Pasta');

      const spumante = { title: 'Spumante Prosecco DOC Extra Dry', chainId: 'coop' };
      assert.equal(classifyCanonicalCategory(spumante), 'Acqua e Bevande');

      // Pandoro Melegatti must NEVER match "mele" -> Frutta e Verdura
      const pandoro = { title: 'Melegatti Pandoro Classico 1kg', chainId: 'carrefour' };
      assert.equal(classifyCanonicalCategory(pandoro), 'Pane e Pasticceria');

      // German appliance brand Miele at Unieuro must go to kitchen_cookware, never Colazione e Dolci
      const mieleDishwasher = { title: 'Miele Lavastoviglie G7281SCVI', brand: 'Miele', chainId: 'unieuro' };
      assert.equal(classifyProductDomain(mieleDishwasher), 'kitchen_cookware');
      assert.equal(classifyCanonicalCategory(mieleDishwasher), 'Cura Casa e Bucato');

      // Hair straighteners / dryers go to personal_care, tablecloths / toys go to home_cleaning
      assert.equal(classifyProductDomain({ title: 'Beper Piastra Capelli Ceramica', chainId: 'carrefour' }), 'personal_care');
      assert.equal(classifyProductDomain({ title: 'Candy Tovaglia Antimacchia Cane', chainId: 'carrefour' }), 'home_cleaning');
      assert.equal(classifyProductDomain({ title: 'Casabella Aspirapolvere Rstoys', chainId: 'carrefour' }), 'home_cleaning');
    });

    it('never interprets "letto" (bedsheets) as "l\'etto" (per 100g) and withholds PTFE badges from textiles/toys/laundry', () => {
      const bedsheets = {
        title: 'Bassetti - Completo Letto Trendy Matrimoniale',
        promoPrice: 26.99,
        domain: 'home_cleaning'
      };
      const pricing = normalizeUnitPricing(bedsheets);
      assert.equal(pricing.isPerEtto, false);
      assert.equal(pricing.pricePerKg, null);
      assert.equal(pricing.formattedNormalizedPrice, null);

      const bedLens = evaluateQualityLens(bedsheets);
      assert.equal(bedLens.badges.length, 0);
      assert.equal(bedLens.technicalSpec, null);

      const dishSoap = evaluateQualityLens({ title: 'Svelto Detersivo Piatti Limone', chainId: 'basko' });
      assert.ok(dishSoap.badges.some((b) => b.label.includes('PTFE')));

      const laundrySoap = evaluateQualityLens({ title: 'Dash Pods Detersivo Lavatrice', chainId: 'basko' });
      assert.ok(!laundrySoap.badges.some((b) => b.label.includes('PTFE')));
    });

    it('deduplicates overlapping flyer tiles per store and supports opening FlyerModalCoordinator at offer.pageNumber', () => {
      const future = '2099-12-31T23:59:59.000Z';
      const raw = [
        { id: '1', storeId: 'rapallo-coop-sciesa', title: 'Pasta Rummo 500g', promoPrice: 1.09, validTo: future },
        { id: '2', storeId: 'rapallo-coop-sciesa', title: 'Pasta Rummo 500g', promoPrice: 1.09, discountPercentage: 35, validTo: future },
        { id: '3', storeId: 'rapallo-coop-sciesa', title: 'Offerta Scaduta', promoPrice: 0.99, validTo: '2020-01-01T00:00:00.000Z' }
      ];
      const deduped = filterActiveAndDeduplicateOffers(raw);
      assert.equal(deduped.length, 1);
      assert.equal(deduped[0].id, '2'); // kept richer record with discountPercentage

      const coord = new FlyerModalCoordinator({ id: 'fly-1', pageCount: 16, pages: [] });
      assert.equal(coord.open().currentPage, 1);
      assert.equal(coord.open(7).currentPage, 7);
    });
  });
});

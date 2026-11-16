/**
 * Basilico 2.0 — Unit & Router Tests for Universal Home/Boat Chemistry & P0 Safety (ADR-0015 / TASK-V2-01)
 * Location: tests/unit/home_chemistry_v2.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { fileURLToPath } from 'node:url';

import { classifyProductDomain } from '../../server/services/domainClassifier.js';
import { evaluateQualityLens } from '../../server/services/qualityLensService.js';
import {
  homeChemistryService,
  resolveStainOrSoil,
  checkChemicalSafetyP0,
  getMinimalKitGuide,
  getApplianceMaintenancePlan,
  getMythBusters,
  evaluateDetergentOffersRapallo,
  decodeDetergentInci
} from '../../server/services/homeChemistryService.js';
import homeChemistryRouter from '../../server/routes/homeChemistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OFFERS_SEED_PATH = path.resolve(__dirname, '../../data/seed/rapallo_offers.json');

describe('TASK-V2-01: Universal Home/Boat Chemistry Engine, P0 Guards & Tigotà/Inox Fixes', () => {
  describe('1. P0 Fix in QualityLensService (NaClO vs Alkaline Degreaser & Inox Pitting)', () => {
    it('separates sodium hypochlorite (candeggina) from alkaline degreasers and forbids Acciaio Inox 18/10', () => {
      const bleach = evaluateQualityLens({
        title: 'Ace Candeggina Classica Igienizzante 2L',
        brand: 'Ace',
        chainId: 'tigota'
      });
      assert.equal(bleach.domain, 'home_cleaning');
      assert.ok(bleach.technicalSpec);
      assert.equal(bleach.technicalSpec.phClass, 'chlorine_oxidizer');
      assert.ok(
        !bleach.technicalSpec.safeSurfaces.some((s) => /inox/i.test(s)),
        'Bleach must NEVER list Acciaio Inox 18/10 as a safe surface (Cr2O3 pitting!)'
      );
      assert.ok(
        bleach.technicalSpec.forbiddenSurfaces.some((s) => /inox/i.test(s)),
        'Bleach must explicitly forbid Acciaio Inox 18/10'
      );
      assert.ok(bleach.warnings.some((w) => /Cl2|pitting/i.test(w)));

      const degreaser = evaluateQualityLens({
        title: 'Chanteclair Sgrassatore Universale Marsiglia 600ml',
        brand: 'Chanteclair',
        chainId: 'tigota'
      });
      assert.equal(degreaser.technicalSpec.phClass, 'alkaline');
      assert.ok(degreaser.technicalSpec.safeSurfaces.includes('Acciaio Inox 18/10'));

      const percarbonate = evaluateQualityLens({
        title: 'Percarbonato di Sodio Puro Smacchiatore Ossigeno Attivo 1kg',
        chainId: 'tigota'
      });
      assert.equal(percarbonate.technicalSpec.phClass, 'oxygen_oxidizer');
      assert.ok(percarbonate.warnings.some((w) => /P0-PRESSURE-BURST/i.test(w)));

      // Regression guard: Ace Laundry Detergent must still stay in Cura Bucato (M-P1-08)
      const aceLaundry = evaluateQualityLens({
        title: 'Ace - Detersivo Lavatrice Liquido Classico 38 Lavaggi',
        brand: 'Ace',
        chainId: 'piume'
      });
      assert.equal(aceLaundry.technicalSpec, null);
      assert.ok(aceLaundry.badges.some((b) => b.label.includes('Cura Bucato')));
    });
  });

  describe('2. Tigotà / PiùMe Perfume & Cosmetic Leak Fix in DomainClassifier', () => {
    it('routes opaque Tigotà/PiùMe perfumes, cosmetics, and beauty gift sets to personal_care instead of home_cleaning', () => {
      const leakedPerfumesAndCosmetics = [
        { title: 'Coveri - Enrico', brand: 'Coveri', storeId: 'rapallo-tigota-lamarmora', category: 'Cura Casa e Bucato' },
        { title: 'Delideal', brand: 'Tigotà', storeId: 'rapallo-tigota-lamarmora', category: 'Cura Casa e Bucato' },
        { title: 'Remiseca Humectes', brand: 'Tigotà', storeId: 'rapallo-tigota-lamarmora', category: 'Cura Casa e Bucato' },
        { title: 'Aaz', brand: 'Tigotà', storeId: 'rapallo-tigota-lamarmora', category: 'Cura Casa e Bucato' },
        { title: 'Aspettando Il Natale.', brand: 'PiùMe', storeId: 'rapallo-piume-neri', category: 'Cura Casa e Bucato' },
        { title: 'Cofanetto Eau De Parfum Donna', brand: 'Tigotà', storeId: 'rapallo-tigota-lamarmora' }
      ];
      for (const item of leakedPerfumesAndCosmetics) {
        assert.equal(
          classifyProductDomain(item),
          'personal_care',
          `Expected ${item.title} at drugstore to be personal_care`
        );
      }

      // Genuine cleaning offers at Tigotà/PiùMe and pure reagents must stay home_cleaning
      assert.equal(
        classifyProductDomain({ title: 'Ace - Detersivo Lavatrice Liquido', storeId: 'rapallo-piume-neri' }),
        'home_cleaning'
      );
      assert.equal(
        classifyProductDomain({ title: 'Acido Citrico Anidro Puro 1kg', storeId: 'rapallo-tigota-lamarmora' }),
        'home_cleaning'
      );
      assert.equal(
        classifyProductDomain({ title: 'Percarbonato di Sodio 500g', storeId: 'rapallo-piume-neri' }),
        'home_cleaning'
      );

      // Full seed corpus check: zero Coveri / Eau De Parfum / Remiseca in home_cleaning
      const allSeedOffers = JSON.parse(fs.readFileSync(OFFERS_SEED_PATH, 'utf8'));
      const cleaningSeed = allSeedOffers.filter((o) => classifyProductDomain(o) === 'home_cleaning');
      const leaked = cleaningSeed.filter((o) =>
        /\b(eau\s+de\s+parfum|eau\s+de\s+toilette|coveri|remiseca|delideal|\baaz\b|aspettando\s+il\s+natale)\b/i.test(
          `${o.title || ''} ${o.brand || ''}`
        )
      );
      assert.equal(leaked.length, 0, `Expected 0 perfumes/cosmetics in home_cleaning, got: ${leaked.map((x) => x.title).join(', ')}`);
    });
  });

  describe('3. Non-Bypassable P0 & P1 Safety Matrix (Lethal Mixtures & Pure Powders)', () => {
    it('blocks all lethal chemical mixtures (Cl2, chloramines, peracetic acid, Al+NaOH->H2, anionic+cationic)', () => {
      const cl2 = checkChemicalSafetyP0({ reagents: ['Candeggina', 'Acido Citrico'] });
      assert.equal(cl2.safe, false);
      assert.equal(cl2.blockedByP0, true);
      assert.equal(cl2.highestSeverity, 'P0-LETHAL');
      assert.ok(cl2.violations.some((v) => v.id === 'p0-bleach-acid' && /Cl2/.test(v.hazardFormula)));

      const chloramines = checkChemicalSafetyP0('posso unire candeggina e ammoniaca per i pavimenti?');
      assert.equal(chloramines.blockedByP0, true);
      assert.ok(chloramines.violations.some((v) => v.id === 'p0-bleach-ammonia'));

      const peracetic = checkChemicalSafetyP0({ reagents: ['Percarbonato', 'Aceto'] });
      assert.equal(peracetic.blockedByP0, true);
      assert.ok(peracetic.violations.some((v) => v.id === 'p0-peroxide-acetic'));

      const alH2 = checkChemicalSafetyP0({ reagents: ['Soda Solvay'], surface: 'Moka in alluminio' });
      assert.equal(alH2.blockedByP0, true);
      assert.ok(alH2.violations.some((v) => v.id === 'p0-alkali-aluminum-h2' && /H2/.test(v.hazardFormula)));

      const quatInact = checkChemicalSafetyP0({
        reagents: ['Detersivo piatti Svelto', 'Benzalconio cloruro disinfettante']
      });
      assert.equal(quatInact.blockedByP0, true);
      assert.ok(quatInact.violations.some((v) => v.id === 'p0-anionic-cationic-inactivation'));
    });

    it('enforces all 3 pure-powder P0 guards (P0-PRESSURE-BURST, P0-CAV-INGESTION, P0-DUST-AEROSOL)', () => {
      const burst = checkChemicalSafetyP0({
        reagents: ['Sodio percarbonato'],
        containerType: 'flacone spray chiuso ermetico'
      });
      assert.equal(burst.blockedByP0, true);
      assert.equal(burst.highestSeverity, 'P0-LETHAL');
      assert.ok(burst.violations.some((v) => v.code === 'P0-PRESSURE-BURST'));

      const ingestion = checkChemicalSafetyP0({
        reagents: ['Acido citrico 15%'],
        containerType: 'bottiglia acqua minerale PET'
      });
      assert.equal(ingestion.blockedByP0, true);
      assert.equal(ingestion.highestSeverity, 'P0-LETHAL');
      assert.ok(ingestion.violations.some((v) => v.code === 'P0-CAV-INGESTION'));

      const boilOver = checkChemicalSafetyP0({
        reagents: ['Percarbonato'],
        waterTempC: 90
      });
      assert.equal(boilOver.blockedByP0, true);
      assert.ok(boilOver.violations.some((v) => v.code === 'P0-DUST-AEROSOL'));
    });

    it('blocks P1 substrate damage on Ligurian marble/slate, Inox, Wool/Silk, Microfiber, and Boat marine discharge', () => {
      const marbleAcid = checkChemicalSafetyP0({ reagents: ['Acido citrico'], surface: 'Ardesia Ligure e Marmo di Carrara' });
      assert.equal(marbleAcid.safe, false);
      assert.equal(marbleAcid.blockedByP1, true);
      assert.ok(marbleAcid.violations.some((v) => v.id === 'p1-acid-ligurian-stone'));

      const woolProtease = checkChemicalSafetyP0({ reagents: ['Percarbonato', 'Proteasi Subtilisin'], surface: 'Maglione in lana cashmere' });
      assert.equal(woolProtease.safe, false);
      assert.ok(woolProtease.violations.some((v) => v.id === 'p1-protease-alkali-wool'));

      const boatBleach = checkChemicalSafetyP0({ reagents: ['Candeggina'], boatMode: true });
      assert.equal(boatBleach.blockedByP0, true);
      assert.ok(boatBleach.violations.some((v) => v.id === 'p0-marine-bleach'));
    });
  });

  describe('4. 4-Axis Sinner Solver, Rapallo Water Hardness (14–22 °f) & Myth-Busters', () => {
    it('ensures every Sinner protocol sums to 100% and protects marble, cold-water proteins, wool, microfiber, and boat', () => {
      const matrix = homeChemistryService.getMatrix();
      assert.equal(matrix.soilTaxonomy.length, 8, 'Must define all 8 soil classes');
      for (const p of matrix.sinnerProtocols) {
        const sum =
          p.sinnerCircle.chemistryPct +
          p.sinnerCircle.tempPct +
          p.sinnerCircle.timePct +
          p.sinnerCircle.mechanicalPct;
        assert.equal(sum, 100, `Sinner circle for ${p.id} must sum to 100, got ${sum}`);
      }

      const marbleRes = resolveStainOrSoil({
        surface: 'Marmo di Carrara / Ardesia',
        soil: 'calcare',
        ownedKitKeys: ['detersivo_piatti_neutro']
      });
      assert.equal(marbleRes.surface.id, 'marmo_ardesia_graniglia');
      assert.equal(marbleRes.sinnerCircle.totalPct, 100);
      assert.match(marbleRes.doNotDoFirst, /VIETATO.*ACIDO/i);
      assert.ok(!marbleRes.requiredKitPillars.some((k) => k.key === 'acido_citrico_puro'));

      const bloodRes = resolveStainOrSoil({ surface: 'camicia cotone', soil: 'macchia di sangue' });
      assert.equal(bloodRes.soil.id, 'biopolymer_protein_starch');
      assert.match(bloodRes.doNotDoFirst, /acqua calda/i);

      const fishInox = resolveStainOrSoil({ surface: 'casseruola_inox', soil: 'odore di pesce trimetilammina' });
      assert.equal(fishInox.protocolId, 'proto-inox-fish-amines');
      assert.ok(fishInox.requiredKitPillars.some((k) => k.key === 'acido_citrico_puro'));

      const maillardUpgrade = resolveStainOrSoil({
        surface: 'acciaio inox',
        soil: 'olio',
        peakTempC: 215
      });
      assert.equal(maillardUpgrade.soil.id, 'lipid_polymerized', 'Oil >= 180°C must auto-upgrade to lipid_polymerized');

      const boatRes = resolveStainOrSoil({ surface: 'candelieri AISI 316', soil: 'salsedine', boatMode: true });
      assert.equal(boatRes.surface.id, 'barca_aisi316_gelcoat');
      assert.match(boatRes.doNotDoFirst, /mare/i);
    });

    it('calibrates Minimal Chemical Kit (7 pillars) and Appliance Maintenance to Iren Rapallo water hardness (14–22 °f)', () => {
      const kit = getMinimalKitGuide({ waterHardnessF: 18, ownedKitKeys: ['acido_citrico_puro'] });
      assert.equal(kit.pillarCount, 7);
      assert.equal(kit.waterHardness.frenchDegrees, 18);
      assert.deepEqual(kit.waterHardness.rapalloReferenceRange, [14, 22]);
      assert.ok(kit.totalCommercialBottlesReplaced >= 20);
      assert.equal(kit.purePowderSafetyLocksP0.length, 3);

      const percarbPillar = kit.pillars.find((p) => p.key === 'sodio_percarbonato');
      assert.equal(percarbPillar.preparedSolutionRecipe.allowedInClosedSprayBottle, false);

      const hardKit = getMinimalKitGuide({ waterHardnessF: 32 });
      assert.equal(hardKit.waterHardness.detergentMultiplierVsEu25F, 1.3);

      const maint = getApplianceMaintenancePlan({ waterHardnessF: 18, includeBoat: true });
      assert.ok(maint.appliances.length >= 5);
      assert.ok(maint.boatCareModule);
      const washer = maint.appliances.find((a) => a.id === 'app-washing-machine');
      assert.ok(washer.decoupledSteps.some((s) => /MAI insieme/i.test(s)));

      const myths = getMythBusters({ topic: 'bicarbonato' });
      assert.ok(myths.some((m) => m.id === 'myth-vinegar-bicarbonate' && /CH3COONa/.test(m.stoichiometry)));

      const inci = decodeDetergentInci('Aqua, Sodium Laureth Sulfate, Subtilisin, Sodium Carbonate Peroxide, TAED');
      assert.ok(inci.detectedActives.length >= 3);
      assert.ok(inci.warnings.some((w) => /Lana e Seta/i.test(w)));
    });
  });

  describe('5. ADR-0006 Honesty & Reg. 648/2004 Interval Dominance on Rapallo Detergent Offers + Express Router', () => {
    let server;
    let baseUrl;

    before(async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/home-chemistry', homeChemistryRouter);
      await new Promise((resolve) => {
        server = http.createServer(app).listen(0, '127.0.0.1', () => {
          const addr = server.address();
          baseUrl = `http://127.0.0.1:${addr.port}/api/home-chemistry`;
          resolve();
        });
      });
    });

    after(async () => {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('keeps null metrics when PromoQui flyer omits format, and proves Interval Dominance without fake scalar % when format is known', async () => {
      const sampleOffers = [
        {
          id: 'off-no-size',
          storeId: 'rapallo-carrefour-assereto',
          storeName: 'Carrefour',
          title: 'Dash - Detersivo Liquido Lavatrice',
          promoPrice: 6.49
        },
        {
          id: 'off-explicit-washes',
          storeId: 'rapallo-basko-colombo',
          storeName: 'Basko',
          title: 'Dash Pods Detersivo Lavatrice 36 lavaggi',
          promoPrice: 9.0
        },
        {
          id: 'off-viakal-500',
          storeId: 'rapallo-tigota-lamarmora',
          storeName: 'Tigotà',
          title: 'Viakal Anticalcare Spray Classico 500 ml',
          promoPrice: 2.99
        },
        {
          id: 'off-perfume-ignored',
          storeId: 'rapallo-tigota-lamarmora',
          storeName: 'Tigotà',
          title: 'Coveri - Enrico',
          promoPrice: 12.9
        }
      ];

      const report = await evaluateDetergentOffersRapallo(sampleOffers, { waterHardnessF: 18 });
      assert.equal(report.totalCleaningOffers, 3, 'Perfume must be excluded from cleaning offers evaluation');

      const noSize = report.offers.find((o) => o.id === 'off-no-size');
      assert.equal(noSize.packSizeStatus, 'omitted_on_flyer');
      assert.equal(noSize.costPerStandardCycleEur, null, 'ADR-0006: never invent wash count when omitted');
      assert.equal(noSize.intervalDominanceComparison, null, 'ADR-0006: never compute active interval without explicit mass/volume');

      const explicitWash = report.offers.find((o) => o.id === 'off-explicit-washes');
      assert.equal(explicitWash.packSizeStatus, 'explicit_verified');
      assert.equal(explicitWash.washCount, 36);
      assert.equal(explicitWash.costPerStandardCycleEur, 0.25);
      assert.equal(explicitWash.costPerRapalloCycleEur, 0.25); // 1.0x at 18 °f

      const viakal = report.offers.find((o) => o.id === 'off-viakal-500');
      assert.ok(viakal.intervalDominanceComparison);
      assert.deepEqual(viakal.intervalDominanceComparison.commercialActivePctRange, [1, 5]);
      assert.equal(viakal.intervalDominanceComparison.assumedCommercialUpperBoundPct, 5);
      assert.equal(viakal.intervalDominanceComparison.dominanceProven, true);
      assert.ok(viakal.intervalDominanceComparison.certifiedMinSavingsPct >= 85);
    });

    it('serves all /api/home-chemistry endpoints cleanly via Express router', async () => {
      const solveRes = await fetch(`${baseUrl}/solve?surface=marmo&soil=calcare`).then((r) => r.json());
      assert.equal(solveRes.surface.id, 'marmo_ardesia_graniglia');

      const safetyRes = await fetch(`${baseUrl}/safety-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reagents: ['Candeggina', 'Viakal'] })
      }).then((r) => r.json());
      assert.equal(safetyRes.blockedByP0, true);

      const kitRes = await fetch(`${baseUrl}/minimal-kit?waterHardnessF=18`).then((r) => r.json());
      assert.equal(kitRes.pillarCount, 7);

      const mythsRes = await fetch(`${baseUrl}/myths`).then((r) => r.json());
      assert.ok(mythsRes.myths.length >= 6);

      const appRes = await fetch(`${baseUrl}/appliances`).then((r) => r.json());
      assert.ok(appRes.appliances.length >= 5);

      const offersRes = await fetch(`${baseUrl}/offers-value`).then((r) => r.json());
      assert.ok(Array.isArray(offersRes.offers) && offersRes.totalCleaningOffers >= 1);
      assert.equal(offersRes.totalCleaningOffers, offersRes.offers.length);

      // Also verify deterministic seed evaluation (21 genuine home_cleaning offers after purging 5 drugstore perfumes)
      const allSeed = JSON.parse(fs.readFileSync(OFFERS_SEED_PATH, 'utf8'));
      const seedEval = await evaluateDetergentOffersRapallo(allSeed, { waterHardnessF: 18 });
      assert.ok(seedEval.totalCleaningOffers >= 18);
    });
  });
});

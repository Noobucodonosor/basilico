/**
 * Basilico — Unit Tests for Recipes, Tigullio Restaurants, Arbitrage & 80/20 Solver (ADR-0011 / TASK-M5-01)
 * Location: tests/unit/recipe_arbitrage_8020.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {
  RecipeAndArbitrageService,
  matchBomIngredientToOffer,
  resolveIngredientPackSpec,
  resolveRestaurantZona,
  classifyDishMetadata
} from '../../server/services/recipeAndArbitrageService.js';
import { creaService } from '../../server/services/creaService.js';

test('RecipeAndArbitrageService — Certified Catalog Integrity (Verified Provincia di Genova Menus & Censused Restaurants)', () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test-${Date.now()}.json`)
  });

  const dishes = svc.getDishesSeed();
  const activeRestaurants = svc.getRestaurants();
  const allCensusedRestaurants = svc.getRestaurants({ includeWithoutMenu: true });

  assert.ok(allCensusedRestaurants.length >= 32, 'Must preserve all censused Provincia di Genova restaurants when includeWithoutMenu=true');
  assert.ok(
    allCensusedRestaurants.length - activeRestaurants.length >= 9,
    'Must preserve the 9 historic Tigullio restaurants without public menus in full anagrafica'
  );
  assert.ok(activeRestaurants.length >= 23, `Expected at least 23 active restaurants with verified priced menus, got ${activeRestaurants.length}`);
  assert.ok(
    activeRestaurants.every((r) => r.dishCount > 0 && Boolean(r.zona)),
    'Default getRestaurants() must strictly return only restaurants with dishCount > 0 and canonical zona'
  );
  assert.ok(dishes.length >= 360, `Expected at least 360 dishes after expansion, got ${dishes.length}`);

  const totalBomRows = dishes.reduce((acc, d) => acc + (d.bom?.length || 0), 0);
  assert.ok(totalBomRows >= 1500, `Expected at least 1500 BOM rows, got ${totalBomRows}`);
});

test('RecipeAndArbitrageService — Profile-Adapted Variant & Dual Cost Arbitrage', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test2-${Date.now()}.json`)
  });

  const dishes = svc.getDishesSeed();
  // tigullio-dish-2 has Parmigiano Reggiano DOP 24 mesi
  const dishWithCheese = dishes.find((d) => d.id === 'tigullio-dish-2');
  assert.ok(dishWithCheese, 'Expected tigullio-dish-2 in seed');

  // Evaluate for 'casa' profile (cheese excluded)
  const evalDany = await svc.evaluateDish(dishWithCheese, { profileId: 'casa', servings: 2 });
  assert.equal(evalDany.hasProfileSubstitution, true, 'Must trigger dairy-free Ligurian substitution for casa');
  assert.ok(evalDany.substitutionsApplied.length >= 1);
  assert.equal(evalDany.servings, 2);
  assert.ok(evalDany.costAndArbitrage.purePortionCostEur > 0);
  assert.ok(evalDany.costAndArbitrage.totalMenuPriceEur === dishWithCheese.menuPriceEuro * 2);
  assert.equal(
    evalDany.costAndArbitrage.arbitrageSavingsEur,
    Number((evalDany.costAndArbitrage.totalMenuPriceEur - evalDany.costAndArbitrage.purePortionCostEur).toFixed(2))
  );

  // Evaluate for 'ospiti' profile (no exclusions)
  const evalFree = await svc.evaluateDish(dishWithCheese, { profileId: 'ospiti', servings: 1 });
  assert.equal(evalFree.hasProfileSubstitution, false, 'Must not substitute cheese for ospiti profile');
});

test('RecipeAndArbitrageService — 80/20 Max-Coverage Basket & Science Cooking Session', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test3-${Date.now()}.json`)
  });

  const pareto = await svc.computeMaxCoverage8020({ topK: 10 });
  assert.equal(pareto.paretoBasket.length, 10);
  assert.ok(pareto.totalCatalogDishes >= 234);
  assert.ok(
    pareto.paretoBasket[9].cumulativeUnlockedDishesCount >= pareto.paretoBasket[0].cumulativeUnlockedDishesCount
  );

  // Check Harvard Science & Cooking session translation for Induction vs Gas
  const sessionInduction = await svc.getScientificCookingSession('starred-cracco-spaghetto-pomodoro-studio', {
    heatSource: 'induction',
    servings: 2
  });
  assert.equal(sessionInduction.heatSource, 'induction');
  assert.ok(sessionInduction.scientificSteps.length >= 3);
  assert.match(sessionInduction.scientificSteps[1].stoveInstruction, /Induzione/i);
  assert.ok(sessionInduction.kitchenReset.protocols.length >= 1);
});

test('RecipeAndArbitrageService — Expanded Single/Breakfast/Boat Catalog & Twin Deduplication (ADR-0013 / TASK-REAL-02)', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test4-${Date.now()}.json`)
  });

  const all = svc.getDishesSeed();
  assert.ok(all.length >= 264, `Expected >=264 dishes after TASK-REAL-02 expansion, got ${all.length}`);

  const breakfasts = all.filter((d) => d.course === 'colazione');
  assert.ok(breakfasts.length >= 6, `Expected >=6 real breakfast recipes, got ${breakfasts.length}`);

  const boatDishes = await svc.queryDishes({ mealContext: 'boat_cooler', limit: 50 });
  const coldSafeCount = boatDishes.dishes.filter((d) => d.boatSafeCold).length;
  assert.ok(coldSafeCount >= 13, `Expected >=13 cold-safe boat dishes, got ${coldSafeCount}`);

  // Comparative restaurant twin deduplication
  const rawPesto = await svc.queryDishes({ q: 'pesto', sourceType: 'tigullio_restaurant', deduplicateTwins: false, limit: 50 });
  const dedupPesto = await svc.queryDishes({ q: 'pesto', sourceType: 'tigullio_restaurant', deduplicateTwins: true, limit: 50 });
  assert.ok(rawPesto.totalMatching > dedupPesto.totalMatching, 'Deduplicating homologous twins must consolidate multiple restaurant pesto entries');
  assert.ok(dedupPesto.dishes.some((d) => d.restaurantPriceRangeEur && d.restaurantPriceRangeEur.count >= 5));
});

test('RecipeAndArbitrageService — Strict BOM Matcher, Granular Packs, 3-Tier Zero-Cheese & 8 Archetypes (ADR-0013 / TASK-REAL-03)', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test5-${Date.now()}.json`)
  });

  // 1. Strict word-boundary & physical-state offer matching (zero substring hallucinations)
  const fakeTraps = [
    { id: 'trap-1', title: 'Battaglio Ananas 1 kg', brand: 'Battaglio', domain: 'food_human', promoPrice: 1.99 },
    { id: 'trap-2', title: 'Tonno Rio Mare all Olio di Oliva 4x80g', brand: 'Rio Mare', domain: 'food_human', promoPrice: 4.99 },
    { id: 'trap-3', title: 'La Robiola Osella con Latte Fresco 100g', brand: 'Osella', domain: 'food_human', promoPrice: 1.49 },
    { id: 'trap-4', title: 'Salsa di Noci Fresca 150g', brand: 'Biffi', domain: 'food_human', promoPrice: 2.39 },
    { id: 'valid-garlic', title: 'Aglio Bianco Italiano Rete 100g', brand: '', domain: 'food_human', promoPrice: 1.19 }
  ];

  assert.equal(matchBomIngredientToOffer({ name: 'Aglio fresco', creaId: '005010' }, [fakeTraps[0]]), null, 'Aglio must NEVER match Battaglio');
  assert.equal(matchBomIngredientToOffer({ name: 'Tonno rosso crudo abbattuto', creaId: '123520' }, [fakeTraps[1]]), null, 'Raw tuna must NEVER match canned Rio Mare');
  assert.equal(matchBomIngredientToOffer({ name: 'Latte parzialmente scremato', creaId: '130020' }, [fakeTraps[2]]), null, 'Milk must NEVER match Robiola cheese');
  assert.equal(matchBomIngredientToOffer({ name: 'Gherigli di noci', creaId: '009910' }, [fakeTraps[3]]), null, 'Raw walnuts must NEVER match processed walnut sauce');
  assert.equal(matchBomIngredientToOffer({ name: 'Aglio fresco', creaId: '005010' }, fakeTraps)?.id, 'valid-garlic');

  // 2. Granular commercial packs (3g herbs -> 30g pack < €2.00, not 500g)
  const herbSpec = resolveIngredientPackSpec('Maggiorana fresca ligure');
  assert.equal(herbSpec.packGrams, 30);
  const pineSpec = resolveIngredientPackSpec('Pinoli italiani');
  assert.equal(pineSpec.packGrams, 50);
  const garlicSpec = resolveIngredientPackSpec('Aglio di Vessalico');
  assert.equal(garlicSpec.packGrams, 100);

  // 3. 3-Tier Zero-Cheese: structural dairy dishes flagged honestly, Pansotti herb-bound cleanly
  const all = svc.getDishesSeed();
  const structuralDairyDish = all.find((d) => /focaccia\s+(?:col|al)\s+formaggio|caprese|tiramisu/i.test(d.title));
  assert.ok(structuralDairyDish, 'Expected structural dairy dish in catalog');
  const evalStructuralDany = await svc.evaluateDish(structuralDairyDish, { profileId: 'casa', servings: 1 });
  assert.equal(evalStructuralDany.isExcludedByProfileIdentity, true, 'Structural dairy dish must be flagged as excluded for casa');
  assert.equal(evalStructuralDany.hasProfileSubstitution, false, 'Structural dairy dish must NOT receive absurd olive-oil substitution');

  const pansottiDish = all.find((d) => /pansot/i.test(d.title));
  if (pansottiDish) {
    const evalPansotti = await svc.evaluateDish(pansottiDish, { profileId: 'casa', servings: 1 });
    assert.equal(evalPansotti.isExcludedByProfileIdentity, false);
    assert.equal(evalPansotti.hasProfileSubstitution, true);
  }

  // 4. Distinct Science & Cooking archetypes across diverse dishes
  const archetypesSeen = new Set();
  const sampleIds = [
    'tigullio-dish-2', // pesto pasta
    'starred-cracco-spaghetto-pomodoro-studio', // starch_emulsion_pasta
    all.find((d) => d.boatSafeCold && d.course === 'piatto_unico_barca')?.id, // cold_osmotic_boat_cambusa
    all.find((d) => /risott/i.test(d.title))?.id, // amylopectin_risotto
    all.find((d) => d.course === 'secondo' && /orata|branzino|acciug/i.test(d.title))?.id, // fish_skin_maillard_or_poach
    all.find((d) => d.course === 'colazione' && /avena|porridge|yogurt/i.test(d.title))?.id // baking_or_breakfast_gelatinization
  ].filter(Boolean);

  for (const sid of sampleIds) {
    const sess = await svc.getScientificCookingSession(sid, { heatSource: 'gas', servings: 1 });
    assert.ok(sess.cookingArchetype, `Expected cookingArchetype for ${sid}`);
    assert.ok(sess.scientificSteps.length >= 3);
    archetypesSeen.add(sess.cookingArchetype);
  }
  assert.ok(archetypesSeen.size >= 5, `Expected at least 5 distinct cooking archetypes across sample dishes, got ${archetypesSeen.size}`);
});

test('RecipeAndArbitrageService — Regression Suite M-P0-07..09 & M-P1-05..20 (CREA Integrity, Semantic BOM Guards, 3-Tier Sweet Dairy, Sort-Before-Slice, Cold Desserts)', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-reg-${Date.now()}.json`)
  });

  const dishes = svc.getDishesSeed();

  // M-P0-09: 100% of BOM creaId references across all dishes must exist in CREA database,
  // and 100% of newly added TASK-M5-03 dishes (numericId >= 231) must have canonical cookware_archetypes.json IDs
  const cookwareSeed = JSON.parse(
    await import('node:fs').then((m) => m.default.readFileSync(path.resolve(process.cwd(), 'data/seed/cookware_archetypes.json'), 'utf8'))
  );
  const validCookwareIds = new Set(cookwareSeed.map((c) => c.id));
  for (const d of dishes) {
    for (const b of d.bom || []) {
      const food = creaService.getFoodById(b.creaId);
      assert.ok(food, `Dish ${d.id} BOM "${b.name}" has invalid creaId "${b.creaId}"`);
    }
    if (Number(d.numericId) >= 231) {
      assert.ok(d.menuPriceEuro > 0 && d.menuSourceUrl, `New dish ${d.id} must have verified price & menuSourceUrl`);
      for (const cid of d.cookwareRequired || []) {
        assert.ok(validCookwareIds.has(cid), `New dish ${d.id} has invalid cookwareRequired ID "${cid}"`);
      }
    }
  }
  const cracco = dishes.find((d) => d.id === 'starred-cracco-spaghetto-pomodoro-studio');
  assert.equal(cracco.bom[0].creaId, '000800', 'Spaghetti must use Pasta di semola 000800, never Miglio 000080');
  assert.equal(cracco.bom[1].creaId, '006680', 'Pelati/Passata must use 006680, never Cicoria 005240');

  // M-P0-07 & M-P1-20: Canned fish `all'olio` pack spec, semantic guards & weightless multipack cap
  assert.equal(resolveIngredientPackSpec("Rio Mare - Tonno All'Olio Di Oliva").family, 'canned_fish');

  const adversarialOffers = [
    { id: 'mutti-passata', title: 'Mutti - Passata Di Pomodoro 700g', brand: 'Mutti', domain: 'food_human', promoPrice: 1.29 },
    { id: 'alpli-fiocchi', title: 'Alplì - Fiocchi Di Latte Classici', brand: 'Alplì', domain: 'food_human', promoPrice: 0.99, profileCompatibility: { isCompatible: false } },
    { id: 'novi-crema', title: 'Novi - Crema Spalmabile Nocciole', brand: 'Novi', domain: 'food_human', promoPrice: 2.99 },
    { id: 'tacchino-petto', title: 'Petto Di Tacchino A Fette', brand: '', domain: 'food_human', promoPrice: 3.49 },
    { id: 'life-disidratata', title: 'Life - Frutta Disidratata Mix', brand: 'Life', domain: 'food_human', promoPrice: 1.99 },
    { id: 'champignon', title: 'Funghi Champignon Affettati', brand: '', domain: 'food_human', promoPrice: 1.49 },
    { id: 'riomare-olio', title: "Rio Mare - Tonno All'Olio Di Oliva", brand: 'Rio Mare', domain: 'food_human', promoPrice: 6.69 }
  ];

  assert.equal(matchBomIngredientToOffer({ name: 'Spicchi di agrume / mela fresca pelata a vivo', creaId: '007130' }, adversarialOffers), null);
  assert.equal(matchBomIngredientToOffer({ name: 'Mandorle dolci secche pelate', creaId: '008540' }, adversarialOffers), null);
  assert.equal(matchBomIngredientToOffer({ name: "Fiocchi d'avena integrali", creaId: '003030' }, adversarialOffers), null);
  assert.equal(matchBomIngredientToOffer({ name: 'Crema di latte / panna fresca', creaId: '140100' }, adversarialOffers), null);
  assert.equal(matchBomIngredientToOffer({ name: 'Petto di pollo fresco a bocconcini', creaId: '106500' }, adversarialOffers), null);
  assert.equal(matchBomIngredientToOffer({ name: 'Frutta fresca di stagione', creaId: '007130' }, adversarialOffers), null);
  assert.equal(matchBomIngredientToOffer({ name: 'Funghi porcini freschi', creaId: '006030' }, adversarialOffers), null);
  assert.equal(matchBomIngredientToOffer({ name: 'Tonno al naturale sgocciolato', creaId: '123550' }, adversarialOffers), null);

  const oilTunaDish = dishes.find((d) => d.id === 'base-barca-insalata-mare-ceci');
  const eval669 = await svc.evaluateDish(oilTunaDish, {
    profileId: 'casa',
    activeOffers: [adversarialOffers.at(-1)]
  });
  const tunaLine = eval669.bom.find((b) => /tonno/i.test(b.name));
  assert.ok(tunaLine.euroPerKg < 25, `Weightless €6.69 multipack must never inflate to €41.81/kg (got ${tunaLine.euroPerKg})`);

  // M-P0-08 & M-P1-13: Sweet ricotta/mascarpone/semifreddo desserts excluded honestly (never savory potato!) & isSubstitutedComposite preserved
  const cassata = dishes.find((d) => d.id === 'tigullio-dish-227');
  const schiumone = dishes.find((d) => d.id === 'tigullio-dish-179');
  for (const pid of ['casa', 'barca']) {
    const evCassata = await svc.evaluateDish(cassata, { profileId: pid });
    assert.equal(evCassata.isExcludedByProfileIdentity, true);
    assert.equal(evCassata.hasProfileSubstitution, false);
    const evSchiumone = await svc.evaluateDish(schiumone, { profileId: pid });
    assert.equal(evSchiumone.isExcludedByProfileIdentity, true);
    assert.equal(evSchiumone.hasProfileSubstitution, false);
  }

  const dishWithParmigiano = dishes.find((d) => d.id === 'tigullio-dish-2');
  const evParm = await svc.evaluateDish(dishWithParmigiano, { profileId: 'casa' });
  assert.ok(evParm.bom.some((b) => b.isSubstitutedComposite === true), 'Substituted composite BOM flag must be preserved');

  // M-P1-05: 80/20 respects profileId & computes unlockedDishesCount before .slice(0, 30)
  const paretoDany = await svc.computeMaxCoverage8020({ topK: 15, profileId: 'casa' });
  assert.ok(
    !paretoDany.paretoBasket.some((i) =>
      /\b(burrata|parmigiano|pecorino|mascarpone|ricotta|mozzarella|gorgonzola|stracchino|crescenza|formaggi\w*)\b/i.test(
        i.name
      )
    )
  );
  assert.equal(paretoDany.unlockedDishesCount, paretoDany.paretoBasket.at(-1).cumulativeUnlockedDishesCount);

  // M-P1-10: deconstructCustomMenuDish splits comma-separated ingredients BEFORE normalizing
  const customDish = await svc.deconstructCustomMenuDish({
    title: 'Trenette Test Rapallo',
    menuPriceEuro: 18,
    ingredientsText: 'pasta di semola, patate, fagiolini, pinoli',
    profileId: 'casa'
  });
  assert.equal(customDish.bom.length, 4);
  assert.ok(!customDish.bom.some((b) => b.creaId === '120010'));

  // M-P1-11 & M-P1-14: Global sort before pagination (with 2500 full-catalog limit), strict boatSafeCold, Semifreddi cold archetype & Frittata non-fried
  const top5Cheapest = await svc.queryDishes({ sortBy: 'cost_asc', limit: 5 });
  const allCheapest = await svc.queryDishes({ sortBy: 'cost_asc', limit: 2500 });
  assert.equal(top5Cheapest.dishes[0].id, allCheapest.dishes[0].id);
  assert.equal(allCheapest.dishes.length, allCheapest.totalMatching, 'limit=2500 must inspect 100% of catalog dishes');

  const boatOnly = await svc.queryDishes({ mealContext: 'boat_cooler', limit: 100 });
  assert.ok(boatOnly.dishes.every((d) => d.boatSafeCold === true), 'boat_cooler filter must strictly enforce boatSafeCold');

  const semifreddiSess = await svc.getScientificCookingSession('tigullio-dish-228', { profileId: 'ospiti' });
  assert.equal(semifreddiSess.cookingArchetype, 'cold_emulsion_or_frozen_dessert');

  const frittataDish = dishes.find((d) => d.id === 'base-single-frittata-zucchine-basilico-no-formaggio');
  const evalFrittata = await svc.evaluateDish(frittataDish, { profileId: 'casa' });
  assert.notEqual(evalFrittata.dishFamily, 'fried_dish', 'Frittata must never be classified as deep-fried');
  assert.equal(evalFrittata.lightDinnerSuitable, true);

  // Structural cheese dishes from Angolo 48 SML must be honestly excluded under Zero-Formaggi (casa)
  const fugassetteDish = dishes.find((d) => d.id === 'tigullio-dish-299');
  const sanSteDish = dishes.find((d) => d.id === 'tigullio-dish-300');
  assert.ok(fugassetteDish && sanSteDish, 'Expected Angolo 48 SML structural cheese dishes in seed');
  const evalFugassette = await svc.evaluateDish(fugassetteDish, { profileId: 'casa' });
  const evalSanSte = await svc.evaluateDish(sanSteDish, { profileId: 'casa' });
  assert.equal(evalFugassette.dairyRole, 'structural_unsubstitutable');
  assert.equal(evalFugassette.isExcludedByProfileIdentity, true);
  assert.equal(evalFugassette.dishFamily, 'pizza_focaccia');
  assert.equal(evalSanSte.dairyRole, 'structural_unsubstitutable');
  assert.equal(evalSanSte.isExcludedByProfileIdentity, true);
});

test('RecipeAndArbitrageService — Provincia di Genova Zona/Citta Filters & Recco/Genova Structural Cheese Guards (TASK-M5-04)', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-ge-${Date.now()}.json`)
  });

  // 1. Canonical Zona resolution across Provincia di Genova
  assert.equal(resolveRestaurantZona({ citta: 'Rapallo' }), 'Tigullio Ovest (Rapallo-SML-Portofino)');
  assert.equal(resolveRestaurantZona({ citta: 'Santa Margherita Ligure' }), 'Tigullio Ovest (Rapallo-SML-Portofino)');
  assert.equal(resolveRestaurantZona({ citta: 'Recco' }), 'Golfo Paradiso');
  assert.equal(resolveRestaurantZona({ citta: 'Camogli' }), 'Golfo Paradiso');
  assert.equal(resolveRestaurantZona({ citta: 'Chiavari' }), 'Tigullio Est (Chiavari-Sestri-Moneglia)');
  assert.equal(resolveRestaurantZona({ citta: 'Sestri Levante' }), 'Tigullio Est (Chiavari-Sestri-Moneglia)');
  assert.equal(resolveRestaurantZona({ citta: 'Genova', zona: 'Genova Centro & Porto Antico' }), 'Genova Centro & Porto Antico');
  assert.equal(resolveRestaurantZona({ citta: 'Genova', indirizzo: 'Via Boccadasse 1' }), 'Genova Mare (Boccadasse-Nervi)');
  assert.equal(resolveRestaurantZona({ citta: 'Arenzano' }), 'Ponente Genovese');
  assert.equal(resolveRestaurantZona({ citta: 'Campo Ligure' }), 'Entroterra Genovese');

  // 2. Dynamic zona & citta filters consistency between getRestaurants() and queryDishes()
  const fullQuery = await svc.queryDishes({ limit: 2500 });
  assert.ok(Array.isArray(fullQuery.zones) && fullQuery.zones.length >= 1);
  assert.ok(Array.isArray(fullQuery.cities) && fullQuery.cities.length >= 3);

  const sampleZone = fullQuery.zones[0];
  const zoneRests = svc.getRestaurants({ zona: sampleZone.zona });
  assert.equal(zoneRests.length, sampleZone.restaurantCount);
  assert.ok(zoneRests.every((r) => r.zona === sampleZone.zona && r.dishCount > 0));

  const zoneDishesRes = await svc.queryDishes({ zona: sampleZone.zona, limit: 2500 });
  assert.equal(zoneDishesRes.totalMatching, sampleZone.dishCount);
  assert.ok(zoneDishesRes.dishes.every((d) => d.zona === sampleZone.zona));

  const sampleCity = fullQuery.cities[0];
  const cityRests = svc.getRestaurants({ citta: sampleCity.citta });
  assert.ok(cityRests.length >= sampleCity.restaurantCount);
  const cityDishesRes = await svc.queryDishes({ citta: sampleCity.citta, zona: sampleCity.zona, limit: 2500 });
  assert.equal(cityDishesRes.totalMatching, sampleCity.dishCount);

  // 3. Recco/Genova structural cheese dishes vs non-cheese false-positive guards
  const reccoCheeseDishes = [
    {
      id: 'test-focaccia-recco',
      title: 'La Focaccia di Recco IGP',
      course: 'focaccia',
      bom: [
        { creaId: '000220', name: 'Farina di frumento 00', rawGramsPerServing: 90 },
        { creaId: '167250', name: 'Stracchino / Crescenza fresca', rawGramsPerServing: 110, isDairy: true }
      ]
    },
    {
      id: 'test-pizzata-recco',
      title: 'Pizzata di Recco',
      course: 'focaccia',
      bom: [
        { creaId: '000220', name: 'Farina di frumento 00', rawGramsPerServing: 90 },
        { creaId: '167250', name: 'Stracchino fresco', rawGramsPerServing: 95, isDairy: true },
        { creaId: '006680', name: 'Polpa di pomodoro', rawGramsPerServing: 50 }
      ]
    },
    {
      id: 'test-seirass',
      title: 'Seirass del Fen con miele di castagno',
      course: 'dolce',
      bom: [{ creaId: '166820', name: 'Seirass vaccino ligure', rawGramsPerServing: 100, isDairy: true }]
    },
    {
      id: 'test-parmigiana',
      title: 'Parmigiana di melanzane classica',
      course: 'antipasto',
      bom: [
        { creaId: '005500', name: 'Melanzane fresche', rawGramsPerServing: 160 },
        { creaId: '164820', name: 'Mozzarella fiordilatte', rawGramsPerServing: 80, isDairy: true },
        { creaId: '166000', name: 'Parmigiano Reggiano DOP', rawGramsPerServing: 25, isDairy: true }
      ]
    }
  ];

  for (const sample of reccoCheeseDishes) {
    const ev = await svc.evaluateDish(sample, { profileId: 'casa' });
    assert.equal(ev.dairyRole, 'structural_unsubstitutable', `${sample.title} must be structural_unsubstitutable`);
    assert.equal(ev.isExcludedByProfileIdentity, true, `${sample.title} must be excluded for casa`);
    assert.equal(ev.hasProfileSubstitution, false);
  }

  // Non-cheese false positive guards: Trofie di Recco & Torta Caprese must NOT be misclassified as structural mozzarella/Recco cheese
  const trofieMeta = classifyDishMetadata({
    title: 'Trofie di Recco al pesto',
    course: 'primo',
    bom: [{ creaId: '166000', name: 'Parmigiano Reggiano', rawGramsPerServing: 18, isDairy: true }]
  });
  assert.equal(trofieMeta.dairyRole, 'secondary_umami_finisher');

  const tortaCapreseMeta = classifyDishMetadata({
    title: 'Torta Caprese alle mandorle e cioccolato fondente',
    course: 'dolce',
    bom: [{ creaId: '008540', name: 'Mandorle dolci', rawGramsPerServing: 50 }]
  });
  assert.equal(tortaCapreseMeta.dairyRole, 'none');
});

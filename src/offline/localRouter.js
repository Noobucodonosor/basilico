/**
 * C.I.B.O. / Basilico — In-Browser Virtual API Router (Static / Full-Offline Mode)
 * Resolves `/api/*` requests against preloaded static JSON datasets in `public/data/`
 * and persistent user state in IndexedDB / localStorage.
 */

import { getDataset, getUserState, setUserState } from './localStore.js';

export function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function parseBody(init) {
  if (!init || !init.body) return {};
  if (typeof init.body === 'string') {
    try {
      return JSON.parse(init.body);
    } catch (_) {
      return {};
    }
  }
  return init.body;
}

const DEFAULT_PROFILES = {
  activeProfileId: 'ospiti',
  profiles: [
    { id: 'ospiti', name: 'Standard (Tutti gli ingredienti)', householdSize: 2, diet: 'mediterranea' },
    { id: 'dany', name: 'Senza latticini', householdSize: 2, diet: 'senza_latticini' },
    { id: 'barca', name: 'Cambusa & Barca', householdSize: 2, diet: 'no_fridge_resilient' }
  ]
};

const DEFAULT_CALIBRATION = {
  rhythmPreset: 'feriale',
  hourlyValueEuro: 15,
  kwhEuro: 0.28,
  smcEuro: 1.05
};

async function handleStores(url) {
  const stores = await getDataset('rapallo_stores.json', []);
  const includeLocal = url.searchParams.get('includeLocalShops') === 'true';
  const localShops = includeLocal ? await getDataset('rapallo_local_shops.json', []) : [];
  let list = [...stores, ...localShops];

  const hasOffers = url.searchParams.get('hasOffers');
  if (hasOffers === 'true') list = list.filter((s) => (s.activeOfferCount || 0) > 0);
  if (hasOffers === 'false') list = list.filter((s) => (s.activeOfferCount || 0) === 0);

  return jsonResponse({
    stores: list,
    totalStores: list.length,
    totalFlyers: list.reduce((acc, s) => acc + (s.flyerCount || 0), 0),
    totalOffers: list.reduce((acc, s) => acc + (s.activeOfferCount || 0), 0)
  });
}

async function handleFlyers(url) {
  const storeSet = new Set(
    (url.searchParams.get('storeId') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const raw = await getDataset('rapallo_flyers.json', []);
  const filtered = storeSet.size > 0 ? raw.filter((f) => storeSet.has(f.storeId)) : raw;
  const flyers = filtered.map((flyer) => {
    let pages = Array.isArray(flyer.pages) && flyer.pages.length > 0
      ? flyer.pages.map((p) => (typeof p === 'string' ? p : (p?.imageUrl || flyer.coverImageUrl)))
      : (Array.isArray(flyer.pageImages) && flyer.pageImages.length > 0
        ? flyer.pageImages
        : (flyer.coverImageUrl ? [flyer.coverImageUrl] : []));
    return {
      ...flyer,
      pages,
      pageCount: typeof flyer.pageCount === 'number' && flyer.pageCount >= 1 ? flyer.pageCount : Math.max(1, pages.length)
    };
  });
  return jsonResponse({ flyers, totalFlyers: flyers.length });
}

function resolveOfferCategory(o) {
  const title = normalizeText(o.title || '');
  const price = Number(o.promoPrice ?? o.price ?? 0);
  if (/\b(pantalone|maglia|felpa|scarpe|completo letto|lenzuol|trapunt|tovaglia|accappatoi|asciugaman)\b/.test(title)) {
    return 'Tessile, Abbigliamento e Bazar Casa';
  }
  if (/\b(giocattol|lego|barbie|playmobil|peluche|presepe|albero di natale|cry babies|air hockey|clementoni|hasbro|mattel|grinch)\b/.test(title)) {
    return 'Giocattoli, Natale e Tempo Libero';
  }
  if (
    /\b(padell|pentol|casseruol|friggitrice|forno|frigorifero|aspirapolvere|lavatric|lavastovigli|asciugatric|microonde|elettrodomestic|electrolux|whirlpool|hotpoint|bosch|samsung|rowenta)\b/.test(title) ||
    (/\bmiele\b/.test(title) && price >= 80)
  ) {
    return 'Pentole, Cucina ed Elettrodomestici';
  }
  if (/\b(detersiv|ammorbident|candeggina|svelto|lavatrice|lavastoviglie|spugn)\b/.test(title)) {
    return 'Cura Casa e Bucato';
  }
  if (/\b(shampoo|bagnoschiuma|dentifric|deodorant|crema viso|sapone mani)\b/.test(title)) {
    return 'Cura Persona e Igiene';
  }
  if (/\b(latte\s+(?:uht|intero|parzialmente|alta\s+digeribilita)|mozzarella|pecorino|parmigiano|yogurt|ricotta|stracchino|gorgonzola)\b/.test(title)) {
    return 'Latticini e Formaggi';
  }
  if (/\b(wudy|wurstel|prosciutto|salame|mortadella|speck|pollo|suino|bovino|tacchino|tonno|sgombro|salmone|merluzzo|cozze|vongole|gamber|ragu)\b/.test(title)) {
    return 'Carne e Pesce';
  }
  return o.category || 'Dispensa e Pasta';
}

function resolveOfferDomain(cat) {
  if (cat === 'Cura Casa e Bucato') return 'home_cleaning';
  if (cat === 'Cura Persona e Igiene') return 'personal_care';
  if (cat === 'Pentole, Cucina ed Elettrodomestici') return 'kitchen_cookware';
  if (cat === 'Animali Domestici') return 'pet_care';
  if (cat === 'Giocattoli, Natale e Tempo Libero' || cat === 'Tessile, Abbigliamento e Bazar Casa') return 'bazar_seasonal';
  return 'food_human';
}

function resolveStorageHint(o, domain) {
  if (domain !== 'food_human') return null;
  const title = normalizeText(o.title || '');
  if (o.category === 'Surgelati' || /\b(surgelat\w*|frozen|a cubetti)\b/.test(title)) {
    return '❄️ Freezer (-18°C): 6–12 mesi (24h in frigo scongelato)';
  }
  if (/\b(uht|passata|pelati|in scatola|sott\s*olio|tonno|sgombro|olive|capperi|miele)\b/.test(title)) {
    return '🫙 Dispensa: 12+ mesi chiuso (3–4 gg frigo aperto)';
  }
  if (/\b(secch[ioae]|pasta|riso|farina|avena|ceci|lenticch|fagioli|mandorl|noci|olio|caffe|biscott|taralli|fette biscottate)\b/.test(title)) {
    return '🥫 Dispensa secca: 6–18 mesi';
  }
  if (
    o.category === 'Carne e Pesce' ||
    o.category === 'Latticini e Formaggi' ||
    o.category === 'Frutta e Verdura' ||
    /\b(fresc[oaie]|pollo|suino|bovino|tacchino|mozzarella|latte|yogurt|ricotta|rucola|spinaci|carote|mele|banane)\b/.test(title)
  ) {
    return '🧊 Frigo (0–4°C): 2–5 giorni';
  }
  return '🥫 Dispensa / Frigo: vedi confezione';
}

const CREA_KEYWORD_OVERRIDES = [
  { re: /\bfunghi porcini\b/, id: '006030' },
  { re: /\b(funghi|champignon)\b/, id: '006000' },
  { re: /\b(pasta|spaghetti|penne|fusilli|taglierini|gnocchi)\b/, id: '000800' },
  { re: /\bolio extra vergine|olio evo\b/, id: '009210' },
  { re: /\bmozzarella\b/, id: '162030' },
  { re: /\bpecorino\b/, id: '162080' },
  { re: /\bpollo\b/, id: '106400' },
  { re: /\btacchino\b/, id: '106856' },
  { re: /\buova\b/, id: '181100' },
  { re: /\bbanan/, id: '007510' },
  { re: /\bmel[ae]\b/, id: '007130' },
  { re: /\bcarot/, id: '005150' },
  { re: /\bspinac/, id: '005700' },
  { re: /\bpatat/, id: '006500' },
  { re: /\bceci\b/, id: '004000' },
  { re: /\blenticch/, id: '004500' },
  { re: /\bmandorl/, id: '008540' },
  { re: /\bnoci\b/, id: '008570' },
  { re: /\bavena\b/, id: '003030' }
];

function resolveQuantityLabel(o, domain) {
  const price = Number(o.promoPrice ?? o.price ?? 0);
  const origPrice = o.originalPrice != null ? Number(o.originalPrice) : null;
  const hasFullPrice = Boolean(origPrice && price > 0 && origPrice > price);

  if (typeof o.packWeightGrams === 'number' && o.packWeightGrams > 0) {
    const isLiquid = /\/L\b/i.test(String(o.unitPrice || '')) || /\b(latte|acqua|olio|vino|birra|succo|bevanda|detersivo liquido|ammorbidente)\b/i.test(o.title || '');
    const unitSym = isLiquid ? 'L' : 'kg';
    if (o.quantityLabel && /^Sfuso a peso:/i.test(o.quantityLabel)) {
      const fullKg = hasFullPrice ? ` (anziché € ${origPrice.toFixed(2).replace('.', ',')}/kg)` : '';
      return `${o.quantityLabel}${fullKg}`;
    }
    if (o.quantityLabel && /^Al banco:/i.test(o.quantityLabel)) {
      const fullKg = hasFullPrice ? ` · anziché € ${(origPrice * 10).toFixed(2).replace('.', ',')}/kg` : '';
      return `${o.quantityLabel}${fullKg}`;
    }
    const label = o.packWeightGrams >= 1000
      ? `${(o.packWeightGrams / 1000).toFixed(2).replace(/\.00$/, '').replace('.', ',')} ${isLiquid ? 'L' : 'kg'}`
      : `${o.packWeightGrams} ${isLiquid ? 'ml' : 'g'}`;
    const promoPerUnit = price > 0 ? (price / o.packWeightGrams) * 1000 : null;
    const origPerUnit = hasFullPrice ? (origPrice / o.packWeightGrams) * 1000 : null;
    // Always compute €/kg mathematically from price & packWeightGrams so OCR misreads never corrupt unit price
    const promoTag = promoPerUnit ? `€ ${promoPerUnit.toFixed(2).replace('.', ',')}/${unitSym}` : (o.unitPrice || '');
    const origTag = origPerUnit ? ` (anziché € ${origPerUnit.toFixed(2).replace('.', ',')}/${unitSym})` : '';
    return promoTag ? `${label} · ${promoTag}${origTag}` : `Confezione: ${label}`;
  }

  if (o.quantityLabel) return o.quantityLabel;

  const text = `${o.title || ''} ${o.description || ''}`;
  const packMatch = text.match(/\b(\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|lt|l)|\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|lt|l|pz|pezzi|uova|rotoli|lavaggi))\b/i);
  if (packMatch) {
    return `Confezione: ${packMatch[1].replace(/\s+/g, ' ').trim()}`;
  }
  const unitStr = String(o.unitPrice || o.formattedNormalizedPrice || '');
  const unitMatch = unitStr.match(/(\d+(?:[.,]\d+)?)\s*€?\s*\/\s*(kg|l)\b/i) || unitStr.match(/€\s*(\d+(?:[.,]\d+)?)\s*\/\s*(kg|l)\b/i);
  if (unitMatch && price > 0) {
    const perUnit = Number(unitMatch[1].replace(',', '.'));
    const unitSym = unitMatch[2].toLowerCase() === 'l' ? 'L' : 'kg';
    if (perUnit > 0) {
      const gramsOrMl = Math.round((price / perUnit) * 1000);
      const origPerUnit = hasFullPrice ? perUnit * (origPrice / price) : null;
      const origTag = origPerUnit ? ` (anziché € ${origPerUnit.toFixed(2).replace('.', ',')}/${unitSym})` : '';
      return unitSym === 'L'
        ? `~${gramsOrMl >= 1000 ? `${(gramsOrMl / 1000).toFixed(2)} L` : `${gramsOrMl} ml`} · € ${perUnit.toFixed(2).replace('.', ',')}/L${origTag}`
        : `~${gramsOrMl >= 1000 ? `${(gramsOrMl / 1000).toFixed(2)} kg` : `${gramsOrMl} g`} · € ${perUnit.toFixed(2).replace('.', ',')}/kg${origTag}`;
    }
  }
  if (domain === 'kitchen_cookware' || domain === 'bazar_seasonal') {
    return null;
  }
  return 'Peso non indicato nel volantino';
}

function resolveCreaMatch(o, domain, creaById, creaList) {
  if (domain !== 'food_human' || creaList.length === 0) return null;
  const title = normalizeText(o.title || '');
  let matched = null;
  for (const rule of CREA_KEYWORD_OVERRIDES) {
    if (rule.re.test(title)) {
      matched = creaById.get(rule.id) || null;
      if (matched) break;
    }
  }
  if (!matched) {
    const words = title.split(/[\s\-/,]+/).filter((w) => w.length >= 5);
    for (const w of words.slice(0, 3)) {
      matched = creaList.find((f) => normalizeText(f.name).startsWith(w));
      if (matched) break;
    }
  }
  if (!matched) return null;
  const macro = matched.sections?.['MACRO NUTRIENTI'] || [];
  const getMacro = (label) => {
    const row = macro.find((m) => m.c === label);
    return Number(String(row?.v100 || 0).replace(',', '.')) || 0;
  };
  const kcal100 = Math.round(getMacro('Energia (kcal)'));
  const prot100 = getMacro('Proteine (g)');
  const carbs100 = getMacro('Carboidrati disponibili (g)');
  const fat100 = getMacro('Lipidi (g)');
  const fiber100 = getMacro('Fibra totale (g)');
  const price = Number(o.promoPrice ?? o.price ?? 0);
  const proteinGPerEuro = price > 0 && prot100 > 0 ? Math.round((prot100 * 3) / price) : 0;
  return {
    creaFoodId: matched.id,
    creaFoodName: matched.name,
    kcal100,
    prot100,
    carbs100,
    fat100,
    fiber100,
    nutrientsPerEuro: { proteinGPerEuro }
  };
}

async function handleOffers(url) {
  const [rawAll, stores, creaFoods] = await Promise.all([
    getDataset('rapallo_offers.json', []),
    getDataset('rapallo_stores.json', []),
    getDataset('crea_foods.json', [])
  ]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const creaById = new Map(creaFoods.map((f) => [String(f.id), f]));
  const all = rawAll.map((o) => {
    const cleanCat = resolveOfferCategory(o);
    const domain = o.domain || resolveOfferDomain(cleanCat);
    const store = storeById.get(o.storeId);
    const loyaltyCard = o.loyaltyCard || store?.loyaltyCard || null;
    const isMemberOnly = typeof o.isMemberOnly === 'boolean'
      ? o.isMemberOnly
      : Boolean(loyaltyCard?.requiredForPromo);
    return {
      ...o,
      category: cleanCat,
      domain,
      storeFullName: store?.name || o.storeName,
      storeAddress: store?.address ? `${store.address}, ${store.city || 'Rapallo'}` : null,
      loyaltyCard,
      isMemberOnly,
      quantityLabel: resolveQuantityLabel(o, domain),
      storageHint: o.storageHint || resolveStorageHint({ ...o, category: cleanCat }, domain),
      creaMatch: o.creaMatch || resolveCreaMatch(o, domain, creaById, creaFoods)
    };
  });
  const storeSet = new Set(
    (url.searchParams.get('storeId') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const domainSet = new Set(
    (url.searchParams.get('domain') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const q = normalizeText(url.searchParams.get('q') || url.searchParams.get('query') || '');
  const categorySet = new Set(
    (url.searchParams.get('category') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const excludedSet = new Set(
    (url.searchParams.get('excludeCategories') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const minDiscount = Number(url.searchParams.get('minDiscount') || 0);
  const excludeMemberOnly = url.searchParams.get('excludeMemberOnly') === 'true';
  const sortBy = url.searchParams.get('sortBy') || 'discount_desc';
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20)));

  const categories = [...new Set(all.map((o) => o.category).filter(Boolean))].sort();
  let filtered = all;
  if (storeSet.size > 0) filtered = filtered.filter((o) => storeSet.has(o.storeId));
  if (domainSet.size > 0) filtered = filtered.filter((o) => domainSet.has(o.domain));
  if (excludeMemberOnly) filtered = filtered.filter((o) => !o.isMemberOnly);
  if (q) {
    filtered = filtered.filter((o) =>
      normalizeText(`${o.title} ${o.brand || ''} ${o.description || ''} ${o.category || ''}`).includes(q)
    );
  }
  const categoryCounts = {};
  const domainCounts = {};
  for (const o of filtered) {
    if (o.category) categoryCounts[o.category] = (categoryCounts[o.category] || 0) + 1;
    if (o.domain) domainCounts[o.domain] = (domainCounts[o.domain] || 0) + 1;
  }
  if (categorySet.size > 0) filtered = filtered.filter((o) => categorySet.has(o.category));
  if (excludedSet.size > 0) filtered = filtered.filter((o) => !excludedSet.has(o.category));
  if (minDiscount > 0) filtered = filtered.filter((o) => (o.discountPercentage || 0) >= minDiscount);

  const sorted = [...filtered];
  if (sortBy === 'price_asc') sorted.sort((a, b) => (a.promoPrice ?? a.price ?? 999) - (b.promoPrice ?? b.price ?? 999));
  else if (sortBy === 'price_desc') sorted.sort((a, b) => (b.promoPrice ?? b.price ?? 0) - (a.promoPrice ?? a.price ?? 0));
  else if (sortBy === 'name_asc') sorted.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  else sorted.sort((a, b) => (b.discountPercentage || 0) - (a.discountPercentage || 0));

  const totalOffers = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalOffers / limit));
  const slice = sorted.slice((page - 1) * limit, page * limit);

  return jsonResponse({
    offers: slice,
    totalOffers,
    page,
    limit,
    totalPages,
    categories,
    facets: { categories: categoryCounts, domains: domainCounts }
  });
}

async function handleStatus() {
  const [stores, flyers, offers] = await Promise.all([
    getDataset('rapallo_stores.json', []),
    getDataset('rapallo_flyers.json', []),
    getDataset('rapallo_offers.json', [])
  ]);
  return jsonResponse({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,
    dataSource: 'static_offline',
    lastSyncTimestamp: new Date().toISOString(),
    storeCount: stores.length,
    flyerCount: flyers.length,
    offerCount: offers.length,
    seedHealth: { ok: true, mode: 'full_offline_pwa' }
  });
}

async function handlePantry(pathname, method, init) {
  const state = await getUserState('pantry', { items: [], valueAtRisk48h: { totalAtRiskEuro: 0, expiringCount: 0 } });
  const items = Array.isArray(state.items) ? state.items : [];
  const body = parseBody(init);

  if (pathname === '/api/pantry' && method === 'GET') {
    const totalAtRiskEuro = Number(
      items
        .filter((i) => (i.daysLeft ?? 7) <= 2 && (i.fractionRemaining ?? 1) > 0)
        .reduce((acc, i) => acc + (Number(i.estimatedEuro) || 2.5) * (i.fractionRemaining ?? 1), 0)
        .toFixed(2)
    );
    return jsonResponse({ ...state, items, valueAtRisk48h: { totalAtRiskEuro, expiringCount: items.filter((i) => (i.daysLeft ?? 7) <= 2).length } });
  }

  if (pathname === '/api/pantry/items' && method === 'POST') {
    const newItem = {
      id: body.id || `pantry-${Date.now()}`,
      name: body.name || 'Alimento',
      category: body.category || 'Dispensa',
      fractionRemaining: body.fractionRemaining ?? 1,
      daysLeft: body.daysLeft ?? 5,
      estimatedEuro: Number(body.estimatedEuro || 2.5),
      location: body.location || 'casa',
      createdAt: new Date().toISOString()
    };
    const next = { ...state, items: [newItem, ...items] };
    await setUserState('pantry', next);
    return jsonResponse({ item: newItem, state: next }, 201);
  }

  const consumeMatch = pathname.match(/^\/api\/pantry\/items\/([^/]+)\/consume$/);
  if (consumeMatch && method === 'POST') {
    const id = decodeURIComponent(consumeMatch[1]);
    const nextItems = items.map((i) => (i.id === id ? { ...i, fractionRemaining: 0 } : i));
    const next = { ...state, items: nextItems };
    await setUserState('pantry', next);
    return jsonResponse({ ok: true, state: next });
  }

  const swipeMatch = pathname.match(/^\/api\/maestro\/pantry-swipe\/([^/]+)$/);
  if (swipeMatch && method === 'POST') {
    const id = decodeURIComponent(swipeMatch[1]);
    const fraction = body.fractionRemaining ?? 0.5;
    const nextItems = items.map((i) => (i.id === id ? { ...i, fractionRemaining: fraction } : i));
    const next = { ...state, items: nextItems };
    await setUserState('pantry', next);
    return jsonResponse({ ok: true, itemId: id, fractionRemaining: fraction, state: next });
  }

  return jsonResponse({ items });
}

const DEFAULT_KITCHEN_STATE = {
  heatSource: 'induction',
  setId: 'casa_base',
  tools: ['padella_antiaderente', 'casseruola_inox', 'pentola']
};

const KITCHEN_SETS = {
  cambusa_minima: {
    id: 'cambusa_minima',
    label: 'Cambusa Minima (1 padella + 1 pentola)',
    tools: ['padella_antiaderente', 'pentola']
  },
  casa_base: {
    id: 'casa_base',
    label: 'Casa Base (Padella + Casseruola + Pentola)',
    tools: ['padella_antiaderente', 'casseruola_inox', 'pentola']
  },
  cucina_completa: {
    id: 'cucina_completa',
    label: 'Cucina Completa (Tutti gli strumenti)',
    tools: null
  }
};

function isRecipeCompatibleWithTools(recipe, toolSet) {
  if (!toolSet) return true;
  const req = Array.isArray(recipe.cookwareRequired) ? recipe.cookwareRequired : [];
  if (req.length === 0) return true;
  return req.every((t) => toolSet.has(t));
}

async function computeKitchenTiers() {
  const [cookware, recipes, offers, kitchen] = await Promise.all([
    getDataset('cookware_archetypes.json', []),
    getDataset('recipes_and_dishes.json', []),
    getDataset('rapallo_offers.json', []),
    getUserState('kitchen_state', DEFAULT_KITCHEN_STATE)
  ]);

  const activeTools = kitchen.setId === 'cucina_completa'
    ? cookware.map((c) => c.id)
    : (Array.isArray(kitchen.tools) && kitchen.tools.length > 0 ? kitchen.tools : DEFAULT_KITCHEN_STATE.tools);
  const toolSet = new Set(activeTools);

  const unlockedRecipes = recipes.filter((r) => isRecipeCompatibleWithTools(r, toolSet));
  const upgradeSuggestions = cookware
    .filter((c) => !toolSet.has(c.id))
    .map((c) => {
      const nextSet = new Set([...toolSet, c.id]);
      const extraCount = recipes.filter((r) => !isRecipeCompatibleWithTools(r, toolSet) && isRecipeCompatibleWithTools(r, nextSet)).length;
      const offerMatch = offers.find((o) => normalizeText(o.title).includes(normalizeText(c.material || c.name.split(' ')[0])));
      return {
        toolId: c.id,
        name: c.name,
        referencePriceEuro: c.referencePriceEuro || null,
        extraRecipesUnlocked: extraCount,
        offerMatch: offerMatch ? { title: offerMatch.title, storeName: offerMatch.storeName, promoPrice: offerMatch.promoPrice ?? offerMatch.price } : null
      };
    })
    .filter((u) => u.extraRecipesUnlocked > 0)
    .sort((a, b) => b.extraRecipesUnlocked - a.extraRecipesUnlocked)
    .slice(0, 3);

  return {
    setId: kitchen.setId || 'casa_base',
    presets: Object.values(KITCHEN_SETS).map(({ id, label, tools }) => ({ id, label, tools })),
    activeTools,
    unlockedRecipesCount: unlockedRecipes.length,
    totalRecipesCount: recipes.length,
    upgradeSuggestions
  };
}

async function handleShoppingList(pathname, method, init) {
  const rawState = await getUserState('shopping_list', {
    activeListId: 'list-default',
    lists: [{ id: 'list-default', name: 'Spesa Rapallo', items: [] }]
  });
  const lists = Array.isArray(rawState.lists) && rawState.lists.length > 0
    ? rawState.lists
    : [{ id: 'list-default', name: 'Spesa Rapallo', items: Array.isArray(rawState.items) ? rawState.items : [] }];
  const body = parseBody(init);
  const activeListId = body.listId || rawState.activeListId || lists[0].id;
  const activeList = lists.find((l) => l.id === activeListId) || lists[0];
  const items = Array.isArray(activeList.items) ? activeList.items : [];

  const serialize = (nextLists, nextActiveId = activeList.id) => {
    const cur = nextLists.find((l) => l.id === nextActiveId) || nextLists[0];
    const curItems = cur.items || [];
    const totalEstimatedEuro = Number(curItems.reduce((a, b) => a + (Number(b.price) || 0), 0).toFixed(2));
    return {
      activeListId: cur.id,
      lists: nextLists,
      items: curItems,
      totalEstimatedEuro,
      subtotals: {
        totalItemsCount: curItems.length,
        totalEstimatedEuro
      }
    };
  };

  if (pathname === '/api/shopping-list' && method === 'GET') {
    return jsonResponse(serialize(lists));
  }

  if (pathname === '/api/shopping-list/lists' && method === 'POST') {
    const newList = { id: `list-${Date.now()}`, name: body.name || 'Nuova lista', items: [] };
    const next = serialize([...lists, newList], newList.id);
    await setUserState('shopping_list', next);
    return jsonResponse(next, 201);
  }

  if (pathname === '/api/shopping-list/lists/active' && method === 'POST') {
    const next = serialize(lists, body.listId || activeList.id);
    await setUserState('shopping_list', next);
    return jsonResponse(next);
  }

  if (pathname === '/api/shopping-list/items' && method === 'POST') {
    const item = {
      id: body.id || `sl-${Date.now()}`,
      title: body.title || body.name || 'Articolo',
      storeName: body.storeName || '',
      price: Number(body.price || body.promoPrice || 0),
      checked: false,
      ...body
    };
    const nextLists = lists.map((l) => (l.id === activeList.id ? { ...l, items: [item, ...items] } : l));
    const next = serialize(nextLists);
    await setUserState('shopping_list', next);
    return jsonResponse(next, 201);
  }

  const toggleMatch = pathname.match(/^\/api\/shopping-list\/items\/([^/]+)\/toggle$/);
  if (toggleMatch && method === 'POST') {
    const id = decodeURIComponent(toggleMatch[1]);
    const nextItems = items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
    const nextLists = lists.map((l) => (l.id === activeList.id ? { ...l, items: nextItems } : l));
    const next = serialize(nextLists);
    await setUserState('shopping_list', next);
    return jsonResponse(next);
  }

  const deleteMatch = pathname.match(/^\/api\/shopping-list\/items\/([^/]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const id = decodeURIComponent(deleteMatch[1]);
    const nextItems = items.filter((i) => i.id !== id);
    const nextLists = lists.map((l) => (l.id === activeList.id ? { ...l, items: nextItems } : l));
    const next = serialize(nextLists);
    await setUserState('shopping_list', next);
    return jsonResponse(next);
  }

  if (pathname === '/api/shopping-list/complete-and-load-pantry' && method === 'POST') {
    const checked = items.filter((i) => i.checked);
    const remaining = items.filter((i) => !i.checked);
    const pantry = await getUserState('pantry', { items: [] });
    const added = checked.map((c) => ({
      id: `pantry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: c.title || c.name,
      category: c.category || 'Spesa',
      fractionRemaining: 1,
      daysLeft: 6,
      estimatedEuro: Number(c.price || 2)
    }));
    await setUserState('pantry', { ...pantry, items: [...added, ...(pantry.items || [])] });
    const nextLists = lists.map((l) => (l.id === activeList.id ? { ...l, items: remaining } : l));
    const nextList = serialize(nextLists);
    await setUserState('shopping_list', nextList);
    return jsonResponse({ movedCount: added.length, shoppingList: nextList });
  }

  return jsonResponse(serialize(lists));
}

async function handleCrea(pathname, url) {
  const foods = await getDataset('crea_foods.json', []);
  if (pathname === '/api/crea/foods') {
    const q = normalizeText(url.searchParams.get('q') || '');
    const categorySet = new Set(
    (url.searchParams.get('category') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30)));
    let filtered = foods;
    if (categorySet.size > 0) filtered = filtered.filter((f) => categorySet.has(f.category));
    if (q) filtered = filtered.filter((f) => normalizeText(`${f.name} ${f.nameEn || ''} ${f.category || ''}`).includes(q));
    return jsonResponse({
      foods: filtered.slice(0, limit),
      total: filtered.length,
      categories: [...new Set(foods.map((f) => f.category).filter(Boolean))].sort()
    });
  }

  const detailMatch = pathname.match(/^\/api\/crea\/foods\/([^/]+)$/);
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    const food = foods.find((f) => String(f.id) === id);
    if (!food) return jsonResponse({ error: `Alimento CREA non trovato: ${id}` }, 404);
    return jsonResponse({ food });
  }

  if (pathname === '/api/crea/nutrients-per-euro') {
    const offers = await getDataset('rapallo_offers.json', []);
    return jsonResponse({ items: [], totalOffersAnalyzed: offers.length, mode: 'static_offline' });
  }

  return jsonResponse({ foods: foods.slice(0, 20), total: foods.length });
}

async function handleRecipes(pathname, url, method, init) {
  const recipes = await getDataset('recipes_and_dishes.json', []);
  const restaurants = await getDataset('restaurants_tigullio.json', []);

  if (pathname === '/api/recipes') {
    const q = normalizeText(url.searchParams.get('q') || '');
    const course = (url.searchParams.get('course') || '').trim();
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get('limit') || 24)));
    let filtered = recipes;
    if (course) filtered = filtered.filter((r) => r.course === course);
    if (q) filtered = filtered.filter((r) => normalizeText(`${r.title} ${r.restaurantName || ''} ${r.course || ''}`).includes(q));
    return jsonResponse({
      recipes: filtered.slice(0, limit),
      total: filtered.length,
      restaurantsCount: restaurants.length
    });
  }

  const labMatch = pathname.match(/^\/api\/recipes\/([^/]+)\/lab-notes$/);
  if (labMatch && method === 'POST') {
    const id = decodeURIComponent(labMatch[1]);
    const notes = await getUserState('recipe_lab_notes', {});
    const body = parseBody(init);
    notes[id] = [...(notes[id] || []), { ...body, savedAt: new Date().toISOString() }];
    await setUserState('recipe_lab_notes', notes);
    return jsonResponse({ ok: true, notes: notes[id] });
  }

  return jsonResponse({ recipes: recipes.slice(0, 20), total: recipes.length });
}

async function handleHomeChemistry(pathname, method, init) {
  const matrix = await getDataset('home_chemistry_matrix.json', {});
  const cleaning = await getDataset('cleaning_chemistry.json', []);
  const body = parseBody(init);

  if (pathname === '/api/home-chemistry/matrix') return jsonResponse(matrix);
  if (pathname === '/api/home-chemistry/myths') return jsonResponse({ myths: matrix.myths || cleaning });
  if (pathname === '/api/home-chemistry/safety-check' && method === 'POST') {
    const text = normalizeText(`${body.agentA || ''} ${body.agentB || ''} ${body.query || ''}`);
    const p0Hazard = (text.includes('candeggina') || text.includes('ipoclorito')) &&
      (text.includes('ammoniaca') || text.includes('aceto') || text.includes('acido'));
    return jsonResponse({
      safe: !p0Hazard,
      severity: p0Hazard ? 'P0_BLOCK' : 'OK',
      warning: p0Hazard ? 'PERICOLO P0: Non mescolare ipoclorito di sodio (candeggina) con acidi o ammoniaca (sviluppo di gas tossici).' : null
    });
  }
  if (pathname === '/api/home-chemistry/solve' && method === 'POST') {
    return jsonResponse({
      protocol: matrix.sinnerProtocols?.[0] || null,
      waterHardnessF: matrix.waterHardnessRapallo?.degreesF || 18,
      mode: 'static_offline'
    });
  }
  return jsonResponse({
    minimalKit: matrix.minimalChemicalKit || [],
    waterHardnessRapallo: matrix.waterHardnessRapallo || { degreesF: 18 },
    appliances: matrix.surfacesAndFabrics || []
  });
}

async function handleMaestro(pathname, method, init) {
  const body = parseBody(init);
  if (pathname === '/api/maestro/calibration') {
    if (method === 'POST' || method === 'PUT') {
      const current = await getUserState('maestro_calibration', DEFAULT_CALIBRATION);
      const next = { ...current, ...body };
      await setUserState('maestro_calibration', next);
      return jsonResponse(next);
    }
    return jsonResponse(await getUserState('maestro_calibration', DEFAULT_CALIBRATION));
  }

  if (pathname === '/api/maestro/kitchen-tiers' && method === 'GET') {
    return jsonResponse(await computeKitchenTiers());
  }

  if (pathname === '/api/maestro/kitchen-set' && method === 'POST') {
    const current = await getUserState('kitchen_state', DEFAULT_KITCHEN_STATE);
    const preset = body.setId && KITCHEN_SETS[body.setId];
    const nextTools = Array.isArray(body.tools)
      ? body.tools
      : (preset ? (preset.tools || []) : current.tools);
    const next = {
      ...current,
      setId: body.setId || (Array.isArray(body.tools) ? 'custom' : current.setId),
      tools: nextTools
    };
    await setUserState('kitchen_state', next);
    return jsonResponse(await computeKitchenTiers());
  }

  const [calibration, pantry, offers, recipes, creaFoods, localShops, tiers] = await Promise.all([
    getUserState('maestro_calibration', DEFAULT_CALIBRATION),
    getUserState('pantry', { items: [] }),
    getDataset('rapallo_offers.json', []),
    getDataset('recipes_and_dishes.json', []),
    getDataset('crea_foods.json', []),
    getDataset('rapallo_local_shops.json', []),
    computeKitchenTiers()
  ]);

  const toolSet = new Set(tiers.activeTools);
  const cookable = recipes.filter((r) => isRecipeCompatibleWithTools(r, toolSet));
  const pool = cookable.length > 0 ? cookable : recipes;
  const dinnerPool = pool.filter((r) => {
    const title = normalizeText(r.title || '');
    const course = normalizeText(r.course || '');
    const contexts = Array.isArray(r.mealContexts) ? r.mealContexts.map(normalizeText) : [];
    const isBreakfast = course.includes('colazione') || contexts.includes('breakfast') || /\b(porridge|pancake|crepe|biscott|marmellata)\b/.test(title);
    return !isBreakfast;
  });
  const tonightPool = dinnerPool.length >= 3 ? dinnerPool : pool;

  if (pathname === '/api/maestro/generate-crea-list' && method === 'POST') {
    const goal = normalizeText(body.goal || 'equilibrata');
    const matchedCrea = creaFoods.filter((f) => {
      if (!goal || goal === 'equilibrata') return true;
      return normalizeText(`${f.name} ${f.category || ''} ${JSON.stringify(f.sections || {})}`).includes(goal);
    });
    const creaPool = matchedCrea.length > 0 ? matchedCrea : creaFoods;

    // Pick balanced CREA foods across distinct categories (never force restaurant dishes as the base)
    const seenCat = new Set();
    const chosenCrea = [];
    for (const f of creaPool) {
      const cat = f.category || 'Altro';
      if (!seenCat.has(cat)) {
        seenCat.add(cat);
        chosenCrea.push(f);
      }
      if (chosenCrea.length >= 10) break;
    }

    const pickLocalShop = (food) => {
      const cat = normalizeText(`${food.category || ''} ${food.name || ''}`);
      if (/pesc|mollusch|crostac|sgombro|alice|tonno/.test(cat)) {
        return localShops.find((s) => s.id.includes('pescheria'))?.name || 'Mercato Ittico & Pescherie - Rapallo';
      }
      if (/carn|poll|tacchin|suin|bovin/.test(cat)) {
        return localShops.find((s) => s.id.includes('macelleria'))?.name || 'Macelleria Storica - Centro Rapallo';
      }
      if (/cereal|pane|farina|pasta/.test(cat)) {
        return localShops.find((s) => s.id.includes('panificio'))?.name || 'Panificio & Focacceria - Rapallo';
      }
      return 'Ortofrutta & Botteghe Locali Rapallo';
    };

    const listItems = chosenCrea.map((food, idx) => {
      const keyword = normalizeText(food.name).split(/[\s,]+/).find((w) => w.length >= 4) || normalizeText(food.name);
      const offer = offers.find((o) => normalizeText(o.title).includes(keyword));
      return {
        id: `crea-sl-${Date.now()}-${idx}`,
        title: food.name,
        creaId: food.id,
        creaCategory: food.category,
        storeName: offer ? offer.storeName : pickLocalShop(food),
        price: offer ? Number(offer.promoPrice ?? offer.price ?? 0) : null,
        hasOffer: Boolean(offer),
        discountPercentage: offer?.discountPercentage || 0,
        sourceChannel: offer ? 'gdo_offer' : 'local_shop',
        checked: false
      };
    });

    const rawListState = await getUserState('shopping_list', { activeListId: 'list-default', lists: [] });
    const existingLists = Array.isArray(rawListState.lists) ? rawListState.lists : [];
    const newList = {
      id: `list-crea-${Date.now()}`,
      name: body.listName || `Spesa CREA (${listItems.length} alimenti)`,
      items: listItems
    };
    const nextState = {
      activeListId: newList.id,
      lists: [newList, ...existingLists],
      items: listItems,
      totalEstimatedEuro: Number(listItems.reduce((a, b) => a + (Number(b.price) || 0), 0).toFixed(2))
    };
    await setUserState('shopping_list', nextState);

    return jsonResponse({
      list: newList,
      creaEvaluatedCount: creaFoods.length,
      recipesSelected: pool.slice(0, 3).map((r) => r.title),
      matchedOffersCount: listItems.filter((i) => i.hasOffer).length,
      localShopsCount: listItems.filter((i) => !i.hasOffer).length,
      upgradeSuggestions: tiers.upgradeSuggestions
    });
  }

  const pickFast = tonightPool.find((r) => (r.prepMinutes || 30) <= 25) || tonightPool[0] || {};
  const pickPromo = tonightPool[1] || tonightPool[0] || {};
  const pickSave = tonightPool[2] || tonightPool[0] || {};

  const tonightParetoCards = [
    {
      dishId: pickFast.id || 'pareto-fast',
      badge: 'Veloce stasera',
      title: pickFast.title || 'Pasta al pesto ligure espresso',
      cleanTitle: pickFast.title || 'Pasta al pesto ligure espresso',
      totalHandsOnMinutes: pickFast.prepMinutes || 15,
      purePortionCostEur: 2.8,
      menuPriceEuro: pickFast.menuPriceEuro || 14,
      bom: pickFast.bom || []
    },
    {
      dishId: pickPromo.id || 'pareto-promo',
      badge: 'Sulle offerte di oggi',
      title: pickPromo.title || 'Piatto con offerte Rapallo',
      cleanTitle: pickPromo.title || 'Piatto con offerte Rapallo',
      totalHandsOnMinutes: pickPromo.prepMinutes || 25,
      purePortionCostEur: 3.1,
      menuPriceEuro: pickPromo.menuPriceEuro || 16,
      bom: pickPromo.bom || []
    },
    {
      dishId: pickSave.id || 'pareto-zero-waste',
      badge: 'Salva dispensa',
      title: pantry.items?.[0]?.name ? `${pickSave.title || 'Piatto svuota frigo'} (${pantry.items[0].name})` : (pickSave.title || 'Piatto equilibrato CREA'),
      cleanTitle: pickSave.title || 'Piatto equilibrato CREA',
      totalHandsOnMinutes: pickSave.prepMinutes || 20,
      purePortionCostEur: 2.5,
      menuPriceEuro: pickSave.menuPriceEuro || 15,
      bom: pickSave.bom || []
    }
  ];

  if (pathname === '/api/maestro/today-copilot') {
    const pantryCount = (pantry.items || []).length;
    const humanSummary = `Con il tuo set puoi cucinare ${tiers.unlockedRecipesCount} piatti su ${tiers.totalRecipesCount}, incrociati con ${offers.length} offerte locali e ${pantryCount > 0 ? `${pantryCount} scorte in dispensa` : 'dati CREA completi'}.`;
    return jsonResponse({
      rhythm: calibration,
      tonightParetoCards,
      paretoCards: tonightParetoCards,
      kitchenTiers: tiers,
      humanSummary,
      pantryItemsCount: pantryCount,
      offersCount: offers.length,
      mode: 'deterministic_scientific_engine'
    });
  }

  if (pathname === '/api/maestro/chat' && method === 'POST') {
    const message = String(body.message || '').trim();
    const norm = normalizeText(message);
    const p0Hazard = (norm.includes('candeggina') || norm.includes('ipoclorito')) &&
      (norm.includes('ammoniaca') || norm.includes('aceto') || norm.includes('acido'));
    const p0Alerts = p0Hazard
      ? [{ code: 'P0_CHEM_TOXIC_GAS', title: 'Blocco Sicurezza Chimica P0', scientificWarning: 'Non mescolare mai candeggina con acidi (aceto/anticalcare) o ammoniaca: libera cloro gassoso o clorammine tossiche.' }]
      : [];

    const proxyUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAESTRO_PROXY_URL) || '';
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

    if (proxyUrl && isOnline && p0Alerts.length === 0) {
      try {
        const res = await window.fetch(proxyUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message,
            history: body.history || [],
            paretoCards: tonightParetoCards,
            rhythmPreset: calibration.rhythmPreset
          })
        });
        if (res.status === 429) {
          return jsonResponse({
            reply: '⚠️ Quota AI gratuita della demo esaurita per oggi (429). Puoi continuare usando tutte le funzioni offline e le proposte locali qui sotto.',
            mode: 'quota_exceeded_429_fallback',
            p0Alerts,
            hasP0Block: false,
            suggestedParetoCards: tonightParetoCards
          });
        }
        if (res.ok) {
          const llmData = await res.json();
          if (llmData?.reply) {
            return jsonResponse({
              ...llmData,
              p0Alerts,
              hasP0Block: false,
              suggestedParetoCards: tonightParetoCards
            });
          }
        }
      } catch (_) {}
    }

    const ligureDish = pool.find((r) => r.restaurantName && r.city) || tonightParetoCards[0];
    const restaurantRef = ligureDish?.restaurantName
      ? ` (reverse-engineering da **${ligureDish.restaurantName}**, ${ligureDish.city}${ligureDish.menuPriceEuro ? `, €${ligureDish.menuPriceEuro} al tavolo` : ''})`
      : '';
    const upgradeHint = tiers.upgradeSuggestions[0]
      ? ` Aggiungendo **${tiers.upgradeSuggestions[0].name}** sbloccheresti altri **+${tiers.upgradeSuggestions[0].extraRecipesUnlocked} piatti**.`
      : '';
    const reply = p0Alerts.length > 0
      ? `🛑 **${p0Alerts[0].title}** — ${p0Alerts[0].scientificWarning}`
      : `Mente ligure Basilico attiva (${creaFoods.length} alimenti CREA, ${tiers.unlockedRecipesCount} ricette cucinabili col tuo set, ${offers.length} offerte). Stasera ti propongo **${ligureDish?.title || tonightParetoCards[0].title}**${restaurantRef}, bilanciato su CREA.${upgradeHint}`;

    return jsonResponse({
      reply,
      mode: 'deterministic_scientific_engine',
      p0Alerts,
      hasP0Block: p0Alerts.length > 0,
      suggestedParetoCards: tonightParetoCards
    });
  }

  return jsonResponse({ ok: true, mode: 'deterministic_scientific_engine', tonightParetoCards, kitchenTiers: tiers });
}

export async function routeStaticApi(input, init = {}) {
  const rawUrl = typeof input === 'string' ? input : input.url;
  const url = new URL(rawUrl, 'http://localhost');
  const pathname = url.pathname;
  const method = String(init.method || 'GET').toUpperCase();

  if (pathname === '/api/stores') return handleStores(url);
  if (pathname === '/api/flyers') return handleFlyers(url);
  if (pathname === '/api/offers') return handleOffers(url);
  if (pathname === '/api/status') return handleStatus();
  if (pathname === '/api/sync' || pathname === '/api/sync/progress') {
    return jsonResponse({ ok: true, status: 'completed', dataSource: 'static_offline', step: 'ready', progressPct: 100 });
  }
  if (pathname.startsWith('/api/agentation')) {
    return jsonResponse({ annotations: [], disabledInStaticMode: true });
  }
  if (pathname.startsWith('/api/profiles')) {
    const state = await getUserState('profiles', DEFAULT_PROFILES);
    if (pathname === '/api/profiles/active' && (method === 'POST' || method === 'PUT')) {
      const body = parseBody(init);
      const next = { ...state, activeProfileId: body.profileId || state.activeProfileId };
      await setUserState('profiles', next);
      return jsonResponse(next);
    }
    return jsonResponse(state);
  }
  if (pathname.startsWith('/api/pantry') || pathname.startsWith('/api/maestro/pantry-swipe')) {
    return handlePantry(pathname, method, init);
  }
  if (pathname.startsWith('/api/shopping-list')) return handleShoppingList(pathname, method, init);
  if (pathname.startsWith('/api/crea')) return handleCrea(pathname, url);
  if (pathname.startsWith('/api/recipes')) return handleRecipes(pathname, url, method, init);
  if (pathname.startsWith('/api/home-chemistry')) return handleHomeChemistry(pathname, method, init);
  if (pathname.startsWith('/api/maestro')) return handleMaestro(pathname, method, init);
  if (pathname.startsWith('/api/receipts')) {
    const receipts = await getUserState('receipts', []);
    if (method === 'POST') {
      const body = parseBody(init);
      const next = [{ id: `rcpt-${Date.now()}`, ...body }, ...receipts];
      await setUserState('receipts', next);
      return jsonResponse({ receipts: next, ok: true });
    }
    return jsonResponse({ receipts });
  }
  if (pathname.startsWith('/api/prices')) {
    const history = await getUserState('price_history', []);
    if (method === 'POST') {
      const body = parseBody(init);
      const next = [{ id: `price-${Date.now()}`, ...body, observedAt: new Date().toISOString() }, ...history];
      await setUserState('price_history', next);
      return jsonResponse({ ok: true, history: next });
    }
    return jsonResponse({ history });
  }
  if (pathname.startsWith('/api/kitchen') || pathname.startsWith('/api/academy')) {
    const cookware = await getDataset('cookware_archetypes.json', []);
    const academy = await getDataset('culinary_academy.json', {});
    const state = await getUserState('kitchen_state', { heatSource: 'induction', tools: [] });
    if (method === 'POST' || method === 'PUT') {
      const next = { ...state, ...parseBody(init) };
      await setUserState('kitchen_state', next);
      return jsonResponse(next);
    }
    return jsonResponse({ ...state, cookware, academy });
  }
  if (pathname.startsWith('/api/planner')) {
    const defaultModels = [
      { id: 'vegetale_integrale', icon: '🌱', name: 'Base Vegetale CREA', description: 'Legumi, cereali integrali, verdure di stagione e semi oleosi.' },
      { id: 'mediterraneo', icon: '🌿', name: 'Mediterraneo Ligure', description: 'Equilibrio quotidiano tra ortaggi, olio EVO, pesce azzurro e legumi.' },
      { id: 'pescetariano_mare', icon: '🐟', name: 'Pescetariano di Mare', description: 'Zero carne, ricco di Omega-3 dal mercato ittico e verdure.' },
      { id: 'cambusa_barca', icon: '⛵', name: 'Cambusa & Barca', description: 'Alta conservabilità, zero sprechi e preparazioni rapide.' }
    ];
    const plan = await getUserState('meal_plan', { days: [], models: defaultModels });
    if (pathname === '/api/planner/models' && method === 'GET') {
      return jsonResponse({ models: defaultModels });
    }
    if (pathname === '/api/planner/generate-month' && method === 'POST') {
      const body = parseBody(init);
      const dailyKcal = Math.max(800, Number(body.dailyKcal || 2000));
      const days = Math.min(31, Math.max(7, Number(body.days || 30)));
      const targetTotalKcal = dailyKcal * days;

      const [creaFoods, offers, localShops, recipes, academy, pantry, tiers] = await Promise.all([
        getDataset('crea_foods.json', []),
        getDataset('rapallo_offers.json', []),
        getDataset('rapallo_local_shops.json', []),
        getDataset('recipes_and_dishes.json', []),
        getDataset('culinary_academy.json', {}),
        getUserState('pantry', { items: [] }),
        computeKitchenTiers()
      ]);
      const pool = recipes.filter((r) => isRecipeCompatibleWithTools(r, new Set(tiers.activeTools)));

      const now = new Date();
      const activeOffers = offers.filter((o) => {
        const end = o.validTo || o.validityEnd;
        return (!end || new Date(end) >= now) && Number(o.promoPrice ?? o.price ?? 0) > 0;
      });

      const getKcalPer100g = (foodId) => {
        const food = creaFoods.find((f) => String(f.id) === String(foodId));
        if (!food) return null;
        const macro = food.sections?.['MACRO NUTRIENTI'] || [];
        const entry = macro.find((m) => m.c === 'Energia (kcal)');
        const val = Number(String(entry?.v100 || 0).replace(',', '.'));
        return val > 0 ? { id: food.id, name: food.name, kcal100: val } : null;
      };

      // 100% Vegan CREA base split by real shelf-life (dry monthly vs fresh weekly)
      const blueprint = [
        { id: '009210', share: 0.25, shelfLifeDays: 365, storage: 'dry_pantry', offerHint: 'olio extra vergine' },
        { id: '000800', share: 0.23, shelfLifeDays: 365, storage: 'dry_pantry', offerHint: 'pasta di semola' },
        { id: '008540', share: 0.13, shelfLifeDays: 180, storage: 'dry_pantry', offerHint: 'mandorle' },
        { id: '003030', share: 0.12, shelfLifeDays: 180, storage: 'dry_pantry', offerHint: 'fiocchi' },
        { id: '004000', share: 0.08, shelfLifeDays: 365, storage: 'dry_pantry', offerHint: 'ceci' },
        { id: '004500', share: 0.07, shelfLifeDays: 365, storage: 'dry_pantry', offerHint: 'lenticch' },
        { id: '009010', share: 0.02, shelfLifeDays: 180, storage: 'dry_pantry', offerHint: 'arachid' },
        { id: '006500', share: 0.04, shelfLifeDays: 14, storage: 'fresh_weekly', offerHint: 'patat' },
        { id: '007510', share: 0.025, shelfLifeDays: 5, storage: 'fresh_weekly', offerHint: 'banan' },
        { id: '007130', share: 0.015, shelfLifeDays: 10, storage: 'fresh_weekly', offerHint: 'mele' },
        { id: '005150', share: 0.012, shelfLifeDays: 7, storage: 'fresh_weekly', offerHint: 'carot' },
        { id: '005700', share: 0.008, shelfLifeDays: 4, storage: 'fresh_weekly', offerHint: 'spinac' }
      ];

      const freshStartHaveIds = new Set(Array.isArray(body.freshStartHaveIds) ? body.freshStartHaveIds.map(String) : []);
      const activePantryNames = new Set(
        (pantry.items || [])
          .filter((i) => (i.fractionRemaining ?? 1) > 0)
          .map((i) => normalizeText(i.name))
      );

      const resolveChannel = (hint, name) => {
        const offer = activeOffers.find((o) => normalizeText(o.title).includes(hint));
        if (offer) {
          return {
            channel: 'gdo_offer',
            storeName: offer.storeName,
            offerTitle: offer.title,
            unitPromoEuro: Number(offer.promoPrice ?? offer.price ?? 0) || null
          };
        }
        const norm = normalizeText(name);
        if (/pesc|cozz|vongol|gamber|tonno|sgombro|calamar/.test(norm)) {
          return { channel: 'local_shop', storeName: localShops.find((s) => s.id.includes('pescheria'))?.name || 'Mercato Ittico & Pescherie - Rapallo' };
        }
        if (/pollo|uova|carn|suin|prosciutto|salame/.test(norm)) {
          return { channel: 'local_shop', storeName: localShops.find((s) => s.id.includes('macelleria'))?.name || 'Macelleria Storica - Centro Rapallo' };
        }
        if (/pasta|pane/.test(norm)) {
          return { channel: 'local_shop', storeName: localShops.find((s) => s.id.includes('panificio'))?.name || 'Panificio & Focacceria - Rapallo' };
        }
        return { channel: 'local_shop', storeName: 'Ortofrutta & Botteghe Locali Rapallo' };
      };

      const dryMonthlyStock = [];
      const freshPerDayItems = [];
      const skippedByFreshStart = [];

      for (const slot of blueprint) {
        const crea = getKcalPer100g(slot.id);
        if (!crea) continue;
        if (freshStartHaveIds.has(String(slot.id))) {
          skippedByFreshStart.push({ creaId: crea.id, name: crea.name });
          continue;
        }
        // Account for pantry stock on hand (reduces day-1 purchase by 10% if already present)
        const inPantry = [...activePantryNames].some((p) => normalizeText(crea.name).includes(p) || p.includes(slot.offerHint));
        const effectiveKcal = Math.round(targetTotalKcal * slot.share * (inPantry ? 0.9 : 1));
        const gramsTotal = Math.round((effectiveKcal / crea.kcal100) * 100);
        const sourcing = resolveChannel(slot.offerHint, crea.name);

        if (slot.storage === 'dry_pantry') {
          dryMonthlyStock.push({
            creaId: crea.id,
            name: crea.name,
            kcalPer100g: crea.kcal100,
            gramsTotal,
            kgTotal: Number((gramsTotal / 1000).toFixed(2)),
            kcalTotal: Math.round((gramsTotal / 100) * crea.kcal100),
            shelfLifeDays: slot.shelfLifeDays,
            inPantryAdjusted: inPantry,
            ...sourcing
          });
        } else {
          freshPerDayItems.push({
            creaId: crea.id,
            name: crea.name,
            kcalPer100g: crea.kcal100,
            gramsTotal,
            shelfLifeDays: slot.shelfLifeDays,
            inPantryAdjusted: inPantry,
            ...sourcing
          });
        }
      }

      // Split fresh items into consumption tranches matching their shelf-life (weekly tranches)
      const trancheCount = Math.ceil(days / 7);
      const freshTranches = Array.from({ length: trancheCount }, (_, idx) => {
        const dayStart = idx * 7 + 1;
        const dayEnd = Math.min(days, (idx + 1) * 7);
        const spanDays = dayEnd - dayStart + 1;
        const ratio = spanDays / days;
        const items = freshPerDayItems.map((f) => {
          const grams = Math.round(f.gramsTotal * ratio);
          return {
            creaId: f.creaId,
            name: f.name,
            grams,
            kg: Number((grams / 1000).toFixed(2)),
            kcal: Math.round((grams / 100) * f.kcalPer100g),
            shelfLifeDays: f.shelfLifeDays,
            channel: f.channel,
            storeName: f.storeName,
            offerTitle: f.offerTitle || null,
            unitPromoEuro: f.unitPromoEuro || null
          };
        });
        return {
          tranche: idx + 1,
          label: `Giorni ${dayStart}-${dayEnd}`,
          spanDays,
          items
        };
      });

      const addRecipeIds = Array.isArray(body.addRecipeIds) ? body.addRecipeIds.map(String) : [];
      const baseFoodIds = new Set(blueprint.map((b) => String(b.id)));
      const omnivoreExtensions = [];
      for (const rid of addRecipeIds) {
        const dish = recipes.find((r) => String(r.id) === rid);
        if (!dish) continue;
        const extraIngredients = (dish.bom || [])
          .filter((b) => !baseFoodIds.has(String(b.creaId || '')))
          .map((b) => {
            const ingName = b.name || b.ingredient || 'Ingrediente';
            const kw = normalizeText(ingName).split(/[\s,/]+/).find((w) => w.length >= 4) || normalizeText(ingName);
            return {
              creaId: b.creaId || null,
              name: ingName,
              ...resolveChannel(kw, ingName)
            };
          });
        omnivoreExtensions.push({
          recipeId: dish.id,
          recipeTitle: dish.title,
          extraIngredients
        });
      }

      const dryKcal = dryMonthlyStock.reduce((acc, i) => acc + i.kcalTotal, 0);
      const freshKcal = freshTranches.reduce((acc, t) => acc + t.items.reduce((s, i) => s + i.kcal, 0), 0);
      const totalPlannedKcal = dryKcal + freshKcal;

      // Culinary Science Enablers from culinary_academy.json (Zero-Dairy Emulsions, Umami Synergy, Maillard)
      const scienceEnablers = [
        { name: 'Funghi champignon / porcini secchi', role: 'Sinergia Umami (guanilato + glutammato)', hint: 'fungh' },
        { name: 'Pomodori pelati / concentrato', role: 'Glutammato naturale + base Maillard', hint: 'pomodor' },
        { name: 'Limoni / Aceto di mele', role: 'Bilanciamento pH & estrazione minerale', hint: 'limon' },
        { name: 'Olive taggiasche / Capperi', role: 'Sapidità complessa & grassi monoinsaturi', hint: 'oliv' },
        { name: 'Erbe aromatiche (basilico, rosmarino, salvia)', role: 'Composti aromatici liposolubili', hint: 'basilic' }
      ].map((e) => ({
        name: e.name,
        scienceRole: e.role,
        ...resolveChannel(e.hint, e.name)
      }));

      const culinaryPillars = (academy.fivePillars || []).map((p) => p.title || p.name || p.id).filter(Boolean);

      // 6 daily meal moments (Colazione, Brunch, Pranzo, Merenda, Cena, Spuntino) grounded in CREA + Science
      const mealSlots = [
        { slot: 'Colazione', baseDish: 'Porridge tiepido di fiocchi d\'avena, banane e mandorle tostate', science: 'Tostatura secca Maillard sui fiocchi + grassi monoinsaturi' },
        { slot: 'Brunch', baseDish: 'Crema di ceci emulsionata con olio EVO, limone e crostini', science: 'Fisica colloidale zero-latticini (emulsione olio-acqua + fibra solubile)' },
        { slot: 'Pranzo', baseDish: 'Pasta di semola mantecata con crema di spinaci, mandorle e acqua amidacea', science: 'Emulsione amidacea + assorbimento Vitamina C / Ferro con limone' },
        { slot: 'Merenda', baseDish: 'Mele e carote croccanti con crema di burro d\'arachidi', science: 'Indice glicemico modulato da fibra + lipidi' },
        { slot: 'Cena', baseDish: 'Lenticchie e patate spadellate con funghi, pomodoro e olive taggiasche', science: 'Sinergia Umami (guanilato funghi + glutammato pomodoro)' },
        { slot: 'Spuntino', baseDish: 'Mandorle tostate con erbe aromatiche e banana', science: 'Composti aromatici liposolubili a rilascio lento' }
      ];

      const scheduleDays = Math.min(days, 7);
      const dailyMeals = Array.from({ length: scheduleDays }, (_, dayIdx) => ({
        day: dayIdx + 1,
        meals: mealSlots.map((m, mIdx) => {
          const cookableHint = pool[(dayIdx * 6 + mIdx) % Math.max(1, pool.length)];
          return {
            slot: m.slot,
            dish: m.baseDish,
            science: m.science,
            kitchenReference: cookableHint?.title || null
          };
        })
      }));

      const offerHits =
        dryMonthlyStock.filter((i) => i.channel === 'gdo_offer').length +
        (freshTranches[0]?.items || []).filter((i) => i.channel === 'gdo_offer').length +
        scienceEnablers.filter((i) => i.channel === 'gdo_offer').length;

      const processTrace = [
        { step: 1, title: 'Analisi CREA Ufficiale', detail: `${creaFoods.length} alimenti letti · target ${dailyKcal} kcal/giorno × ${days} giorni (${targetTotalKcal} kcal)` },
        { step: 2, title: 'Filtro Fresh Start & Dispensa', detail: `${skippedByFreshStart.length} alimenti già in casa esclusi dalla spesa` },
        { step: 3, title: 'Set Cucina & Scienza Culinaria', detail: `${culinaryPillars.length} pilastri applicati · ${tiers.unlockedRecipesCount} ricette compatibili col set ${tiers.setId}` },
        { step: 4, title: 'Suggeritore 6 Pasti/Giorno', detail: `Colazione, Brunch, Pranzo, Merenda, Cena, Spuntino (${days * 6} pasti totali sul periodo)` },
        { step: 5, title: 'Incrocio Offerte & Botteghe Rapallo', detail: `${offerHits} match su offerte attive oggi · resto instradato alle botteghe locali` }
      ];

      const monthlyPlan = {
        dietBase: 'vegan',
        days,
        dailyKcalTarget: dailyKcal,
        targetTotalKcal,
        totalPlannedKcal,
        dailyAverageKcal: Math.round(totalPlannedKcal / days),
        dryMonthlyStock,
        freshTranches,
        skippedByFreshStart,
        culinaryScienceEnablers: scienceEnablers,
        culinaryPillars,
        dailyMeals,
        totalMealsGenerated: days * 6,
        processTrace,
        omnivoreExtensions,
        shelfLifeSafe: freshPerDayItems.every((f) => f.shelfLifeDays >= 4),
        generatedAt: new Date().toISOString()
      };

      const next = { ...plan, monthlyPlan };
      await setUserState('meal_plan', next);
      return jsonResponse(monthlyPlan);
    }

    if (method === 'POST') {
      const body = parseBody(init);
      const next = { ...plan, ...body, updatedAt: new Date().toISOString() };
      await setUserState('meal_plan', next);
      return jsonResponse(next);
    }
    return jsonResponse(plan);
  }
  if (pathname.startsWith('/api/nutrition-coach')) {
    const rules = await getDataset('nutrition_physiology_rules.json', {});
    return jsonResponse({ rules, presets: rules.cookingMethods || [], mode: 'static_offline' });
  }

  return jsonResponse({ error: `Endpoint non supportato in modalità statica: ${pathname}` }, 404);
}

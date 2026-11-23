/**
 * Basilico 2.0 — Scientific Culinary Academy, Ruhlman's Ratios, Zero-Cheese Umami 8×,
 * 30s Cooking SOS & "Frigo -> Tecnica" Improvisation Service (`ADR-0006`, `ADR-0011`, `ADR-0015` / `TASK-V2-02`)
 * Location: server/services/culinaryAcademyService.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookwarePhysicsEngine } from './cookwarePhysicsEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACADEMY_SEED_PATH = path.resolve(__dirname, '../../data/seed/culinary_academy.json');
const DEFAULT_ACADEMY_STATE_PATH = path.resolve(__dirname, '../../data/cache/culinary_academy_state.json');

export const MASTERY_LEVELS = ['novice', 'practitioner', 'master'];

export class CulinaryAcademyService {
  constructor(options = {}) {
    this.storagePath =
      options.storagePath || process.env.BASILICO_ACADEMY_STATE_PATH || DEFAULT_ACADEMY_STATE_PATH;
    this.physicsEngine = options.physicsEngine || cookwarePhysicsEngine;
    this._seed = null;
    this._state = null;
  }

  getAcademySeed() {
    if (!this._seed) {
      this._seed = JSON.parse(fs.readFileSync(ACADEMY_SEED_PATH, 'utf8'));
    }
    return this._seed;
  }

  _loadState() {
    if (this._state) return this._state;
    try {
      if (fs.existsSync(this.storagePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          this._state = { profiles: parsed.profiles || {} };
          return this._state;
        }
      }
    } catch (_) {}
    this._state = { profiles: {} };
    return this._state;
  }

  _saveState() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {}
  }

  _getProfileSkillMap(profileId = 'casa') {
    const state = this._loadState();
    if (!state.profiles[profileId]) {
      state.profiles[profileId] = { skills: {} };
    }
    return state.profiles[profileId].skills;
  }

  /**
   * Returns the 5 Generative Pillars + 12-Skill Tree enriched with user mastery & adaptive verbosity.
   */
  getSkillsCurriculum({ profileId = 'casa' } = {}) {
    const seed = this.getAcademySeed();
    const skillMap = this._getProfileSkillMap(profileId);

    const skills = seed.skillsTree.map((sk) => {
      const rec = skillMap[sk.id] || { practiceCount: 0, perfectCount: 0 };
      const masteryLevel =
        rec.perfectCount >= 3
          ? 'master'
          : rec.practiceCount >= 1
            ? 'practitioner'
            : 'novice';

      const prerequisitesMet = (sk.prerequisites || []).every((preId) => {
        const preRec = skillMap[preId];
        return Boolean(preRec && preRec.practiceCount >= 1);
      });

      return {
        ...sk,
        practiceCount: rec.practiceCount,
        perfectCount: rec.perfectCount,
        masteryLevel,
        unlocked: sk.prerequisites.length === 0 || prerequisitesMet,
        activeGuidanceText: this.adaptVerbosityForSkill(sk, masteryLevel)
      };
    });

    const masteredCount = skills.filter((s) => s.masteryLevel === 'master').length;
    const practicedCount = skills.filter((s) => s.practiceCount > 0).length;
    const globalLevel =
      masteredCount >= 8 ? 'master' : practicedCount >= 4 ? 'practitioner' : 'novice';

    return {
      profileId,
      globalLevel,
      totalSkills: skills.length,
      practicedCount,
      masteredCount,
      fivePillars: seed.fivePillars,
      skills
    };
  }

  adaptVerbosityForSkill(skillOrStep, masteryLevel = 'novice') {
    const va = skillOrStep?.verbosityAdaptation;
    if (va) {
      if (masteryLevel === 'master') return va.masterTarget;
      if (masteryLevel === 'practitioner') return va.intermediateCue;
      return va.noviceGuide;
    }
    const baseText = String(skillOrStep?.instructions || skillOrStep?.title || '');
    if (masteryLevel === 'master') {
      return baseText.split('.')[0] + '.';
    }
    return baseText;
  }

  /**
   * Records a practice session on one of the 12 fundamental skills, advancing didactic mastery.
   */
  recordSkillPractice({ profileId = 'casa', skillId, dishId = null, visualOutcome = 'perfect' } = {}) {
    const seed = this.getAcademySeed();
    const exists = seed.skillsTree.find((s) => s.id === skillId);
    if (!exists) {
      const err = new Error(`Competenza non trovata: ${skillId}`);
      err.status = 404;
      throw err;
    }

    const skillMap = this._getProfileSkillMap(profileId);
    const cur = skillMap[skillId] || { practiceCount: 0, perfectCount: 0, lastDishId: null };
    const next = {
      practiceCount: cur.practiceCount + 1,
      perfectCount: cur.perfectCount + (visualOutcome === 'perfect' ? 1 : 0),
      lastDishId: dishId,
      lastVisualOutcome: visualOutcome,
      updatedAt: new Date().toISOString()
    };
    skillMap[skillId] = next;
    this._saveState();

    return this.getSkillsCurriculum({ profileId });
  }

  /**
   * 30-second deterministic emergency rescue solver ("SOS Fornelli").
   * Accepts an explicit `symptomKey` or natural-language Italian description (`queryText`).
   */
  solveCookingSOS({
    symptomKey = null,
    queryText = '',
    heatSource = 'gas',
    toolId = null
  } = {}) {
    const trees = this.getAcademySeed().cookingSosTrees;
    let matched = symptomKey && trees[symptomKey] ? trees[symptomKey] : null;

    if (!matched && queryText) {
      const qNorm = String(queryText).toLowerCase();
      for (const node of Object.values(trees)) {
        if ((node.triggers || []).some((tr) => qNorm.includes(tr))) {
          matched = node;
          break;
        }
      }
    }

    if (!matched) {
      matched = trees.emulsion_broken;
    }

    const panNote = toolId
      ? this.physicsEngine.translateStovePowerAndValidateP0({
          heatSource,
          toolId,
          requestedLevel: 'medium'
        })
      : null;

    return {
      matchedSymptomId: matched.id,
      symptomLabel: matched.symptomLabel,
      molecularCause: matched.molecularCause,
      rescueIn30Seconds: matched.rescueIn30Seconds,
      doNotDo: matched.doNotDo,
      nextTimeCalibration: matched.nextTimeCalibration,
      equipmentContextNote: panNote
        ? `Regime sicuro sulla tua attrezzatura (${heatSource}): ${panNote.stoveInstruction}`
        : null,
      availableSymptoms: Object.values(trees).map((t) => ({
        id: t.id,
        symptomLabel: t.symptomLabel
      }))
    };
  }

  getRatiosCatalog() {
    return this.getAcademySeed().ruhlmanRatios;
  }

  /**
   * Scales one of Ruhlman's Generative Ratios starting from a real anchor ingredient weight in grams.
   */
  calculateGenerativeRatio({ ratioId, anchorGrams = 100 } = {}) {
    const ratios = this.getRatiosCatalog();
    const ratio = ratios.find((r) => r.id === ratioId) || ratios[0];
    const cleanAnchorGrams = Math.max(5, Number(anchorGrams) || 100);
    const firstPartRatio = ratio.parts[0]?.weightRatio || 1;
    const unitWeight = cleanAnchorGrams / firstPartRatio;

    const scaledParts = ratio.parts.map((p) => ({
      component: p.component,
      weightRatio: p.weightRatio,
      grams: Number((p.weightRatio * unitWeight).toFixed(1))
    }));

    return {
      ratioId: ratio.id,
      name: ratio.name,
      anchorGrams: cleanAnchorGrams,
      scaledParts,
      totalMassGrams: Number(scaledParts.reduce((acc, p) => acc + p.grams, 0).toFixed(1)),
      physicsRule: ratio.physicsRule,
      zeroDairyNote: ratio.zeroDairyNote
    };
  }

  calculateRatio(options = {}) {
    return this.calculateGenerativeRatio(options);
  }

  /**
   * Evaluates the 8× Synergistic Umami Lock (`L-Glutamate` + `5'-Ribonucleotides IMP/GMP`)
   * essential to achieve deep savory mouthfeel on Zero-Cheese profiles (`casa`).
   */
  computeZeroCheeseUmamiSynergy({ ingredients = [] } = {}) {
    const cat = this.getAcademySeed().umamiSynergyCatalog;
    const text = (ingredients || [])
      .map((i) => (typeof i === 'string' ? i : i?.name || ''))
      .join(' ')
      .toLowerCase();

    const hasGlutamate =
      /\b(pomodor\w*|passata|datterin\w*|acciug\w*\s+sott\w*|acciug\w*\s+salat\w*|alici\s+sott\w*|olive|taggiasch\w*|capper\w*|fungh\w*|aglio|soia)\b/.test(
        text
      );
    const hasNucleotide =
      /\b(sgombr\w*|palamita|acciug\w*\s+fresc\w*|alici\s+fresc\w*|tonno|orat\w*|branzin\w*|gamber\w*|vongol\w*|cozz\w*|porcin\w*|manzo|vitell\w*|pollo|coniglio)\b/.test(
        text
      );

    const synergy8xActive = hasGlutamate && hasNucleotide;

    let suggestion =
      'Sinergia Umami 8× ATTIVA (recettore T1R1/T1R3 bloccato da Glutammato + IMP/GMP): sapidità profonda garantita senza formaggi!';
    if (!hasGlutamate && hasNucleotide) {
      suggestion =
        'Hai già i 5\'-ribonucleotidi (IMP/GMP): aggiungi 1 fonte di L-Glutammato libero (pomodorini maturi, olive taggiasche, capperi o 1 filetto d\'acciuga salata sciolto nell\'EVO) per attivare il moltiplicatore 8×.';
    } else if (hasGlutamate && !hasNucleotide) {
      suggestion =
        'Hai già L-Glutammato libero: abbina pesce azzurro del Golfo (sgombro/alici -> IMP) o qualche lamina di porcino secco (GMP) per moltiplicare ×8 la persistenza sapida senza Parmigiano.';
    } else if (!hasGlutamate && !hasNucleotide) {
      suggestion =
        'Base sapida neutra: costruisci il ponte Umami Zero-Formaggi con 1 filetto d\'acciuga salata + olive taggiasche (Glutammato) oppure funghi porcini secchi + pomodoro (GMP + Glutammato), legati con emulsione di pinoli/EVO.';
    }

    return {
      hasGlutamate,
      hasNucleotide,
      synergy8xActive,
      amplificationFactorLabel: synergy8xActive ? '8× (Sinergia Allosterica Attiva)' : '1× (Singolo Canale)',
      suggestion,
      referenceSources: cat
    };
  }

  /**
   * "Frigo -> Tecnica" Improvisation Engine: generates a complete scientific cooking blueprint
   * from raw fridge/pantry items + real owned cookware + stove + available minutes (zero recipe needed).
   */
  improviseFromFridge({
    availableIngredients = [],
    ownedToolIds = ['padella_antiaderente', 'pentola', 'coltello_chef'],
    heatSource = 'gas',
    maxMinutes = 20,
    servings = 1
  } = {}) {
    const seed = this.getAcademySeed();
    const normalizedItems = (availableIngredients || [])
      .map((x) => (typeof x === 'string' ? x.trim() : String(x?.name || x?.title || '').trim()))
      .filter(Boolean);

    const main = normalizedItems[0] || 'Filetti di pesce / legumi di dispensa';
    const secondary = normalizedItems[1] || 'verdure di stagione';
    const aromatics = normalizedItems.slice(2).join(', ') || 'Olio EVO Ligure, aglio e limone';
    const joinedLower = normalizedItems.join(' ').toLowerCase();

    const isBoatOrCold =
      heatSource === 'boat_no_stove' || Number(maxMinutes) < 10;
    const isPastaOrGrain =
      !isBoatOrCold &&
      /\b(spaghett\w*|pasta|trofie|trenette|linguine|penne|riso|farro)\b/.test(joinedLower);
    const isSeafood =
      !isBoatOrCold &&
      !isPastaOrGrain &&
      /\b(acciug\w*|alici|sgombr\w*|orat\w*|branzin\w*|gamber\w*|calamar\w*|pesce|tonno\s+fresco)\b/.test(
        joinedLower
      );

    const targetCategory = isBoatOrCold
      ? 'cold_cambusa'
      : isPastaOrGrain
        ? 'pasta_grain'
        : isSeafood
          ? 'seafood'
          : 'meat_or_veg';

    const frame =
      seed.fridgeToTechniqueTemplates.find((f) => f.matchesCategory === targetCategory) ||
      seed.fridgeToTechniqueTemplates[0];

    // Pick best owned pan for the chosen technique
    const candidatePanId = isBoatOrCold
      ? 'coltello_chef'
      : ownedToolIds.find((id) =>
          ['padella_acciaio_inox', 'casseruola_inox', 'padella_ferro_blu', 'padella_antiaderente'].includes(id)
        ) || ownedToolIds[0] || 'padella_antiaderente';

    const foodMassGrams = Math.max(150, 180 * Math.max(1, Number(servings) || 1));
    const batchPlan = this.physicsEngine.computeBatchingAndThermalDrop({
      toolId: candidatePanId,
      heatSource,
      foodMassGrams,
      technique: isBoatOrCold ? 'cold_assembly' : isPastaOrGrain ? 'boil_pasta' : 'sear_maillard'
    });

    const powerPlan = this.physicsEngine.translateStovePowerAndValidateP0({
      heatSource,
      toolId: candidatePanId,
      requestedLevel: isBoatOrCold ? 'off_heat' : isSeafood ? 'medium_high' : 'high'
    });

    const umamiCheck = this.computeZeroCheeseUmamiSynergy({ ingredients: normalizedItems });

    const renderedSteps = frame.stepsTemplate.map((tpl) =>
      tpl
        .replace('{main}', main)
        .replace('{secondary}', secondary)
        .replace('{aromatics}', aromatics)
        .replace('{acidOrVeg}', secondary)
        .replace('{panLabel}', `${batchPlan.profile.toolName} · ${powerPlan.stoveInstruction}`)
    );

    return {
      techniqueFrameId: frame.id,
      generatedTitle: `${frame.titleTemplate}: ${main} & ${secondary}`,
      estimatedMinutes: Math.max(frame.minMinutes, Math.min(Number(maxMinutes) || 20, 30)),
      selectedToolId: candidatePanId,
      panPhysicsAndBatching: batchPlan,
      stoveAndSafety: powerPlan,
      umamiZeroCheeseAnalysis: umamiCheck,
      steps: renderedSteps
    };
  }
}

export const culinaryAcademyService = new CulinaryAcademyService();
export default culinaryAcademyService;

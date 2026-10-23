const fs = require('fs');
const path = require('path');

// APIs utilisées pour les mises à jour
const APIS = {
  nhtsa: 'https://api.nhtsa.gov/recalls/recallsByVin',
  rappelGouv: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappels-vehicules/records',
  wikidata: 'https://query.wikidata.org/sparql'
};

// Chemins des fichiers
const DATA_FILE = path.join(__dirname, '..', 'data.json');
const NEW_MODELS_FILE = path.join(__dirname, '..', 'new-models.json');
const VERSION_FILE = path.join(__dirname, '..', 'version.json');

// Charger les données existantes
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) {
    return { version: "1.0.0", lastUpdate: new Date().toISOString(), recalls: [], newModels: [] };
  }
}

// Récupérer les nouveaux rappels NHTSA (USA)
async function fetchNHTSARecalls() {
  console.log('🇺🇸 Récupération des rappels NHTSA...');
  const recalls = [];
  
  const brands = ['PEUGEOT', 'CITROEN', 'RENAULT', 'FORD', 'BMW', 'MERCEDES', 'VOLKSWAGEN', 'AUDI', 'TOYOTA', 'HONDA', 'NISSAN', 'HYUNDAI', 'KIA', 'TESLA'];
  
  for (const brand of brands) {
    try {
      const response = await fetch(`${APIS.nhtsa}/${brand}?format=json`);
      if (response.ok) {
        const data = await response.json();
        if (data.results) {
          data.results.forEach(r => {
            recalls.push({
              brand: r.Make,
              model: r.Model,
              years: `${r.ModelYear}`,
              engine: 'Multiple',
              issue: r.Subject || r.Summary,
              tsb: r.NHTSACampaignNumber,
              category: 'rappel_nhtsa',
              desc: r.Summary,
              severity: (r.Consequence?.toLowerCase().includes('crash') || r.Consequence?.toLowerCase().includes('fire')) ? 'CRITIQUE' : 'Élevée',
              source: 'nhtsa',
              dateAdded: new Date().toISOString().split('T')[0]
            });
          });
        }
      }
    } catch(e) {
      console.warn(`⚠️ Erreur NHTSA pour ${brand}:`, e.message);
    }
  }
  
  return recalls;
}

// Récupérer les rappels français
async function fetchFrenchRecalls() {
  console.log('🇫🇷 Récupération des rappels rappel.gouv.fr...');
  const recalls = [];
  
  try {
    const url = `${APIS.rappelGouv}?limit=100&order_by=date_publication desc&select=marque,modele,annee,defaut,risque,numero_rappel`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.results) {
        data.results.forEach(r => {
          recalls.push({
            brand: r.marque,
            model: r.modele,
            years: r.annee || '2017-2026',
            engine: 'Multiple',
            issue: r.defaut || 'Rappel constructeur',
            tsb: r.numero_rappel || 'FR-' + Date.now(),
            category: 'rappel_france',
            desc: `${r.defaut || ''} - Risque: ${r.risque || 'Non spécifié'}`,
            severity: r.risque?.toLowerCase().includes('accident') ? 'CRITIQUE' : 'Élevée',
            source: 'rappel_gouv_fr',
            dateAdded: new Date().toISOString().split('T')[0]
          });
        });
      }
    }
  } catch(e) {
    console.warn('⚠️ Erreur rappel.gouv.fr:', e.message);
  }
  
  return recalls;
}

// Récupérer les nouveaux modèles via Wikidata
async function fetchNewModels() {
  console.log('🚗 Récupération des nouveaux modèles (Wikidata)...');
  const newModels = [];
  
  const query = `
    SELECT ?brand ?model ?year WHERE {
      ?item wdt:P31 wd:Q28803301 .
      ?item wdt:P571 ?inception .
      FILTER(YEAR(?inception) >= 2024)
      ?item wdt:P176 ?manufacturer .
      ?manufacturer rdfs:label ?brand .
      ?item rdfs:label ?model .
      FILTER(LANG(?brand) = "fr")
      FILTER(LANG(?model) = "fr")
      BIND(YEAR(?inception) AS ?year)
    }
    LIMIT 50
  `;
  
  try {
    const response = await fetch(`${APIS.wikidata}?query=${encodeURIComponent(query)}&format=json`);
    if (response.ok) {
      const data = await response.json();
      if (data.results?.bindings) {
        data.results.bindings.forEach(b => {
          newModels.push({
            brand: b.brand?.value || 'Inconnu',
            model: b.model?.value || 'Inconnu',
            year: parseInt(b.year?.value) || 2024,
            engines: ['À compléter'],
            dateAdded: new Date().toISOString().split('T')[0],
            source: 'wikidata'
          });
        });
      }
    }
  } catch(e) {
    console.warn('⚠️ Erreur Wikidata:', e.message);
  }
  
  return newModels;
}

// Détecter les doublons
function removeDuplicates(existing, newItems, keyField = 'tsb') {
  const existingKeys = new Set(existing.map(item => item[keyField]));
  return newItems.filter(item => !existingKeys.has(item[keyField]));
}

// Mettre à jour la version
function updateVersion(data, newRecallsCount, newModelsCount) {
  const versionFile = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
  const parts = versionFile.currentVersion.split('.');
  parts[2] = parseInt(parts[2]) + 1;
  
  versionFile.currentVersion = parts.join('.');
  versionFile.lastUpdate = new Date().toISOString();
  versionFile.nextUpdate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  versionFile.changelog.unshift({
    version: versionFile.currentVersion,
    date: new Date().toISOString().split('T')[0],
    changes: [
      `+${newRecallsCount} nouveaux rappels`,
      `+${newModelsCount} nouveaux modèles`
    ]
  });
  
  fs.writeFileSync(VERSION_FILE, JSON.stringify(versionFile, null, 2));
  return versionFile.currentVersion;
}

// Fonction principale
async function main() {
  console.log('🚀 Début de la mise à jour automatique...');
  console.log('📅 Date:', new Date().toISOString());
  
  const existingData = loadData();
  
  const [nhtsaRecalls, frenchRecalls] = await Promise.all([
    fetchNHTSARecalls(),
    fetchFrenchRecalls()
  ]);
  
  const allNewRecalls = [...nhtsaRecalls, ...frenchRecalls];
  const uniqueNewRecalls = removeDuplicates(existingData.recalls, allNewRecalls);
  
  console.log(`✅ ${uniqueNewRecalls.length} nouveaux rappels trouvés`);
  
  const newModels = await fetchNewModels();
  const uniqueNewModels = removeDuplicates(existingData.newModels || [], newModels, 'model');
  
  console.log(`✅ ${uniqueNewModels.length} nouveaux modèles trouvés`);
  
  const updatedData = {
    version: existingData.version,
    lastUpdate: new Date().toISOString(),
    recalls: [...existingData.recalls, ...uniqueNewRecalls],
    newModels: [...(existingData.newModels || []), ...uniqueNewModels]
  };
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(updatedData, null, 2));
  fs.writeFileSync(NEW_MODELS_FILE, JSON.stringify(uniqueNewModels, null, 2));
  
  const newVersion = updateVersion(updatedData, uniqueNewRecalls.length, uniqueNewModels.length);
  
  console.log(`\n🎉 Mise à jour terminée !`);
  console.log(` Version: ${existingData.version} → ${newVersion}`);
  console.log(`📊 Total rappels: ${updatedData.recalls.length}`);
  console.log(`🚗 Total nouveaux modèles: ${updatedData.newModels.length}`);
}

main().catch(err => {
  console.error(' Erreur:', err);
  process.exit(1);
});

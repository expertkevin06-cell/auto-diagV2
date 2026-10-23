// ============================================================
// AIDE AU DIAGNOSTIC BY KEVIN v9.0 - AVEC MISE À JOUR AUTO
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyCwcLLNZDdqzGsSybo7V0holqKfRoB47ag",
    authDomain: "diag-kevin.firebaseapp.com",
    projectId: "diag-kevin",
    storageBucket: "diag-kevin.appspot.com",
    messagingSenderId: "7479720363",
    appId: "1:7479720363:web:05c047578987e9da43baee"
};

const DATA_URLS = {
    recalls: 'https://expertkevin06-cell.github.io/aide-diagnostic/data.json',
    newModels: 'https://expertkevin06-cell.github.io/aide-diagnostic/new-models.json',
    version: 'https://expertkevin06-cell.github.io/aide-diagnostic/version.json'
};

let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("✅ Firebase initialisé");
} catch(e) { console.error("❌ Erreur Firebase:", e); }

const ADMIN_PASSWORD = "Kevin83600";
let currentUser = null, isAdmin = false, currentDiagnostic = null, currentVINRecalls = [];
let deferredPrompt = null;

// Données embarquées de secours
const FALLBACK_RECALLS = [
    { brand: 'Peugeot', model: '208', years: '2012-2026', engine: '1.2 PureTech 82/110/130', issue: '⚠️ COURROIE DISTRIBUTION DANS HUILE', tsb: 'PSA-STELLANTIS-2020-012', category: 'courroie_huile', desc: 'DÉFAUT CRITIQUE.', severity: 'CRITIQUE' },
    { brand: 'Ford', model: 'Fiesta', years: '2012-2023', engine: '1.0 EcoBoost', issue: '⚠️ COURROIE WET BELT', tsb: 'FORD-SSM-2020-001', category: 'courroie_huile', desc: 'DÉFAUT CRITIQUE FORD.', severity: 'CRITIQUE' }
];

let recallsData = null;
let newModelsData = null;
let versionData = null;

// Charger les données depuis GitHub
async function loadExternalData() {
    const cacheKey = 'diag_kevin_data_cache';
    const cacheExpiry = 24 * 60 * 60 * 1000;
    
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < cacheExpiry) {
            console.log('✅ Données chargées depuis le cache');
            recallsData = parsed.recalls;
            newModelsData = parsed.newModels || [];
            versionData = parsed.version;
            return;
        }
    }
    
    try {
        console.log('🔄 Chargement des données depuis GitHub...');
        
        const [recallsRes, newModelsRes, versionRes] = await Promise.all([
            fetch(DATA_URLS.recalls),
            fetch(DATA_URLS.newModels),
            fetch(DATA_URLS.version)
        ]);
        
        if (recallsRes.ok) {
            const recallsJson = await recallsRes.json();
            recallsData = recallsJson.recalls || FALLBACK_RECALLS;
            
            if (versionRes.ok) {
                versionData = await versionRes.json();
                const localVersion = localStorage.getItem('diag_kevin_version');
                if (localVersion !== versionData.currentVersion) {
                    console.log(` Nouvelle version: ${versionData.currentVersion}`);
                    localStorage.setItem('diag_kevin_version', versionData.currentVersion);
                    showUpdateNotification(versionData);
                }
            }
        } else {
            recallsData = FALLBACK_RECALLS;
        }
        
        if (newModelsRes.ok) {
            newModelsData = await newModelsRes.json();
        }
        
        localStorage.setItem(cacheKey, JSON.stringify({
            recalls: recallsData,
            newModels: newModelsData,
            version: versionData,
            timestamp: Date.now()
        }));
        
        console.log(`✅ ${recallsData.length} rappels chargés`);
        console.log(`✅ ${newModelsData.length} nouveaux modèles chargés`);
        
    } catch(e) {
        console.warn('⚠️ Erreur chargement données externes, utilisation du fallback:', e);
        recallsData = FALLBACK_RECALLS;
        newModelsData = [];
    }
}

function showUpdateNotification(versionData) {
    if (!versionData?.changelog?.[0]) return;
    
    const lastVersion = localStorage.getItem('diag_kevin_last_shown_version');
    if (lastVersion === versionData.currentVersion) return;
    
    const changes = versionData.changelog[0].changes.join('\n• ');
    setTimeout(() => {
        alert(` Mise à jour disponible !\n\nVersion ${versionData.currentVersion}\n\nNouveautés :\n• ${changes}\n\nLes nouvelles données sont maintenant disponibles.`);
        localStorage.setItem('diag_kevin_last_shown_version', versionData.currentVersion);
    }, 2000);
}

function getRecallsData() {
    return recallsData || FALLBACK_RECALLS;
}

function getNewModelsData() {
    return newModelsData || [];
}

async function suggestNewModel() {
    const brand = prompt('Marque du véhicule :');
    if (!brand) return;
    const model = prompt('Modèle du véhicule :');
    if (!model) return;
    const year = prompt('Année de commercialisation :');
    const engine = prompt('Motorisation(s) (séparées par virgule) :');
    const email = prompt('Votre email (optionnel) :');
    
    if (db) {
        try {
            await db.collection('model_suggestions').add({
                brand, model, year, engine, email,
                status: 'pending',
                date: new Date().toISOString(),
                user: currentUser?.username || 'anonymous'
            });
            alert('✅ Merci ! Votre suggestion a été envoyée à Kevin.');
        } catch(e) {
            alert(' Erreur: ' + e.message);
        }
    } else {
        const suggestions = JSON.parse(localStorage.getItem('model_suggestions') || '[]');
        suggestions.push({ brand, model, year, engine, email, date: new Date().toISOString() });
        localStorage.setItem('model_suggestions', JSON.stringify(suggestions));
        alert('✅ Suggestion enregistrée localement.');
    }
}

// ============================================================
// SYMPTÔMES PAR CATÉGORIE
// ============================================================
const symptomsByCategory = {
    'moteur': [
        { id: 'qcm1', label: 'Panne / Dysfonctionnement mais roulant' },
        { id: 'qcm5', label: 'Défaut de puissance' },
        { id: 'qcm6', label: 'À-coups moteur' },
        { id: 'qcm11', label: 'Démarrage difficile / Impossible' },
        { id: 'qcm12', label: 'Surchauffe moteur' },
        { id: 'qcm13', label: 'Fuite (liquide, huile, carburant)' }
    ],
    'transmission': [
        { id: 'qcm7', label: 'À-coups boîte de vitesse' },
        { id: 'qcm8', label: 'Défaut de fonctionnement boîte' },
        { id: 'qcm9', label: 'Problème de passage des rapports' }
    ],
    'electrique': [
        { id: 'qcm15', label: 'Problème électrique / Batterie' },
        { id: 'qcm10', label: 'Voyant alerte allumé planche de bord' }
    ],
    'electronique': [
        { id: 'qcm10', label: 'Voyant alerte allumé planche de bord' },
        { id: 'qcm1', label: 'Panne / Dysfonctionnement mais roulant' }
    ],
    'abs': [
        { id: 'qcm14', label: 'Perte de freinage' },
        { id: 'qcm4', label: 'Défaut de comportement sur route' }
    ],
    'adas': [
        { id: 'qcm4', label: 'Défaut de comportement sur route' },
        { id: 'qcm10', label: 'Voyant alerte allumé planche de bord' }
    ],
    'airbag': [
        { id: 'qcm10', label: 'Voyant alerte allumé planche de bord' }
    ],
    'batterie_haute_tension': [
        { id: 'qcm15', label: 'Problème électrique / Batterie' },
        { id: 'qcm10', label: 'Voyant alerte allumé planche de bord' }
    ],
    'recharge': [
        { id: 'qcm15', label: 'Problème électrique / Batterie' },
        { id: 'qcm10', label: 'Voyant alerte allumé planche de bord' }
    ],
    'consommation': [
        { id: 'qcm5', label: 'Défaut de puissance' },
        { id: 'qcm13', label: 'Fuite (liquide, huile, carburant)' }
    ]
};

// ============================================================
// DÉCODEUR VIN
// ============================================================
function decodeVIN(vin) {
    if (!vin || vin.length !== 17) return null;
    vin = vin.toUpperCase().trim();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;
    
    const wmi = vin.substring(0, 3);
    const yearChar = vin.charAt(9);
    const plantCode = vin.charAt(10);
    const serial = vin.substring(11);
    
    const wmiDB = {
        'VF1': { brand: 'Renault', country: 'France' }, 'VF3': { brand: 'Peugeot', country: 'France' },
        'VF7': { brand: 'Citroën', country: 'France' }, 'VF8': { brand: 'DS', country: 'France' },
        'WBA': { brand: 'BMW', country: 'Allemagne' }, 'WDB': { brand: 'Mercedes-Benz', country: 'Allemagne' },
        'WAU': { brand: 'Audi', country: 'Allemagne' }, 'WVW': { brand: 'Volkswagen', country: 'Allemagne' },
        'W0L': { brand: 'Opel', country: 'Allemagne' }, 'WF0': { brand: 'Ford Allemagne', country: 'Allemagne' },
        'WF1': { brand: 'Ford France', country: 'France' }, 'ZAR': { brand: 'Alfa Romeo', country: 'Italie' },
        'Z11': { brand: 'Fiat', country: 'Italie' }, 'JTD': { brand: 'Toyota', country: 'Japon' },
        'JHM': { brand: 'Honda', country: 'Japon' }, 'JN1': { brand: 'Nissan', country: 'Japon' },
        'KMH': { brand: 'Hyundai', country: 'Corée' }, 'KNA': { brand: 'Kia', country: 'Corée' },
        '1FA': { brand: 'Ford USA', country: 'USA' }, '1G': { brand: 'General Motors USA', country: 'USA' },
        '1C4': { brand: 'Chrysler/Jeep', country: 'USA' }, '5YJ': { brand: 'Tesla', country: 'USA' },
        '7SA': { brand: 'Tesla', country: 'USA' }, 'LJD': { brand: 'BYD', country: 'Chine' },
        'LNB': { brand: 'NIO', country: 'Chine' }, 'LVS': { brand: 'XPeng', country: 'Chine' },
        'SAJ': { brand: 'Jaguar', country: 'UK' }, 'SAL': { brand: 'Land Rover', country: 'UK' }
    };
    
    const yearDB = { 'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014, 'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019, 'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024, 'S': 2025, 'T': 2026 };
    
    let manufacturer = null;
    for (let prefix in wmiDB) { if (vin.startsWith(prefix)) { manufacturer = wmiDB[prefix]; break; } }
    
    return { vin, manufacturer, year: yearDB[yearChar] || null, yearChar, plantCode, serial, isValid: vin.length === 17 };
}

// ============================================================
// IDENTIFICATION PAR IMMATRICULATION
// ============================================================
async function searchByPlate(plate) {
    if (!plate) return null;
    plate = plate.toUpperCase().trim().replace(/[\s]/g, '');
    const plateRegex = /^[A-Z]{2}[\s-]?[0-9]{3}[\s-]?[A-Z]{2}$/;
    if (!plateRegex.test(plate)) {
        return { error: 'Format invalide. Format attendu : AA-111-AA', plate: plate, valid: false };
    }
    const normalizedPlate = plate.replace(/[\s-]/g, '').match(/([A-Z]{2})([0-9]{3})([A-Z]{2})/);
    if (normalizedPlate) { plate = `${normalizedPlate[1]}-${normalizedPlate[2]}-${normalizedPlate[3]}`; }
    try {
        const response = await fetch(`https://www.api-car.info/car/${plate.replace(/-/g, '')}`);
        if (!response.ok) throw new Error('API non disponible');
        const data = await response.json();
        return { success: true, valid: true, plate: plate, brand: data.marque || null, model: data.modele || null, version: data.version || null, year: data.annee || null, fuel: data.energie || null, power: data.puissance || null, firstRegistration: data.date_mise_circulation || null, vin: data.vin || null };
    } catch(e) {
        return { error: 'Service temporairement indisponible.', plate: plate, valid: true, success: false };
    }
}

// ============================================================
// RECHERCHE RAPPELS PAR VIN
// ============================================================
async function searchRecallsByVIN(vin) {
    if (!vin || vin.length !== 17) return { error: 'VIN invalide' };
    vin = vin.toUpperCase().trim();
    const decoded = decodeVIN(vin);
    const results = { vin, decoded, nhtsa: [], local: [], total: 0 };
    try {
        const response = await fetch(`https://api.nhtsa.gov/recalls/recallsByVin/${vin}?format=json`);
        if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                results.nhtsa = data.results.map(r => ({ campaignNumber: r.NHTSACampaignNumber, manufacturer: r.Manufacturer, subject: r.Subject, summary: r.Summary, consequence: r.Consequence, remedy: r.Remedy, date: r.ReportReceivedDate, url: `https://www.nhtsa.gov/recalls?nhtsaId=${r.NHTSACampaignNumber}` }));
            }
        }
    } catch(e) { console.log('API NHTSA indisponible:', e); }
    if (decoded && decoded.manufacturer) {
        const brand = decoded.manufacturer.brand.toLowerCase();
        const year = decoded.year;
        const allRecalls = getRecallsData();
        results.local = allRecalls.filter(r => {
            const brandMatch = r.brand.toLowerCase() === brand || brand.includes(r.brand.toLowerCase());
            const yearMatch = !year || (year >= parseInt(r.years.split('-')[0]) && year <= (parseInt(r.years.split('-')[1]) || 2026));
            return brandMatch && yearMatch;
        });
    }
    results.total = results.nhtsa.length + results.local.length;
    return results;
}

// ============================================================
// MOTEUR IA LOCAL
// ============================================================
function runLocalAI(d, vinRecalls = null) {
    const issues = [], causes = [], consequences = [], recommendations = [];
    let severity = 'Normal';
    let criticalAlerts = [];

    const qcmMap = {
        qcm1: { i: 'Dysfonctionnement avec véhicule roulant', c: 'Défaut intermittent' },
        qcm2: { i: 'Bruit anormal détecté', c: 'Usure pièces mécaniques' },
        qcm3: { i: 'Risque incendie / Fumée', c: 'Court-circuit, fuite carburant', s: 'CRITIQUE', cons: 'DANGER IMMÉDIAT' },
        qcm4: { i: 'Défaut comportement routier', c: 'Problème suspension, direction, freinage' },
        qcm5: { i: 'Perte de puissance', c: 'Alimentation, turbo, injection, FAP/EGR' },
        qcm6: { i: 'À-coups moteur', c: 'Allumage, injecteurs, admission' },
        qcm7: { i: 'À-coups boîte vitesse', c: 'Mécatronique, embrayage' },
        qcm8: { i: 'Défaut fonctionnement boîte', c: 'Capteur boîte, mécatronique' },
        qcm9: { i: 'Problème passage rapports', c: 'Tringlerie, synchroniseurs' },
        qcm10: { i: 'Voyant alerte actif', c: 'Défaut calculateurs' },
        qcm11: { i: 'Démarrage difficile', c: 'Batterie, démarreur, alternateur' },
        qcm12: { i: 'Surchauffe moteur', c: 'Circuit refroidissement', s: 'CRITIQUE', cons: 'Risque casse moteur' },
        qcm13: { i: 'Fuite détectée', c: 'Joint, durite, carter' },
        qcm14: { i: 'Perte freinage', c: 'Circuit frein, ABS', s: 'CRITIQUE', cons: 'DANGER MORTEL' },
        qcm15: { i: 'Problème électrique', c: 'Batterie 12V, alternateur' }
    };

    for (let key in d.qcm) {
        if (d.qcm[key] && qcmMap[key]) { issues.push(qcmMap[key].i); causes.push(qcmMap[key].c); if (qcmMap[key].s === 'CRITIQUE') severity = 'CRITIQUE'; if (qcmMap[key].cons) consequences.push(qcmMap[key].cons); }
    }

    const brand = (d.vehicle.brand || '').toLowerCase();
    const engine = (d.vehicle.engine || '').toLowerCase();
    const year = parseInt(d.vehicle.year) || 0;
    const courroieHuileBrands = ['peugeot', 'citroën', 'citroen', 'ds', 'opel', 'jeep', 'ford', 'volkswagen', 'renault'];
    const moteursCourroieHuile = ['puretech', '1.2', 'ecoboost', '1.0', 'tsi'];
    const isCourroieHuileRisk = courroieHuileBrands.some(b => brand.includes(b)) && moteursCourroieHuile.some(m => engine.includes(m));
    if (isCourroieHuileRisk) { criticalAlerts.push({ type: 'COURROIE_HUILE', title: '⚠️ ALERTE CRITIQUE : COURROIE DANS HUILE', message: `Véhicule concerné par le défaut de courroie immergée.`, symptoms: ['Voyant pression huile', 'P0016', 'P0522'], consequences: ['Casse moteur'], action: 'CONTRÔLE URGENT' }); severity = 'CRITIQUE'; }

    let dtcAnalysis = '';
    if (d.dtcRead === 'oui' && d.dtcCodes) {
        const codes = d.dtcCodes.split('\n').map(c => c.trim().toUpperCase()).filter(c => c);
        const dtcDict = { 'P0016': 'Corrélation vilebrequin/arbre à cames - ⚠️ COURROIE', 'P0300': 'Ratés aléatoires - ⚠️ BOUGIES', 'P0522': 'Pression huile basse - ⚠️ COURROIE' };
        dtcAnalysis = '<h4>🔍 Analyse codes DTC :</h4><ul>';
        codes.forEach(code => { let desc = dtcDict[code] || 'Code spécifique constructeur'; if (code.startsWith('P0')) desc = 'Powertrain - ' + desc; dtcAnalysis += `<li><strong>${code}</strong> : ${desc}</li>`; });
        dtcAnalysis += '</ul>';
    }

    const allRecalls = getRecallsData();
    const recallMatches = allRecalls.filter(r => { const brandMatch = r.brand.toLowerCase() === brand || brand.includes(r.brand.toLowerCase()); const model = (d.vehicle.model || '').toLowerCase(); const modelMatch = model.includes(r.model.toLowerCase()) || r.model.toLowerCase().includes(model); const yearMatch = !year || (year >= parseInt(r.years.split('-')[0]) && year <= (parseInt(r.years.split('-')[1]) || 2026)); return brandMatch && modelMatch && yearMatch; });
    let recallHtml = '';
    if (recallMatches.length > 0) { recallHtml = '<div class="alert alert-warning">🚨 <strong>RAPPELS DÉTECTÉS :</strong><br><br>'; recallMatches.forEach(r => { recallHtml += `<div style="margin:10px 0;padding:10px;background:rgba(255,255,255,0.1);border-radius:8px"><strong>📋 ${r.brand} ${r.model} (${r.years})</strong><br><strong>Problème :</strong> ${r.issue}<br><strong>TSB :</strong> ${r.tsb}<br><strong>Description :</strong> ${r.desc}</div>`; }); recallHtml += '</div>'; }

    let vinRecallsHtml = '';
    if (vinRecalls && vinRecalls.total > 0) { vinRecallsHtml = '<div class="alert alert-danger">🚨 <strong>CAMPAGNES DE RAPPEL PAR VIN :</strong><br>'; vinRecallsHtml += `<p><strong>VIN :</strong> <code>${vinRecalls.vin}</code></p>`; if (vinRecalls.nhtsa.length > 0) { vinRecallsHtml += `<h4>🇺🇸 NHTSA - ${vinRecalls.nhtsa.length} campagne(s) :</h4>`; vinRecalls.nhtsa.forEach((r, idx) => { vinRecallsHtml += `<div style="background:rgba(255,255,255,0.15);padding:12px;margin:8px 0;border-radius:8px"><strong>Campagne ${idx+1} : ${r.campaignNumber}</strong><br><strong>Objet :</strong> ${r.subject}<br><a href="${r.url}" target="_blank">🔗 NHTSA.gov</a></div>`; }); } vinRecallsHtml += '</div>'; recommendations.push(` URGENT : ${vinRecalls.nhtsa.length} rappel(s) NHTSA détecté(s)`); }

    recommendations.push('Diagnostic complet avec outil constructeur');
    recommendations.push('Vérifier TSB sur portail constructeur');
    if (severity === 'CRITIQUE') recommendations.push('⚠️ URGENT : NE PAS UTILISER - Remorquage recommandé');
    else recommendations.push('Rendez-vous atelier sous 48h');

    return { issues, causes, consequences, recommendations, dtcAnalysis, recallHtml, vinRecallsHtml, severity, criticalAlerts };
}

// ============================================================
// INITIALISATION QCM AVEC FILTRE
// ============================================================
function initQCM() {
    const container = document.getElementById('qcmContainer');
    if (!container) return;
    container.innerHTML = '';
    const allSymptoms = [];
    for (let category in symptomsByCategory) { symptomsByCategory[category].forEach(symptom => { if (!allSymptoms.find(s => s.id === symptom.id)) allSymptoms.push(symptom); }); }
    allSymptoms.forEach(symptom => { container.innerHTML += `<div class="checkbox-item"><input type="checkbox" id="${symptom.id}" onchange="toggleDetail('${symptom.id}', '${symptom.label}')"><label for="${symptom.id}">${symptom.label}</label></div>`; });
}

function filterSymptomsByCategory(category) {
    const container = document.getElementById('qcmContainer');
    if (!container) return;
    container.innerHTML = '';
    if (category === 'all') {
        const allSymptoms = [];
        for (let cat in symptomsByCategory) { symptomsByCategory[cat].forEach(symptom => { if (!allSymptoms.find(s => s.id === symptom.id)) allSymptoms.push(symptom); }); }
        allSymptoms.forEach(symptom => { container.innerHTML += `<div class="checkbox-item"><input type="checkbox" id="${symptom.id}" onchange="toggleDetail('${symptom.id}', '${symptom.label}')"><label for="${symptom.id}">${symptom.label}</label></div>`; });
    } else {
        const symptoms = symptomsByCategory[category] || [];
        symptoms.forEach(symptom => { container.innerHTML += `<div class="checkbox-item"><input type="checkbox" id="${symptom.id}" onchange="toggleDetail('${symptom.id}', '${symptom.label}')"><label for="${symptom.id}">${symptom.label}</label></div>`; });
    }
}

function toggleDetail(id, label) {
    const checkbox = document.getElementById(id);
    const existing = document.getElementById('detail-' + id);
    const container = document.getElementById('detailSections');
    if (checkbox.checked && !existing) { const div = document.createElement('div'); div.id = 'detail-' + id; div.className = 'form-group'; div.style.cssText = 'padding:12px;background:#fff;border-radius:8px;border-left:4px solid #ff6b35'; div.innerHTML = `<label>Détails : <strong>${label}</strong></label><textarea placeholder="Décrivez..."></textarea>`; container.appendChild(div); } else if (!checkbox.checked && existing) { existing.remove(); }
}

// ============================================================
// GESTION PWA
// ============================================================
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const banner = document.getElementById('installBanner'); if (banner) banner.classList.add('show'); });
async function installPWA() { const msg = document.getElementById('installMessage'); if (deferredPrompt) { deferredPrompt.prompt(); const choice = await deferredPrompt.userChoice; if (msg) { msg.textContent = choice.outcome === 'accepted' ? '✅ Installée !' : '❌ Annulée'; msg.style.color = choice.outcome === 'accepted' ? '#28a745' : '#dc3545'; } deferredPrompt = null; const banner = document.getElementById('installBanner'); if (banner) banner.classList.remove('show'); } else { const ua = navigator.userAgent; if (msg) { if (/iphone|ipad|ipod/i.test(ua)) msg.innerHTML = '📱 iPhone : Partager → "Sur l\'écran d\'accueil"'; else if (/android/i.test(ua)) msg.innerHTML = '📱 Android : 3 points ⋮ → "Installer"'; else msg.innerHTML = ' PC : Icône 📲 dans la barre d\'adresse'; msg.style.color = '#ffd700'; } } }
function dismissInstall() { const banner = document.getElementById('installBanner'); if (banner) banner.classList.remove('show'); }

// ============================================================
// AUTHENTIFICATION
// ============================================================
async function handleLogin() { const username = document.getElementById('loginUsername').value.trim(); const password = document.getElementById('loginPassword').value; const msg = document.getElementById('loginMessage'); if (!username || !password) { msg.innerHTML = '<div class="alert alert-danger">Champs requis</div>'; return; } if (username.toLowerCase() === 'admin' && password === ADMIN_PASSWORD) { currentUser = { username: 'admin', role: 'admin', status: 'authorized' }; isAdmin = true; enterApp(); return; } if (db) { try { const doc = await db.collection('users').doc(username).get(); if (doc.exists) { const data = doc.data(); if (data.password !== password) { msg.innerHTML = '<div class="alert alert-danger">Mot de passe incorrect</div>'; return; } if (data.status === 'refused') { msg.innerHTML = '<div class="alert alert-danger">❌ Accès refusé</div>'; return; } if (data.status === 'pending') { msg.innerHTML = '<div class="alert alert-warning"> En attente</div>'; return; } currentUser = { username, role: 'user', status: 'authorized' }; isAdmin = false; enterApp(); } else { msg.innerHTML = '<div class="alert alert-danger">Utilisateur inconnu</div>'; } } catch(e) { msg.innerHTML = '<div class="alert alert-danger">Erreur: ' + e.message + '</div>'; } } else { const users = JSON.parse(localStorage.getItem('users') || '[]'); const user = users.find(u => u.username === username && u.password === password); if (!user) { msg.innerHTML = '<div class="alert alert-danger">Identifiants incorrects</div>'; return; } if (user.status === 'refused') { msg.innerHTML = '<div class="alert alert-danger">❌ Accès refusé</div>'; return; } if (user.status === 'pending') { msg.innerHTML = '<div class="alert alert-warning">⏳ En attente</div>'; return; } currentUser = user; isAdmin = user.role === 'admin'; enterApp(); } }
function enterApp() { document.getElementById('loginSection').classList.add('hidden'); document.getElementById('mainApp').classList.remove('hidden'); document.getElementById('currentUserDisplay').textContent = currentUser.username; const badge = document.getElementById('userBadge'); if (isAdmin) { badge.textContent = 'Administrateur'; badge.className = 'badge badge-admin'; document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden')); loadAdminData(); } else { badge.textContent = 'Utilisateur'; badge.className = 'badge badge-user'; } updateHistory(); }
function logout() { currentUser = null; isAdmin = false; document.getElementById('mainApp').classList.add('hidden'); document.getElementById('loginSection').classList.remove('hidden'); document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; document.getElementById('loginMessage').innerHTML = ''; }
async function showAccessRequest() { const username = prompt('Nom d\'utilisateur :'); if (!username) return; const password = prompt('Mot de passe :'); if (!password) return; if (db) { try { await db.collection('users').doc(username).set({ username, password, role: 'user', status: 'pending', date: new Date().toISOString() }); alert('✅ Demande envoyée à Kevin'); } catch(e) { alert('Erreur: ' + e.message); } } else { const users = JSON.parse(localStorage.getItem('users') || '[]'); if (users.find(u => u.username === username)) { alert('Existe déjà'); return; } users.push({ username, password, role: 'user', status: 'pending', date: new Date().toISOString() }); localStorage.setItem('users', JSON.stringify(users)); alert('✅ Demande enregistrée'); } }

// ============================================================
// NAVIGATION
// ============================================================
function showSection(section) { document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active')); document.getElementById(section + 'Section').classList.add('active'); if (event && event.target) event.target.classList.add('active'); if (section === 'admin') loadAdminData(); if (section === 'history') updateHistory(); }
function toggleDTCInput(show) { document.getElementById('dtcInputSection').classList.toggle('hidden', !show); }

// ============================================================
// IDENTIFICATION VÉHICULE
// ============================================================
async function identifyVehicle() { const type = document.getElementById('idType').value; const value = document.getElementById('idValue').value.trim(); const resultDiv = document.getElementById('idResult'); if (!value) { resultDiv.innerHTML = '<div class="alert alert-danger">Veuillez saisir une valeur</div>'; return; } resultDiv.innerHTML = '<div class="alert alert-info"> Recherche en cours...</div>'; if (type === 'vin') { const decoded = decodeVIN(value); if (!decoded || !decoded.isValid) { resultDiv.innerHTML = '<div class="alert alert-danger"> VIN invalide</div>'; return; } const recallsResult = await searchRecallsByVIN(value); currentVINRecalls = recallsResult; let html = '<div class="alert alert-success">✅ VIN décodé</div>'; html += '<div style="background:#f8f9fa;padding:15px;border-radius:8px;margin-top:10px">'; if (decoded.manufacturer) { html += `<p><strong>Constructeur :</strong> ${decoded.manufacturer.brand}</p><p><strong>Pays :</strong> ${decoded.manufacturer.country}</p>`; } if (decoded.year) html += `<p><strong>Année :</strong> ${decoded.year}</p>`; html += `</div>`; if (recallsResult.total > 0) { html += `<div class="alert alert-warning" style="margin-top:15px">🚨 <strong>${recallsResult.total} rappel(s) détecté(s) !</strong></div>`; } else { html += '<div class="alert alert-success" style="margin-top:15px">✅ Aucun rappel détecté</div>'; } if (decoded.manufacturer) document.getElementById('vehicleBrand').value = decoded.manufacturer.brand; if (decoded.year) document.getElementById('vehicleYear').value = decoded.year; document.getElementById('vehicleVIN').value = value; resultDiv.innerHTML = html; } else { const result = await searchByPlate(value); if (result && result.valid) { if (result.success) { let html = '<div class="alert alert-success">✅ Véhicule identifié</div>'; html += '<div style="background:#f8f9fa;padding:15px;border-radius:8px;margin-top:10px">'; html += `<p><strong>Immatriculation :</strong> ${result.plate}</p>`; if (result.brand) html += `<p><strong>Marque :</strong> ${result.brand}</p>`; if (result.model) html += `<p><strong>Modèle :</strong> ${result.model}</p>`; if (result.year) html += `<p><strong>Année :</strong> ${result.year}</p>`; if (result.fuel) html += `<p><strong>Énergie :</strong> ${result.fuel}</p>`; if (result.vin) { html += `<p><strong>VIN :</strong> ${result.vin}</p>`; const recallsResult = await searchRecallsByVIN(result.vin); currentVINRecalls = recallsResult; if (recallsResult.total > 0) { html += `<div class="alert alert-warning" style="margin-top:10px">🚨 <strong>${recallsResult.total} rappel(s) détecté(s) !</strong></div>`; } } html += '</div>'; if (result.brand) document.getElementById('vehicleBrand').value = result.brand; if (result.model) document.getElementById('vehicleModel').value = result.model; if (result.year) document.getElementById('vehicleYear').value = result.year; if (result.fuel) { const fuelMap = { 'Essence': 'Essence', 'Diesel': 'Diesel (Gazole)', 'Electrique': 'Électrique', 'Hybride': 'Hybride' }; document.getElementById('vehicleEngine').value = fuelMap[result.fuel] || ''; } if (result.vin) document.getElementById('vehicleVIN').value = result.vin; resultDiv.innerHTML = html; } else { resultDiv.innerHTML = `<div class="alert alert-warning">⚠️ ${result.error}</div>`; } } else { resultDiv.innerHTML = `<div class="alert alert-danger"> ${result ? result.error : 'Format invalide'}</div>`; } } }

// ============================================================
// DIAGNOSTIC
// ============================================================
function saveDiagnostic() { const data = { id: Date.now(), date: new Date().toISOString(), user: currentUser.username, vehicle: { brand: document.getElementById('vehicleBrand').value, model: document.getElementById('vehicleModel').value, year: document.getElementById('vehicleYear').value, engine: document.getElementById('vehicleEngine').value, mileage: document.getElementById('vehicleMileage').value, vin: document.getElementById('vehicleVIN').value }, symptoms: document.getElementById('symptoms').value, context: document.getElementById('context').value, visualDefects: document.getElementById('visualDefects').value, dtcRead: document.querySelector('input[name="dtcRead"]:checked')?.value || 'non', dtcCodes: document.getElementById('dtcCodes').value, qcm: {}, additionalInfo: document.getElementById('additionalInfo').value }; for (let i = 1; i <= 15; i++) data.qcm['qcm' + i] = document.getElementById('qcm' + i).checked; if (!data.vehicle.brand || !data.symptoms) { alert('⚠️ Marque et Symptômes requis'); return; } const diagnostics = JSON.parse(localStorage.getItem('diagnostics') || '[]'); diagnostics.push(data); localStorage.setItem('diagnostics', JSON.stringify(diagnostics)); currentDiagnostic = data; alert('✅ Diagnostic enregistré !'); updateHistory(); }
function goToAnalysis() { if (!currentDiagnostic) { const diagnostics = JSON.parse(localStorage.getItem('diagnostics') || '[]'); if (diagnostics.length > 0) currentDiagnostic = diagnostics[diagnostics.length - 1]; else { alert('Enregistrez d\'abord un diagnostic'); return; } } showSection('analysis'); generateAIAnalysis(); }
async function generateAIAnalysis() { const d = currentDiagnostic; let vinRecalls = currentVINRecalls; if (d.vehicle.vin && d.vehicle.vin.length === 17 && (!vinRecalls || vinRecalls.vin !== d.vehicle.vin.toUpperCase())) { document.getElementById('aiConclusion').innerHTML = '<div class="alert alert-info">🔍 Recherche rappels par VIN...</div>'; vinRecalls = await searchRecallsByVIN(d.vehicle.vin); currentVINRecalls = vinRecalls; } const aiResult = runLocalAI(d, vinRecalls); let html = `<div class="conclusion-box"><h3>🧠 Analyse Technique IA</h3><p><strong>Véhicule :</strong> ${d.vehicle.brand} ${d.vehicle.model} ${d.vehicle.year || ''} - ${d.vehicle.engine || '?'}</p>${d.vehicle.vin ? `<p><strong>VIN :</strong> <code>${d.vehicle.vin}</code></p>` : ''}<p><strong>Sévérité :</strong> <span style="color:${aiResult.severity === 'CRITIQUE' ? '#ff6b6b' : '#ffd700'};font-weight:bold">${aiResult.severity}</span></p>${aiResult.recallHtml}${aiResult.vinRecallsHtml}${aiResult.dtcAnalysis}<h4>⚠️ Symptômes :</h4><ul>${aiResult.issues.length ? aiResult.issues.map(i => `<li>${i}</li>`).join('') : '<li>' + (d.symptoms || 'Non précisé') + '</li>'}</ul><h4> Causes :</h4><ul>${aiResult.causes.length ? aiResult.causes.map(c => `<li>${c}</li>`).join('') : '<li>Investigation requise</li>'}</ul>${aiResult.consequences.length ? `<h4> Conséquences :</h4><ul>${aiResult.consequences.map(c => `<li>${c}</li>`).join('')}</ul>` : ''}`; if (aiResult.criticalAlerts && aiResult.criticalAlerts.length > 0) { html += '<h4 style="color:#ff6b6b;margin-top:20px">🚨 ALERTES CRITIQUES :</h4>'; aiResult.criticalAlerts.forEach(alert => { html += `<div style="background:rgba(220,53,69,0.2);border-left:4px solid #dc3545;padding:15px;margin:10px 0;border-radius:8px"><h5 style="color:#fff;margin:0 0 10px 0">${alert.title}</h5><p style="color:#fff;margin:5px 0">${alert.message}</p><p style="color:#ffd700;margin:10px 0 0 0"><strong>✅ Action :</strong> ${alert.action}</p></div>`; }); } html += `<h4>📌 Recommandations :</h4><ul>${aiResult.recommendations.map(r => `<li>${r}</li>`).join('')}</ul><h4>📊 Conclusion :</h4><p>Analyse de <strong>${d.vehicle.brand} ${d.vehicle.model}</strong> : ${aiResult.issues.length} dysfonctionnement(s). ${aiResult.vinRecallsHtml ? '<strong style="color:#ffd700">🚨 RAPPELS DÉTECTÉS PAR VIN - Actions prioritaires.</strong>' : (aiResult.recallHtml ? 'Rappels détectés - actions prioritaires.' : 'Vérification officielle recommandée.')} Expertise professionnelle requise.</p></div>`; document.getElementById('aiConclusion').innerHTML = html; }

// ============================================================
// RECALLS
// ============================================================
function searchRecalls() { const search = document.getElementById('recallSearch').value.toLowerCase(); const allRecalls = getRecallsData(); const results = allRecalls.filter(r => (r.brand + ' ' + r.model).toLowerCase().includes(search)); let html = ''; if (results.length === 0) html = '<div class="alert alert-warning">Aucun rappel trouvé</div>'; else { html = '<div class="alert alert-success">✅ ' + results.length + ' résultat(s)</div>'; results.forEach(r => { html += `<div class="recall-card"><h4>🚨 ${r.brand} ${r.model} (${r.years})</h4><p><strong>Motorisation :</strong> ${r.engine}</p><p><strong>Problème :</strong> ${r.issue}</p><p><strong>TSB :</strong> ${r.tsb}</p><p>${r.desc}</p></div>`; }); } document.getElementById('recallResults').innerHTML = html; }

// ============================================================
// ADMIN
// ============================================================
async function loadAdminData() { if (!db) { const users = JSON.parse(localStorage.getItem('users') || '[]').filter(u => u.role !== 'admin'); renderTiersTable(users); document.getElementById('adminStats').innerHTML = '<div class="alert alert-warning">Mode Local</div>'; return; } try { const snapshot = await db.collection('users').get(); const users = []; snapshot.forEach(doc => { if (doc.data().role !== 'admin') users.push({ id: doc.id, ...doc.data() }); }); renderTiersTable(users); const authorized = users.filter(u => u.status === 'authorized').length; const refused = users.filter(u => u.status === 'refused').length; const pending = users.filter(u => u.status === 'pending').length; document.getElementById('adminStats').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px"><div class="alert alert-success"><strong>✅ Autorisés :</strong> ${authorized}</div><div class="alert alert-danger"><strong>❌ Refusés :</strong> ${refused}</div><div class="alert alert-warning"><strong> En attente :</strong> ${pending}</div></div>`; } catch(e) { console.error(e); } }
function renderTiersTable(users) { let html = '<table><thead><tr><th>Utilisateur</th><th>Date</th><th>Statut</th><th>Actions</th></tr></thead><tbody>'; if (users.length === 0) html += '<tr><td colspan="4" style="text-align:center">Aucun tiers</td></tr>'; else { users.forEach(u => { const statusClass = u.status === 'authorized' ? 'status-authorized' : u.status === 'refused' ? 'status-refused' : 'status-pending'; const statusText = u.status === 'authorized' ? '✅ Autorisé' : u.status === 'refused' ? '❌ Refusé' : '⏳ En attente'; html += `<tr><td>${u.username}</td><td>${new Date(u.date).toLocaleDateString('fr-FR')}</td><td class="${statusClass}">${statusText}</td><td><button class="btn btn-success" onclick="setUserStatus('${u.id || u.username}','authorized')" style="padding:5px 10px;font-size:0.75em">Autoriser</button><button class="btn btn-danger" onclick="setUserStatus('${u.id || u.username}','refused')" style="padding:5px 10px;font-size:0.75em">Couper</button></td></tr>`; }); } html += '</tbody></table>'; document.getElementById('tiersTable').innerHTML = html; }
async function setUserStatus(id, status) { if (db) { await db.collection('users').doc(id).update({ status }); alert(`✅ Statut mis à jour : ${status}`); loadAdminData(); } else { const users = JSON.parse(localStorage.getItem('users') || '[]'); const user = users.find(u => u.username === id); if (user) { user.status = status; localStorage.setItem('users', JSON.stringify(users)); alert('Mis à jour'); loadAdminData(); } } }

// ============================================================
// HISTORY
// ============================================================
function updateHistory() { const diagnostics = JSON.parse(localStorage.getItem('diagnostics') || '[]'); let html = ''; if (diagnostics.length === 0) html = '<div class="alert alert-info">Aucun diagnostic</div>'; else { html = '<table><thead><tr><th>Date</th><th>Véhicule</th><th>Symptôme</th><th>Actions</th></tr></thead><tbody>'; diagnostics.slice().reverse().forEach(d => { html += `<tr><td>${new Date(d.date).toLocaleDateString('fr-FR')}</td><td>${d.vehicle.brand} ${d.vehicle.model}</td><td>${d.symptoms.substring(0, 40)}...</td><td><button class="btn btn-primary" onclick="loadDiagnostic(${d.id})" style="padding:5px 10px;font-size:0.75em">Voir</button></td></tr>`; }); html += '</tbody></table>'; } document.getElementById('historyContent').innerHTML = html; }
function loadDiagnostic(id) { currentDiagnostic = JSON.parse(localStorage.getItem('diagnostics') || '[]').find(d => d.id === id); if (currentDiagnostic) { showSection('analysis'); generateAIAnalysis(); } }

// ============================================================
// PARTAGE
// ============================================================
function shareBySMS() { const number = document.getElementById('shareSmsNumber').value; if (!number) { alert('Numéro requis'); return; } const message = `Bonjour,\n\nVoici "Aide au diagnostic by Kevin" - Outil professionnel IA.\n\n🔗 Lien : https://expertkevin06-cell.github.io/aide-diagnostic/\n\n📱 INSTALLATION :\n1. Ouvrez dans Chrome\n2. 3 points  → "Installer l'application"\n3. L'icône apparaît sur l'écran d'accueil\n\n🔐 Cliquez sur "Demander un accès" pour créer vos identifiants.\n\nKevin`; window.open(`sms:${number}?body=${encodeURIComponent(message)}`); }
function shareByEmail() { const email = document.getElementById('shareEmail').value; if (!email) { alert('Email requis'); return; } const subject = 'Application Aide au diagnostic by Kevin'; const body = `Bonjour,\n\nJe vous partage "Aide au diagnostic by Kevin".\n\n Lien : https://expertkevin06-cell.github.io/aide-diagnostic/\n\n📱 INSTALLATION :\n- Android : Chrome → 3 points ⋮ → "Installer"\n- iPhone : Safari → Partager → "Sur l'écran d'accueil"\n\n Cliquez sur "Demander un accès" pour créer vos identifiants.\n\nKevin`; window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`); }
function copyLink() { const link = document.getElementById('shareLink'); link.select(); document.execCommand('copy'); alert('✅ Lien copié !'); }
function copyInstallLink() { const link = document.getElementById('installLink'); link.select(); document.execCommand('copy'); alert('✅ Lien d\'installation copié !'); }

// ============================================================
// INIT
// ============================================================
window.addEventListener('DOMContentLoaded', async function() {
    await loadExternalData();
    initQCM();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.log('SW:', e));
    console.log(`✅ Application initialisée`);
    console.log(`✅ ${getRecallsData().length} rappels disponibles`);
    console.log(`✅ ${getNewModelsData().length} nouveaux modèles`);
    
    setInterval(() => { loadExternalData(); }, 6 * 60 * 60 * 1000);
    
    const cacheKey = 'diag_kevin_data_cache';
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        const parsed = JSON.parse(cached);
        const dateEl = document.getElementById('lastUpdateDate');
        if (dateEl && parsed.version?.lastUpdate) {
            dateEl.textContent = new Date(parsed.version.lastUpdate).toLocaleDateString('fr-FR');
        }
    }
    
    if (window.location.search.includes('install=1')) { setTimeout(() => { alert(' Pour installer :\n\n1. 3 points ⋮ en haut de Chrome\n2. "Installer l\'application"\n3. L\'icône apparaîtra sur l\'écran d\'accueil'); }, 1000); }
});

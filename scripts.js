// App state
const state = {
    sites: [],
    filteredSites: [],
    selectedYear: new Date().getFullYear(),
    selectedType: 'all',
    loading: true,
    error: null
};

// DOM elements
const elements = {
    loading: document.getElementById('loading'),
    map: document.getElementById('map'),
    siteCount: document.getElementById('site-count'),
    selectedYear: document.getElementById('selected-year'),
    yearSlider: document.getElementById('year-slider'),
    currentYear: document.getElementById('current-year'),
    totalSites: document.getElementById('total-sites'),
    progressPercent: document.getElementById('progress-percent'),
    filterButtons: document.querySelectorAll('.filter-btn')
};

// Initialize the app
async function init() {
    console.log('Initializing app...');
    
    // Set current year
    elements.currentYear.textContent = state.selectedYear;
    elements.yearSlider.value = state.selectedYear;
    elements.yearSlider.max = state.selectedYear;
    
    // Add event listeners
    setupEventListeners();
    
    // Load sites
    await loadSites();
    
    // Initialize map
    initMap();
}

// Set up event listeners
function setupEventListeners() {
    // Year slider
    elements.yearSlider.addEventListener('input', (e) => {
        state.selectedYear = parseInt(e.target.value);
        elements.selectedYear.textContent = state.selectedYear;
        updateProgress();
        filterSites();
        updateMap();
    });
    
    // Filter buttons
    elements.filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            elements.filterButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            // Update selected type
            state.selectedType = btn.dataset.type;
            // Filter and update
            filterSites();
            updateMap();
            updateCounts();
        });
    });
}

// Load UNESCO sites from Wikidata
async function loadSites() {
    try {
        console.log('Loading sites from Wikidata...');
        
        const query = `
SELECT ?item ?itemLabel ?country ?latitude ?longitude ?inscriptionYear ?type ?description ?officialUrl WHERE {
  ?item wdt:P31 wd:Q15941471.
  ?item rdfs:label ?itemLabel.
  FILTER(LANG(?itemLabel) = "en")
  
  OPTIONAL { ?item wdt:P17 ?countryItem. ?countryItem rdfs:label ?country. FILTER(LANG(?country) = "en") }
  OPTIONAL { ?item wdt:P625 ?coordinate. BIND(STRDT(STRBEFORE(STR(?coordinate), " "), xsd:double) AS ?latitude) }
  OPTIONAL { ?item wdt:P625 ?coordinate. BIND(STRDT(STRAFTER(STR(?coordinate), " "), xsd:double) AS ?longitude) }
  OPTIONAL { ?item wdt:P575 ?inscribed. BIND(YEAR(?inscribed) AS ?inscriptionYear) }
  OPTIONAL { ?item wdt:P1435 ?typeItem. ?typeItem rdfs:label ?type. FILTER(LANG(?type) = "en") }
  OPTIONAL { ?item wdt:P1813 ?description. FILTER(LANG(?description) = "en") }
  OPTIONAL { ?item wdt:P856 ?officialUrl. }
  
  FILTER (?inscriptionYear >= 1978)
  
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?inscriptionYear
`;
        
        const encodedQuery = encodeURIComponent(query);
        const apiUrl = `https://query.wikidata.org/sparql?query=${encodedQuery}&format=json`;
        const proxyUrl = 'https://corsproxy.io/?';
        const finalUrl = proxyUrl + encodeURIComponent(apiUrl);
        
        console.log('Fetching from:', finalUrl);
        
        const response = await fetch(finalUrl, {
            headers: {
                'Accept': 'application/sparql-results+json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Raw data received:', data);
        
        if (!data.results || !data.results.bindings) {
            throw new Error('Invalid data structure');
        }
        
        state.sites = data.results.bindings.map(item => ({
            id: item.item?.value ? item.item.value.split('/').pop() : 'unknown',
            name: item.itemLabel?.value || 'Unknown Site',
            country: item.country?.value || 'Unknown',
            latitude: item.latitude?.value ? parseFloat(item.latitude.value) : 0,
            longitude: item.longitude?.value ? parseFloat(item.longitude.value) : 0,
            inscriptionYear: item.inscriptionYear?.value ? parseInt(item.inscriptionYear.value) : 1978,
            type: (() => {
                const t = item.type?.value?.toLowerCase() || '';
                if (t.includes('cultural')) return 'cultural';
                if (t.includes('natural')) return 'natural';
                if (t.includes('mixed')) return 'mixed';
                return 'cultural';
            })(),
            description: item.description?.value || 'No description available.',
            officialUrl: item.officialUrl?.value || ''
        })).filter(site => 
            site.latitude && 
            site.longitude && 
            !isNaN(site.latitude) && 
            !isNaN(site.longitude) &&
            site.latitude >= -90 && 
            site.latitude <= 90 &&
            site.longitude >= -180 && 
            site.longitude <= 180
        );
        
        console.log('Processed sites:', state.sites.length);
        
        // Filter sites initially
        filterSites();
        updateCounts();
        updateProgress();
        
        state.loading = false;
        hideLoading();
        
    } catch (error) {
        console.error('Error loading sites:', error);
        state.error = 'Failed to load UNESCO World Heritage Sites data.';
        hideLoading();
        showError(state.error);
    }
}

// Filter sites based on current state
function filterSites() {
    state.filteredSites = state.sites.filter(site => {
        const yearMatch = site.inscriptionYear <= state.selectedYear;
        const typeMatch = state.selectedType === 'all' || site.type === state.selectedType;
        return yearMatch && typeMatch;
    });
    
    elements.siteCount.innerHTML = `Showing <strong>${state.filteredSites.length}</strong> sites${state.selectedYear < new Date().getFullYear() ? ` up to ${state.selectedYear}` : ''}`;
}

// Update progress percentage
function updateProgress() {
    const minYear = 1978;
    const maxYear = new Date().getFullYear();
    const percent = Math.round(((state.selectedYear - minYear) / (maxYear - minYear)) * 100);
    elements.progressPercent.textContent = `${percent}% through time`;
    elements.totalSites.textContent = `${state.sites.length} total sites`;
}

// Update site counts
function updateCounts() {
    const counts = {
        all: state.sites.filter(s => s.inscriptionYear <= state.selectedYear).length,
        cultural: state.sites.filter(s => s.type === 'cultural' && s.inscriptionYear <= state.selectedYear).length,
        natural: state.sites.filter(s => s.type === 'natural' && s.inscriptionYear <= state.selectedYear).length,
        mixed: state.sites.filter(s => s.type === 'mixed' && s.inscriptionYear <= state.selectedYear).length
    };
    
    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-cultural').textContent = counts.cultural;
    document.getElementById('count-natural').textContent = counts.natural;
    document.getElementById('count-mixed').textContent = counts.mixed;
}

// Hide loading screen
function hideLoading() {
    elements.loading.style.display = 'none';
}

// Show error
function showError(message) {
    elements.loading.innerHTML = `
        <div style="text-align: center; max-width: 500px; padding: 1rem;">
            <p style="color: #d4183d; margin-bottom: 1rem;">${message}</p>
            <button onclick="location.reload()" style="
                padding: 0.5rem 1rem;
                background: #030213;
                color: white;
                border: none;
                border-radius: 0.5rem;
                cursor: pointer;
            ">Retry</button>
        </div>
    `;
}

// Map initialization
let map;
let markers = [];

function initMap() {
    console.log('Initializing map...');
    
    // Create map
    map = L.map('map').setView([20, 0], 2);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Update map with sites
    updateMap();
}

// Update map with current filtered sites
function updateMap() {
    if (!map) return;
    
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // Add new markers
    state.filteredSites.forEach(site => {
        const icon = createIcon(site.type);
        
        const marker = L.marker([site.latitude, site.longitude], { icon })
            .addTo(map)
            .bindPopup(`
                <div style="padding: 8px; width: 288px; max-height: 320px; overflow-y: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 12px; line-height: 1.4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    <h3 style="font-weight: bold; color: #000000; margin: 0 0 4px 0;">${site.name}</h3>
                    <p style="color: #000000; margin: 4px 0;"><strong>Country:</strong> ${site.country}</p>
                    <p style="color: #000000; margin: 4px 0;"><strong>Inscribed:</strong> ${site.inscriptionYear}</p>
                    <p style="color: #000000; margin: 8px 0;">${site.description}</p>
                    <a href="${site.officialUrl}" target="_blank" rel="noopener noreferrer" style="color: #10B981; text-decoration: underline; font-size: 11px;">View on UNESCO →</a>
                </div>
            `);
        
        marker.on('mouseover', function() {
            this.bindTooltip(`<strong>${site.name}</strong>`, {
                permanent: false,
                direction: 'top'
            }).openTooltip();
        });
        
        markers.push(marker);
    });
    
    // Fit bounds if we have sites
    if (state.filteredSites.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
}

// Create custom icons
function createIcon(type) {
    const colors = {
        cultural: '#8B5CF6', // violet
        natural: '#10B981',  // emerald
        mixed: '#F59E0B'     // amber
    };
    
    const svgIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42" fill="none">
            <path d="M16 0L32 16V42H0V16L16 0Z" fill="${colors[type]}" stroke="#ffffff" stroke-width="1"/>
            <circle cx="16" cy="20" r="4" fill="white"/>
            ${type === 'cultural' ? '<path d="M14 24H18V28H14V24Z" fill="#ffffff"/>' : ''}
            ${type === 'natural' ? '<path d="M14 24L16 20L18 24H14Z" fill="#ffffff"/>' : ''}
            ${type === 'mixed' ? '<path d="M14 24L16 20L18 24H14Z M14 28H18V32H14V28Z" fill="#ffffff"/>' : ''}
        </svg>
    `;
    
    return L.divIcon({
        html: svgIcon,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -42],
        className: ''
    });
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', init);
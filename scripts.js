// App state
const state = {
    sites: [],
    filteredSites: [],
    selectedYear: new Date().getFullYear(),
    selectedType: 'all',
    loading: true,
    error: null,
    controlsCollapsed: false
};

// DOM elements
const elements = {
    loading: document.getElementById('loading'),
    map: document.getElementById('map'),
    siteCount: document.getElementById('site-count'),
    selectedYear: document.getElementById('selected-year'),
    yearSlider: document.getElementById('year-slider'),
    minYear: document.getElementById('min-year'),
    currentYear: document.getElementById('current-year'),
    totalSites: document.getElementById('total-sites'),
    progressPercent: document.getElementById('progress-percent'),
    filterButtons: document.querySelectorAll('.filter-btn'),
    toggleControls: document.getElementById('toggle-controls'),
    controlsPanel: document.getElementById('controls'),
    expandedControls: document.getElementById('expanded-controls')
};

// Initialize the app
async function init() {
    console.log('Initializing app...');
    
    // Set current year
    elements.currentYear.textContent = state.selectedYear;
    elements.yearSlider.value = state.selectedYear;
    elements.yearSlider.max = state.selectedYear;
    elements.minYear.textContent = elements.yearSlider.min;
    elements.selectedYear.textContent = state.selectedYear;
    
    // Add event listeners
    setupEventListeners();
    
    // Load sites
    try {
        await loadSites();
        
        // Initialize map
        initMap();
    } catch (error) {
        console.error('Initialization failed:', error);
    }
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
    
    // Toggle controls
    elements.toggleControls.addEventListener('click', () => {
        state.controlsCollapsed = !state.controlsCollapsed;
        updateControlsVisibility();
    });
}

// Update controls visibility
function updateControlsVisibility() {
    const controlPanel = document.querySelector('.control-panel');
    if (state.controlsCollapsed) {
        controlPanel.classList.add('collapsed');
    } else {
        controlPanel.classList.remove('collapsed');
    }
}

// Load UNESCO sites from DigitalOcean Function with improved Wikidata query
async function loadSites() {
    try {
        console.log('Loading sites from DigitalOcean Function...');
        
        // Use your actual DigitalOcean function URL
        const functionUrl = 'https://faas-nyc1-2ef2e6cc.doserverless.co/api/v1/web/fn-64bcf502-3460-4418-ae12-fed42467b800/default/wikidata-proxy';
        
        // Improved SPARQL query for real UNESCO World Heritage Sites data
        const query = `
SELECT ?site ?siteName ?category ?countryName ?lat ?lon ?description ?unescoURL ?inscriptionYear
WHERE {
  {
    SELECT ?site
           (SAMPLE(?labelEn) AS ?siteLabelEn)
           (SAMPLE(?labelAny) AS ?siteLabelAny)
           (SAMPLE(?countryLabel) AS ?countryName)
           (SAMPLE(?descriptionEn) AS ?description)
           (SAMPLE(?latValue) AS ?lat)
           (SAMPLE(?lonValue) AS ?lon)
           (SAMPLE(?whsIdVal) AS ?whsId)
           (SAMPLE(?unescoUrlRaw) AS ?unescoURLRaw)
           (SAMPLE(?yearValue) AS ?inscriptionYear)
    WHERE {
      ?site wdt:P1435 wd:Q9259 .
      FILTER NOT EXISTS {
        ?site p:P1435 ?st .
        ?st ps:P1435 wd:Q9259 ; pq:P582 ?end .
      }
      OPTIONAL { ?site rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }
      OPTIONAL { ?site rdfs:label ?labelAny }
      OPTIONAL {
        ?site wdt:P17 ?country .
        ?country rdfs:label ?countryLabel FILTER(LANG(?countryLabel) = "en")
      }
      OPTIONAL { ?site schema:description ?descriptionEn FILTER(LANG(?descriptionEn) = "en") }
      OPTIONAL {
        ?site wdt:P625 ?coords .
        BIND(geof:latitude(?coords) AS ?latValue)
        BIND(geof:longitude(?coords) AS ?lonValue)
      }
      OPTIONAL { ?site wdt:P757 ?whsIdVal }
      OPTIONAL {
        ?site wdt:P973 ?unescoUrlRaw .
        FILTER(CONTAINS(STR(?unescoUrlRaw), "whc.unesco.org/en/list/"))
      }
      OPTIONAL {
        ?site p:P1435 ?whsStatement .
        ?whsStatement ps:P1435 wd:Q9259 .
        OPTIONAL { ?whsStatement pq:P580 ?inscriptionDate }
      }
      BIND(IF(BOUND(?inscriptionDate), YEAR(?inscriptionDate), 0) AS ?yearValue)
    }
    GROUP BY ?site
  }

  BIND(COALESCE(?siteLabelEn, ?siteLabelAny) AS ?siteName)

  BIND(
    IF(
      EXISTS {
        ?site wdt:P2614 ?criterionC .
        ?criterionC wdt:P1545 ?numberC .
        FILTER(?numberC >= 1 && ?numberC <= 6)
      } &&
      EXISTS {
        ?site wdt:P2614 ?criterionN .
        ?criterionN wdt:P1545 ?numberN .
        FILTER(?numberN >= 7 && ?numberN <= 10)
      },
      "mixed",
      IF(
        EXISTS {
          ?site wdt:P2614 ?criterionNOnly .
          ?criterionNOnly wdt:P1545 ?numberNOnly .
          FILTER(?numberNOnly >= 7 && ?numberNOnly <= 10)
        },
        "natural",
        "cultural"
      )
    ) AS ?category
  )

  BIND(
    IF(
      BOUND(?whsId),
      CONCAT("https://whc.unesco.org/en/list/", STR(?whsId)),
      COALESCE(STR(?unescoURLRaw), "")
    ) AS ?unescoURL
  )
}
ORDER BY ?siteName
`;
        
        // Send the query through the DigitalOcean function
        console.log('Fetching from DigitalOcean function...');
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Function returned:', data);
        
        if (!data.results || !data.results.bindings) {
            throw new Error('Invalid data structure returned from function');
        }
        
        processSitesData(data);
        
    } catch (error) {
        console.error('Error loading sites from function:', error);
        state.loading = false;
        showError('Unable to load data from Wikidata. Please try again.');
        throw error;
    }
}

// Process the sites data
function processSitesData(data) {
    console.log('Processing sites ', data);
    
    if (!data.results || !data.results.bindings) {
        throw new Error('Invalid data structure');
    }
    
    console.log('Number of results:', data.results.bindings.length);
    
    state.sites = data.results.bindings.map(item => {
        // Parse coordinates
        let latitude = 0;
        let longitude = 0;
        
        if (item.lat?.value && item.lon?.value) {
            latitude = parseFloat(item.lat.value);
            longitude = parseFloat(item.lon.value);
        }

        const rawYear = item.inscriptionYear?.value ? parseInt(item.inscriptionYear.value, 10) : NaN;
        const inscriptionYear = Number.isFinite(rawYear) && rawYear > 0 ? rawYear : 1978;
        
        // Determine type from category or default to cultural
        let type = 'cultural';
        if (item.category?.value) {
            type = item.category.value.toLowerCase();
        }
        
        return {
            id: item.site?.value ? item.site.value.split('/').pop() : 'unknown',
            name: item.siteName?.value || 'Unknown Site',
            country: item.countryName?.value || 'Unknown',
            latitude: latitude,
            longitude: longitude,
            inscriptionYear,
            type: type,
            description: item.description?.value || 'UNESCO World Heritage Site',
            officialUrl: item.unescoURL?.value || ''
        };
    }).filter(site => 
        site.latitude && 
        site.longitude && 
        !isNaN(site.latitude) && 
        !isNaN(site.longitude) &&
        site.latitude >= -90 && 
        site.latitude <= 90 &&
        site.longitude >= -180 && 
        site.longitude <= 180
    );

    const availableYears = state.sites
        .map(site => site.inscriptionYear)
        .filter(year => Number.isFinite(year) && year > 0);

    if (availableYears.length) {
        const minYear = Math.min(...availableYears);
        elements.yearSlider.min = minYear;
        elements.minYear.textContent = minYear;
    }

    console.log('Processed valid sites:', state.sites.length);
    
    // Filter sites initially
    filterSites();
    updateCounts();
    updateProgress();
    
    state.loading = false;
    hideLoading();
}

// Test data fallback
function loadTestSites() {
    console.log('Loading test data...');
    
    const testSites = [
        {
            id: "1",
            name: "Yellowstone National Park",
            country: "United States",
            latitude: 44.4280,
            longitude: -110.5885,
            inscriptionYear: 1978,
            type: "natural",
            description: "First national park in the world, known for its geothermal features.",
            officialUrl: "https://www.nps.gov/yell/index.htm"
        },
        {
            id: "2",
            name: "Great Wall of China",
            country: "China",
            latitude: 40.4319,
            longitude: 116.5704,
            inscriptionYear: 1987,
            type: "cultural",
            description: "Series of fortifications made of stone, brick, wood and other materials.",
            officialUrl: "https://whc.unesco.org/en/list/438"
        },
        {
            id: "3",
            name: "Galápagos Islands",
            country: "Ecuador",
            latitude: -0.7893,
            longitude: -91.2109,
            inscriptionYear: 1978,
            type: "natural",
            description: "Volcanic archipelago famous for its endemic species studied by Charles Darwin.",
            officialUrl: "https://whc.unesco.org/en/list/1"
        }
    ];
    
    state.sites = testSites;
    filterSites();
    updateCounts();
    updateProgress();
    state.loading = false;
    hideLoading();
    initMap();
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
    const minAttr = parseInt(elements.yearSlider.min, 10);
    const maxAttr = parseInt(elements.yearSlider.max, 10);
    const minYear = Number.isFinite(minAttr) ? minAttr : 1978;
    const maxYear = Number.isFinite(maxAttr) ? maxAttr : new Date().getFullYear();
    const clampedSelected = Math.max(minYear, Math.min(state.selectedYear, maxYear));
    const range = Math.max(1, maxYear - minYear);
    const percent = Math.round(((clampedSelected - minYear) / range) * 100);
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
    elements.loading.style.display = 'flex';
    elements.loading.innerHTML = `
        <div style="text-align: center; max-width: 500px; padding: 1rem;">
            <p style="color: #d4183d; margin-bottom: 1rem;">${message}</p>
            <button
                onclick="location.reload()"
                style="
                    padding: 0.5rem 1rem;
                    background: #030213;
                    color: white;
                    border: none;
                    border-radius: 0.5rem;
                    cursor: pointer;
                "
                aria-label="Retry loading data"
            >
                Retry
            </button>
        </div>
    `;
}

// Map initialization
let map;
let markers = [];

function initMap() {
    console.log('Initializing map with MapTiler Dataviz tiles...');
    
    // Create map
    map = L.map('map').setView([20, 0], 2);
    
    // Add MapTiler Dataviz tile layer with your API key
    L.tileLayer('https://api.maptiler.com/maps/dataviz/{z}/{x}/{y}.png?key=hwdzAUpEiLf9NbzhMhnP', {
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data from <a href="https://www.wikidata.org/">Wikidata</a>',
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        maxZoom: 18,
        crossOrigin: true
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
                    <p style="color: #000000; margin: 4px 0;"><strong>Type:</strong> ${site.type.charAt(0).toUpperCase() + site.type.slice(1)}</p>
                    <p style="color: #000000; margin: 8px 0;">${site.description}</p>
                    <a 
                        href="${site.officialUrl}" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style="color: #10B981; text-decoration: underline; font-size: 11px;"
                    >
                        View on UNESCO →
                    </a>
                </div>
            `);
        
        marker.on('mouseover', function() {
            marker.bindTooltip(`<strong>${site.name}</strong>`, {
                permanent: false,
                direction: 'top',
                className: 'tooltip-popup',
                offset: [0, -10],
            }).openTooltip();
        });
        
        marker.on('mouseout', () => marker.closeTooltip());
        
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
            <path d="M16 0L32 16V42H0V16L16 0Z" fill="${colors[type]}" stroke="#030213" stroke-width="1"/>
            <circle cx="16" cy="20" r="4" fill="white"/>
            ${type === 'cultural' ? '<path d="M14 24H18V28H14V24Z" fill="#030213"/>' : ''}
            ${type === 'natural' ? '<path d="M14 24L16 20L18 24H14Z" fill="#030213"/>' : ''}
            ${type === 'mixed' ? '<path d="M14 24L16 20L18 24H14Z M14 28H18V32H14V28Z" fill="#030213"/>' : ''}
        </svg>
    `;
    
    return L.divIcon({
        html: svgIcon,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -42],
        className: 'custom-heritage-marker',
    });
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', init);

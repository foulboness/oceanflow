  /**
     * ============================================================================
     * OCEANFLOW — 3D Interactive Ocean Current & Thermohaline Circulation Simulator
     * ============================================================================
     * Architecture:
     * 1. Procedural High-Res Earth Bathymetry, Continent Polygons & Dynamic Ice Caps
     * 2. Three.js WebGL Scene: Layered Globe (Abyssal Core + Translucent Ocean Shell),
     *    Atmospheric Fresnel Rim Shader, Graticule Lat/Lon Grid, Deep Water Sinking
     *    Vortex Rings, and Starfield.
     * 3. Spline-Guided + Curl-Perturbed Lagrangian Particle Advection System:
     *    - Surface Gyres & Boundary Currents (Gulf Stream, Kuroshio, ACC, Humboldt,
     *      Benguela, Agulhas, Equatorial Currents)
     *    - Thermohaline Conveyor Belt (NADW Sinking, Deep Atlantic Southward Return,
     *      AABW Circumpolar Mixing, Indian/Pacific Upwelling, Warm Surface Return)
     * 4. Real-Time Seawater Equation of State ρ(T, S, z) & AMOC Overturning Box Model
     * 5. Interactive Climate Experiments & Vertical Thermocline/Pycnocline Profiler
     */

    // ---------------------------------------------------------------------------
    // 1. GLOBAL SIMULATION STATE
    // ---------------------------------------------------------------------------
    const state = {
      playing: true,
      simSpeed: 1.0,
      layerMode: 'surface',      // 'surface' | 'deep' | 'conveyor'
      colorMode: 'thermal',      // 'thermal' | 'velocity' | 'salinity'
      tempAnomaly: 0.0,          // -2.0 to +5.0 °C
      polarSalinity: 34.9,       // 32.0 to 36.5 PSU
      windStress: 100,           // 20 to 200 %
      inspectDepth: 50,          // 0 to 4000 m
      polarDensity: 1027.8,      // Computed kg/m³
      amocStrength: 17.2,        // Computed Sverdrups (Sv)
      sinkingFactor: 1.0,        // 0.15 to 1.45
      iceExtent: 1.0,            // 0.15 (melted) to 1.65 (glacial)
      activeExperiment: 'baseline',
      selectedStationId: 'gulf_stream',
      showMarkers: true,
      showGrid: true,
      autoRotate: false
    };

    const GLOBE_RADIUS = 5.0;
    const SURFACE_SHELL_RADIUS = 5.055;
    const DEEP_SHELL_RADIUS = 4.92;

    // ---------------------------------------------------------------------------
    // 2. MAJOR CURRENT STATIONS & OCEANOGRAPHIC KNOWLEDGE BASE
    // ---------------------------------------------------------------------------
    const CURRENT_STATIONS = [
      {
        id: 'gulf_stream',
        name: 'Gulf Stream',
        shortName: 'Gulf Stream',
        basin: 'North Atlantic',
        lat: 36.5,
        lon: -71.0,
        depthLayer: 'surface',
        category: 'WARM WESTERN BOUNDARY',
        baseVel: 1.85,
        baseTemp: 24.6,
        baseSal: 36.2,
        windSensitivity: 0.55,
        amocSensitivity: 0.45,
        briefing: 'The Gulf Stream is a powerful, warm Atlantic western boundary current driven by subtropical wind-stress curl and intensified by Earth’s rotation. It carries ~30–150 Sv of warm tropical water northward, moderating Western European climate and feeding the North Atlantic Drift.',
        epistemic: 'Observational baseline velocity (~1.5–2.2 m/s) derived from satellite altimetry and drifter buoys. In simulation experiments, freshwater-induced AMOC weakening reduces its northward heat-transport component.'
      },
      {
        id: 'nadw_sinking',
        name: 'NADW Deep Water Formation',
        shortName: 'NADW Sinking',
        basin: 'Nordic / Labrador Seas',
        lat: 63.0,
        lon: -32.0,
        depthLayer: 'deep',
        category: 'THERMOHALINE DOWNWELLING',
        baseVel: 0.42,
        baseTemp: 1.8,
        baseSal: 34.9,
        windSensitivity: 0.15,
        amocSensitivity: 0.95,
        briefing: 'In the subpolar North Atlantic, warm, salty surface waters lose heat to the frigid atmosphere. Cooling increases seawater density until surface water becomes denser than underlying layers and plunges 2,000–4,000 m to form North Atlantic Deep Water (NADW)—the primary engine of the global conveyor belt.',
        epistemic: 'Real overturning (~17 Sv) is monitored by the RAPID-MOCHA array at 26.5°N. Lowering polar salinity in our model reduces seawater density ρ(T,S), directly throttling downwelling convection.'
      },
      {
        id: 'kuroshio',
        name: 'Kuroshio Current',
        shortName: 'Kuroshio',
        basin: 'North Pacific',
        lat: 33.0,
        lon: 141.0,
        depthLayer: 'surface',
        category: 'WARM WESTERN BOUNDARY',
        baseVel: 1.72,
        baseTemp: 23.8,
        baseSal: 34.8,
        windSensitivity: 0.75,
        amocSensitivity: 0.15,
        briefing: 'The Kuroshio ("Black Tide") is the Pacific counterpart to the Gulf Stream, flowing northeastward past Taiwan and Japan before forming the North Pacific Current. Its dark cobalt waters are nutrient-poor at the surface but transfer vast latent heat into mid-latitude storm tracks.',
        epistemic: 'Driven primarily by Pacific trade and westerly wind gyre torque; responds strongly to the Wind Stress slider.'
      },
      {
        id: 'acc',
        name: 'Antarctic Circumpolar Current',
        shortName: 'Antarctic Circumpolar',
        basin: 'Southern Ocean',
        lat: -56.0,
        lon: 20.0,
        depthLayer: 'surface',
        category: 'CIRCUMPOLAR WIND-DRIVEN',
        baseVel: 1.15,
        baseTemp: 1.2,
        baseSal: 34.6,
        windSensitivity: 0.90,
        amocSensitivity: 0.20,
        briefing: 'Unobstructed by continental landmasses, the Antarctic Circumpolar Current (ACC) flows clockwise around Antarctica from west to east. Reaching all the way to the seafloor and transporting ~135–170 Sv, it is Earth’s largest current system and connects the Atlantic, Indian, and Pacific basins.',
        epistemic: 'Driven by fierce Southern Hemisphere westerlies ("Roaring Forties" & "Furious Fifties") and steep meridional density fronts.'
      },
      {
        id: 'humboldt',
        name: 'Humboldt (Peru) Current',
        shortName: 'Humboldt Current',
        basin: 'Southeast Pacific',
        lat: -18.0,
        lon: -76.0,
        depthLayer: 'surface',
        category: 'COLD EASTERN BOUNDARY / UPWELLING',
        baseVel: 0.58,
        baseTemp: 15.4,
        baseSal: 34.7,
        windSensitivity: 0.85,
        amocSensitivity: 0.10,
        briefing: 'Flowing equatorward along the coasts of Chile and Peru, the Humboldt Current drives intense wind-induced Ekman coastal upwelling. Deep, cold, nutrient-rich water rises into the sunlit euphotic zone, fueling one of the most productive marine ecosystems on Earth.',
        epistemic: 'Coastal upwelling strength scales tightly with trade-wind stress; weakens dramatically during El Niño events.'
      },
      {
        id: 'agulhas',
        name: 'Agulhas Current & Leakage',
        shortName: 'Agulhas Current',
        basin: 'SW Indian / SE Atlantic',
        lat: -35.5,
        lon: 22.0,
        depthLayer: 'surface',
        category: 'WARM RETURN CONVEYOR GATEWAY',
        baseVel: 1.65,
        baseTemp: 22.1,
        baseSal: 35.4,
        windSensitivity: 0.65,
        amocSensitivity: 0.40,
        briefing: 'Sweeping down the southeast coast of Africa, the Agulhas Current retroflects south of Cape Agulhas, shedding giant warm, salty eddies ("Agulhas Rings") into the South Atlantic. This leakage provides crucial warm, saline water that replenishes the upper limb of the Atlantic Meridional Overturning Circulation.',
        epistemic: 'Serves as a vital inter-ocean choke point linking Indian Ocean heat and salt budgets back into the Atlantic.'
      }
    ];

    // ---------------------------------------------------------------------------
    // 3. EXPERIMENT SCENARIOS
    // ---------------------------------------------------------------------------
    const EXPERIMENTS = {
      baseline: {
        label: 'OBSERVATIONAL BASELINE',
        isObs: true,
        tempAnomaly: 0.0,
        polarSalinity: 34.9,
        windStress: 100,
        layerMode: 'surface',
        camera: 'global',
        note: 'Climatological modern ocean state (~17.2 Sv AMOC overturning). Streamlines reflect observed geostrophic gyres and deep thermohaline pathways.'
      },
      greenland: {
        label: 'SIMULATION: FRESHWATER HOSING',
        isObs: false,
        tempAnomaly: 1.4,
        polarSalinity: 32.5,
        windStress: 95,
        layerMode: 'conveyor',
        camera: 'natlantic',
        note: 'HYPOTHESIS TEST: Accelerated Greenland ice-sheet melt injects low-density freshwater into the subpolar North Atlantic (32.5 PSU). Surface water fails to reach critical sinking density, slowing AMOC overturning and weakening northward Gulf Stream heat transport.'
      },
      warming: {
        label: 'SIMULATION: +4.0°C WARMING',
        isObs: false,
        tempAnomaly: 4.0,
        polarSalinity: 33.8,
        windStress: 88,
        layerMode: 'conveyor',
        camera: 'global',
        note: 'HYPOTHESIS TEST: Strong surface warming and polar ice retreat increase upper-ocean thermal stratification, creating a buoyant lid that inhibits vertical mixing and weakens the thermohaline conveyor.'
      },
      glacial: {
        label: 'SIMULATION: GLACIAL MAXIMUM',
        isObs: false,
        tempAnomaly: -2.0,
        polarSalinity: 36.2,
        windStress: 135,
        layerMode: 'conveyor',
        camera: 'natlantic',
        note: 'PALEO-OCEAN SCENARIO: Expanded polar sea ice rejects dense salty brine during freezing (36.2 PSU), while stronger glacial winds intensify surface gyres and Antarctic Bottom Water formation.'
      },
      windsurge: {
        label: 'SIMULATION: WIND-STRESS SURGE',
        isObs: false,
        tempAnomaly: 0.2,
        polarSalinity: 35.0,
        windStress: 180,
        layerMode: 'surface',
        camera: 'southern',
        note: 'DYNAMIC FORCING TEST: Intensified Trade and Westerly winds (+80%) accelerate wind-driven Ekman transport, subtropical gyres, and the Antarctic Circumpolar Current.'
      }
    };

    // ---------------------------------------------------------------------------
    // 4. PROCEDURAL EARTH TEXTURE GENERATOR (Continents, Bathymetry & Dynamic Ice)
    // ---------------------------------------------------------------------------
    // Simplified high-accuracy geographic continent polygons [lon, lat]
    const CONTINENT_POLYGONS = [
      // North America
      [[-168,65],[-162,70],[-140,70],[-110,73],[-85,70],[-78,62],[-64,60],[-55,50],[-67,44],[-75,36],[-81,25],[-90,21],[-97,26],[-97,19],[-84,10],[-78,8],[-88,15],[-105,20],[-114,31],[-122,37],[-125,49],[-138,59],[-152,60],[-165,60]],
      // Greenland
      [[-52,60],[-43,60],[-22,70],[-18,77],[-35,83],[-58,81],[-72,77],[-60,68]],
      // South America
      [[-78,9],[-72,12],[-60,8],[-50,1],[-35,-6],[-38,-14],[-41,-22],[-53,-33],[-63,-41],[-68,-54],[-74,-53],[-73,-41],[-71,-29],[-70,-18],[-81,-5],[-79,3]],
      // Europe
      [[-9,36],[-9,43],[-2,48],[4,52],[9,55],[11,59],[5,61],[15,68],[28,71],[42,67],[58,69],[60,55],[45,48],[38,45],[28,41],[23,37],[16,38],[12,44],[5,43],[-2,36]],
      // Africa
      [[-17,15],[-13,28],[-6,35],[10,37],[12,33],[25,32],[32,31],[43,12],[51,11],[41,-2],[40,-15],[35,-24],[28,-33],[18,-34],[15,-26],[12,-15],[12,-5],[8,4],[2,6],[-8,5],[-16,11]],
      // Asia
      [[28,41],[40,42],[52,40],[60,55],[60,69],[80,73],[105,77],[135,71],[165,67],[175,65],[162,55],[142,53],[135,43],[128,35],[122,40],[118,35],[121,25],[110,20],[108,12],[103,2],[98,16],[92,22],[85,20],[80,8],[72,20],[66,25],[56,26],[48,30],[44,13],[36,28],[35,36]],
      // Australia
      [[114,-22],[122,-17],[131,-12],[136,-13],[142,-11],[146,-19],[153,-28],[150,-37],[141,-38],[136,-35],[130,-32],[115,-34],[113,-26]],
      // Madagascar & Japan & UK & NZ (Key oceanographic islands)
      [[44,-25],[47,-13],[50,-16],[47,-25]],
      [[130,31],[136,34],[141,38],[145,44],[140,43],[137,37],[131,33]],
      [[-6,50],[1,51],[0,58],[-5,58]],
      [[167,-46],[174,-41],[178,-37],[174,-35],[172,-43]]
    ];

    let earthTextureCanvas, earthTexture, bumpTexture;

    function initProceduralTextures() {
      earthTextureCanvas = document.createElement('canvas');
      earthTextureCanvas.width = 2048;
      earthTextureCanvas.height = 1024;

      earthTexture = new THREE.CanvasTexture(earthTextureCanvas);
      earthTexture.wrapS = THREE.RepeatWrapping;
      earthTexture.wrapT = THREE.ClampToEdgeWrapping;

      // Generate static bump map for bathymetric ridges & continental relief
      const bumpCanvas = document.createElement('canvas');
      bumpCanvas.width = 1024;
      bumpCanvas.height = 512;
      const bctx = bumpCanvas.getContext('2d');
      bctx.fillStyle = '#18202c';
      bctx.fillRect(0, 0, 1024, 512);

      // Mid-ocean ridge bump highlights
      bctx.strokeStyle = 'rgba(130, 170, 210, 0.35)';
      bctx.lineWidth = 6;
      bctx.beginPath();
      // Mid-Atlantic Ridge
      bctx.moveTo(430, 60);
      bctx.bezierCurveTo(400, 180, 460, 260, 475, 430);
      bctx.stroke();

      // Continents elevated in bump map
      bctx.fillStyle = '#b0c4d8';
      drawContinentsPath(bctx, 1024, 512);
      bctx.fill();

      bumpTexture = new THREE.CanvasTexture(bumpCanvas);
      bumpTexture.wrapS = THREE.RepeatWrapping;
      bumpTexture.wrapT = THREE.ClampToEdgeWrapping;

      updateEarthSurfaceTexture(state.iceExtent);
    }

    function lonLatToCanvas(lon, lat, w, h) {
      const x = ((lon + 180) / 360) * w;
      const y = ((90 - lat) / 180) * h;
      return [x, y];
    }

    function drawContinentsPath(ctx, w, h) {
      ctx.beginPath();
      for (const poly of CONTINENT_POLYGONS) {
        for (let i = 0; i < poly.length; i++) {
          const [x, y] = lonLatToCanvas(poly[i][0], poly[i][1], w, h);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
    }

    function updateEarthSurfaceTexture(iceExtent) {
      const w = earthTextureCanvas.width;
      const h = earthTextureCanvas.height;
      const ctx = earthTextureCanvas.getContext('2d');

      // 1. Deep Abyssal Ocean Bathymetry Gradient
      const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
      oceanGrad.addColorStop(0.0, '#071b30');
      oceanGrad.addColorStop(0.25, '#051526');
      oceanGrad.addColorStop(0.5, '#061a2e');
      oceanGrad.addColorStop(0.75, '#051526');
      oceanGrad.addColorStop(1.0, '#071b30');
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Subtle Mid-Ocean Ridges & Abyssal Fracture Zones
      ctx.save();
      ctx.strokeStyle = 'rgba(18, 72, 112, 0.35)';
      ctx.lineWidth = 10;
      ctx.filter = 'blur(4px)';
      ctx.beginPath();
      // Mid-Atlantic Ridge
      ctx.moveTo(w * 0.42, h * 0.12);
      ctx.bezierCurveTo(w * 0.38, h * 0.35, w * 0.45, h * 0.52, w * 0.465, h * 0.85);
      // East Pacific Rise
      ctx.moveTo(w * 0.19, h * 0.42);
      ctx.bezierCurveTo(w * 0.17, h * 0.62, w * 0.14, h * 0.78, w * 0.10, h * 0.86);
      // Indian Ocean Triple Junction
      ctx.moveTo(w * 0.68, h * 0.48);
      ctx.lineTo(w * 0.69, h * 0.72);
      ctx.lineTo(w * 0.52, h * 0.83);
      ctx.moveTo(w * 0.69, h * 0.72);
      ctx.lineTo(w * 0.88, h * 0.84);
      ctx.stroke();
      ctx.restore();

      // 3. Continental Shelves (Glowing Cyan/Teal Shallow Bathymetry Halo)
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 22;
      ctx.strokeStyle = 'rgba(14, 116, 144, 0.34)';
      drawContinentsPath(ctx, w, h);
      ctx.stroke();

      ctx.lineWidth = 9;
      ctx.strokeStyle = 'rgba(20, 165, 185, 0.38)';
      drawContinentsPath(ctx, w, h);
      ctx.stroke();
      ctx.restore();

      // 4. Continental Landmasses (Dark Slate/Charcoal Topographic Laboratory Style)
      ctx.save();
      drawContinentsPath(ctx, w, h);
      const landGrad = ctx.createLinearGradient(0, 0, 0, h);
      landGrad.addColorStop(0.0, '#1e2c3a');
      landGrad.addColorStop(0.5, '#172330');
      landGrad.addColorStop(1.0, '#1e2c3a');
      ctx.fillStyle = landGrad;
      ctx.fill();

      // Crisp coastline border
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.stroke();
      ctx.restore();

      // 5. Dynamic Polar Ice Caps & Antarctica (Scales with iceExtent)
      ctx.save();
      // Antarctica base continent + ice shelf
      const antY = h * (0.86 - (iceExtent - 1.0) * 0.045);
      const antGrad = ctx.createLinearGradient(0, antY - 25, 0, h);
      antGrad.addColorStop(0, 'rgba(186, 230, 253, 0.0)');
      antGrad.addColorStop(0.25, 'rgba(205, 240, 255, 0.78)');
      antGrad.addColorStop(0.6, '#e0f4ff');
      antGrad.addColorStop(1.0, '#f0f9ff');
      ctx.fillStyle = antGrad;
      ctx.fillRect(0, antY - 25, w, h - (antY - 25));

      // Arctic Sea Ice Cap (grows/shrinks dynamically with Polar Melt / Glacial experiments)
      const arcticDepth = h * Math.max(0.025, 0.095 * iceExtent);
      const arcGrad = ctx.createLinearGradient(0, 0, 0, arcticDepth + 20);
      arcGrad.addColorStop(0.0, '#e6f6ff');
      arcGrad.addColorStop(0.65, 'rgba(186, 230, 253, 0.72)');
      arcGrad.addColorStop(1.0, 'rgba(186, 230, 253, 0.0)');
      ctx.fillStyle = arcGrad;
      ctx.fillRect(0, 0, w, arcticDepth + 20);
      ctx.restore();

      if (earthTexture) {
        earthTexture.needsUpdate = true;
      }
    }

    // ---------------------------------------------------------------------------
    // 5. THREE.JS SCENE SETUP
    // ---------------------------------------------------------------------------
    let scene, camera, renderer, controls;
    let earthMesh, oceanShellMesh, atmosphereMesh, graticuleGroup, sinkingMarkersGroup;
    let surfaceParticleSystem, deepParticleSystem;
    const markerElements = {};

    function initThreeScene() {
      const container = document.getElementById('canvas-container');
      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x040b14, 0.014);

      camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 200);
      camera.position.set(0, 4.5, 15.2);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      // OrbitControls
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.rotateSpeed = 0.65;
      controls.zoomSpeed = 0.85;
      controls.minDistance = 7.4;
      controls.maxDistance = 26.0;
      controls.enablePan = false;

      // Lighting
      const ambientLight = new THREE.AmbientLight(0x88b4d8, 0.85);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xdff6ff, 1.15);
      dirLight.position.set(12, 10, 14);
      scene.add(dirLight);

      const rimLight = new THREE.DirectionalLight(0x00f0ff, 0.45);
      rimLight.position.set(-14, -6, -10);
      scene.add(rimLight);

      // Procedural Textures
      initProceduralTextures();

      // 1. Earth Globe Mesh (Bathymetry + Continents + Dynamic Ice)
      const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64);
      const earthMat = new THREE.MeshPhongMaterial({
        map: earthTexture,
        bumpMap: bumpTexture,
        bumpScale: 0.045,
        specular: new THREE.Color(0x164e63),
        shininess: 22,
        transparent: true,
        opacity: 1.0
      });
      earthMesh = new THREE.Mesh(earthGeo, earthMat);
      scene.add(earthMesh);

      // 2. Translucent Upper Ocean Envelope (gives depth separation between surface & abyssal currents)
      const oceanGeo = new THREE.SphereGeometry(SURFACE_SHELL_RADIUS - 0.015, 72, 48);
      const oceanMat = new THREE.MeshPhongMaterial({
        color: 0x06243d,
        transparent: true,
        opacity: 0.16,
        shininess: 65,
        depthWrite: false
      });
      oceanShellMesh = new THREE.Mesh(oceanGeo, oceanMat);
      scene.add(oceanShellMesh);

      // 3. Atmospheric Fresnel Glow Shader
      const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.065, 64, 48);
      const atmoMat = new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.66 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.8);
            gl_FragColor = vec4(0.0, 0.88, 1.0, 1.0) * intensity * 0.85;
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false
      });
      atmosphereMesh = new THREE.Mesh(atmoGeo, atmoMat);
      scene.add(atmosphereMesh);

      // 4. Lat/Lon Scientific Graticule Grid
      buildGraticuleGrid();

      // 5. Deep Water Downwelling / Upwelling Pulsing Rings
      buildThermohalineNodes();

      // 6. Starfield Background
      buildStarfield();

      // 7. Ocean Current Particle Advection Systems
      initParticleSystems();

      // 8. HTML 3D Waypoint Markers
      buildStationUI();

      window.addEventListener('resize', onWindowResize);
    }

    function latLonToVector3(lat, lon, radius) {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      const x = -radius * Math.sin(phi) * Math.cos(theta);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      const y = radius * Math.cos(phi);
      return new THREE.Vector3(x, y, z);
    }

    function buildGraticuleGrid() {
      graticuleGroup = new THREE.Group();
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.11
      });
      const equatorMat = new THREE.LineBasicMaterial({
        color: 0x0de8b5,
        transparent: true,
        opacity: 0.25
      });

      const r = SURFACE_SHELL_RADIUS + 0.005;

      // Latitude parallels every 30°
      for (let lat = -60; lat <= 60; lat += 30) {
        const pts = [];
        for (let lon = -180; lon <= 180; lon += 4) {
          pts.push(latLonToVector3(lat, lon, r));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        graticuleGroup.add(new THREE.Line(geo, lat === 0 ? equatorMat : lineMat));
      }

      // Longitude meridians every 30°
      for (let lon = -180; lon < 180; lon += 30) {
        const pts = [];
        for (let lat = -85; lat <= 85; lat += 4) {
          pts.push(latLonToVector3(lat, lon, r));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        graticuleGroup.add(new THREE.Line(geo, lineMat));
      }

      scene.add(graticuleGroup);
    }

    function buildThermohalineNodes() {
      sinkingMarkersGroup = new THREE.Group();
      const nodes = [
        { lat: 63, lon: -32, color: 0x00f0ff, type: 'sink' },  // NADW Greenland/Iceland
        { lat: 57, lon: -52, color: 0x00f0ff, type: 'sink' },  // Labrador Sea
        { lat: -68, lon: -35, color: 0x38bdf8, type: 'sink' }, // Weddell Sea AABW
        { lat: 10, lon: 68, color: 0xffaa00, type: 'upwell' }, // Indian Ocean Upwelling
        { lat: 28, lon: -155, color: 0xffaa00, type: 'upwell' } // North Pacific Upwelling
      ];

      nodes.forEach((n, idx) => {
        const ringGeo = new THREE.RingGeometry(0.14, 0.24, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: n.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        const pos = latLonToVector3(n.lat, n.lon, SURFACE_SHELL_RADIUS + 0.02);
        ring.position.copy(pos);
        ring.lookAt(pos.clone().multiplyScalar(2));
        ring.userData = { phase: idx * 1.3, type: n.type };
        sinkingMarkersGroup.add(ring);
      });

      scene.add(sinkingMarkersGroup);
    }

    function buildStarfield() {
      const starGeo = new THREE.BufferGeometry();
      const count = 1600;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = 55 + Math.random() * 65;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0x93c5fd,
        size: 0.22,
        transparent: true,
        opacity: 0.55
      });
      scene.add(new THREE.Points(starGeo, starMat));
    }

    // ---------------------------------------------------------------------------
    // 6. OCEAN CURRENT PATHWAYS & LAGRANGIAN PARTICLE ADVECTION ENGINE
    // ---------------------------------------------------------------------------
    // Major Circulation Pathways defined by [lon, lat, baseTemp(°C), baseSal(PSU), baseSpeed]
    const SURFACE_PATHWAYS = [
      // North Atlantic Subtropical Gyre + Gulf Stream + North Atlantic Drift
      {
        name: 'Gulf Stream & N. Atlantic Gyre',
        loop: true,
        type: 'wind_amoc',
        points: [
          [-20, 14, 26, 36.0, 0.9], [-55, 16, 27, 36.2, 1.0], [-78, 25, 27, 36.4, 1.5],
          [-74, 35, 24, 36.2, 1.9], [-55, 41, 18, 35.7, 1.5], [-30, 48, 13, 35.3, 1.1],
          [-12, 54, 10, 35.1, 0.85], [-16, 36, 17, 36.1, 0.75]
        ]
      },
      // North Atlantic Subpolar Gyre
      {
        name: 'Subpolar Gyre',
        loop: true,
        type: 'amoc',
        points: [
          [-20, 56, 9, 35.0, 0.8], [-35, 62, 5, 34.8, 0.75], [-52, 60, 3, 34.5, 0.8],
          [-48, 50, 7, 34.7, 0.85], [-32, 49, 11, 35.1, 0.95]
        ]
      },
      // South Atlantic Gyre & Benguela Current
      {
        name: 'South Atlantic Gyre & Benguela',
        loop: true,
        type: 'wind',
        points: [
          [10, -32, 15, 35.1, 0.8], [5, -18, 19, 35.4, 0.85], [-15, -8, 25, 35.8, 0.95],
          [-36, -10, 26, 36.3, 1.1], [-46, -26, 22, 36.0, 1.0], [-30, -38, 15, 35.2, 0.95],
          [-5, -38, 13, 34.9, 0.9]
        ]
      },
      // North Pacific Gyre & Kuroshio Current
      {
        name: 'Kuroshio & North Pacific Gyre',
        loop: true,
        type: 'wind',
        points: [
          [-125, 16, 26, 34.6, 0.9], [165, 15, 28, 34.7, 1.0], [126, 22, 27, 34.8, 1.35],
          [137, 33, 24, 34.8, 1.75], [162, 40, 16, 34.4, 1.35], [-165, 43, 12, 33.9, 1.0],
          [-132, 40, 14, 33.6, 0.8], [-122, 26, 18, 34.1, 0.75]
        ]
      },
      // South Pacific Gyre & Humboldt Current
      {
        name: 'South Pacific Gyre & Humboldt',
        loop: true,
        type: 'wind',
        points: [
          [-75, -38, 13, 34.3, 0.75], [-76, -18, 16, 34.7, 0.8], [-95, -6, 24, 35.1, 0.95],
          [-145, -8, 27, 35.6, 1.0], [172, -18, 26, 35.5, 0.95], [156, -32, 20, 35.4, 1.0],
          [-165, -42, 13, 34.7, 0.9], [-110, -42, 12, 34.4, 0.85]
        ]
      },
      // Indian Ocean Gyre & Agulhas Current
      {
        name: 'Agulhas & Indian Ocean Gyre',
        loop: true,
        type: 'wind_amoc',
        points: [
          [98, -12, 27, 34.6, 0.9], [65, -14, 26, 35.1, 1.0], [42, -16, 26, 35.3, 1.25],
          [28, -32, 22, 35.4, 1.65], [20, -38, 18, 35.3, 1.3], [55, -38, 15, 35.2, 1.0],
          [92, -32, 17, 35.5, 0.85]
        ]
      },
      // Antarctic Circumpolar Current (ACC - Global Ring)
      {
        name: 'Antarctic Circumpolar Current',
        loop: true,
        type: 'wind',
        points: [
          [-170, -56, 2.0, 34.5, 1.2], [-115, -58, 1.5, 34.5, 1.25], [-62, -57, 1.8, 34.4, 1.35],
          [-10, -54, 1.2, 34.6, 1.2], [45, -53, 1.5, 34.6, 1.2], [105, -55, 1.4, 34.6, 1.2],
          [155, -57, 1.8, 34.5, 1.25]
        ]
      }
    ];

    // Global Thermohaline Conveyor Belt Pathways (Deep Cold NADW/AABW + Warm Surface Return)
    const CONVEYOR_PATHWAYS = [
      // Deep Cold Limb: Sinks in North Atlantic -> Flows South at Abyssal Depth -> Joins ACC -> Enters Indian & Pacific
      {
        name: 'NADW Deep Southward Limb',
        loop: false,
        limb: 'deep',
        points: [
          [-32, 63, 2.0, 34.9, 0.65], [-38, 45, 2.4, 34.9, 0.6], [-34, 20, 2.2, 34.9, 0.55],
          [-26, -10, 2.0, 34.8, 0.55], [-18, -38, 1.6, 34.8, 0.6], [15, -52, 0.8, 34.7, 0.75],
          [68, -46, 1.2, 34.7, 0.7], [66, -15, 2.2, 34.7, 0.55], [68, 10, 4.5, 34.8, 0.5]
        ]
      },
      {
        name: 'Pacific Abyssal Conveyor Limb',
        loop: false,
        limb: 'deep',
        points: [
          [15, -52, 0.8, 34.7, 0.75], [95, -54, 0.9, 34.7, 0.75], [165, -48, 1.1, 34.7, 0.7],
          [-172, -20, 1.5, 34.7, 0.55], [-162, 10, 1.8, 34.7, 0.5], [-155, 34, 2.8, 34.6, 0.45]
        ]
      },
      // Warm Shallow Return Limb: Pacific & Indian Upwelling -> Indonesian Throughflow -> Agulhas Leakage -> Gulf Stream -> NADW
      {
        name: 'Warm Upper Conveyor Return',
        loop: false,
        limb: 'shallow_return',
        points: [
          [-155, 32, 17.0, 34.3, 0.65], [155, 12, 26.5, 34.7, 0.8], [122, -6, 28.0, 34.5, 0.85],
          [82, -14, 26.5, 35.0, 0.9], [36, -24, 24.5, 35.4, 1.1], [16, -35, 19.5, 35.5, 0.95],
          [-18, -12, 24.0, 35.8, 0.9], [-55, 12, 27.0, 36.1, 1.05], [-74, 34, 24.0, 36.2, 1.35],
          [-45, 48, 14.0, 35.4, 1.0], [-32, 63, 4.5, 34.9, 0.75]
        ]
      }
    ];

    class CurrentParticleField {
      constructor(pathways, count, isConveyor) {
        this.pathways = pathways;
        this.count = count;
        this.isConveyor = isConveyor;

        // Precompute smooth CatmullRomCurve3 splines for each pathway
        this.splines = pathways.map(pw => {
          const vecs = pw.points.map(p => {
            const r = this.getRadiusForPoint(pw, p);
            return latLonToVector3(p[1], p[0], r);
          });
          return {
            curve: new THREE.CatmullRomCurve3(vecs, pw.loop, 'catmullrom', 0.5),
            meta: pw
          };
        });

        // Trail ribbons: each particle has a head + 5 trailing vertices for fluid streamline appearance
        this.trailLength = 6;
        const totalVertices = this.count * this.trailLength;
        this.positions = new Float32Array(totalVertices * 3);
        this.colors = new Float32Array(totalVertices * 3);

        this.particles = [];
        for (let i = 0; i < this.count; i++) {
          const splineIdx = i % this.splines.length;
          this.particles.push({
            splineIdx,
            u: Math.random(),
            lateralOffset: (Math.random() - 0.5) * 0.24,
            radialOffset: (Math.random() - 0.5) * 0.025,
            speedJitter: 0.82 + Math.random() * 0.36
          });
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        // Create index buffer for line segments along each particle's trail
        const indices = [];
        for (let i = 0; i < this.count; i++) {
          const base = i * this.trailLength;
          for (let j = 0; j < this.trailLength - 1; j++) {
            indices.push(base + j, base + j + 1);
          }
        }
        geo.setIndex(indices);

        const mat = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.88,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });

        this.mesh = new THREE.LineSegments(geo, mat);
        scene.add(this.mesh);
      }

      getRadiusForPoint(pw, pt) {
        if (!this.isConveyor) return SURFACE_SHELL_RADIUS;
        if (pw.limb === 'deep') return DEEP_SHELL_RADIUS;
        return SURFACE_SHELL_RADIUS + 0.015;
      }

      samplePathwayProperties(meta, u) {
        const pts = meta.points;
        const scaled = u * (pts.length - 1);
        const idx = Math.min(pts.length - 2, Math.max(0, Math.floor(scaled)));
        const frac = scaled - idx;
        const p0 = pts[idx];
        const p1 = pts[idx + 1];

        let temp = p0[2] + (p1[2] - p0[2]) * frac + state.tempAnomaly * (meta.limb === 'deep' ? 0.25 : 0.85);
        let sal = p0[3] + (p1[3] - p0[3]) * frac + (state.polarSalinity - 34.9) * (meta.limb === 'deep' ? 0.5 : 0.35);
        let spd = p0[4] + (p1[4] - p0[4]) * frac;

        // Dynamic physics response to Wind Stress & AMOC Sinking Strength
        const windFactor = state.windStress / 100;
        if (meta.type === 'wind') {
          spd *= (0.35 + 0.65 * windFactor);
        } else if (meta.type === 'wind_amoc') {
          spd *= (0.35 + 0.45 * windFactor + 0.20 * state.sinkingFactor);
        } else if (meta.type === 'amoc' || this.isConveyor) {
          spd *= (0.20 + 0.80 * state.sinkingFactor);
        }

        return { temp, sal, spd };
      }

      computeColor(temp, sal, spd, targetColor) {
        if (state.colorMode === 'thermal') {
          // Cold (-2°C -> Deep Blue/Cyan) to Warm (30°C -> Amber/Coral Red)
          const t = Math.max(0, Math.min(1, (temp + 1.5) / 30.0));
          if (t < 0.35) {
            const k = t / 0.35;
            targetColor.setRGB(0.05 * (1 - k), 0.35 + 0.58 * k, 0.95 + 0.05 * k);
          } else if (t < 0.65) {
            const k = (t - 0.35) / 0.30;
            targetColor.setRGB(0.05 + 0.95 * k, 0.93 - 0.18 * k, 1.0 - 0.85 * k);
          } else {
            const k = (t - 0.65) / 0.35;
            targetColor.setRGB(1.0, 0.75 - 0.48 * k, 0.15 - 0.10 * k);
          }
        } else if (state.colorMode === 'velocity') {
          // Slow (0.2 m/s -> Deep Indigo) to Fast (2.2 m/s -> Electric Turquoise/White)
          const v = Math.max(0, Math.min(1, (spd - 0.2) / 1.9));
          targetColor.setRGB(0.08 + 0.85 * Math.pow(v, 1.6), 0.30 + 0.70 * v, 0.75 + 0.25 * v);
        } else {
          // Salinity: Low/Fresh (32.0 PSU -> Emerald/Mint) to High/Salty (36.5 PSU -> Magenta/Violet/Cyan)
          const s = Math.max(0, Math.min(1, (sal - 32.5) / 3.8));
          targetColor.setRGB(0.15 + 0.80 * s, 0.92 - 0.55 * s, 0.55 + 0.45 * s);
        }
      }

      update(dt) {
        const tmpColor = new THREE.Color();
        const tangent = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const binormal = new THREE.Vector3();
        const pos = new THREE.Vector3();

        for (let i = 0; i < this.count; i++) {
          const p = this.particles[i];
          const splineObj = this.splines[p.splineIdx];
          const props = this.samplePathwayProperties(splineObj.meta, p.u);

          // Advance particle along spline
          const du = dt * 0.042 * props.spd * p.speedJitter;
          p.u += du;
          if (p.u >= 1.0) {
            p.u -= 1.0;
          }

          this.computeColor(props.temp, props.sal, props.spd, tmpColor);

          // Populate trail vertices behind head
          const trailSpan = Math.min(0.055, 0.016 + props.spd * 0.018);
          for (let j = 0; j < this.trailLength; j++) {
            const frac = j / (this.trailLength - 1);
            let sampleU = p.u - frac * trailSpan;
            if (sampleU < 0) {
              sampleU = splineObj.meta.loop ? (sampleU + 1.0) : 0.001;
            }

            splineObj.curve.getPointAt(sampleU, pos);
            splineObj.curve.getTangentAt(sampleU, tangent);

            // Compute lateral offset tangent to sphere surface
            normal.copy(pos).normalize();
            binormal.crossVectors(tangent, normal).normalize();

            // At sinking/upwelling transitions in conveyor mode, smoothly dive/rise radially
            let radialShift = p.radialOffset;
            if (this.isConveyor && splineObj.meta.limb === 'deep' && sampleU < 0.12) {
              // Sinking plunge from surface to abyssal depth
              const dive = 1.0 - (sampleU / 0.12);
              radialShift += dive * (SURFACE_SHELL_RADIUS - DEEP_SHELL_RADIUS);
            } else if (this.isConveyor && splineObj.meta.limb === 'deep' && sampleU > 0.88) {
              // Upwelling rise in Indian/Pacific
              const rise = (sampleU - 0.88) / 0.12;
              radialShift += rise * (SURFACE_SHELL_RADIUS - DEEP_SHELL_RADIUS);
            }

            pos.addScaledVector(binormal, p.lateralOffset);
            pos.addScaledVector(normal, radialShift);

            const vIdx = (i * this.trailLength + j) * 3;
            this.positions[vIdx] = pos.x;
            this.positions[vIdx + 1] = pos.y;
            this.positions[vIdx + 2] = pos.z;

            // Fade tail opacity via vertex brightness
            const fade = Math.pow(1.0 - frac, 1.35);
            this.colors[vIdx] = tmpColor.r * fade;
            this.colors[vIdx + 1] = tmpColor.g * fade;
            this.colors[vIdx + 2] = tmpColor.b * fade;
          }
        }

        this.mesh.geometry.attributes.position.needsUpdate = true;
        this.mesh.geometry.attributes.color.needsUpdate = true;
      }
    }

    function initParticleSystems() {
      surfaceParticleSystem = new CurrentParticleField(SURFACE_PATHWAYS, 1350, false);
      deepParticleSystem = new CurrentParticleField(CONVEYOR_PATHWAYS, 850, true);
      updateLayerVisibility();
    }

    // ---------------------------------------------------------------------------
    // 7. PHYSICAL OCEANOGRAPHY CALCULATIONS & TELEMETRY UPDATES
    // ---------------------------------------------------------------------------
    // Simplified UNESCO Seawater Equation of State approximation ρ(T, S, z)
    function calculateSeawaterDensity(tempC, salPSU, depthM) {
      const rho0 = 1000.0;
      // Thermal expansion + haline contraction + pressure compressibility
      const thermalTerm = -0.0068 * Math.pow(tempC - 4.0, 2) - 0.055 * tempC;
      const halineTerm = 0.77 * (salPSU - 35.0);
      const pressureTerm = 0.0046 * depthM;
      return rho0 + 28.1 + thermalTerm + halineTerm + pressureTerm;
    }

    function recalculatePhysics() {
      // Polar surface winter cooling temperature (~ -1.2°C baseline + 1.3x polar amplification of anomaly)
      const polarTemp = -1.2 + state.tempAnomaly * 1.3;
      state.polarDensity = calculateSeawaterDensity(polarTemp, state.polarSalinity, 0);

      // Critical sinking threshold is ~1027.8 kg/m³
      const densityExcess = state.polarDensity - 1026.2;
      state.sinkingFactor = Math.max(0.12, Math.min(1.55, densityExcess / 1.6));

      // AMOC strength in Sverdrups (17.2 Sv baseline)
      state.amocStrength = +(17.2 * state.sinkingFactor * (0.85 + 0.15 * (state.windStress / 100))).toFixed(1);

      // Polar sea ice extent responds to temperature anomaly
      const newIce = Math.max(0.15, Math.min(1.65, 1.0 - state.tempAnomaly * 0.22));
      if (Math.abs(newIce - state.iceExtent) > 0.04) {
        state.iceExtent = newIce;
        updateEarthSurfaceTexture(state.iceExtent);
      }

      // Update Left Control Readouts
      document.getElementById('val-temp').textContent = `${state.tempAnomaly >= 0 ? '+' : ''}${state.tempAnomaly.toFixed(1)} °C`;
      document.getElementById('val-salinity').textContent = `${state.polarSalinity.toFixed(1)} PSU`;
      document.getElementById('val-wind').textContent = `${state.windStress}%`;
      document.getElementById('val-depth').textContent = `${state.inspectDepth} m`;
      document.getElementById('val-density').textContent = `${state.polarDensity.toFixed(1)} kg/m³`;

      const sinkPct = Math.round(state.sinkingFactor * 100);
      const sinkEl = document.getElementById('val-sinking-pct');
      if (sinkPct < 45) {
        sinkEl.textContent = `${sinkPct}% (Weakened)`;
        sinkEl.className = 'text-xs font-mono-tech font-bold text-rose-400';
      } else if (sinkPct > 115) {
        sinkEl.textContent = `${sinkPct}% (Intensified)`;
        sinkEl.className = 'text-xs font-mono-tech font-bold text-cyan-300';
      } else {
        sinkEl.textContent = `${sinkPct}% (Active)`;
        sinkEl.className = 'text-xs font-mono-tech font-bold text-[#0de8b5]';
      }

      updateStationTelemetry();
      drawWaterColumnProfile();
    }

    function updateStationTelemetry() {
      const st = CURRENT_STATIONS.find(s => s.id === state.selectedStationId) || CURRENT_STATIONS[0];
      const depth = state.inspectDepth;

      // Depth decay curve for temperature and velocity
      const thermoclineFactor = Math.exp(-depth / 480);
      const deepTemp = 1.6 + state.tempAnomaly * 0.15;
      const surfaceTemp = st.baseTemp + state.tempAnomaly * (Math.abs(st.lat) > 50 ? 1.25 : 0.85);
      const localTemp = deepTemp + (surfaceTemp - deepTemp) * thermoclineFactor;

      const localSal = st.baseSal + (state.polarSalinity - 34.9) * (Math.abs(st.lat) > 50 ? 0.85 : 0.25) * (0.4 + 0.6 * thermoclineFactor);

      const windMult = 0.4 + 0.6 * (state.windStress / 100);
      const amocMult = 0.4 + 0.6 * state.sinkingFactor;
      const forcing = (1 - st.windSensitivity - st.amocSensitivity) + st.windSensitivity * windMult + st.amocSensitivity * amocMult;
      const depthVelDecay = st.depthLayer === 'deep'
        ? (0.35 + 0.65 * Math.min(1, depth / 1500))
        : (0.18 + 0.82 * Math.exp(-depth / 650));
      const localVel = st.baseVel * forcing * depthVelDecay;

      const localDensity = calculateSeawaterDensity(localTemp, localSal, depth);

      document.getElementById('station-type-badge').textContent = st.category;
      document.getElementById('station-name').textContent = st.name;
      const latDir = st.lat >= 0 ? 'N' : 'S';
      const lonDir = st.lon >= 0 ? 'E' : 'W';
      document.getElementById('station-coords').textContent = `${Math.abs(st.lat).toFixed(1)}° ${latDir}, ${Math.abs(st.lon).toFixed(1)}° ${lonDir} • ${st.basin}`;

      document.getElementById('telemetry-amoc').textContent = `${state.amocStrength.toFixed(1)} Sv`;
      document.getElementById('telemetry-vel').textContent = `${localVel.toFixed(2)} m/s`;
      document.getElementById('telemetry-temp').textContent = `${localTemp.toFixed(1)} °C`;
      document.getElementById('telemetry-sal').textContent = `${localSal.toFixed(1)} PSU`;
      document.getElementById('telemetry-den').textContent = `${localDensity.toFixed(1)} kg/m³`;

      document.getElementById('briefing-text').textContent = st.briefing;
      document.getElementById('epistemic-note').textContent = st.epistemic;
      document.getElementById('profile-depth-indicator').textContent = `Sensor: ${depth} m`;
    }

    // ---------------------------------------------------------------------------
    // 8. MINIATURE CANVAS THERMOCLINE & PYCNOCLINE PROFILE CHART
    // ---------------------------------------------------------------------------
    function drawWaterColumnProfile() {
      const canvas = document.getElementById('profile-canvas');
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      // Subtle depth grid lines (0m, 1000m, 2000m, 3000m, 4000m)
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        const y = (h / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const st = CURRENT_STATIONS.find(s => s.id === state.selectedStationId) || CURRENT_STATIONS[0];
      const surfaceTemp = st.baseTemp + state.tempAnomaly * (Math.abs(st.lat) > 50 ? 1.25 : 0.85);
      const deepTemp = 1.6 + state.tempAnomaly * 0.15;

      // Plot Temperature Curve (Amber/Coral)
      ctx.beginPath();
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 2.2;
      for (let py = 0; py <= h; py += 3) {
        const z = (py / h) * 4000;
        const t = deepTemp + (surfaceTemp - deepTemp) * Math.exp(-z / 480);
        const nx = Math.max(0.06, Math.min(0.94, (t + 2) / 34));
        const px = nx * w;
        if (py === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Plot Density Curve (Cyan)
      ctx.beginPath();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2.2;
      for (let py = 0; py <= h; py += 3) {
        const z = (py / h) * 4000;
        const t = deepTemp + (surfaceTemp - deepTemp) * Math.exp(-z / 480);
        const rho = calculateSeawaterDensity(t, st.baseSal, z);
        const nx = Math.max(0.06, Math.min(0.94, (rho - 1022) / 26));
        const px = nx * w;
        if (py === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Active Sensor Inspection Depth Horizontal Line
      const sensorY = (state.inspectDepth / 4000) * h;
      ctx.strokeStyle = 'rgba(13, 232, 181, 0.85)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, sensorY);
      ctx.lineTo(w, sensorY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---------------------------------------------------------------------------
    // 9. UI & INTERACTIVE CONTROLS HANDLERS
    // ---------------------------------------------------------------------------
    function buildStationUI() {
      const chipsContainer = document.getElementById('station-chips');
      const markersLayer = document.getElementById('markers-layer');
      chipsContainer.innerHTML = '';
      markersLayer.innerHTML = '';

      CURRENT_STATIONS.forEach(st => {
        // 1. Right Panel Quick Chip
        const chip = document.createElement('button');
        chip.className = `station-chip px-2 py-1 rounded-lg text-[10px] font-mono-tech border transition ${
          st.id === state.selectedStationId
            ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/50 font-semibold'
            : 'bg-white/5 text-slate-300 border-white/10 hover:border-cyan-400/30'
        }`;
        chip.dataset.id = st.id;
        chip.textContent = st.shortName;
        chip.onclick = () => selectStation(st.id, true);
        chipsContainer.appendChild(chip);

        // 2. 3D Projected Globe Marker
        const marker = document.createElement('div');
        marker.className = `globe-marker flex items-center gap-1.5 ${st.id === state.selectedStationId ? 'active' : ''}`;
        const pinColor = st.category.includes('WARM') ? '#ffaa00' : '#00f0ff';
        marker.innerHTML = `
          <div class="marker-pin" style="background:${pinColor}; color:${pinColor};"></div>
          <div class="marker-tag font-mono-tech text-slate-100">${st.shortName}</div>
        `;
        marker.onclick = (e) => {
          e.stopPropagation();
          selectStation(st.id, true);
        };
        markersLayer.appendChild(marker);

        markerElements[st.id] = {
          el: marker,
          pos3D: latLonToVector3(st.lat, st.lon, SURFACE_SHELL_RADIUS + 0.04)
        };
      });
    }

    function selectStation(stationId, focusCamera = false) {
      state.selectedStationId = stationId;
      const st = CURRENT_STATIONS.find(s => s.id === stationId);

      // Update chip & marker active styling
      document.querySelectorAll('.station-chip').forEach(btn => {
        const isAct = btn.dataset.id === stationId;
        btn.className = `station-chip px-2 py-1 rounded-lg text-[10px] font-mono-tech border transition ${
          isAct
            ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/50 font-semibold'
            : 'bg-white/5 text-slate-300 border-white/10 hover:border-cyan-400/30'
        }`;
      });

      Object.keys(markerElements).forEach(id => {
        markerElements[id].el.classList.toggle('active', id === stationId);
      });

      if (focusCamera && st) {
        flyCameraToLatLon(st.lat, st.lon, 13.5);
      }

      recalculatePhysics();
    }

    function updateLayerVisibility() {
      if (!surfaceParticleSystem || !deepParticleSystem) return;
      const hintEl = document.getElementById('layer-hint');

      if (state.layerMode === 'surface') {
        surfaceParticleSystem.mesh.visible = true;
        deepParticleSystem.mesh.visible = false;
        earthMesh.material.opacity = 1.0;
        oceanShellMesh.material.opacity = 0.16;
        hintEl.textContent = 'Wind-driven upper ocean gyres (0–400m) transporting equatorial heat poleward.';
      } else if (state.layerMode === 'deep') {
        surfaceParticleSystem.mesh.visible = false;
        deepParticleSystem.mesh.visible = true;
        // Make globe slightly translucent so abyssal circulation pathways are clearly visible
        earthMesh.material.opacity = 0.72;
        oceanShellMesh.material.opacity = 0.10;
        hintEl.textContent = 'Density-driven abyssal NADW & AABW pathways (2,000–4,000m) sinking at polar convection zones.';
      } else {
        surfaceParticleSystem.mesh.visible = true;
        deepParticleSystem.mesh.visible = true;
        earthMesh.material.opacity = 0.82;
        oceanShellMesh.material.opacity = 0.14;
        hintEl.textContent = 'Dual Conveyor Belt: Warm shallow return flow paired with cold deep abyssal overturning.';
      }
    }

    function setLayerMode(mode) {
      state.layerMode = mode;
      document.querySelectorAll('.layer-btn').forEach(btn => {
        const isAct = btn.dataset.layer === mode;
        btn.className = isAct
          ? 'layer-btn active py-1.5 px-2 rounded-lg text-[11px] font-semibold bg-cyan-500/25 text-cyan-200 border border-cyan-400/40 transition'
          : 'layer-btn py-1.5 px-2 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 transition';
      });
      updateLayerVisibility();
    }

    function setColorMode(mode) {
      state.colorMode = mode;
      document.querySelectorAll('.color-btn').forEach(btn => {
        const isAct = btn.dataset.color === mode;
        btn.className = isAct
          ? 'color-btn active py-1.5 px-2 rounded-lg text-[11px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/40 transition'
          : 'color-btn py-1.5 px-2 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 transition';
      });

      const bar = document.getElementById('color-legend-bar');
      const labels = document.getElementById('color-legend-labels');
      if (mode === 'thermal') {
        bar.style.background = 'linear-gradient(90deg, #1d4ed8, #00f0ff, #0de8b5, #ffaa00, #ff4422)';
        labels.innerHTML = '<span>-1°C Polar</span><span>14°C Temp</span><span>30°C Tropics</span>';
      } else if (mode === 'velocity') {
        bar.style.background = 'linear-gradient(90deg, #1e3a8a, #0284c7, #0de8b5, #e0f2fe)';
        labels.innerHTML = '<span>0.2 m/s Slow</span><span>1.1 m/s</span><span>2.0+ m/s Swift</span>';
      } else {
        bar.style.background = 'linear-gradient(90deg, #10b981, #06b6d4, #8b5cf6, #ec4899)';
        labels.innerHTML = '<span>32.5 PSU Fresh</span><span>34.8 PSU</span><span>36.4 PSU Salty</span>';
      }
    }

    function onParamChange() {
      state.tempAnomaly = parseFloat(document.getElementById('slider-temp').value);
      state.polarSalinity = parseFloat(document.getElementById('slider-salinity').value);
      state.windStress = parseInt(document.getElementById('slider-wind').value, 10);
      state.inspectDepth = parseInt(document.getElementById('slider-depth').value, 10);

      // Mark badge as interactive custom simulation if modified away from baseline
      const isBaseline = Math.abs(state.tempAnomaly) < 0.05 && Math.abs(state.polarSalinity - 34.9) < 0.05 && state.windStress === 100;
      setEpistemicBadge(isBaseline ? 'OBSERVATIONAL BASELINE' : 'SIMULATION MODEL (CUSTOM)', isBaseline);

      recalculatePhysics();
    }

    function setEpistemicBadge(text, isObs) {
      const textEl = document.getElementById('epistemic-text');
      const dotEl = document.getElementById('epistemic-dot');
      textEl.textContent = text;
      if (isObs) {
        textEl.className = 'text-[10px] sm:text-xs font-mono-tech font-semibold tracking-wide text-[#0de8b5]';
        dotEl.className = 'w-2 h-2 rounded-full bg-[#0de8b5]';
      } else {
        textEl.className = 'text-[10px] sm:text-xs font-mono-tech font-semibold tracking-wide text-amber-300';
        dotEl.className = 'w-2 h-2 rounded-full bg-amber-400';
      }
    }

    function applyExperiment(expKey) {
      const exp = EXPERIMENTS[expKey];
      if (!exp) return;

      state.activeExperiment = expKey;
      state.tempAnomaly = exp.tempAnomaly;
      state.polarSalinity = exp.polarSalinity;
      state.windStress = exp.windStress;

      document.getElementById('slider-temp').value = exp.tempAnomaly;
      document.getElementById('slider-salinity').value = exp.polarSalinity;
      document.getElementById('slider-wind').value = exp.windStress;

      setLayerMode(exp.layerMode);
      setCameraPreset(exp.camera);
      setEpistemicBadge(exp.label, exp.isObs);

      document.querySelectorAll('.exp-btn').forEach(btn => {
        const isAct = btn.dataset.exp === expKey;
        btn.className = isAct
          ? 'exp-btn active w-full text-left px-3 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/45 transition flex items-center justify-between'
          : 'exp-btn w-full text-left px-3 py-2 rounded-xl bg-[#040b14]/60 hover:bg-white/5 border border-white/10 transition flex items-center justify-between';
      });

      recalculatePhysics();
      document.getElementById('epistemic-note').textContent = exp.note;
    }

    // ---------------------------------------------------------------------------
    // 10. SMOOTH CAMERA FLIGHT & PRESETS
    // ---------------------------------------------------------------------------
    let cameraTargetPos = null;

    function flyCameraToLatLon(lat, lon, dist = 14.5) {
      cameraTargetPos = latLonToVector3(lat, lon, dist);
    }

    function setCameraPreset(presetKey) {
      document.querySelectorAll('.cam-btn').forEach(btn => {
        const isAct = btn.dataset.cam === presetKey;
        btn.className = isAct
          ? 'cam-btn active px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/25 text-cyan-200 border border-cyan-400/40 transition'
          : 'cam-btn px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/5 border border-transparent transition';
      });

      if (presetKey === 'global') flyCameraToLatLon(18, -28, 15.2);
      else if (presetKey === 'natlantic') flyCameraToLatLon(45, -42, 12.6);
      else if (presetKey === 'npacific') flyCameraToLatLon(32, 155, 13.2);
      else if (presetKey === 'southern') flyCameraToLatLon(-56, 15, 13.5);
    }

    // ---------------------------------------------------------------------------
    // 11. PLAYBACK, OVERLAYS & RESPONSIVE DRAWERS
    // ---------------------------------------------------------------------------
    function togglePlayPause() {
      state.playing = !state.playing;
      document.getElementById('play-icon').textContent = state.playing ? '❚❚' : '▶';
      document.getElementById('play-label').textContent = state.playing ? 'Pause' : 'Play';
    }

    function setSimSpeed(spd) {
      state.simSpeed = spd;
      document.querySelectorAll('.speed-btn').forEach(btn => {
        const isAct = parseFloat(btn.dataset.speed) === spd;
        btn.className = isAct
          ? 'speed-btn active px-2 py-1 rounded-lg text-[11px] font-mono-tech bg-cyan-500/25 text-cyan-200 font-bold'
          : 'speed-btn px-2 py-1 rounded-lg text-[11px] font-mono-tech text-slate-400 hover:text-white';
      });
    }

    function toggleMarkers() {
      state.showMarkers = !state.showMarkers;
      document.getElementById('btn-toggle-markers').textContent = `Markers: ${state.showMarkers ? 'ON' : 'OFF'}`;
      document.getElementById('markers-layer').style.display = state.showMarkers ? 'block' : 'none';
    }

    function toggleLatLonGrid() {
      state.showGrid = !state.showGrid;
      document.getElementById('btn-toggle-grid').textContent = `Grid: ${state.showGrid ? 'ON' : 'OFF'}`;
      if (graticuleGroup) graticuleGroup.visible = state.showGrid;
    }

    function toggleAutoRotate() {
      state.autoRotate = !state.autoRotate;
      controls.autoRotate = state.autoRotate;
      controls.autoRotateSpeed = 0.7;
      document.getElementById('btn-toggle-rotate').textContent = `Auto-Orbit: ${state.autoRotate ? 'ON' : 'OFF'}`;
    }

    function resetSimulation() {
      state.inspectDepth = 50;
      document.getElementById('slider-depth').value = 50;
      setSimSpeed(1);
      if (!state.playing) togglePlayPause();
      applyExperiment('baseline');
      selectStation('gulf_stream', false);
    }

    function toggleDrawer(side) {
      const leftPanel = document.getElementById('left-panel');
      const rightPanel = document.getElementById('right-panel');
      if (side === 'left') {
        leftPanel.classList.toggle('-translate-x-[115%]');
        rightPanel.classList.add('translate-x-[115%]');
      } else {
        rightPanel.classList.toggle('translate-x-[115%]');
        leftPanel.classList.add('-translate-x-[115%]');
      }
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      drawWaterColumnProfile();
    }

    // ---------------------------------------------------------------------------
    // 12. MAIN RENDER & ANIMATION LOOP
    // ---------------------------------------------------------------------------
    let lastTime = performance.now();
    const projVec = new THREE.Vector3();
    const camToPoint = new THREE.Vector3();

    function updateProjectedMarkers() {
      if (!state.showMarkers) return;
      const w = window.innerWidth;
      const h = window.innerHeight;

      for (const id of Object.keys(markerElements)) {
        const item = markerElements[id];
        projVec.copy(item.pos3D);

        // Horizon occlusion test: dot product of surface normal and vector to camera
        camToPoint.subVectors(camera.position, projVec).normalize();
        const normal = projVec.clone().normalize();
        const facing = normal.dot(camToPoint);

        if (facing < 0.14) {
          item.el.style.opacity = '0';
          item.el.style.pointerEvents = 'none';
        } else {
          projVec.project(camera);
          const x = (projVec.x * 0.5 + 0.5) * w;
          const y = (-projVec.y * 0.5 + 0.5) * h;
          item.el.style.left = `${x}px`;
          item.el.style.top = `${y}px`;
          item.el.style.opacity = Math.min(1, (facing - 0.14) * 4).toFixed(2);
          item.el.style.pointerEvents = 'auto';
        }
      }
    }

    function animate(now) {
      requestAnimationFrame(animate);

      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Smooth camera preset transitions
      if (cameraTargetPos) {
        camera.position.lerp(cameraTargetPos, 0.065);
        if (camera.position.distanceTo(cameraTargetPos) < 0.08) {
          cameraTargetPos = null;
        }
      }

      controls.update();

      // Advance simulation physics & particles
      if (state.playing) {
        const simDt = rawDt * state.simSpeed;
        if (surfaceParticleSystem && surfaceParticleSystem.mesh.visible) {
          surfaceParticleSystem.update(simDt);
        }
        if (deepParticleSystem && deepParticleSystem.mesh.visible) {
          deepParticleSystem.update(simDt);
        }

        // Animate pulsing downwelling / upwelling rings
        if (sinkingMarkersGroup) {
          const t = now * 0.0025;
          sinkingMarkersGroup.children.forEach(ring => {
            const wave = (Math.sin(t + ring.userData.phase) + 1) * 0.5;
            const scale = ring.userData.type === 'sink'
              ? (1.3 - wave * 0.55) * (0.6 + 0.4 * state.sinkingFactor)
              : (0.75 + wave * 0.55);
            ring.scale.set(scale, scale, 1);
            ring.material.opacity = (0.25 + 0.5 * wave) * (ring.userData.type === 'sink' ? Math.min(1, state.sinkingFactor) : 0.8);
          });
        }
      }

      updateProjectedMarkers();
      renderer.render(scene, camera);
    }

    // Cancel camera glide if user grabs the globe manually
    window.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'CANVAS') {
        cameraTargetPos = null;
      }
    });

    // Boot Application
    window.onload = function () {
      initThreeScene();
      recalculatePhysics();
      setCameraPreset('global');
      requestAnimationFrame(animate);
    };
document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL DE LA APLICACIÓN ---
    const appState = {
        currentStep: 1,
        totalSteps: 5, // Incrementado a 5 por la nueva sección de jugador
        horarioLibre: {
            0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
        },
        nacionalidad: "",      // País favorito de la pregunta 2
        jugadorFavorito: "",   // Nombre del jugador elegido
        paisJugadorFavorito: "", // País del jugador elegido para aplicar el boost simétrico
        
        w_calidad_elo: 0,
        w_calidad_fifa: 0,
        w_paridad_elo: 0,
        w_paridad_fifa: 0,
        
        clientTimezoneOffsetMs: new Date().getTimezoneOffset() * 60 * 1000,

        partidosData: [],
        partidosRecomendados: [],
        jugadoresData: [], // Almacén dinámico para el listado del nuevo CSV
        
        currentSortField: 'recommendation_order',
        currentSortOrder: 'asc'
    };

    let isDragging = false;
    let dragSelectMode = true;

    const PESO_FIN_DE_SEMANA = 10.0;

    const listadoPaisesEspanol = [
        "Corea del Sur", "México", "Chequia", "Sudáfrica", "Canadá", "Suiza",
        "Catar", "Bosnia-Herzegovina", "Brasil", "Escocia", "Haití", "Marruecos",
        "Australia", "Estados Unidos", "Turquía", "Paraguay", "Ecuador", "Alemania",
        "Costa de Marfil", "Curazao", "Países Bajos", "Japón", "Suecia", "Túnez",
        "Irán", "Bélgica", "Egipto", "Nueva Zelanda", "España", "Uruguay",
        "Arabia Saudita", "Cabo Verde", "Francia", "Senegal", "Irak", "Noruega",
        "Austria", "Argentina", "Argelia", "Jordania", "Portugal", "Colombia",
        "Uzbekistán", "Congo RD", "Panamá", "Inglaterra", "Ghana", "Croacia"
    ];

    const diccionarioPaises = {
        "Corea del Sur": "Korea Republic", "México": "Mexico", "Chequia": "Czechia",
        "Sudáfrica": "South Africa", "Canadá": "Canada", "Suiza": "Switzerland",
        "Catar": "Qatar", "Bosnia-Herzegovina": "Bosnia-Herzegovina", "Brasil": "Brazil",
        "Escocia": "Scotland", "Haití": "Haiti", "Marruecos": "Morocco", "Australia": "Australia",
        "Estados Unidos": "USA", "Turquía": "Turkey", "Paraguay": "Paraguay", "Ecuador": "Ecuador",
        "Alemania": "Germany", "Costa de Marfil": "Côte d'Ivoire", "Curazao": "Curaçao",
        "Países Bajos": "Netherlands", "Japón": "Japan", "Suecia": "Sweden", "Túnez": "Tunisia",
        "Irán": "IR Iran", "Bélgica": "Belgium", "Egipto": "Egypt", "Nueva Zelanda": "New Zealand",
        "España": "Spain", "Uruguay": "Uruguay", "Arabia Saudita": "Saudi Arabia",
        "Cabo Verde": "Cabo Verde", "Francia": "France", "Senegal": "Senegal", "Irak": "Iraq",
        "Noruega": "Norway", "Austria": "Austria", "Argentina": "Argentina", "Argelia": "Algeria",
        "Jordania": "Jordan", "Portugal": "Portugal", "Colombia": "Colombia", "Uzbekistán": "Uzbekistan",
        "Congo RD": "Congo DR", "Panamá": "Panama", "Inglaterra": "England", "Ghana": "Ghana", "Croacia": "Croacia"
    };

    const diasSemanaLargos = {
        0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado'
    };

    const mesesLargos = { 5: 'Junio', 6: 'Julio' };

    const btnStart = document.getElementById('btn-start');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const gridContainer = document.getElementById('availability-grid');
    const selectNacionalidad = document.getElementById('select-nacionalidad');
    const tableBody = document.getElementById('table-results-body');

    initApp();

    function initApp() {
        buildAvailabilityGrid();
        populateCountriesDropdown();
        loadPartidosCSV(); 
        loadJugadoresCSV(); 

        btnStart.addEventListener('click', () => {
            appState.currentStep = 1;
            updateProgressBar();
            
            const bgWrapper = document.querySelector('.landing-bg-wrapper');
            if (bgWrapper) bgWrapper.classList.remove('hidden');
            
            actualizarOscuridadFondo();
            progressContainer.classList.remove('hidden');
            transitionToPhase('phase-onboarding');
        });

        const btnSelectAll = document.getElementById('btn-select-all-hours');
        if (btnSelectAll) {
            btnSelectAll.addEventListener('click', () => {
                const todasLasCeldas = document.querySelectorAll('.grid-cell');
                const celdasSeleccionadas = document.querySelectorAll('.grid-cell.selected');
                const marcarTodas = celdasSeleccionadas.length < todasLasCeldas.length;

                todasLasCeldas.forEach(cell => {
                    if (marcarTodas) cell.classList.add('selected');
                    else cell.classList.remove('selected');
                });
                btnSelectAll.textContent = marcarTodas ? "🧹 Desmarcar todo" : "✨ Marcar todo como libre";
            });
        }

        setupPlayerSearchbox();

        document.querySelectorAll('.next-step-trigger').forEach(btn => {
            btn.addEventListener('click', () => { handleNavigationNext(); });
        });

        document.querySelectorAll('.prev-step-trigger').forEach(btn => {
            btn.addEventListener('click', () => { handleNavigationBack(); });
        });

        document.querySelectorAll('.type-to-landing').forEach(btn => {
            btn.addEventListener('click', () => {
                progressContainer.classList.add('hidden');
                transitionToPhase('phase-landing');
            });
        });

        document.querySelectorAll('#recommendations-table th').forEach(th => {
            th.addEventListener('click', () => {
                const sortField = th.dataset.sort;
                if (!sortField) return;
                
                if (appState.currentSortField === sortField) {
                    appState.currentSortOrder = appState.currentSortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    appState.currentSortField = sortField;
                    appState.currentSortOrder = (sortField === 'Score_Recomendacion' || sortField === 'feature_disponibilidad' || sortField === 'recommendation_order') ? 'desc' : 'asc';
                }
                
                document.querySelectorAll('#recommendations-table th').forEach(h => h.classList.remove('active-sort', 'asc', 'desc'));
                th.classList.add('active-sort', appState.currentSortOrder);
                sortAndRenderTable();
            });
        });
    }

    function populateCountriesDropdown() {
        if (!selectNacionalidad) return;
        selectNacionalidad.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = ""; defaultOption.textContent = "🌍 Ninguno / Soy neutral";
        selectNacionalidad.appendChild(defaultOption);

        const copiaOrdenada = [...listadoPaisesEspanol].sort((a, b) => a.localeCompare(b));
        copiaOrdenada.forEach(paisEsp => {
            const o = document.createElement('option');
            o.value = paisEsp; o.textContent = paisEsp;
            selectNacionalidad.appendChild(o);
        });
    }

    async function loadPartidosCSV() {
        try {
            const response = await fetch('./data/matriz_partidos_scaled_pca.csv');
            if (!response.ok) throw new Error();
            const csvText = await response.text();
            appState.partidosData = parseGenericCSV(csvText);
        } catch (e) { console.warn("Mitigación CORS activa partidos."); }
    }

    async function loadJugadoresCSV() {
        try {
            const response = await fetch('./data/jugadores_todos_los_paises.csv');
            if (!response.ok) throw new Error("Error al consultar el archivo de jugadores.");
            const csvText = await response.text();
            
            const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 2) return;

            const separador = lines[0].includes(';') ? ';' : ',';
            const headers = lines[0].split(separador).map(h => h.replace(/^["']|["']$/g, '').trim());
            
            const idxPlayer = headers.indexOf('Player');
            const idxCountry = headers.indexOf('Country');

            if (idxPlayer === -1 || idxCountry === -1) {
                console.error("No se encontraron las columnas 'Player' o 'Country' en el CSV.");
                return;
            }

            const listadoCargado = [];
            for (let i = 1; i < lines.length; i++) {
                const columns = lines[i].split(separador);
                if (columns.length < headers.length) continue;

                const nameValue = columns[idxPlayer].replace(/^["']|["']$/g, '').trim();
                const countryValue = columns[idxCountry].replace(/^["']|["']$/g, '').trim();

                if (nameValue) {
                    listadoCargado.push({
                        Player: nameValue,
                        Country: countryValue
                    });
                }
            }

            appState.jugadoresData = listadoCargado;
            console.log(`✅ Buscador listo: ${appState.jugadoresData.length} jugadores cargados.`);
        } catch (error) {
            console.error("Fallo crítico al procesar jugadores:", error);
        }
    }

    function setupPlayerSearchbox() {
        const inputSearch = document.getElementById('input-search-player');
        const dropdown = document.getElementById('player-results-dropdown');
        const btnClear = document.getElementById('btn-clear-player');
        const badge = document.getElementById('saved-player-badge');
        const txtPlayer = document.getElementById('txt-saved-player');
        const txtCountry = document.getElementById('txt-saved-player-country');

        if (!inputSearch) return;

        inputSearch.addEventListener('input', () => {
            const query = inputSearch.value.trim().toLowerCase();
            
            if (query.length < 2) {
                dropdown.classList.add('hidden');
                btnClear.classList.add('hidden');
                return;
            }

            btnClear.classList.remove('hidden');

            const matches = appState.jugadoresData.filter(j => j.Player && j.Player.toLowerCase().includes(query)).slice(0, 10);

            if (matches.length === 0) {
                dropdown.innerHTML = '<div style="padding:12px; color:#aeaeb2; text-align:center; font-size:0.9rem;">No se encontraron jugadores</div>';
                dropdown.classList.remove('hidden');
                return;
            }

            dropdown.innerHTML = '';
            matches.forEach(jugador => {
                const row = document.createElement('div');
                row.classList.add('player-suggest-row');
                
                row.innerHTML = `
                    <span class="player-suggest-name">${jugador.Player}</span>
                    <span class="player-suggest-meta">${jugador.Country}</span>
                `;

                row.addEventListener('click', () => {
                    appState.jugadorFavorito = jugador.Player;
                    appState.paisJugadorFavorito = jugador.Country; // Ya viene en inglés directo

                    inputSearch.value = jugador.Player;
                    
                    dropdown.innerHTML = '';
                    dropdown.classList.add('hidden');
                    inputSearch.blur();

                    txtPlayer.textContent = jugador.Player;
                    txtCountry.textContent = jugador.Country;
                    badge.classList.remove('hidden');
                });

                dropdown.appendChild(row);
            });

            dropdown.classList.remove('hidden');
        });

        btnClear.addEventListener('click', () => {
            inputSearch.value = '';
            appState.jugadorFavorito = "";
            appState.paisJugadorFavorito = "";
            dropdown.classList.add('hidden');
            btnClear.classList.add('hidden');
            badge.classList.add('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!inputSearch.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }

    function handleNavigationNext() {
        if (appState.currentStep === 1) {
            saveGridData();
            document.getElementById('step-1').classList.remove('active');
            appState.currentStep = 2; document.getElementById('step-2').classList.add('active');
            updateProgressBar();
        } else if (appState.currentStep === 2) {
            if (selectNacionalidad) {
                const seleccionEsp = selectNacionalidad.value;
                appState.nacionalidad = diccionarioPaises[seleccionEsp] || "";
            }
            document.getElementById('step-2').classList.remove('active');
            appState.currentStep = 3; document.getElementById('step-3').classList.add('active');
            updateProgressBar();
        } else if (appState.currentStep === 3) {
            document.getElementById('step-3').classList.remove('active');
            appState.currentStep = 4; document.getElementById('step-4').classList.add('active');
            updateProgressBar();
        } else if (appState.currentStep === 4) {
            const val = parseInt(document.getElementById('slider-calidad').value, 10);
            appState.w_calidad_elo = val / 2; appState.w_calidad_fifa = val / 2;
            document.getElementById('step-4').classList.remove('active');
            appState.currentStep = 5; document.getElementById('step-5').classList.add('active');
            updateProgressBar();
        } else if (appState.currentStep === 5) {
            const val = parseInt(document.getElementById('slider-paridad').value, 10);
            appState.w_paridad_elo = val / 2; appState.w_paridad_fifa = val / 2;
            
            runLoadingAndRecommendationFlow();
            return;
        }
        actualizarOscuridadFondo();
    }

    function handleNavigationBack() {
        if (appState.currentStep === 2) {
            document.getElementById('step-2').classList.remove('active');
            appState.currentStep = 1; document.getElementById('step-1').classList.add('active');
            updateProgressBar();
        } else if (appState.currentStep === 3) {
            document.getElementById('step-3').classList.remove('active');
            appState.currentStep = 2; document.getElementById('step-2').classList.add('active');
            updateProgressBar();
        } else if (appState.currentStep === 4) {
            document.getElementById('step-4').classList.remove('active');
            appState.currentStep = 3; document.getElementById('step-3').classList.add('active');
            updateProgressBar();
        } else if (appState.currentStep === 5) {
            document.getElementById('step-5').classList.remove('active');
            appState.currentStep = 4; document.getElementById('step-4').classList.add('active');
            updateProgressBar();
        }
        actualizarOscuridadFondo();
    }

    function updateProgressBar() {
        const percentage = (appState.currentStep / (appState.totalSteps + 1)) * 100;
        progressBar.style.width = `${percentage}%`;
    }

    function runLoadingAndRecommendationFlow() {
        const bgWrapper = document.querySelector('.landing-bg-wrapper');
        if (bgWrapper) {
            bgWrapper.classList.remove('dimmed-step-1', 'dimmed-step-2', 'dimmed-step-3', 'dimmed-step-4');
            bgWrapper.classList.add('dimmed-step-5');
        }

        transitionToPhase('phase-loading');
        
        setTimeout(() => {
            calcularRecomendacionesMotor();
            renderSummaryHeader();
            sortAndRenderTable();
            
            if (bgWrapper) {
                bgWrapper.classList.add('hidden');
            }
            
            progressContainer.classList.add('hidden');
            transitionToPhase('phase-results');
        }, 1800); 
    }

    function calcularRecomendacionesMotor() {
        const partidos = appState.partidosData;
        const favPais = appState.nacionalidad;
        const favPaisJugador = appState.paisJugadorFavorito; 

        const pesosCrudos = {
            w_calidad_elo: appState.w_calidad_elo,
            w_paridad_elo: appState.w_paridad_elo,
            w_calidad_fifa: appState.w_calidad_fifa,
            w_paridad_fifa: appState.w_paridad_fifa,
            w_fin_de_semana: PESO_FIN_DE_SEMANA 
        };

        let sumaTotal = 0;
        for (let k in pesosCrudos) { sumaTotal += Math.abs(pesosCrudos[k]); }
        if (sumaTotal === 0) sumaTotal = 1.0;

        const pesosNorm = {};
        const signos = {};
        for (let k in pesosCrudos) {
            pesosNorm[k] = Math.abs(pesosCrudos[k]) / sumaTotal;
            signos[k] = pesosCrudos[k] >= 0 ? 1 : -1;
        }

        let calculados = partidos.map(partido => {
            const item = { ...partido };

            const stringTimestampUtc = `${item.date}T${item.time_utc}Z`;
            const dateObjetoUtc = new Date(stringTimestampUtc);

            const localTimestampMs = dateObjetoUtc.getTime() - appState.clientTimezoneOffsetMs;
            const dateObjetoLocal = new Date(localTimestampMs);

            const localHour1 = dateObjetoLocal.getUTCHours(); 
            const localHour2 = (localHour1 + 1) % 24;

            const dayIndexNative = dateObjetoLocal.getUTCDay();
            const localGridDay1 = dayIndexNative === 0 ? 6 : dayIndexNative - 1;
            const localGridDay2 = localHour2 < localHour1 ? (localGridDay1 + 1) % 7 : localGridDay1;

            item['local_timestamp'] = localTimestampMs;
            item['local_hour_1'] = localHour1;
            item['local_day_name'] = diasSemanaLargos[dayIndexNative];
            item['local_day_num'] = dateObjetoLocal.getUTCDate();
            item['local_month_name'] = mesesLargos[dateObjetoLocal.getUTCMonth()];

            const isWeekendLocal = (dayIndexNative === 6 || dayIndexNative === 0) ? 1.0 : 0.0;

            const listaDia1 = appState.horarioLibre[localGridDay1] || [];
            const listaDia2 = appState.horarioLibre[localGridDay2] || [];

            const puedeVerPrimerTiempo = listaDia1.includes(localHour1);
            const puedeVerSegundoTiempo = listaDia2.includes(localHour2);

            let disp = 0.0;
            if (puedeVerPrimerTiempo && puedeVerSegundoTiempo) disp = 1.0;
            else if (puedeVerPrimerTiempo || puedeVerSegundoTiempo) disp = 0.5;

            item['feature_disponibilidad'] = disp;

            function aplicarLogicaJS(key, featDirecta, featInversa) {
                const w = pesosNorm[key] || 0;
                const s = signos[key] || 1;
                return w * (s > 0 ? featDirecta : featInversa);
            }

            item['Score_Recomendacion'] = (
                aplicarLogicaJS('w_calidad_elo', item['ELO_match_rating_scaled'], 1.0 - item['ELO_match_rating_scaled']) +
                aplicarLogicaJS('w_paridad_elo', 1.0 - item['ELO_diff_scaled'], item['ELO_diff_scaled']) +
                aplicarLogicaJS('w_calidad_fifa', item['PC2_Calidad_scaled'], 1.0 - item['PC2_Calidad_scaled']) +
                aplicarLogicaJS('w_paridad_fifa', 1.0 - item['PC1_Disparidad_scaled'], item['PC1_Disparidad_scaled']) +
                aplicarLogicaJS('w_fin_de_semana', isWeekendLocal, 1.0 - isWeekendLocal)
            );

            return item;
        });

        calculados.sort((a, b) => b.Score_Recomendacion - a.Score_Recomendacion);

        calculados.forEach((partido, index) => {
            partido['recommendation_order'] = index + 1;
        });

        const scoresOrdenados = calculados.map(c => c.Score_Recomendacion).sort((a, b) => a - b);
        
        function getQuantile(sortedArr, q) {
            const pos = (sortedArr.length - 1) * q;
            const base = Math.floor(pos);
            const rest = pos - base;
            if (sortedArr[base + 1] !== undefined) {
                return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
            }
            return sortedArr[base];
        }

        const qAlta = getQuantile(scoresOrdenados, 0.85);
        const qMedia = getQuantile(scoresOrdenados, 0.50);
        const pAlta = Math.max(qAlta, 0.65);
        const pMedia = Math.max(qMedia, 0.45);

        calculados.forEach(item => {
            const score = item.Score_Recomendacion;
            const disp = item.feature_disponibilidad;
            
            const esPartidoPrioritario = (item.home_team === favPais || item.away_team === favPais || item.home_team === favPaisJugador || item.away_team === favPaisJugador);

            if (esPartidoPrioritario) {
                item['Categoria'] = (disp === 0.0) ? "Vale la pena 📺" : "Imperdible 🌟";
            } else {
                if (score >= pAlta) {
                    item['Categoria'] = (disp === 0.0) ? "Vale la pena 📺" : "Imperdible 🌟";
                } else if (score >= pMedia) {
                    item['Categoria'] = "Vale la pena 📺";
                } else {
                    item['Categoria'] = "Para ver el resumen 📱";
                }
            }
        });

        appState.partidosRecomendados = calculados;
    }

    function renderSummaryHeader() {
        let imp = 0, vale = 0, res = 0;
        appState.partidosRecomendados.forEach(p => {
            if (p.Categoria.includes("Imperdible")) imp++;
            else if (p.Categoria.includes("Vale la pena")) vale++;
            else res++;
        });

        document.getElementById('count-imperdible').textContent = imp;
        document.getElementById('count-valepena').textContent = vale;
        document.getElementById('count-resumen').textContent = res;

        let paisUI = "Neutral";
        for (let key in diccionarioPaises) {
            if (diccionarioPaises[key] === appState.nacionalidad) {
                paisUI = key;
                break;
            }
        }

        let txtJugador = appState.jugadorFavorito !== "" ? ` · Siguiendo a ${appState.jugadorFavorito}` : "";

        const sliderParidadVal = parseInt(document.getElementById('slider-paridad').value, 10);
        const desvioHoras = Math.round(appState.clientTimezoneOffsetMs / -3600000);
        const gmtText = desvioHoras >= 0 ? `+${desvioHoras}` : desvioHoras;
        
        let txtParidad = "Indiferente a la paridad";
        if (sliderParidadVal > 15) txtParidad = "Preferís partidos parejos";
        else if (sliderParidadVal < -15) txtParidad = "Preferís goleadas";

        document.getElementById('profile-summary-text').textContent = 
            `${paisUI}${txtJugador} · Agenda Local Activa (GMT ${gmtText}) · ${txtParidad}`;
    }

    function sortAndRenderTable() {
        const field = appState.currentSortField;
        const order = appState.currentSortOrder;
        const favPais = appState.nacionalidad; 
        const favPaisJugador = appState.paisJugadorFavorito; 

        const banderasPaises = {
            "Korea Republic": "🇰🇷", "Mexico": "🇲🇽", "Czechia": "🇨🇿", "South Africa": "🇿🇦",
            "Canada": "🇨🇦", "Switzerland": "🇨🇭", "Qatar": "🇶🇦", "Bosnia-Herzegovina": "🇧🇦",
            "Brazil": "🇧🇷", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Haiti": "🇭🇹", "Morocco": "🇲🇦",
            "Australia": "🇦🇺", "USA": "🇺🇸", "Turkey": "🇹🇷", "Paraguay": "🇵🇾",
            "Ecuador": "🇪🇨", "Germany": "🇩🇪", "Côte d'Ivoire": "🇨🇮", "Curaçao": "🇨🇼",
            "Netherlands": "🇳🇱", "Japan": "🇯🇵", "Sweden": "🇸🇪", "Tunisia": "🇹🇳", 
            "IR Iran": "🇮🇷", "Belgium": "🇧🇪", "Egypt": "🇪🇬", "New Zealand": "🇳🇿", 
            "Spain": "🇪🇸", "Uruguay": "🇺🇾", "Saudi Arabia": "🇸🇦", "Cabo Verde": "🇨🇻", 
            "France": "🇫🇷", "Senegal": "🇸🇳", "Iraq": "🇮🇶", "Norway": "🇳🇴", 
            "Austria": "🇦🇹", "Argentina": "🇦🇷", "Algeria": "🇩🇿", "Jordan": "🇯🇴", 
            "Portugal": "🇵🇹", "Colombia": "🇨🇴", "Uzbekistan": "🇺🇿", "Congo DR": "🇨🇩", 
            "Panama": "🇵🇦", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Ghana": "🇬🇭", "Croatia": "🇭🇷"
        };

        const baseSorted = [...appState.partidosRecomendados].sort((a, b) => {
            let valA = a[field]; let valB = b[field];
            if (field === 'Partido') {
                valA = `${a.home_team} vs ${a.away_team}`; valB = `${b.home_team} vs ${b.away_team}`;
            }
            if (typeof valA === 'string') return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            else return order === 'asc' ? valA - valB : valB - valA;
        });

        let finalSorted = baseSorted;
        const tieneFiltrosActivos = (favPais !== "" || favPaisJugador !== "");

        if (tieneFiltrosActivos && (field === 'recommendation_order' || field === 'Score_Recomendacion')) {
            const partidosFavoritos = baseSorted.filter(p => p.home_team === favPais || p.away_team === favPais || p.home_team === favPaisJugador || p.away_team === favPaisJugador);
            const partidosRestantes = baseSorted.filter(p => p.home_team !== favPais && p.away_team !== favPais && p.home_team !== favPaisJugador && p.away_team !== favPaisJugador);
            
            finalSorted = order === 'asc' ? [...partidosFavoritos, ...partidosRestantes] : [...partidosRestantes, ...partidosFavoritos];
        }

        // ==========================================================================
        // CÁLCULO DEL TOP 30% PARA LA CATEGORÍA "VALE LA PENA"
        // ==========================================================================
        // Filtramos y ordenamos de mayor a menor los scores de los partidos que son estrictamente "Vale la pena"
        const scoresValeLaPena = appState.partidosRecomendados
            .filter(p => p.Categoria.includes("Vale la pena"))
            .map(p => p.Score_Recomendacion)
            .sort((a, b) => b - a);

        // Determinamos el valor de corte del score para el 30% superior
        let umbralTopValeLaPena = 1.0; 
        if (scoresValeLaPena.length > 0) {
            const indexCorte = Math.max(0, Math.floor(scoresValeLaPena.length * 0.30) - 1);
            umbralTopValeLaPena = scoresValeLaPena[indexCorte];
        }
        // ==========================================================================

        tableBody.innerHTML = '';

        finalSorted.forEach((partido, idx) => {
            const tr = document.createElement('tr');
            
            const esImperdible = partido.Categoria.includes("Imperdible");
            const esValeLaPena = partido.Categoria.includes("Vale la pena");

            if (esImperdible) tr.classList.add('row-cat-imperdible');
            else if (esValeLaPena) tr.classList.add('row-cat-valepena');
            else tr.classList.add('row-cat-resumen');

            // Columna '#' Secuencial
            const tdIndex = document.createElement('td');
            tdIndex.textContent = idx + 1; 
            tdIndex.style.fontWeight = "700"; tdIndex.style.color = "var(--primary-accent)";
            tr.appendChild(tdIndex);

            // Columna Partido
            const tdTeams = document.createElement('td'); tdTeams.classList.add('cell-teams');
            const banderaHome = banderasPaises[partido.home_team] || ""; const banderaAway = banderasPaises[partido.away_team] || "";
            
            const spanHome = document.createElement('span'); spanHome.classList.add('cell-team-home');
            spanHome.innerHTML = `<span class="flag-home">${banderaHome}</span>${partido.home_team}`;
            const spanVs = document.createElement('span'); spanVs.classList.add('cell-team-vs'); spanVs.textContent = "vs.";
            const spanAway = document.createElement('span'); spanAway.classList.add('cell-team-away');
            spanAway.innerHTML = `${partido.away_team}<span class="flag-away">${banderaAway}</span>`;
            
            tdTeams.appendChild(spanHome); tdTeams.appendChild(spanVs); tdTeams.appendChild(spanAway);
            tr.appendChild(tdTeams);

            // Columna Día
            const tdDate = document.createElement('td'); tdDate.textContent = `${partido.local_day_name}, ${partido.local_day_num} de ${partido.local_month_name}`; 
            tr.appendChild(tdDate);

            // Columna Hora
            const tdTime = document.createElement('td');
            const horaFormateada = partido.local_hour_1 < 10 ? `0${partido.local_hour_1}:00hs` : `${partido.local_hour_1}:00hs`;
            tdTime.textContent = horaFormateada; tr.appendChild(tdTime);

            // ==========================================================================
            // MOTOR DE MOTIVOS CON RECORTE ESTADÍSTICO (Top 30% de Vale la Pena)
            // ==========================================================================
            const tdScore = document.createElement('td');
            let motivoTexto = ""; 
            let esFiltroFavorito = false;
            
            const paisJugadorIngles = diccionarioPaises[appState.paisJugadorFavorito] || appState.paisJugadorFavorito;

            // REGLA 1: Prioridad máxima por País Favorito
            if (favPais !== "" && (partido.home_team === favPais || partido.away_team === favPais)) {
                let paisEsp = "tu equipo";
                for (let key in diccionarioPaises) {
                    if (diccionarioPaises[key] === favPais) { paisEsp = key; break; }
                }
                motivoTexto = `Juega ${paisEsp}`;
                esFiltroFavorito = true;
            }
            // REGLA 2: Prioridad por Jugador Favorito
            else if (appState.jugadorFavorito !== "" && (partido.home_team === paisJugadorIngles || partido.away_team === paisJugadorIngles)) {
                motivoTexto = `Juega ${appState.jugadorFavorito}`;
                esFiltroFavorito = true;
            }
            // REGLA 3: Clasificación basada en Sliders si es Imperdible, o si es del Top 30% de Vale la Pena
            else {
                const esTopValeLaPena = esValeLaPena && (partido.Score_Recomendacion >= umbralTopValeLaPena);
                const llevaJustificacionDetallada = esImperdible || esTopValeLaPena;

                if (llevaJustificacionDetallada) {
                    const sliderCalidad = parseInt(document.getElementById('slider-calidad').value, 10);
                    const sliderParidad = parseInt(document.getElementById('slider-paridad').value, 10);

                    // Prioridad Paridad dominante
                    if (Math.abs(sliderParidad) >= Math.abs(sliderCalidad) && sliderParidad !== 0) {
                        motivoTexto = sliderParidad > 0 ? "Partido Parejo" : "Partido Disparejo";
                    }
                    // Prioridad Jerarquía dominante
                    else if (sliderCalidad !== 0) {
                        motivoTexto = sliderCalidad > 0 ? "Equipos Importantes" : "Equipos Exóticos";
                    }
                    // Respaldo estadístico neutral (0)
                    else {
                        if (partido.PC2_Calidad_scaled > 0.75) {
                            motivoTexto = "Equipos Importantes";
                        } else {
                            motivoTexto = "Partido Parejo";
                        }
                    }
                } 
                // REGLA 4: Si es un "Vale la pena" común y corriente (fuera del top 30%), dice simplemente "Recomendado"
                else if (esValeLaPena) {
                    motivoTexto = "Recomendado";
                }
            }

            // Renderizado estético en la celda
            if (motivoTexto !== "") {
                const txtMotivo = document.createElement('span');
                txtMotivo.textContent = motivoTexto;
                txtMotivo.style.fontWeight = "500";
                
                // Distribución de paleta de colores premium
                if (esFiltroFavorito) {
                    txtMotivo.style.color = "var(--primary-accent)"; // Verde flúo para tus elecciones fijas
                } else if (motivoTexto.includes("Importantes") || motivoTexto.includes("Parejo")) {
                    txtMotivo.style.color = "#ffca28"; // Ámbar para los motivos tácticos fuertes
                } else {
                    txtMotivo.style.color = "#aeaeb2"; // Gris tenue elegante para la palabra "Recomendado"
                }
                tdScore.appendChild(txtMotivo);
            }

            tr.appendChild(tdScore);
            // ==========================================================================

            // Columna Disponibilidad
            const tdDisp = document.createElement('td');
            if (partido.feature_disponibilidad === 1.0) { tdDisp.textContent = "✅ Completo"; tdDisp.style.color = "#00e676"; }
            else if (partido.feature_disponibilidad === 0.5) { tdDisp.textContent = "🕐 Solo un tiempo"; tdDisp.style.color = "#ffca28"; }
            else { tdDisp.textContent = "❌ No coincide con horarios"; tdDisp.style.color = "#aeaeb2"; }
            tr.appendChild(tdDisp);

            tableBody.appendChild(tr);
        });
    }

    function buildAvailabilityGrid() {
        if (!gridContainer) return;
        gridContainer.innerHTML = '';
        const emptyCorner = document.createElement('div'); gridContainer.appendChild(emptyCorner);

        for (let h = 0; h < 24; h++) {
            const hourHeader = document.createElement('div'); hourHeader.classList.add('grid-header-cell'); hourHeader.textContent = h; hourHeader.style.cursor = 'pointer';
            hourHeader.addEventListener('click', () => {
                const celdasColumna = gridContainer.querySelectorAll(`.grid-cell[data-hour="${h}"]`);
                const celdasSeleccionadas = gridContainer.querySelectorAll(`.grid-cell.selected[data-hour="${h}"]`);
                const marcarTodas = celdasSeleccionadas.length < celdasColumna.length;
                celdasColumna.forEach(cell => { if (marcarTodas) cell.classList.add('selected'); else cell.classList.remove('selected'); });
            });
            gridContainer.appendChild(hourHeader);
        }

        const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        diasSemana.forEach((dia, dayIndex) => {
            const dayLabel = document.createElement('div'); dayLabel.classList.add('day-label'); dayLabel.textContent = dia; dayLabel.style.cursor = 'pointer';
            dayLabel.addEventListener('click', () => {
                const celdasFila = gridContainer.querySelectorAll(`.grid-cell[data-day="${dayIndex}"]`);
                const celdasSeleccionadas = gridContainer.querySelectorAll(`.grid-cell.selected[data-day="${dayIndex}"]`);
                const marcarTodas = celdasSeleccionadas.length < celdasFila.length;
                celdasFila.forEach(cell => { if (marcarTodas) cell.classList.add('selected'); else cell.classList.remove('selected'); });
            });
            gridContainer.appendChild(dayLabel);

            for (let hour = 0; hour < 24; hour++) {
                const cell = document.createElement('div'); cell.classList.add('grid-cell'); cell.dataset.day = dayIndex; cell.dataset.hour = hour;
                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault(); isDragging = true; dragSelectMode = !cell.classList.contains('selected'); toggleCell(cell, dragSelectMode);
                });
                cell.addEventListener('mouseenter', () => { if (isDragging) toggleCell(cell, dragSelectMode); });
                cell.addEventListener('touchstart', () => { dragSelectMode = !cell.classList.contains('selected'); toggleCell(cell, dragSelectMode); });
                gridContainer.appendChild(cell);
            }
        });
        window.addEventListener('mouseup', () => { isDragging = false; });
    }

    function toggleCell(cell, select) { if (select) cell.classList.add('selected'); else cell.classList.remove('selected'); }

    function saveGridData() {
        for (let i = 0; i < 7; i++) appState.horarioLibre[i] = [];
        const selectedCells = gridContainer.querySelectorAll('.grid-cell.selected');
        selectedCells.forEach(cell => {
            const day = parseInt(cell.dataset.day, 10); const hour = parseInt(cell.dataset.hour, 10);
            if (!appState.horarioLibre[day].includes(hour)) appState.horarioLibre[day].push(hour);
        });
    }

    function actualizarOscuridadFondo() {
        const bgWrapper = document.querySelector('.landing-bg-wrapper'); if (!bgWrapper) return;
        bgWrapper.classList.remove('dimmed-step-1', 'dimmed-step-2', 'dimmed-step-3', 'dimmed-step-4', 'dimmed-step-5');
        
        if (appState.currentStep >= 1 && appState.currentStep <= 6) {
            let numClase = appState.currentStep;
            if (numClase === 5) numClase = 4; 
            if (numClase === 6) numClase = 5; 
            bgWrapper.classList.add(`dimmed-step-${numClase}`);
        }
    }

    function transitionToPhase(nextPhaseId) {
        const activePhase = document.querySelector('.phase.active');
        if (activePhase) {
            activePhase.style.opacity = '0'; activePhase.style.transform = 'translateY(-16px)';
            setTimeout(() => {
                activePhase.classList.remove('active'); activePhase.style.display = 'none';
                const nextPhase = document.getElementById(nextPhaseId);
                if (nextPhase) {
                    nextPhase.style.display = 'block';
                    setTimeout(() => { nextPhase.classList.add('active'); nextPhase.style.opacity = '1'; nextPhase.style.transform = 'translateY(0)'; }, 20);
                }
            }, 400);
        }
    }

    // ==========================================================================
    // FUNCIÓN INYECTADA: PARSEADOR GENÉRICO DE ARCHIVOS CSV REPARADO
    // ==========================================================================
    function parseGenericCSV(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return [];

        const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
        const list = [];

        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            if (columns.length < headers.length) continue;

            const obj = {};
            headers.forEach((h, idx) => {
                const val = columns[idx].replace(/^["']|["']$/g, '').trim();
                // Si la columna es un identificador o texto, la dejamos estática; si no, la parseamos como float
                if (h === 'home_team' || h === 'away_team' || h === 'id_partido' || h === 'date' || h === 'time_utc' || h === 'Country' || h === 'Player' || h === 'Position' || h === 'Club') {
                    obj[h] = val;
                } else {
                    obj[h] = parseFloat(val);
                }
            });
            list.push(obj);
        }
        return list;
    }
});
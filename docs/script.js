document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL DE LA APLICACIÓN ---
    const appState = {
        currentStep: 1,
        totalSteps: 4, 
        horarioLibre: {
            0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
        },
        nacionalidad: "", 
        w_calidad_elo: 0,
        w_calidad_fifa: 0,
        w_paridad_elo: 0,
        w_paridad_fifa: 0,
        
        // Offset dinámico del cliente en minutos convertido a milisegundos para las operaciones nativas
        clientTimezoneOffsetMs: new Date().getTimezoneOffset() * 60 * 1000,

        partidosData: [],
        partidosRecomendados: [],
        
        currentSortField: 'recommendation_order',
        currentSortOrder: 'asc'
    };

    // --- VARIABLES DE ARRASTRE DE LA GRILLA (POSICIONADAS AL PRINCIPIO) ---
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

    const mesesLargos = {
        5: 'Junio', 6: 'Julio'
    };

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

        // Botón inicial
        btnStart.addEventListener('click', () => {
            appState.currentStep = 1; // Primero fijamos el paso 1
            updateProgressBar();
            actualizarOscuridadFondo(); // ¡Acá ahora sí va a activar la clase dimmed-step-1!
            progressContainer.classList.remove('hidden');
            transitionToPhase('phase-onboarding');
        });

        // Link para volver a configurar al final
        const linkReset = document.getElementById('link-reset-onboarding');
        if (linkReset) {
            linkReset.addEventListener('click', (e) => {
                e.preventDefault();
                appState.currentStep = 1;
                updateProgressBar();
                actualizarOscuridadFondo(); // Limpia los oscurecidos
                progressContainer.classList.remove('hidden');
                transitionToPhase('phase-onboarding');
            });
        }

        // --- NUEVO: LÓGICA PARA MARCAR TODA LA GRILLA COMO LIBRE ---
        const btnSelectAll = document.getElementById('btn-select-all-hours');
        if (btnSelectAll) {
            btnSelectAll.addEventListener('click', () => {
                // Capturamos todas las celdas horarias generadas en el DOM
                const todasLasCeldas = document.querySelectorAll('.grid-cell');
                
                // Evaluamos si ya están todas seleccionadas para alternar el comportamiento (Toggle)
                const celdasSeleccionadas = document.querySelectorAll('.grid-cell.selected');
                const marcarTodas = celdasSeleccionadas.length < todasLasCeldas.length;

                todasLasCeldas.forEach(cell => {
                    if (marcarTodas) {
                        cell.classList.add('selected');
                    } else {
                        cell.classList.remove('selected');
                    }
                });

                // Cambiamos dinámicamente el texto del botón para que sea intuitivo
                if (marcarTodas) {
                    btnSelectAll.textContent = "🧹 Desmarcar todo";
                } else {
                    btnSelectAll.textContent = "✨ Marcar todo como libre";
                }
            });
        }

        // Configuración de los disparadores basados en clases (Fiel a tu index.html)
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

        // ESCUCHA DE COLUMNAS CONFIGURADA UNA SOLA VEZ AL INICIO Y BLINDADA
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
        defaultOption.value = ""; defaultOption.textContent = "Ninguno / Soy neutral";
        selectNacionalidad.appendChild(defaultOption);

        const copiaOrdenada = [...listadoPaisesEspanol].sort((a, b) => a.localeCompare(b));
        copiaOrdenada.forEach(paisEsp => {
            const o = document.createElement('option');
            o.value = paisEsp; 
            o.textContent = paisEsp;
            selectNacionalidad.appendChild(o);
        });
    }

    async function loadPartidosCSV() {
        try {
            const response = await fetch('./data/matriz_partidos_scaled_pca.csv');
            if (!response.ok) throw new Error("No se pudo cargar el archivo.");
            const csvText = await response.text();
            
            const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
            
            const listData = [];
            for (let i = 1; i < lines.length; i++) {
                const columns = lines[i].split(',');
                if (columns.length < headers.length) continue;
                
                const rowObj = {};
                headers.forEach((header, index) => {
                    const value = columns[index].replace(/^["']|["']$/g, '').trim();
                    if (header === 'home_team' || header === 'away_team' || header === 'id_partido' || header === 'date' || header === 'time_utc') {
                        rowObj[header] = value;
                    } else {
                        rowObj[header] = parseFloat(value);
                    }
                });
                listData.push(rowObj);
            }
            appState.partidosData = listData;
        } catch (error) {
            console.warn("Fallo de entorno local CORS mitigado.");
        }
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
            const val = parseInt(document.getElementById('slider-calidad').value, 10);
            appState.w_calidad_elo = val / 2; appState.w_calidad_fifa = val / 2;
            document.getElementById('step-3').classList.remove('active');
            appState.currentStep = 4; document.getElementById('step-4').classList.add('active');
            updateProgressBar();
        } else if (appState.currentStep === 4) {
            const val = parseInt(document.getElementById('slider-paridad').value, 10);
            appState.w_paridad_elo = val / 2; appState.w_paridad_fifa = val / 2;
            
            appState.currentStep = 5;
            updateProgressBar();
            runLoadingAndRecommendationFlow();
        }

        // NUEVO: Actualizar el nivel de atenuación del fondo al avanzar
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
        }

        // NUEVO: Actualizar el nivel de atenuación del fondo al retroceder
        actualizarOscuridadFondo();
    }

    // NUEVA FUNCIÓN AUXILIAR: Maneja las clases de intensidad del fondo
    function actualizarOscuridadFondo() {
        const bgWrapper = document.querySelector('.landing-bg-wrapper');
        if (!bgWrapper) return;

        // Limpiamos todas las clases previas de intensidad para evitar solapamientos
        bgWrapper.classList.remove('dimmed-step-1', 'dimmed-step-2', 'dimmed-step-3', 'dimmed-step-4', 'dimmed-step-5');

        // Si ya entramos al onboarding (Paso 1 al 5), asignamos la clase exacta de su paso
        if (appState.currentStep >= 1 && appState.currentStep <= 5) {
            bgWrapper.classList.add(`dimmed-step-${appState.currentStep}`);
        }
    }

    function updateProgressBar() {
        const percentage = (appState.currentStep / (appState.totalSteps + 1)) * 100;
        progressBar.style.width = `${percentage}%`;
    }

    function runLoadingAndRecommendationFlow() {
        transitionToPhase('phase-loading');
        setTimeout(() => {
            calcularRecomendacionesMotor();
            renderSummaryHeader();
            sortAndRenderTable(); // Renderizado inicial directo y seguro
            progressContainer.classList.add('hidden');
            transitionToPhase('phase-results');
        }, 1800); 
    }

    // --- MOTOR DE RECOMENDACIÓN ---
    function calcularRecomendacionesMotor() {
        const partidos = appState.partidosData;
        const favUsuario = appState.nacionalidad;

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

        // Ordenamiento base para estampar el ranking oficial de recomendación matemático
        calculados.sort((a, b) => b.Score_Recomendacion - a.Score_Recomendacion);

        // Estampar índice original de recomendación
        calculados.forEach((partido, index) => {
            partido['recommendation_order'] = index + 1;
        });

        // Calcular Percentiles globales
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
            const esPartidoFavorito = (item.home_team === favUsuario || item.away_team === favUsuario);

            if (esPartidoFavorito) {
                if (disp === 0.0) {
                    item['Categoria'] = "Vale la pena 📺";
                } else {
                    item['Categoria'] = "Imperdible 🌟";
                }
            } else {
                if (score >= pAlta) {
                    if (disp === 0.0) item['Categoria'] = "Vale la pena 📺";
                    else item['Categoria'] = "Imperdible 🌟";
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

        const sliderParidadVal = parseInt(document.getElementById('slider-paridad').value, 10);
        const desvioHoras = Math.round(appState.clientTimezoneOffsetMs / -3600000);
        const gmtText = desvioHoras >= 0 ? `+${desvioHoras}` : desvioHoras;
        
        let txtParidad = "Indiferente a la paridad";
        if (sliderParidadVal > 15) txtParidad = "Preferís partidos parejos";
        else if (sliderParidadVal < -15) txtParidad = "Preferís goleadas";

        document.getElementById('profile-summary-text').textContent = 
            `${paisUI} · Agenda Local Activa (GMT ${gmtText}) · ${txtParidad}`;
    }

    // --- ORDENAMIENTO DE ENCABEZADOS Y RENDERIZADO ---
    function sortAndRenderTable() {
        const field = appState.currentSortField;
        const order = appState.currentSortOrder;
        const favUsuario = appState.nacionalidad; 

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

        // 1. Clasificación base de ordenamiento genérico por campos
        const baseSorted = [...appState.partidosRecomendados].sort((a, b) => {
            let valA = a[field];
            let valB = b[field];

            if (field === 'Partido') {
                valA = `${a.home_team} vs ${a.away_team}`;
                valB = `${b.home_team} vs ${b.away_team}`;
            }

            if (typeof valA === 'string') {
                return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
                return order === 'asc' ? valA - valB : valB - valA;
            }
        });

        // 2. Particionar por bloque prioritario de Selección (Solo si no está ordenando explícitamente por Fecha, Hora o Score)
        let finalSorted = baseSorted;
        if (favUsuario !== "" && (field === 'recommendation_order' || field === 'Score_Recomendacion')) {
            const partidosFavoritos = baseSorted.filter(p => p.home_team === favUsuario || p.away_team === favUsuario);
            const partidosRestantes = baseSorted.filter(p => p.home_team !== favUsuario && p.away_team !== favUsuario);
            
            if (order === 'asc') {
                finalSorted = [...partidosFavoritos, ...partidosRestantes];
            } else {
                finalSorted = [...partidosRestantes, ...partidosFavoritos];
            }
        }

        tableBody.innerHTML = '';

        // 3. Pintado dinámico de las celdas (Corregido para re-indexar correlativamente)
        finalSorted.forEach((partido, idx) => {
            const tr = document.createElement('tr');
            
            if (partido.Categoria.includes("Imperdible")) {
                tr.classList.add('row-cat-imperdible');
            } else if (partido.Categoria.includes("Vale la pena")) {
                tr.classList.add('row-cat-valepena');
            } else {
                tr.classList.add('row-cat-resumen');
            }

            // CORRECCIÓN COMPLETA: Columna '#' correlativa según el orden final en pantalla
            const tdIndex = document.createElement('td');
            // Si el orden de la columna es descendente (ej. invertido), cuenta al revés; si no, va del 1 al 72 limpio
            tdIndex.textContent = order === 'desc' ? finalSorted.length - idx : idx + 1;
            tdIndex.style.fontWeight = "700";
            tdIndex.style.color = "var(--primary-accent)";
            tr.appendChild(tdIndex);

            // Columna Partido alineada con Flexbox y banderas
            const tdTeams = document.createElement('td');
            tdTeams.classList.add('cell-teams');
            
            const banderaHome = banderasPaises[partido.home_team] || "";
            const banderaAway = banderasPaises[partido.away_team] || "";
            
            const spanHome = document.createElement('span');
            spanHome.classList.add('cell-team-home');
            spanHome.innerHTML = `<span class="flag-home">${banderaHome}</span>${partido.home_team}`;
            
            const spanVs = document.createElement('span');
            spanVs.classList.add('cell-team-vs');
            spanVs.textContent = "vs.";
            
            const spanAway = document.createElement('span');
            spanAway.classList.add('cell-team-away');
            spanAway.innerHTML = `${partido.away_team}<span class="flag-away">${banderaAway}</span>`;
            
            tdTeams.appendChild(spanHome);
            tdTeams.appendChild(spanVs);
            tdTeams.appendChild(spanAway);
            tr.appendChild(tdTeams);

            // Columna Día
            const tdDate = document.createElement('td');
            tdDate.textContent = `${partido.local_day_name}, ${partido.local_day_num} de ${partido.local_month_name}`; 
            tr.appendChild(tdDate);

            // Columna Hora
            const tdTime = document.createElement('td');
            const horaFormateada = partido.local_hour_1 < 10 ? `0${partido.local_hour_1}:00hs` : `${partido.local_hour_1}:00hs`;
            tdTime.textContent = horaFormateada;
            tr.appendChild(tdTime);

            // Columna Score
            const tdScore = document.createElement('td');
            const pct = Math.round(partido.Score_Recomendacion * 100);
            const wrapper = document.createElement('div'); wrapper.classList.add('score-cell-wrapper');
            const barBg = document.createElement('div'); barBg.classList.add('mini-bar-bg');
            const barFill = document.createElement('div'); barFill.classList.add('mini-bar-fill');
            barFill.style.width = `${pct}%`;
            barBg.appendChild(barFill); wrapper.appendChild(barBg);
            const txtPct = document.createElement('span'); txtPct.textContent = `${pct}%`;
            wrapper.appendChild(txtPct); tdScore.appendChild(wrapper);
            tr.appendChild(tdScore);

            // Columna Disponibilidad
            const tdDisp = document.createElement('td');
            if (partido.feature_disponibilidad === 1.0) {
                tdDisp.textContent = "✅ Completo"; tdDisp.style.color = "#00e676";
            } else if (partido.feature_disponibilidad === 0.5) {
                tdDisp.textContent = "🕐 Solo un tiempo"; tdDisp.style.color = "#ffca28";
            } else {
                tdDisp.textContent = "❌ No coincide con horarios"; tdDisp.style.color = "#aeaeb2";
            }
            tr.appendChild(tdDisp);

            tableBody.appendChild(tr);
        });
    }

    // --- CONSTRUCCIÓN DEL GRID INTERACTIVO PREMIUM ---
    function buildAvailabilityGrid() {
        if (!gridContainer) return;
        gridContainer.innerHTML = '';
        
        // 1. Esquina superior izquierda vacía
        const emptyCorner = document.createElement('div');
        gridContainer.appendChild(emptyCorner);

        // 2. Generar Cabeceras de Hora (Columnas 0 a 23)
        for (let h = 0; h < 24; h++) {
            const hourHeader = document.createElement('div');
            hourHeader.classList.add('grid-header-cell'); 
            hourHeader.textContent = h;
            hourHeader.style.cursor = 'pointer'; // Indicador visual de que es clickeable
            hourHeader.title = `Marcar/Desmarcar las ${h}:00hs para toda la semana`;

            // EVENTO: Clic en el número de la hora (Columna Completa)
            hourHeader.addEventListener('click', () => {
                // Buscamos todas las celdas que correspondan a esa hora específica
                const celdasColumna = gridContainer.querySelectorAll(`.grid-cell[data-hour="${h}"]`);
                const celdasSeleccionadas = gridContainer.querySelectorAll(`.grid-cell.selected[data-hour="${h}"]`);
                
                // Si no están todas marcadas, marcamos la columna entera. Si ya estaban todas, limpiamos.
                const marcarTodas = celdasSeleccionadas.length < celdasColumna.length;
                celdasColumna.forEach(cell => {
                    if (marcarTodas) cell.classList.add('selected');
                    else cell.classList.remove('selected');
                });
            });

            gridContainer.appendChild(hourHeader);
        }

        // 3. Generar Filas por cada Día de la Semana
        const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        diasSemana.forEach((dia, dayIndex) => {
            const dayLabel = document.createElement('div');
            dayLabel.classList.add('day-label'); 
            dayLabel.textContent = dia;
            dayLabel.style.cursor = 'pointer'; // Indicador visual de que es clickeable
            dayLabel.title = `Marcar/Desmarcar todo el ${dia}`;

            // EVENTO: Clic en la etiqueta del Día (Fila Completa)
            dayLabel.addEventListener('click', () => {
                // Buscamos todas las celdas que correspondan a ese día específico
                const celdasFila = gridContainer.querySelectorAll(`.grid-cell[data-day="${dayIndex}"]`);
                const celdasSeleccionadas = gridContainer.querySelectorAll(`.grid-cell.selected[data-day="${dayIndex}"]`);
                
                // Alternamos comportamiento (Toggle) para la fila completa
                const marcarTodas = celdasSeleccionadas.length < celdasFila.length;
                celdasFila.forEach(cell => {
                    if (marcarTodas) cell.classList.add('selected');
                    else cell.classList.remove('selected');
                });
            });

            gridContainer.appendChild(dayLabel);

            // 4. Generar las celdas horarias individuales de la fila
            for (let hour = 0; hour < 24; hour++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell'); 
                cell.dataset.day = dayIndex; 
                cell.dataset.hour = hour;

                // Eventos nativos de arrastre y clic individual que ya tenías funcionando
                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault(); 
                    isDragging = true;
                    dragSelectMode = !cell.classList.contains('selected');
                    toggleCell(cell, dragSelectMode);
                });
                cell.addEventListener('mouseenter', () => { 
                    if (isDragging) toggleCell(cell, dragSelectMode); 
                });
                cell.addEventListener('touchstart', () => {
                    dragSelectMode = !cell.classList.contains('selected');
                    toggleCell(cell, dragSelectMode);
                });
                gridContainer.appendChild(cell);
            }
        });
        
        window.addEventListener('mouseup', () => { isDragging = false; });
    }

    function toggleCell(cell, select) {
        if (select) {
            cell.classList.add('selected');
        } else {
            cell.classList.remove('selected');
        }
    }

    function saveGridData() {
        for (let i = 0; i < 7; i++) appState.horarioLibre[i] = [];
        const selectedCells = gridContainer.querySelectorAll('.grid-cell.selected');
        selectedCells.forEach(cell => {
            const day = parseInt(cell.dataset.day, 10);
            const hour = parseInt(cell.dataset.hour, 10);
            if (!appState.horarioLibre[day].includes(hour)) {
                appState.horarioLibre[day].push(hour);
            }
        });
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
                    setTimeout(() => {
                        nextPhase.classList.add('active'); nextPhase.style.opacity = '1'; nextPhase.style.transform = 'translateY(0)';
                    }, 20);
                }
            }, 400);
        }
    }
});
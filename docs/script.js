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
        
        // DETECCIÓN AUTOMÁTICA DE ZONA HORARIA DEL USUARIO
        // getTimezoneOffset() devuelve los minutos en negativo para zonas Occidentales, por eso dividimos por -60
        utcOffset: new Date().getTimezoneOffset() / -60,

        partidosData: [],
        partidosRecomendados: [],
        currentSortField: 'Score_Recomendacion',
        currentSortOrder: 'desc'
    };

    // Constante del algoritmo de tu modelo
    const PESO_HORARIO_LIBRE = 20.0;

    // Países del Mundial 2026
    const paisesMundial = [
        "Alemania", "Angola", "Arabia Saudita", "Argelia", "Argentina", "Australia", 
        "Austria", "Bélgica", "Brasil", "Camerún", "Canadá", "Chile", "Colombia", 
        "Corea del Sur", "Costa de Marfil", "Croacia", "Dinamarca", "Ecuador", 
        "Egipto", "Escocia", "España", "Estados Unidos", "Francia", "Gales", 
        "Ghana", "Irán", "Irlanda", "Italia", "Japón", "Marruecos", "México", 
        "Nigeria", "Nueva Zelanda", "Países Bajos", "Panamá", "Perú", "Polonia", 
        "Portugal", "República Checa", "Senegal", "Serbia", "Suecia", "Suiza", 
        "Túnez", "Turquía", "Uruguay", "Uzbekistán", "Venezuela"
    ];

    const diasSemanaLargos = {
        0: 'Lun', 1: 'Mar', 2: 'Mié', 3: 'Jue', 4: 'Vie', 5: 'Sáb', 6: 'Dom'
    };

    // Elementos Interfaz
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

        btnStart.addEventListener('click', () => {
            appState.currentStep = 1;
            updateProgressBar();
            progressContainer.classList.remove('hidden');
            transitionToPhase('phase-onboarding');
        });

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

        document.getElementById('link-reset-onboarding').addEventListener('click', (e) => {
            e.preventDefault();
            appState.currentStep = 1;
            updateProgressBar();
            progressContainer.classList.remove('hidden');
            transitionToPhase('phase-onboarding');
        });

        document.querySelectorAll('#recommendations-table th').forEach(th => {
            th.addEventListener('click', () => {
                const sortField = th.dataset.sort;
                if (!sortField) return;
                
                if (appState.currentSortField === sortField) {
                    appState.currentSortOrder = appState.currentSortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    appState.currentSortField = sortField;
                    appState.currentSortOrder = 'desc';
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
        paisesMundial.forEach(c => {
            const o = document.createElement('option'); o.value = c; o.textContent = c;
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
                    if (header === 'home_team' || header === 'away_team' || header === 'id_partido') {
                        rowObj[header] = value;
                    } else {
                        rowObj[header] = parseFloat(value);
                    }
                });
                listData.push(rowObj);
            }
            appState.partidosData = listData;
            console.log(`Base de partidos cargada con éxito. Total: ${listData.length}`);
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
            if (selectNacionalidad) appState.nacionalidad = selectNacionalidad.value;
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
            sortAndRenderTable();
            progressContainer.classList.add('hidden');
            transitionToPhase('phase-results');
        }, 1800); 
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MOTOR DE RECOMENDACIÓN AJUSTADO (ZONA HORARIA AUTO & NO WEEKEND)
    // ─────────────────────────────────────────────────────────────────────────
    function calcularRecomendacionesMotor() {
        const partidos = appState.partidosData;
        const nacUsuario = appState.nacionalidad;
        const userOffset = appState.utcOffset; // Desvío dinámico del cliente

        // 1. CORRECCIÓN: Eliminada la variable w_fin_de_semana de la estructura
        const pesosCrudos = {
            w_nacionalidad: nacUsuario !== "" ? 35.0 : 0.0,
            w_calidad_elo: appState.w_calidad_elo,
            w_paridad_elo: appState.w_paridad_elo,
            w_calidad_fifa: appState.w_calidad_fifa,
            w_paridad_fifa: appState.w_paridad_fifa,
            w_horario_libre: PESO_HORARIO_LIBRE
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

        const favUsuario = appState.nacionalidad;

        const calculados = partidos.map(partido => {
            const item = { ...partido };

            const horaUtc = item.match_hora_utc;
            const diaUtc = item.day_of_week_num;

            // ZONA HORARIA DINÁMICA CON MANEJO DE DESBORDAMIENTO
            const horaLocalBruta = horaUtc + userOffset;
            
            let hora1 = horaLocalBruta % 24;
            if (hora1 < 0) hora1 += 24; 

            let dia1 = diaUtc;
            if (horaLocalBruta >= 24) {
                dia1 = (diaUtc + 1) % 7;
            } else if (horaLocalBruta < 0) {
                dia1 = (diaUtc - 1 + 7) % 7;
            }

            let hora2 = (hora1 + 1) % 24;
            let dia2 = hora2 < hora1 ? (dia1 + 1) % 7 : dia1;

            // Inyectamos día y hora local calculados en el objeto para usarlos en la renderización de la tabla
            item['local_hour_1'] = hora1;
            item['local_day_1'] = dia1;

            const listaDia1 = appState.horarioLibre[dia1] || [];
            const listaDia2 = appState.horarioLibre[dia2] || [];

            const puedeVerPrimerTiempo = listaDia1.includes(hora1);
            const puedeVerSegundoTiempo = listaDia2.includes(hora2);

            let disp = 0.0;
            if (puedeVerPrimerTiempo && puedeVerSegundoTiempo) disp = 1.0;
            else if (puedeVerPrimerTiempo || puedeVerSegundoTiempo) disp = 0.5;

            item['feature_disponibilidad'] = disp;

            const juegaNac = (item.home_team === favUsuario || item.away_team === favUsuario) ? 1.0 : 0.0;
            item['feature_nacionalidad'] = juegaNac;

            function aplicarLogicaJS(key, featDirecta, featInversa) {
                const w = pesosNorm[key] || 0;
                const s = signos[key] || 1;
                return w * (s > 0 ? featDirecta : featInversa);
            }

            // Ecuación limpia lineal (sin la feature is_weekend)
            item['Score_Recomendacion'] = (
                aplicarLogicaJS('w_nacionalidad', item['feature_nacionalidad'], 1.0 - item['feature_nacionalidad']) +
                aplicarLogicaJS('w_calidad_elo', item['ELO_match_rating_scaled'], 1.0 - item['ELO_match_rating_scaled']) +
                aplicarLogicaJS('w_paridad_elo', 1.0 - item['ELO_diff_scaled'], item['ELO_diff_scaled']) +
                aplicarLogicaJS('w_calidad_fifa', item['PC2_Calidad_scaled'], 1.0 - item['PC2_Calidad_scaled']) +
                aplicarLogicaJS('w_paridad_fifa', 1.0 - item['PC1_Disparidad_scaled'], item['PC1_Disparidad_scaled']) +
                (pesosNorm['w_horario_libre'] * item['feature_disponibilidad'])
            );

            return item;
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
            if (score >= pAlta) item['Categoria'] = "Imperdible 🌟";
            else if (score >= pMedia) item['Categoria'] = "Vale la pena 📺";
            else item['Categoria'] = "Para ver el resumen 📱";
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

        const nac = appState.nacionalidad || "Neutral";
        const sliderCalidadVal = parseInt(document.getElementById('slider-calidad').value, 10);
        const sliderParidadVal = parseInt(document.getElementById('slider-paridad').value, 10);
        const gmtText = appState.utcOffset >= 0 ? `+${appState.utcOffset}` : appState.utcOffset;
        
        let txtParidad = "Indiferente a la paridad";
        if (sliderParidadVal > 15) txtParidad = "Preferís partidos parejos";
        else if (sliderParidadVal < -15) txtParidad = "Preferís goleadas o partidos disparejos";

        document.getElementById('profile-summary-text').textContent = 
            `${nac} · Agenda local activa (UTC ${gmtText}) · ${txtParidad} (Nivel indexado: ${sliderCalidadVal >= 0 ? '+' : ''}${sliderCalidadVal})`;
    }

    function sortAndRenderTable() {
        const field = appState.currentSortField;
        const order = appState.currentSortOrder;

        const sorted = [...appState.partidosRecomendados].sort((a, b) => {
            let valA = a[field];
            let valB = b[field];

            if (field === 'Partido') {
                valA = `${a.home_team} vs ${a.away_team}`;
                valB = `${b.home_team} vs ${b.away_team}`;
            }
            // Si ordena por fecha, mapeamos la hora local calculada para mantener consistencia
            if (field === 'match_hora_utc') {
                valA = a.day_of_week_num * 24 + a.match_hora_utc;
                valB = b.day_of_week_num * 24 + b.match_hora_utc;
            }

            if (typeof valA === 'string') {
                return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
                return order === 'asc' ? valA - valB : valB - valA;
            }
        });

        tableBody.innerHTML = '';

        sorted.forEach((partido, index) => {
            const tr = document.createElement('tr');
            if (partido.Categoria.includes("Imperdible")) tr.classList.add('row-imperdible');

            const tdIndex = document.createElement('td');
            tdIndex.textContent = index + 1;
            tr.appendChild(tdIndex);

            const tdCat = document.createElement('td');
            const spanBadge = document.createElement('span');
            spanBadge.classList.add('match-badge');
            if (partido.Categoria.includes("Imperdible")) spanBadge.classList.add('cat-imperdible');
            else if (partido.Categoria.includes("Vale la pena")) spanBadge.classList.add('cat-valepena');
            else spanBadge.classList.add('cat-resumen');
            spanBadge.textContent = partido.Categoria.replace(/ 🌟| 📺| 📱/, '');
            tdCat.appendChild(spanBadge);
            tr.appendChild(tdCat);

            const tdTeams = document.createElement('td');
            tdTeams.classList.add('cell-teams');
            tdTeams.textContent = `${partido.home_team} vs ${partido.away_team}`;
            tr.appendChild(tdTeams);

            // ADAPTACIÓN DE LA COLUMNA DE FECHA Y HORA AL HORARIO LOCAL PROPIO DEL USUARIO
            const tdDate = document.createElement('td');
            const diaTexto = diasSemanaLargos[partido.local_day_1];
            const horaFormateada = partido.local_hour_1 < 10 ? `0${partido.local_hour_1}:00` : `${partido.local_hour_1}:00`;
            tdDate.textContent = `${diaTexto}, ${horaFormateada}hs`;
            tr.appendChild(tdDate);

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

            const tdDisp = document.createElement('td');
            const spanIcon = document.createElement('span'); spanIcon.classList.add('disp-icon');
            if (partido.feature_disponibilidad === 1.0) spanIcon.textContent = "✅";
            else if (partido.feature_disponibilidad === 0.5) spanIcon.textContent = "🕐";
            else spanIcon.textContent = "❌";
            tdDisp.appendChild(spanIcon); tr.appendChild(tdDisp);

            tableBody.appendChild(tr);
        });
    }

    // --- CONSTRUCCIÓN DEL GRID INTERACTIVO ---
    function buildAvailabilityGrid() {
        if (!gridContainer) return;
        gridContainer.innerHTML = '';
        const emptyCorner = document.createElement('div');
        gridContainer.appendChild(emptyCorner);

        for (let h = 0; h < 24; h++) {
            const hourHeader = document.createElement('div');
            hourHeader.classList.add('grid-header-cell'); hourHeader.textContent = h;
            gridContainer.appendChild(hourHeader);
        }

        const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        diasSemana.forEach((dia, dayIndex) => {
            const dayLabel = document.createElement('div');
            dayLabel.classList.add('day-label'); dayLabel.textContent = dia;
            gridContainer.appendChild(dayLabel);

            for (let hour = 0; hour < 24; hour++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell'); cell.dataset.day = dayIndex; cell.dataset.hour = hour;

                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault(); isDragging = true;
                    dragSelectMode = !cell.classList.contains('selected');
                    toggleCell(cell, dragSelectMode);
                });
                cell.addEventListener('mouseenter', () => { if (isDragging) toggleCell(cell, dragSelectMode); });
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
        if (select) cell.classList.add('selected'); else cell.classList.remove('selected');
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
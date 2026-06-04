# ⚽ Sistema de Recomendación de Partidos — FIFA World Cup 2026

> **Competencia MIA · Universidad Austral**  
> Desarrollo de un sistema inteligente de recomendación personalizada para la primera fase del Mundial 2026.

---

## 📋 Descripción del Proyecto

Este sistema analiza el perfil de un usuario (horarios disponibles, selección favorita, preferencias de juego) y recomienda qué partidos de la primera fase del Mundial 2026 debería ver, clasificándolos en tres categorías:

| Categoría | Descripción |
|-----------|-------------|
| ⭐ **Imperdible** | Partidos indispensables por relevancia y afinidad con el perfil |
| 📺 **Vale la pena** | Partidos interesantes pero no cruciales, o en horarios complejos |
| 📱 **Para ver el resumen** | Partidos de bajo interés para el perfil o en horarios imposibles |

El scoring combina **métricas ELO históricas**, **ratings del juego FIFA 2026** procesados mediante **PCA**, y las **preferencias personales** del usuario, con soporte para pesos negativos (e.g., "quiero ver partidos parejos" o "quiero ver goleadas").

---

## 🗂️ Estructura del Repositorio

```
RECOMENDATION-SYSTEM-W2026/
│
├── data/                              # Datasets procesados
│   ├── json/                          # Datos de jugadores por país (JSON)
│   ├── txt/                           # Ratings FIFA 2026 (HTML scrapeado)
│   ├── elo_ratings_completo.csv       # Rankings ELO históricos por selección
│   ├── jugadores_todos_los_paises.csv # Planteles completos con valor de mercado
│   ├── partidos_primera_ronda.csv     # Fixture oficial de la fase de grupos
│   ├── partidos_rankeados.csv         # Fixture enriquecido con ELO por partido
│   ├── matriz_partidos.csv            # Matriz de features sin escalar
│   ├── matriz_partidos_scaled.csv     # Matriz de features escalada [0,1]
│   └── matriz_partidos_scaled_pca.csv # Matriz final con componentes PCA
│
├── notebooks/                         # Pipeline de procesamiento y análisis
│   ├── creacion_jugadores.ipynb       # [PASO 1] Scraping y limpieza de planteles
│   ├── creacion_metrica.ipynb         # [PASO 2] Cálculo de métricas ELO por partido
│   ├── creacion_valor_plantel.ipynb   # [PASO 3] Feature engineering y scaling
│   ├── estudio_pca.ipynb              # [PASO 4] Análisis PCA de selecciones y partidos
│   ├── recomendacion_pca_negativos.ipynb  # [PASO 5] Sistema de recomendación final
│   ├── recomendacion_pca.ipynb        # Versión intermedia del recomendador
│   └── recomendacion_test.ipynb       # Tests de perfiles de usuario
│
├── src/
│   └── extraer_partidos.py            # Script de extracción del fixture oficial
│
├── .gitignore
├── LICENSE
├── README.md
└── requirements.txt
```

---

## 🔧 Instalación

### Requisitos previos
- Python 3.9 o superior
- pip

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/<usuario>/recomendation-system-w2026.git
cd recomendation-system-w2026

# 2. Crear entorno virtual (recomendado)
python -m venv venv
source venv/bin/activate        # Linux / macOS
venv\Scripts\activate           # Windows

# 3. Instalar dependencias
pip install -r requirements.txt

# 4. Iniciar Jupyter
jupyter notebook
```

---

## ▶️ Instrucciones de Ejecución

> **Importante:** Los notebooks deben ejecutarse en orden. Cada uno genera los archivos que el siguiente necesita.

### Pipeline completo (primera vez)

```
src/extraer_partidos.py
        ↓
notebooks/creacion_jugadores.ipynb
        ↓
notebooks/creacion_metrica.ipynb
        ↓
notebooks/creacion_valor_plantel.ipynb
        ↓
notebooks/estudio_pca.ipynb
        ↓
notebooks/recomendacion_pca_negativos.ipynb
```

---

### Paso 1 — Extracción del fixture
**Archivo:** `src/extraer_partidos.py`  
**Genera:** `data/partidos_primera_ronda.csv`

```bash
python src/extraer_partidos.py
```

Extrae el fixture oficial de los 72 partidos de la primera fase del Mundial 2026 (12 grupos × 4 equipos × 6 partidos). Incluye fecha, hora UTC, estadio y equipos.

---

### Paso 2 — Creación de planteles
**Notebook:** `notebooks/creacion_jugadores.ipynb`  
**Genera:** `data/jugadores_todos_los_paises.csv`, `data/json/jugadores_todos_los_paises.json`

Procesa los datos de los planteles de las 48 selecciones participantes:
- Limpieza y normalización del valor de mercado (€m / €k → millones)
- Extracción de edad desde el formato de Transfermarkt
- Agrupación por país

---

### Paso 3 — Métricas ELO por partido
**Notebook:** `notebooks/creacion_metrica.ipynb`  
**Requiere:** `data/partidos_primera_ronda.csv`, `data/elo_ratings_completo.csv`  
**Genera:** `data/partidos_rankeados.csv`

Cruza el fixture con los ratings ELO históricos de cada selección. Calcula:
- `match_rating`: suma de ELO de ambas selecciones (atractivo general del partido)
- `home_elo_rating` / `away_elo_rating`: ELO individual por equipo
- `ELO_diff`: diferencia absoluta (indicador de paridad)

---

### Paso 4 — Feature Engineering y Scaling
**Notebook:** `notebooks/creacion_valor_plantel.ipynb`  
**Requiere:** `data/partidos_rankeados.csv`, `data/json/jugadores_todos_los_paises.json`  
**Genera:** `data/matriz_partidos.csv`, `data/matriz_partidos_scaled.csv`

Construye la matriz de features del partido:

| Feature | Descripción | Transformación |
|---------|-------------|----------------|
| `ELO_match_rating_scaled` | Nivel general del partido (ELO) | MinMaxScaler |
| `ELO_diff_scaled` | Disparidad histórica entre equipos | MinMaxScaler |
| `match_value_scaled` | Valor total de mercado en cancha | log1p → MinMaxScaler |
| `match_value_diff_scaled` | Diferencia de valor entre planteles | log1p → MinMaxScaler |
| `is_decisive` | 1 si es la última fecha del grupo | Binaria (partidos 5 y 6 de cada grupo) |
| `is_weekend` | 1 si es sábado o domingo | Binaria |
| `match_hora_utc` | Hora de inicio en UTC | Numérica (0–23) |
| `day_of_week_num` | Día de la semana (0=Lunes) | Numérica (0–6) |

---

### Paso 5 — Análisis PCA
**Notebook:** `notebooks/estudio_pca.ipynb`  
**Requiere:** `data/matriz_partidos.csv`, `data/txt/fifa26_ratings_selecciones.txt`  
**Genera:** `data/matriz_partidos_scaled_pca.csv`

Incorpora ratings tácticos del videojuego FIFA 2026 (Attack, Midfield, Defence, Overall, InternationalPrestige) mediante análisis de componentes principales:

- **PC1 — Disparidad táctica** (52.8% de varianza): captura cuán desparejo es el partido a nivel ofensivo/defensivo
- **PC2 — Calidad táctica** (36.2% de varianza): captura el nivel medio de ambos equipos

> Los 2 componentes explican el **89.0%** de la varianza total de los 7 features tácticos.

Ambos componentes se escalan a [0,1] con MinMaxScaler y se agregan a la matriz final como `PC1_Disparidad_scaled` y `PC2_Calidad_scaled`.

---

### Paso 6 — Sistema de Recomendación
**Notebook:** `notebooks/recomendacion_pca_negativos.ipynb`  
**Requiere:** `data/matriz_partidos_scaled_pca.csv`

Función principal: `recomendar_partidos(df_partidos, perfil_usuario)`

#### Estructura del perfil de usuario

```python
perfil_usuario = {
    "nacionalidad": "Argentina",   # Selección favorita (nombre en inglés)
    "utc_offset": -3,              # Diferencia horaria respecto a UTC
    "pesos": {
        # Valores positivos = priorizar | Valores negativos = penalizar
        "w_nacionalidad":  35,     # Que juegue mi selección
        "w_calidad_elo":   40,     # Calidad histórica (ELO)
        "w_paridad_elo":   30,     # Partido parejo (ELO)
        "w_calidad_fifa":  40,     # Calidad táctica (FIFA 2026)
        "w_paridad_fifa":  30,     # Paridad táctica (FIFA 2026)
        "w_fin_de_semana": 10,     # Bonus si es sábado o domingo
        # w_horario_libre no se configura: se aplica automáticamente
        # con un peso fijo proporcional al total de pesos del usuario
    },
    "horario_libre": {
        # Día (0=Lunes … 6=Domingo) → lista de horas locales disponibles
        0: [18, 19, 20, 21, 22],
        1: [18, 19, 20, 21, 22],
        2: [18, 19, 20, 21, 22],
        3: [18, 19, 20, 21, 22],
        4: [18, 19, 20, 21, 22],
        5: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
        6: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
    }
}
```

> **Nota sobre los pesos:** No necesitan sumar 100. El sistema normaliza automáticamente los valores absolutos. Los valores negativos invierten la lógica: `w_paridad_elo: -100` prioriza partidos **desiguales** (goleadas esperadas).

> **Nota sobre el horario:** El peso del horario libre se aplica con un valor fijo proporcional al perfil. Si el partido entra completo en el horario disponible → 1.0; si entra solo un tiempo → 0.5; si no entra → 0.0.

#### Fórmula de scoring

```
Score = Σ [ |w_i| / Σ|w_j| × feature_i(signo_i) ]

donde:
  feature_i(+) = feature directa       (ej: ELO_match_rating_scaled)
  feature_i(-) = 1 - feature directa   (ej: 1 - ELO_match_rating_scaled)
```

#### Umbrales de categorización (híbridos)

```
p_alta  = max(percentil_85 del score, 0.65)  → "Imperdible"
p_media = max(percentil_50 del score, 0.45)  → "Vale la pena"
resto                                          → "Para ver el resumen"
```

---

## 📊 Fuentes de Datos

| Dataset | Fuente | Descripción |
|---------|--------|-------------|
| `partidos_primera_ronda.csv` | FIFA / scraping propio | Fixture oficial de los 72 partidos |
| `elo_ratings_completo.csv` | [eloratings.net](https://www.eloratings.net) | Rankings ELO históricos por selección |
| `jugadores_todos_los_paises.json` | [Transfermarkt](https://www.transfermarkt.com) | Planteles y valores de mercado |
| `fifa26_ratings_selecciones.txt` | [FUTGG / EA Sports](https://www.futgg.com) | Ratings del videojuego FIFA 2026 |

---

## 🧪 Ejemplos de Uso

### Fanático de su selección
```python
perfil = {
    "nacionalidad": "Mexico",
    "utc_offset": -6,
    "pesos": {"w_nacionalidad": 100, "w_calidad_elo": 0, "w_paridad_elo": 0,
              "w_calidad_fifa": 0, "w_paridad_fifa": 0, "w_fin_de_semana": 0},
    "horario_libre": {i: list(range(24)) for i in range(7)}
}
```

### Quiere ver goleadas (pesos negativos)
```python
perfil = {
    "nacionalidad": "",
    "utc_offset": -3,
    "pesos": {"w_nacionalidad": 0, "w_calidad_elo": 100, "w_paridad_elo": -100,
              "w_calidad_fifa": 100, "w_paridad_fifa": -100, "w_fin_de_semana": 0},
    "horario_libre": {i: list(range(24)) for i in range(7)}
}
```

### Solo puede ver el fin de semana
```python
perfil = {
    "nacionalidad": "Argentina",
    "utc_offset": -3,
    "pesos": {"w_nacionalidad": 60, "w_calidad_elo": 25, "w_paridad_elo": 25,
              "w_calidad_fifa": 25, "w_paridad_fifa": 25, "w_fin_de_semana": 10},
    "horario_libre": {
        0: [], 1: [], 2: [], 3: [], 4: [],
        5: [14, 15, 16, 17, 18, 19],
        6: [14, 15, 16, 17, 18, 19]
    }
}
```

## 👥 Equipo

Verdondoni, Maximo
Ziadi, Marcos

---

## 🏫 Contexto Académico

Proyecto desarrollado para la **competencia de la Maestría en Inteligencia Artificial (MIA)** de la **Universidad Austral**.

---

## 📄 Licencia

Este proyecto está bajo la licencia especificada en el archivo [LICENSE](./LICENSE).

# ⚽ Sistema de Recomendación de Partidos – FIFA World Cup 2026

> Proyecto desarrollado para la competencia **"Tu tiempo, tu Mundial"** — Maestría en Inteligencia Artificial, Universidad Austral (2026).

---

## 🔗 Demo Interactiva

**[→ Acceder a la demo](https://maximo-verdondoni.github.io/Recomendation-System-WorldCup2026/)**

Configurá tu perfil de usuario (horarios disponibles, selección favorita, preferencias de calidad y paridad) y recibí una recomendación personalizada de los 72 partidos de la fase de grupos del Mundial 2026, clasificados en tres categorías: **Imperdible**, **Vale la pena** y **Para ver el resumen**.

---

## 📌 Descripción del Proyecto

La expansión de la Copa Mundial 2026 a 104 partidos disputados en múltiples husos horarios genera una saturación de información para el espectador. Este sistema resuelve esa fricción mediante un **motor de recomendación basado en contenido (content-based)** que prioriza los encuentros a través de la intersección entre factores empíricos del partido y las restricciones explícitas del usuario.

El sistema combina:
- **Rating ELO oficial FIFA** — desempeño histórico colectivo de cada selección
- **Atributos de EA FC 2026** — perfil técnico-táctico contemporáneo (Ataque, Mediocampo, Defensa) reducido mediante PCA
- **Perfil declarado del usuario** — disponibilidad horaria, selección favorita, preferencias de calidad y paridad competitiva

---

## 🗂️ Estructura del Repositorio

```
├── data/                          # Datasets utilizados en el pipeline
│   ├── partidos_primera_ronda.csv         # Fixture completo de la fase de grupos
│   ├── elo_ratings_completo.csv           # Ratings ELO oficiales FIFA por selección
│   ├── matriz_partidos.csv                # Matriz de partidos con features construidas
│   ├── matriz_partidos_scaled.csv         # Matriz escalada (MinMaxScaler)
│   ├── matriz_partidos_scaled_pca.csv     # Matriz final con componentes PCA incorporadas
│   ├── countries.csv                      # Listado de países clasificados
│   ├── jugadores_todos_los_paises.csv     # Datos de jugadores por selección
│   └── ...
├── docs/                          # Archivos de la demo (GitHub Pages)
│   ├── index.html
│   ├── script.js
│   └── styles.css
├── notebooks/                     # Análisis y desarrollo exploratorio
│   ├── estudio_pca.ipynb                  # Análisis de componentes principales
│   ├── creacion_metrica.ipynb             # Construcción de variables de partido
│   ├── creacion_valor_plantel.ipynb       # Procesamiento de atributos de valor de plantilla
│   ├── recomendacion_pca_negativos.ipynb  # Motor de recomendación con soporte de pesos negativos
│   ├── recomendacion_pca.ipynb            # Motor de recomendación base
│   ├── recomendacion_test.ipynb           # Tests de arquetipos y validación
│   └── players_scraper.ipynb              # Scraping de datos de jugadores
├── scrapers/                      # Scripts de recolección de datos
│   ├── matches_scraper.py                 # Scraping del fixture oficial
│   └── players_scraper.py                 # Scraping de atributos por selección
├── src/                           # Código fuente documentado
│   ├── dataset_creator.py                 # Pipeline completo de construcción del dataset
│   ├── creacion_valor_plantel_documentado.py
│   └── recomendacion_pca_negativos_documentado.py   # Funcion de recomendación final
├── requirements.txt
└── README.md
```

---

## ⚙️ Instalación y Ejecución Local

### Prerrequisitos

- Python 3.9 o superior
- pip

### 1. Clonar el repositorio

```bash
git clone https://github.com/maximo-verdondoni/Recomendation-System-WorldCup2026.git
cd Recomendation-System-WorldCup2026
```

### 2. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 3. Explorar los notebooks

Los notebooks en `/notebooks` documentan cada etapa del pipeline en orden:

| Notebook | Descripción |
|---|---|
| `players_scraper.ipynb` | Recolección de datos de jugadores y atributos EA FC |
| `creacion_valor_plantel.ipynb` | Construcción de métricas por selección |
| `creacion_metrica.ipynb` | Feature engineering sobre la matriz de partidos |
| `estudio_pca.ipynb` | Análisis de componentes principales y validación |
| `recomendacion_pca_negativos.ipynb` | Motor de recomendación completo |
| `recomendacion_test.ipynb` | Validación con arquetipos de usuario |

```bash
jupyter notebook notebooks/
```

### 4. Ejecutar el pipeline completo desde código fuente

```bash
python src/dataset_creator.py
python src/recomendacion_pca_negativos_documentado.py
```

### 5. Demo web (sin instalación)

La demo está desplegada en GitHub Pages y **no requiere instalación**. Accedé directamente desde cualquier navegador:

**[https://maximo-verdondoni.github.io/Recomendation-System-WorldCup2026/](https://maximo-verdondoni.github.io/Recomendation-System-WorldCup2026/)**

---

## 🧠 Metodología

### Feature Engineering

A partir de las fuentes recolectadas se construyeron dos familias de variables por partido:

- **Bloque FIFA:** `ELO_match_rating` (calidad agregada) y `ELO_diff` (disparidad competitiva)
- **Bloque EA FC:** variables de diferencial sectorial (`Attack_diff`, `Midfield_diff`, `Defence_diff`) y de nivel promedio (`Mean_Attack`, `Mean_Midfield`, `Mean_Defence`), reducidas a dos componentes principales mediante PCA

### PCA

Las 7 variables del bloque EA FC fueron estandarizadas y reducidas mediante PCA. Las dos primeras componentes explican el **89% de la varianza total**:

| Componente | Var. explicada | Interpretación |
|---|---|---|
| CP1 | 52.81% | Disparidad táctica del partido |
| CP2 | 36.17% | Calidad técnica absoluta del partido |

### Función de Scoring

El score de cada partido se calcula mediante una combinación lineal ponderada con ruteo de signos, que permite al usuario expresar tanto la intensidad como la dirección de cada preferencia (por ejemplo, preferir activamente partidos disparejos en lugar de parejos).

---

## 📄 Licencia

MIT License — ver [LICENSE](LICENSE) para más detalles.

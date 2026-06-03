"""
creacion_valor_plantel.py
=========================
Pipeline de Feature Engineering para el sistema de recomendación del Mundial 2026.

Descripción:
    Construye la matriz de features escalada que sirve como input para el sistema
    de recomendación. Combina el fixture de partidos (con ratings ELO) con los
    valores de mercado de los planteles (obtenidos de Transfermarkt), genera
    features temporales y de paridad, y aplica transformaciones de escala.

Inputs:
    data/partidos_rankeados.csv           — Fixture con ratings ELO por partido
    data/json/jugadores_todos_los_paises.json — Planteles con valor de mercado

Outputs:
    data/matriz_partidos.csv             — Matriz de features sin escalar
    data/matriz_partidos_scaled.csv      — Matriz de features escalada [0, 1]

Features generadas:
    Identificación:
        id_partido, home_team, away_team, match_number, group_name

    Partido:
        is_decisive            — 1 si es la última fecha del grupo (partidos 5 y 6)
        day_of_week_num        — Día de la semana (0=Lun, 6=Dom)
        is_weekend             — 1 si es sábado o domingo
        match_hora_utc         — Hora de inicio en UTC (0–23)

    ELO (escaladas con MinMaxScaler):
        ELO_match_rating       — Suma de ELO de ambas selecciones (nivel general)
        ELO_diff               — Diferencia absoluta de ELO (disparidad histórica)
        → ELO_match_rating_scaled, ELO_diff_scaled

    Valor de mercado (log1p → MinMaxScaler):
        match_value_diff       — Diferencia absoluta de valor entre planteles
        → match_value_scaled, match_value_diff_scaled
        (match_value total se elimina por alta correlación con match_value_diff)

    Temporales normalizadas (división directa):
        hora_utc_scaled        — match_hora_utc / 23
        day_of_week_scaled     — day_of_week_num / 6

Nota sobre el scaling:
    - ELO se escala directamente con MinMaxScaler (distribución razonablemente uniforme).
    - Valores de mercado son muy asimétricos (distribución sesgada a la derecha),
      por eso se aplica log1p antes del MinMaxScaler para reducir el impacto de outliers.
    - Se usan dos instancias separadas de MinMaxScaler para preservar los parámetros
      de cada grupo de variables de forma independiente.

Dependencias:
    pandas, numpy, scikit-learn (MinMaxScaler)
"""

import pandas as pd
import json
import numpy as np
from sklearn.preprocessing import MinMaxScaler


# ─────────────────────────────────────────────────────────────────────────────
# 1. Carga de datos
# ─────────────────────────────────────────────────────────────────────────────
partidos = pd.read_csv('../data/partidos_rankeados.csv')

with open('../data/json/jugadores_todos_los_paises.json', 'r', encoding='utf-8') as f:
    jugadores_dict = json.load(f)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Limpieza del valor de mercado
# ─────────────────────────────────────────────────────────────────────────────
def clean_market_value(value_str) -> float:
    """
    Convierte el valor de mercado de un jugador a millones de euros (float).

    Maneja los formatos de Transfermarkt:
        - "€50m"  → 50.0
        - "€200k" → 0.2
        - NaN / vacío → 0.0

    Parameters
    ----------
    value_str : str | float
        Valor de mercado en formato string con símbolo €, sufijo 'm' o 'k'.

    Returns
    -------
    float  Valor en millones de euros.
    """
    if pd.isna(value_str) or not isinstance(value_str, str):
        return 0.0
    val = value_str.replace('€', '').strip()
    if 'm' in val:
        return float(val.replace('m', ''))
    elif 'k' in val:
        return float(val.replace('k', '')) / 1000.0
    return 0.0


# ─────────────────────────────────────────────────────────────────────────────
# 3. Valor total de mercado por selección
# ─────────────────────────────────────────────────────────────────────────────
# Suma el valor de todos los jugadores del plantel para obtener el valor
# total de la selección en millones de euros.
valores_paises = {
    pais: sum(clean_market_value(j.get('Market Value', '0')) for j in lista_jugadores)
    for pais, lista_jugadores in jugadores_dict.items()
}

# Mapear al fixture (fillna=0 para selecciones sin datos)
partidos['home_value'] = partidos['home_team'].map(valores_paises).fillna(0.0)
partidos['away_value'] = partidos['away_team'].map(valores_paises).fillna(0.0)


# ─────────────────────────────────────────────────────────────────────────────
# 4. Construcción de la matriz de features
# ─────────────────────────────────────────────────────────────────────────────
matriz_partidos = pd.DataFrame()

# ── Identificación ────────────────────────────────────────────────────────────
matriz_partidos['id_partido']   = partidos['id']
matriz_partidos['home_team']    = partidos['home_team']
matriz_partidos['away_team']    = partidos['away_team']
matriz_partidos['match_number'] = partidos['match_number']
matriz_partidos['group_name']   = partidos['group_name']

# ── Feature: is_decisive ──────────────────────────────────────────────────────
# En un grupo de 4 equipos hay 6 partidos. Los partidos 5 y 6 (ordenados
# por match_number) son la última fecha y se juegan simultáneamente,
# lo que los hace más decisivos e impredecibles.
matriz_partidos = matriz_partidos.sort_values('match_number')
matriz_partidos['orden_en_grupo'] = matriz_partidos.groupby('group_name').cumcount() + 1
matriz_partidos['is_decisive']    = (matriz_partidos['orden_en_grupo'] >= 5).astype(int)
matriz_partidos = matriz_partidos.drop(columns=['orden_en_grupo'])

# ── Features temporales ───────────────────────────────────────────────────────
partidos['date'] = pd.to_datetime(partidos['date'])
matriz_partidos['day_of_week_num'] = partidos['date'].dt.dayofweek
matriz_partidos['is_weekend']      = partidos['date'].dt.dayofweek.isin([5, 6]).astype(int)

# ── Features de calidad del partido ───────────────────────────────────────────
# ELO_match_rating: suma de ELO de ambos equipos → indica el nivel general del partido
# ELO_diff: diferencia absoluta → indica cuán parejo es históricamente el partido
matriz_partidos['ELO_match_rating'] = partidos['match_rating']
matriz_partidos['ELO_diff']         = (partidos['home_elo_rating'] - partidos['away_elo_rating']).abs()

# ── Features de valor de plantel ──────────────────────────────────────────────
# match_value_diff: diferencia de valor entre planteles → paridad económica
# match_value se elimina luego por alta correlación con match_value_diff (r=0.82)
matriz_partidos['home_value']        = partidos['home_value']
matriz_partidos['away_value']        = partidos['away_value']
matriz_partidos['match_value']       = partidos['home_value'] + partidos['away_value']
matriz_partidos['match_value_diff']  = (partidos['home_value'] - partidos['away_value']).abs()
matriz_partidos['match_hora_utc']    = pd.to_datetime(partidos['time_utc'], format='%H:%M:%S').dt.hour

# Ordenar por id y guardar versión sin escalar
matriz_partidos = matriz_partidos.sort_values(by='id_partido', ascending=True)
matriz_partidos.to_csv('../data/matriz_partidos.csv', index=False, encoding='utf-8')


# ─────────────────────────────────────────────────────────────────────────────
# 5. Scaling de features
# ─────────────────────────────────────────────────────────────────────────────
# Instancias separadas para poder guardar y reutilizar los parámetros
# de cada grupo de variables de forma independiente.

# ── Grupo ELO: distribución uniforme → MinMaxScaler directo ──────────────────
scaler_elo = MinMaxScaler()
matriz_partidos[['ELO_match_rating_scaled', 'ELO_diff_scaled']] = (
    scaler_elo.fit_transform(matriz_partidos[['ELO_match_rating', 'ELO_diff']])
)

# ── Grupo Valor: distribución muy asimétrica → log1p antes del scaler ─────────
# log1p achata la diferencia entre selecciones ricas (Francia, Inglaterra)
# y selecciones con pocos jugadores en ligas top (Cabo Verde, Arabia Saudita),
# evitando que los extremos dominen la escala.
matriz_partidos['match_value_log']      = np.log1p(matriz_partidos['match_value'])
matriz_partidos['match_value_diff_log'] = np.log1p(matriz_partidos['match_value_diff'])

scaler_val = MinMaxScaler()
matriz_partidos[['match_value_scaled', 'match_value_diff_scaled']] = (
    scaler_val.fit_transform(
        matriz_partidos[['match_value_log', 'match_value_diff_log']]
    )
)

# ── Grupo Temporal: normalización directa por rango conocido ─────────────────
matriz_partidos['hora_utc_scaled']     = matriz_partidos['match_hora_utc'] / 23.0
matriz_partidos['day_of_week_scaled']  = matriz_partidos['day_of_week_num'] / 6.0

# ── Limpieza de columnas temporales ──────────────────────────────────────────
# Eliminar intermedios de log (ya no necesarios)
matriz_partidos = matriz_partidos.drop(columns=['match_value_log', 'match_value_diff_log'])

# Eliminar match_value por alta correlación con match_value_diff (r=0.82):
# ambas capturan el mismo concepto; match_value_diff (paridad) es más informativo
# para la recomendación que el total absoluto.
matriz_partidos = matriz_partidos.drop(columns=['match_value'])

# Guardar matriz escalada
matriz_partidos.to_csv('../data/matriz_partidos_scaled.csv', index=False, encoding='utf-8')

print("✅ Matriz de features generada correctamente.")
print(f"   Shape: {matriz_partidos.shape}")
print(f"   Columnas: {matriz_partidos.columns.tolist()}")
print(f"   Nulos: {matriz_partidos.isnull().sum().sum()}")

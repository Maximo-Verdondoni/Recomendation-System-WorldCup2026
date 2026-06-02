"""
construir_matriz_pca.py
=======================
Pipeline de construcción de la matriz de features PCA para partidos FIFA 2026.

Lógica central del módulo:
  - Extrae los ratings de selecciones nacionales desde un archivo HTML scrapeado
    de FIFA 26 (Overall, Attack, Midfield, Defence, InternationalPrestige).

  - Cruza esos ratings con la matriz de partidos históricos para generar features
    comparativas por partido: diferencias, promedios y ventajas tácticas entre
    el equipo local y el visitante.

  - Aplica PCA sobre las features tácticas para reducir dimensionalidad y extraer
    dos componentes interpretativos:
        PC1 → Disparidad táctica entre equipos
        PC2 → Nivel de calidad táctico promedio del partido

  - Escala ambos componentes a [0, 1] con MinMaxScaler y los incorpora a la
    matriz de partidos escalada existente (matriz_partidos_scaled.csv), generando
    el archivo final listo para el sistema de recomendación.

Dependencias:
    pandas, numpy, sklearn, bs4 (BeautifulSoup)

Input:
    data/txt/fifa26_ratings_selecciones.txt — HTML con tabla de ratings de FIFA 26
    data/matriz_partidos.csv               — Matriz de partidos con columnas ELO y valor
    data/matriz_partidos_scaled.csv        — Versión escalada de la misma matriz

Output:
    data/matriz_partidos_scaled_pca.csv    — Matriz final con PC1 y PC2 incorporados

Columnas generadas en el output:
    PC1_Disparidad_scaled : float [0, 1]  — Disparidad táctica escalada
    PC2_Calidad_scaled    : float [0, 1]  — Calidad táctica media escalada
"""

import os
import numpy as np
import pandas as pd
from bs4 import BeautifulSoup
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.decomposition import PCA


# ─────────────────────────────────────────────────────────────────────────────
# Constantes: rutas de archivos
# ─────────────────────────────────────────────────────────────────────────────

_DIR = os.path.dirname(os.path.abspath(__file__))

PATH_FIFA_HTML       = os.path.abspath(os.path.join(_DIR, "..", "data", "txt", "fifa26_ratings_selecciones.txt"))
PATH_PARTIDOS        = os.path.abspath(os.path.join(_DIR, "..", "data", "matriz_partidos.csv"))
PATH_PARTIDOS_SCALED = os.path.abspath(os.path.join(_DIR, "..", "data", "matriz_partidos_scaled.csv"))
PATH_OUTPUT          = os.path.abspath(os.path.join(_DIR, "..", "data", "matriz_partidos_scaled_pca.csv"))

# Columnas tácticas que entran al PCA
FEATURES_PCA = [
    'Attack_diff',
    'Midfield_diff',
    'Defence_diff',
    'Mean_Attack',
    'Mean_Midfield',
    'Mean_Defence',
    'Overall_Diff',
]

# Nombres de equipo que difieren entre la fuente FIFA y la fuente de partidos
TEAM_NAME_MAP = {
    'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
    'USA':                'United States',
    'Turkey':             'Türkiye',
    'Curaçao':            'Curacao',
    'IR Iran':            'Iran',
}


# ─────────────────────────────────────────────────────────────────────────────
# Paso 1: Extracción de ratings FIFA desde HTML
# ─────────────────────────────────────────────────────────────────────────────
def extraer_ratings_fifa(path_html: str) -> pd.DataFrame:
    """
    Parsea el archivo HTML de ratings de FIFA 26 y devuelve un DataFrame limpio.

    Lee la tabla de selecciones desde el HTML scrapeado, extrae las columnas
    numéricas relevantes y descarta la formación táctica (no se usa en el PCA).

    Parameters
    ----------
    path_html : str
        Ruta al archivo .txt/.html con el contenido de la tabla FIFA 26.

    Returns
    -------
    pd.DataFrame
        Columnas: Name, Overall, Attack, Midfield, Defence, InternationalPrestige.
        Una fila por selección nacional.

    Raises
    ------
    FileNotFoundError
        Si el archivo HTML no existe en la ruta indicada.
    """
    with open(path_html, "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")
    rows = []

    for tr in soup.select("tbody tr"):
        try:
            name       = tr.select_one("td.s20 a").get_text(strip=True)
            overall    = tr.select_one('td[data-col="oa"]').get_text(strip=True)
            attack     = tr.select_one('td[data-col="at"]').get_text(strip=True)
            midfield   = tr.select_one('td[data-col="md"]').get_text(strip=True)
            defence    = tr.select_one('td[data-col="df"]').get_text(strip=True)
            prestige   = tr.select_one('td[data-col="ip"]').get_text(strip=True)

            rows.append({
                "Name":                  name,
                "Overall":               int(overall),
                "Attack":                int(attack),
                "Midfield":              int(midfield),
                "Defence":               int(defence),
                "InternationalPrestige": int(prestige),
            })

        except Exception:
            # Filas con estructura incompleta se descartan silenciosamente
            continue

    return pd.DataFrame(rows)


# ─────────────────────────────────────────────────────────────────────────────
# Paso 2: Normalización de nombres de selecciones
# ─────────────────────────────────────────────────────────────────────────────
def normalizar_nombres_equipos(df: pd.DataFrame, columnas: list[str]) -> pd.DataFrame:
    """
    Aplica el mapa de equivalencias de nombres a las columnas indicadas.

    Corrige discrepancias entre la nomenclatura usada en la fuente FIFA
    y la nomenclatura de la fuente de partidos históricos (ej: 'USA' → 'United States').

    Parameters
    ----------
    df      : pd.DataFrame  DataFrame con columnas de nombre de equipo.
    columnas: list[str]     Lista de columnas donde aplicar el reemplazo.

    Returns
    -------
    pd.DataFrame
        Mismo DataFrame con los nombres corregidos en las columnas indicadas.
    """
    df = df.copy()
    for col in columnas:
        df[col] = df[col].replace(TEAM_NAME_MAP)
    return df


# ─────────────────────────────────────────────────────────────────────────────
# Paso 3: Construcción de features por partido
# ─────────────────────────────────────────────────────────────────────────────
def construir_features_partido(
    df_partidos: pd.DataFrame,
    df_ratings: pd.DataFrame
) -> pd.DataFrame:
    """
    Cruza los ratings FIFA con la matriz de partidos y genera features comparativas.

    Para cada partido calcula:
      - *_diff    : diferencia absoluta entre local y visitante en cada dimensión.
      - Mean_*    : promedio entre local y visitante (nivel colectivo del partido).
      - Attack_adv: asimetría ataque vs defensa entre ambos equipos (no se usa en PCA).
      - Overall_Diff: diferencia absoluta de Overall.

    Parameters
    ----------
    df_partidos : pd.DataFrame
        Matriz de partidos con columnas home_team, away_team y métricas ELO/valor.
    df_ratings  : pd.DataFrame
        Ratings FIFA por selección. Columnas: Name, Attack, Midfield, Defence, Overall.

    Returns
    -------
    pd.DataFrame
        DataFrame con las features FEATURES_PCA más id_partido, home_team, away_team.
        Filas sin match en df_ratings quedan con NaN y se descartan por el PCA.
    """
    ratings_cols = ['Name', 'Attack', 'Midfield', 'Defence', 'Overall', 'InternationalPrestige']
    ratings = df_ratings[ratings_cols]

    # Cruce doble: primero por equipo local, luego por visitante
    m1 = df_partidos.merge(ratings, left_on='home_team', right_on='Name', how='left', suffixes=('', '_home'))
    m2 = m1.merge(ratings,          left_on='away_team', right_on='Name', how='left', suffixes=('_home', '_away'))

    # Ajuste de ELO_match_rating: se divide por 2 para reflejar la media de ambos equipos
    m2['ELO_match_rating'] = m2['ELO_match_rating'] / 2

    # Features de diferencia y promedio
    m2['Attack_adv']    = abs((m2['Attack_home'] - m2['Defence_away']) - (m2['Attack_away'] - m2['Defence_home']))
    m2['Attack_diff']   = abs(m2['Attack_home']   - m2['Attack_away'])
    m2['Midfield_diff'] = abs(m2['Midfield_home'] - m2['Midfield_away'])
    m2['Defence_diff']  = abs(m2['Defence_home']  - m2['Defence_away'])
    m2['Mean_Attack']   = (m2['Attack_home']   + m2['Attack_away'])   / 2
    m2['Mean_Midfield'] = (m2['Midfield_home'] + m2['Midfield_away']) / 2
    m2['Mean_Defence']  = (m2['Defence_home']  + m2['Defence_away'])  / 2
    m2['Overall_Diff']  = abs(m2['Overall_home']  - m2['Overall_away'])

    return m2


# ─────────────────────────────────────────────────────────────────────────────
# Paso 4: PCA sobre features tácticas
# ─────────────────────────────────────────────────────────────────────────────
def aplicar_pca(df_features: pd.DataFrame) -> tuple[pd.DataFrame, PCA, np.ndarray]:
    """
    Estandariza las features tácticas y aplica PCA completo.

    La estandarización (media=0, std=1) es obligatoria antes del PCA para que
    ninguna feature domine por escala numérica (ej: Mean_Attack ~75 vs *_diff ~5).

    Parameters
    ----------
    df_features : pd.DataFrame
        DataFrame con al menos las columnas en FEATURES_PCA.

    Returns
    -------
    tuple[pd.DataFrame, PCA, np.ndarray]
        - Z_pca    : array con todos los componentes principales.
        - modelo   : objeto PCA ajustado (útil para inspeccionar loadings).
        - Z_scaled : matriz estandarizada (útil para diagnóstico).
    """
    X = df_features[FEATURES_PCA]

    scaler = StandardScaler()
    Z = scaler.fit_transform(X)

    modelo_pca = PCA()
    Z_pca = modelo_pca.fit_transform(Z)

    return Z_pca, modelo_pca, Z


# ─────────────────────────────────────────────────────────────────────────────
# Paso 5: Escalado e incorporación de PC1 y PC2 a la matriz final
# ─────────────────────────────────────────────────────────────────────────────
def incorporar_pca_a_matriz_scaled(
    df_partidos_raw: pd.DataFrame,
    df_scaled: pd.DataFrame,
    Z_pca: np.ndarray
) -> pd.DataFrame:
    """
    Escala PC1 y PC2 a [0, 1] y los une a la matriz de features escaladas.

    Usa MinMaxScaler independiente para cada componente para preservar la
    varianza relativa dentro de cada uno. El merge se hace por id_partido para
    garantizar alineación correcta, evitando errores de índice por ordenamiento.

    Parameters
    ----------
    df_partidos_raw : pd.DataFrame
        Matriz original de partidos (usada solo para extraer id_partido).
    df_scaled       : pd.DataFrame
        Matriz de partidos ya escalada (base sobre la que se agregan PC1/PC2).
    Z_pca           : np.ndarray
        Array de componentes PCA alineado con df_partidos_raw.

    Returns
    -------
    pd.DataFrame
        df_scaled enriquecido con PC1_Disparidad_scaled y PC2_Calidad_scaled.
    """
    # Asignar componentes crudos al DataFrame original para el merge seguro
    df_con_pca = df_partidos_raw[['id_partido']].copy()
    df_con_pca['PC1_Disparidad'] = Z_pca[:, 0]
    df_con_pca['PC2_Calidad']    = Z_pca[:, 1]

    # Cruce por id_partido para garantizar alineación correcta
    df_resultado = df_scaled.merge(
        df_con_pca[['id_partido', 'PC1_Disparidad', 'PC2_Calidad']],
        on='id_partido',
        how='left'
    )

    # Escalar cada componente a [0, 1] de forma independiente
    df_resultado['PC1_Disparidad_scaled'] = MinMaxScaler().fit_transform(
        df_resultado[['PC1_Disparidad']]
    )
    df_resultado['PC2_Calidad_scaled'] = MinMaxScaler().fit_transform(
        df_resultado[['PC2_Calidad']]
    )

    # Descartar columnas crudas; solo se exportan las versiones escaladas
    df_resultado.drop(columns=['PC1_Disparidad', 'PC2_Calidad'], inplace=True)

    return df_resultado


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline principal
# ─────────────────────────────────────────────────────────────────────────────
def construir_matriz_pca(
    path_html: str       = PATH_FIFA_HTML,
    path_partidos: str   = PATH_PARTIDOS,
    path_scaled: str     = PATH_PARTIDOS_SCALED,
    path_output: str     = PATH_OUTPUT,
    verbose: bool        = True
) -> pd.DataFrame:
    """
    Ejecuta el pipeline completo de construcción de la matriz con PCA.

    Orquesta los cinco pasos del módulo en orden:
        1. Extrae ratings FIFA desde HTML.
        2. Normaliza nombres de equipos en ambas fuentes.
        3. Cruza ratings con partidos y genera features comparativas.
        4. Aplica PCA sobre las features tácticas.
        5. Escala PC1/PC2 e incorpora a la matriz_scaled; exporta el CSV final.

    Parameters
    ----------
    path_html     : str   Ruta al HTML de ratings FIFA 26.
    path_partidos : str   Ruta a matriz_partidos.csv.
    path_scaled   : str   Ruta a matriz_partidos_scaled.csv.
    path_output   : str   Ruta de salida para el CSV final con PCA.
    verbose       : bool  Si True, imprime resumen del progreso y del PCA.

    Returns
    -------
    pd.DataFrame
        Matriz final con PC1_Disparidad_scaled y PC2_Calidad_scaled incorporados.
    """

    # ── Paso 1: Ratings FIFA ──────────────────────────────────────────────────
    if verbose:
        print("📥 [1/5] Extrayendo ratings FIFA desde HTML...")
    df_ratings = extraer_ratings_fifa(path_html)
    if verbose:
        print(f"       → {len(df_ratings)} selecciones extraídas.")

    # ── Paso 2: Normalización de nombres ─────────────────────────────────────
    if verbose:
        print("🔤 [2/5] Normalizando nombres de equipos...")
    df_partidos = pd.read_csv(path_partidos)
    df_partidos = normalizar_nombres_equipos(df_partidos, ['home_team', 'away_team'])

    # ── Paso 3: Features por partido ─────────────────────────────────────────
    if verbose:
        print("⚙️  [3/5] Construyendo features comparativas por partido...")
    df_features = construir_features_partido(df_partidos, df_ratings)
    if verbose:
        nas = df_features[FEATURES_PCA].isna().any(axis=1).sum()
        print(f"       → {len(df_features)} partidos procesados | {nas} sin match en ratings FIFA.")

    # ── Paso 4: PCA ──────────────────────────────────────────────────────────
    if verbose:
        print("📐 [4/5] Aplicando PCA sobre features tácticas...")
    Z_pca, modelo_pca, _ = aplicar_pca(df_features)

    if verbose:
        var_exp = modelo_pca.explained_variance_ratio_
        print(f"       → PC1 explica {var_exp[0]:.1%} de la varianza "
              f"| PC2 explica {var_exp[1]:.1%} "
              f"| Acumulado PC1+PC2: {var_exp[:2].sum():.1%}")

    # ── Paso 5: Incorporar a matriz_scaled y exportar ─────────────────────────
    if verbose:
        print("💾 [5/5] Incorporando PCA a la matriz escalada y exportando...")
    df_scaled = pd.read_csv(path_scaled)
    df_final  = incorporar_pca_a_matriz_scaled(df_partidos, df_scaled, Z_pca)
    df_final.to_csv(path_output, index=False, encoding='utf-8')

    if verbose:
        print(f"       → Exportado: {path_output}")
        print(f"       → Shape final: {df_final.shape}")
        nuevas_cols = ['PC1_Disparidad_scaled', 'PC2_Calidad_scaled']
        print(f"\n{'Columna':<30} {'Min':>8} {'Max':>8} {'Media':>10}")
        print("-" * 60)
        for col in nuevas_cols:
            print(f"{col:<30} {df_final[col].min():>8.4f} {df_final[col].max():>8.4f} {df_final[col].mean():>10.4f}")
        print("\n✅ Pipeline completado con éxito.")

    return df_final


# ─────────────────────────────────────────────────────────────────────────────
# Ejecución directa
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":

    df_resultado = construir_matriz_pca(verbose=True)

    # Vista previa de las nuevas columnas en los primeros partidos
    print("\nVista previa (primeras 5 filas):")
    preview_cols = ['id_partido', 'PC1_Disparidad_scaled', 'PC2_Calidad_scaled']
    print(df_resultado[preview_cols].head(5).to_string(index=False))
"""
players_scraper.py
==================
Scraper de planteles de selecciones nacionales desde Transfermarkt.

Lógica central del módulo:
  - Recorre una lista configurable de selecciones nacionales y obtiene para
    cada una el plantel completo desde Transfermarkt (jugador, posición, edad,
    club y valor de mercado).

  - Incorpora una pausa antiban configurable entre peticiones para evitar
    bloqueos por comportamiento de scraping agresivo.

  - Consolida todos los planteles en un único DataFrame, aplica limpieza y
    normalización (edad numérica, valor de mercado en millones de €) y exporta
    dos archivos: un JSON por país y un CSV unificado.

Dependencias:
    requests, bs4 (BeautifulSoup), pandas

Output:
    data/json/jugadores_todos_los_paises.json — Planteles por país en formato JSON
    data/jugadores_todos_los_paises.csv       — DataFrame unificado y limpio

Columnas del CSV de salida:
    Country, Player, Position, Age (int), Club, Market Value (float, millones €)
"""

import os
import json
import time

import requests
import pandas as pd
from bs4 import BeautifulSoup


# ─────────────────────────────────────────────────────────────────────────────
# Constantes
# ─────────────────────────────────────────────────────────────────────────────
_DIR = os.path.dirname(os.path.abspath(__file__))

PATH_OUTPUT_JSON = os.path.abspath(os.path.join(_DIR, "..", "data", "json", "jugadores_todos_los_paises.json"))
PATH_OUTPUT_CSV  = os.path.abspath(os.path.join(_DIR, "..", "data", "jugadores_todos_los_paises.csv"))

# Cabecera obligatoria para evitar bloqueo inmediato por Transfermarkt
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

# Pausa en segundos entre peticiones (antiban)
PAUSA_ENTRE_PETICIONES = 2

# Base URL de Transfermarkt
BASE_URL = "https://www.transfermarkt.com/{cod}/startseite/verein/{id_pais}"

# Lista de selecciones: (nombre_display, id_transfermarkt, codigo_url)
SELECCIONES = [
    ("France",              3377,  "frankreich"),
    ("England",             3299,  "england"),
    ("Spain",               3375,  "spanien"),
    ("Germany",             3262,  "deutschland"),
    ("Portugal",            3300,  "portugal"),
    ("Brazil",              3439,  "brasilien"),
    ("Netherlands",         3379,  "niederlande"),
    ("Argentina",           3437,  "argentinien"),
    ("Norway",              3440,  "norwegen"),
    ("Belgium",             3382,  "belgien"),
    ("Turkey",              3381,  "turkei"),
    ("Côte d'Ivoire",       3591,  "elfenbeinkuste"),
    ("Senegal",             3499,  "senegal"),
    ("Sweden",              3557,  "schweden"),
    ("Uruguay",             3449,  "uruguay"),
    ("USA",                 3505,  "vereinigte-staaten"),
    ("Croatia",             3556,  "kroatien"),
    ("Switzerland",         3384,  "schweiz"),
    ("Colombia",            3816,  "kolumbien"),
    ("Ghana",               3441,  "ghana"),
    ("Japan",               3435,  "japan"),
    ("Austria",             3383,  "osterreich"),
    ("Ecuador",             5750,  "ecuador"),
    ("Morocco",             3575,  "marokko"),
    ("Algeria",             3614,  "algerien"),
    ("Canada",              3510,  "kanada"),
    ("Scotland",            3380,  "schottland"),
    ("Czechia",             3445,  "tschechien"),
    ("Congo DR",            3854,  "demokratische-republik-kongo"),
    ("Korea Republic",      3589,  "sudkorea"),
    ("Bosnia-Herzegovina",  3446,  "bosnien-herzegowina"),
    ("Paraguay",            3581,  "paraguay"),
    ("Egypt",               3672,  "agypten"),
    ("Mexico",              6303,  "mexiko"),
    ("Uzbekistan",          3563,  "usbekistan"),
    ("Tunisia",             3670,  "tunesien"),
    ("Cabo Verde",          4311,  "kap-verde"),
    ("Haiti",               14161, "haiti"),
    ("South Africa",        3806,  "sudafrika"),
    ("Australia",           3433,  "australien"),
    ("IR Iran",             3582,  "iran"),
    ("New Zealand",         9171,  "neuseeland"),
    ("Panama",              3577,  "panama"),
    ("Curaçao",             32364, "curacao"),
    ("Saudi Arabia",        3807,  "saudi-arabien"),
    ("Qatar",               14162, "katar"),
    ("Iraq",                3560,  "irak"),
    ("Jordan",              15737, "jordanien"),
]


# ─────────────────────────────────────────────────────────────────────────────
# Scraping
# ─────────────────────────────────────────────────────────────────────────────
def scraper_plantel(url: str, nombre_pais: str) -> pd.DataFrame | None:
    """
    Obtiene el plantel de una selección nacional desde Transfermarkt.

    Realiza una petición GET a la URL indicada, parsea la tabla HTML con clase
    'items' y extrae para cada jugador: dorsal, nombre, posición, edad, club
    y valor de mercado (como string crudo, sin procesar).

    Parameters
    ----------
    url         : str  URL de la página del equipo en Transfermarkt.
    nombre_pais : str  Nombre del país (solo para mensajes de log).

    Returns
    -------
    pd.DataFrame | None
        DataFrame con columnas [Player, Position, Age, Club, Market Value],
        o None si la petición falla o no se encuentra la tabla de jugadores.
    """
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"  ✗ Error al conectar con {nombre_pais}: {e}")
        return None

    soup  = BeautifulSoup(response.text, "html.parser")
    tabla = soup.find("table", class_="items")

    if not tabla:
        print(f"  ✗ No se encontró la tabla de jugadores para {nombre_pais}.")
        return None

    tbody = tabla.find("tbody")
    registros = []

    for fila in tbody.find_all("tr", recursive=False):
        columnas = fila.find_all("td", recursive=False)

        if len(columnas) < 5:
            continue

        # Celda del jugador: nombre en .hauptlink, posición en la segunda fila
        celda_jugador = columnas[1]
        td_nombre     = celda_jugador.find("td", class_="hauptlink")

        if not td_nombre:
            continue

        nombre   = td_nombre.get_text(strip=True)
        posicion = celda_jugador.find_all("tr")[1].get_text(strip=True)
        edad     = columnas[2].get_text(strip=True)

        img_club = columnas[3].find("img")
        club = (
            img_club["title"]
            if img_club and "title" in img_club.attrs
            else "Libre/Sin Club"
        )

        valor_mercado = columnas[4].get_text(strip=True)

        registros.append({
            "Player":       nombre,
            "Position":     posicion,
            "Age":          edad,
            "Club":         club,
            "Market Value": valor_mercado,
        })

    return pd.DataFrame(registros) if registros else None


# ─────────────────────────────────────────────────────────────────────────────
# Limpieza y normalización
# ─────────────────────────────────────────────────────────────────────────────
def limpiar_valor_mercado(valor: str) -> float:
    """
    Convierte el valor de mercado de string a float en millones de euros.

    Maneja los formatos que usa Transfermarkt:
      - '€45.00m'  → 45.0
      - '€500k'    → 0.5
      - '-' / NaN  → 0.0

    Parameters
    ----------
    valor : str  String de valor de mercado tal como viene del HTML.

    Returns
    -------
    float  Valor en millones de euros. 0.0 si no es parseable.
    """
    if pd.isna(valor):
        return 0.0

    valor = str(valor).replace("€", "").replace(",", "").strip().lower()

    if "m" in valor:
        return float(valor.replace("m", ""))
    elif "k" in valor:
        return float(valor.replace("k", "")) / 1000
    else:
        try:
            return float(valor)
        except ValueError:
            return 0.0


def limpiar_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aplica todas las transformaciones de limpieza al DataFrame unificado.

    Transformaciones:
      - Age          : extrae el número entre paréntesis y convierte a int.
                       Ej: "27 (27)" → 27
      - Market Value : convierte de string a float en millones via
                       `limpiar_valor_mercado`.

    Parameters
    ----------
    df : pd.DataFrame  DataFrame con columnas Country, Player, Position,
                       Age (str), Club, Market Value (str).

    Returns
    -------
    pd.DataFrame  Mismo DataFrame con Age como int y Market Value como float.
    """
    df = df.copy()

    df["Age"] = (
        df["Age"]
        .str.extract(r"\((\d+)\)")
        .astype(int)
    )

    df["Market Value"] = df["Market Value"].apply(limpiar_valor_mercado)

    return df


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline principal
# ─────────────────────────────────────────────────────────────────────────────
def scrapear_planteles(
    selecciones: list[tuple]  = SELECCIONES,
    path_json: str            = PATH_OUTPUT_JSON,
    path_csv: str             = PATH_OUTPUT_CSV,
    pausa: float              = PAUSA_ENTRE_PETICIONES,
    verbose: bool             = True,
) -> pd.DataFrame:
    """
    Ejecuta el pipeline completo de scraping, limpieza y exportación.

    Pasos:
        1. Recorre la lista de selecciones y llama a `scraper_plantel` por cada una.
        2. Consolida los resultados en un dict por país y en una lista para el DataFrame.
        3. Exporta el dict al JSON de salida.
        4. Construye el DataFrame unificado, aplica limpieza y exporta el CSV.

    Parameters
    ----------
    selecciones : list[tuple]  Lista de tuplas (nombre, id, codigo_url).
    path_json   : str          Ruta de salida para el JSON por país.
    path_csv    : str          Ruta de salida para el CSV unificado.
    pausa       : float        Segundos de espera entre peticiones (antiban).
    verbose     : bool         Si True, imprime progreso por país.

    Returns
    -------
    pd.DataFrame
        DataFrame limpio con todos los jugadores y columna Country incluida.
        Columnas: Country, Player, Position, Age (int), Club, Market Value (float).
    """
    diccionario_json = {}
    lista_jugadores  = []
    errores          = []

    if verbose:
        print(f"🌍 Iniciando scraping de {len(selecciones)} selecciones...\n")

    for nombre, id_pais, cod in selecciones:
        url = BASE_URL.format(cod=cod.lower(), id_pais=id_pais)
        df_pais = scraper_plantel(url, nombre)

        if df_pais is not None and not df_pais.empty:
            diccionario_json[nombre] = df_pais.to_dict(orient="records")

            # Agregar columna Country antes de acumular
            df_pais_con_pais = df_pais.copy()
            df_pais_con_pais.insert(0, "Country", nombre)
            lista_jugadores.append(df_pais_con_pais)

            if verbose:
                print(f"  ✓ {nombre:<25} ({len(df_pais)} jugadores)")
        else:
            errores.append(nombre)

        time.sleep(pausa)

    # ── Exportar JSON ─────────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(path_json), exist_ok=True)
    with open(path_json, "w", encoding="utf-8") as f:
        json.dump(diccionario_json, f, ensure_ascii=False, indent=4)

    if verbose:
        print(f"\n💾 JSON exportado: {path_json}")

    # ── Construir y limpiar DataFrame unificado ───────────────────────────────
    df_unificado = pd.concat(lista_jugadores, ignore_index=True)
    df_limpio    = limpiar_dataframe(df_unificado)

    # ── Exportar CSV ──────────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(path_csv), exist_ok=True)
    df_limpio.to_csv(path_csv, index=False, encoding="utf-8")

    if verbose:
        print(f"💾 CSV exportado:  {path_csv}")
        print(f"\n{'─'*50}")
        print(f"✅ Proceso completado.")
        print(f"   Selecciones scrapeadas : {len(diccionario_json)}/{len(selecciones)}")
        print(f"   Jugadores totales      : {len(df_limpio)}")
        if errores:
            print(f"   ⚠️  Con errores          : {', '.join(errores)}")

    return df_limpio


# ─────────────────────────────────────────────────────────────────────────────
# Ejecución directa
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":

    df_jugadores = scrapear_planteles(verbose=True)

    print("\nVista previa (5 jugadores):")
    print(df_jugadores.head(5).to_string(index=False))

    print("\nDistribución por país (top 10 por valor de mercado medio):")
    resumen = (
        df_jugadores
        .groupby("Country")["Market Value"]
        .mean()
        .sort_values(ascending=False)
        .head(10)
        .reset_index()
    )
    resumen.columns = ["País", "Valor Medio (M€)"]
    print(resumen.to_string(index=False))
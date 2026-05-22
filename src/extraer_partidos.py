import os
import requests
import pandas as pd
from dotenv import load_dotenv

# ── Configuración ──────────────────────────────────────────────────────────────
load_dotenv()

BASE_URL = "https://api.wc2026api.com"
API_KEY = os.getenv("WC2026_API_KEY")

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Accept": "application/json",
}

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "partidos_primera_ronda.csv")


# ── Extracción ─────────────────────────────────────────────────────────────────
def obtener_partidos_grupo() -> list[dict]:
    """Consulta la API y retorna los partidos de fase de grupos."""
    print("Consultando la API de wc2026api.com...")
    url = f"{BASE_URL}/matches"

    respuesta = requests.get(url, headers=HEADERS)
    respuesta.raise_for_status()

    datos = respuesta.json()

    partidos = [p for p in datos if p.get("round") == "group"]

    if not partidos:
        raise ValueError("No se encontraron partidos de fase de grupos en la respuesta.")

    print(f"  → {len(partidos)} partidos encontrados.")
    return partidos


# ── Transformación ─────────────────────────────────────────────────────────────
def transformar(partidos: list[dict]) -> pd.DataFrame:
    """Limpia y transforma la lista de partidos en un DataFrame."""
    df = pd.DataFrame(partidos)

    # Eliminar columnas innecesarias
    columnas_a_eliminar = [
        "home_team_flag",
        "away_team_flag",
        "home_score",
        "away_score",
        "home_pen",
        "away_pen",
        "round",
        "status",
    ]
    df = df.drop(columns=[c for c in columnas_a_eliminar if c in df.columns])

    # Separar fecha y hora UTC
    df["kickoff_utc"] = pd.to_datetime(df["kickoff_utc"])
    df["date"] = df["kickoff_utc"].dt.strftime("%Y-%m-%d")
    df["time_utc"] = df["kickoff_utc"].dt.strftime("%H:%M:%S")
    df = df.drop(columns=["kickoff_utc"])

    df = df.sort_values(by=["date", "time_utc"]).reset_index(drop=True)

    return df


# ── Carga ──────────────────────────────────────────────────────────────────────
def guardar(df: pd.DataFrame, path: str) -> None:
    """Guarda el DataFrame como CSV en la ruta indicada."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(path, index=False)
    print(f"  → Guardado en '{path}'  ({len(df)} filas)")


# ── Entrypoint ─────────────────────────────────────────────────────────────────
def main():
    if not API_KEY:
        raise EnvironmentError("La variable WC2026_API_KEY no está definida en el .env")

    partidos = obtener_partidos_grupo()
    df = transformar(partidos)
    guardar(df, OUTPUT_PATH)
    print("¡Proceso completado!")


if __name__ == "__main__":
    main()
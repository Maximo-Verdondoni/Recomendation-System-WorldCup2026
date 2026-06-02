"""
recomendacion_pca_negativos.py
==============================
Sistema de recomendación de partidos del Mundial FIFA 2026.

Lógica central del módulo:
  - Calcula un score de recomendación [0, 1] para cada uno de los 72 partidos
    de la primera fase, combinando métricas ELO históricas, componentes PCA
    derivados de los ratings del juego FIFA 2026, y las preferencias personales
    del usuario (horario disponible, selección favorita, pesos temáticos).

  - Soporta pesos negativos: un peso negativo invierte la feature asociada,
    permitiendo perfiles como "quiero ver goleadas" (w_paridad < 0) o
    "prefiero partidos de semana" (w_fin_de_semana < 0).

  - Clasifica cada partido en una de tres categorías usando umbrales híbridos
    (percentil + mínimo fijo) para garantizar distribución razonable.

Dependencias:
    pandas, numpy, matplotlib, seaborn, os

Input:
    data/matriz_partidos_scaled_pca.csv — Matriz de features escaladas con PCA

Columnas requeridas en el DataFrame de entrada:
    home_team, away_team, day_of_week_num, is_weekend, match_hora_utc,
    ELO_match_rating_scaled, ELO_diff_scaled,
    match_value_scaled, match_value_diff_scaled,
    PC1_Disparidad_scaled, PC2_Calidad_scaled
"""

import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns


# ─────────────────────────────────────────────────────────────────────────────
# Constante: peso fijo del horario libre
# ─────────────────────────────────────────────────────────────────────────────
# El horario libre no se expone como parámetro al usuario porque si el usuario
# configuró su agenda, el sistema asume que quiere verlos en ese horario.
# El valor 20 representa ~10% del peso total en un perfil típico.
# Disponibilidad se calcula como:
#   1.0 → puede ver el partido entero  (primer Y segundo tiempo en su agenda)
#   0.5 → puede ver solo un tiempo     (primer O segundo tiempo en su agenda)
#   0.0 → no puede ver el partido
PESO_HORARIO_LIBRE = 20.0


def recomendar_partidos(df_partidos: pd.DataFrame, perfil_usuario: dict) -> pd.DataFrame:
    """
    Calcula un score de recomendación para cada partido y clasifica en categorías.

    Algoritmo:
        1. Calcula `feature_disponibilidad` para cada partido según el horario
           local del usuario (con corrección de zona horaria y desbordamiento
           de medianoche). Verifica si el usuario puede ver primer tiempo,
           segundo tiempo, o ambos.

        2. Normaliza los pesos del usuario usando la suma de sus valores
           absolutos. Aplica el signo de cada peso para decidir si se usa
           la feature directa (peso > 0) o su inversa 1-feature (peso < 0).

        3. Calcula el score como combinación lineal ponderada de 7 features:
           nacionalidad, calidad ELO, paridad ELO, calidad FIFA (PC2),
           paridad FIFA (PC1), fin de semana y disponibilidad horaria.

        4. Clasifica usando umbrales híbridos:
           - p_alta  = max(percentil 85 del score, 0.65) → "Imperdible"
           - p_media = max(percentil 50 del score, 0.45) → "Vale la pena"
           - resto                                        → "Para ver el resumen"

    Parameters
    ----------
    df_partidos : pd.DataFrame
        Matriz de partidos con features escaladas. Debe indexarse por id_partido.
        Columnas requeridas: home_team, away_team, day_of_week_num, is_weekend,
        match_hora_utc, ELO_match_rating_scaled, ELO_diff_scaled,
        match_value_scaled, match_value_diff_scaled,
        PC1_Disparidad_scaled, PC2_Calidad_scaled.

    perfil_usuario : dict
        Diccionario con la configuración del usuario. Estructura:
        {
            "nacionalidad": str,      # Nombre de la selección (inglés, puede ser "")
            "utc_offset":   int,      # Diferencia horaria con UTC (ej: -3 para Argentina)
            "pesos": {
                "w_nacionalidad":  float,  # Que juegue mi selección. Neg → penaliza
                "w_calidad_elo":   float,  # Nivel ELO del partido.   Neg → quiere peores
                "w_paridad_elo":   float,  # Paridad ELO.             Neg → quiere goleadas
                "w_calidad_fifa":  float,  # Calidad táctica (PC2).   Neg → quiere peores
                "w_paridad_fifa":  float,  # Paridad táctica (PC1).   Neg → quiere goleadas
                "w_fin_de_semana": float,  # Bonus fin de semana.     Neg → prefiere semana
            },
            "horario_libre": {
                int: list[int],  # día (0=Lun…6=Dom) → horas locales disponibles
            }
        }

    Returns
    -------
    pd.DataFrame
        DataFrame ordenado por Score_Recomendacion descendente con columnas adicionales:
        - feature_disponibilidad : float  (0.0, 0.5 o 1.0)
        - feature_nacionalidad   : float  (0.0 o 1.0)
        - Score_Recomendacion    : float  [0, 1]
        - Categoria              : str    ("Imperdible 🌟" | "Vale la pena 📺" | "Para ver el resumen 📱")
    """

    df = df_partidos.copy()

    # ─────────────────────────────────────────────────────────────────────────
    # PASO 1: Feature de disponibilidad horaria
    # ─────────────────────────────────────────────────────────────────────────
    def verificar_disponibilidad(row: pd.Series) -> float:
        """
        Determina si el usuario puede ver el partido según su zona horaria
        y horario disponible.

        Convierte la hora UTC del partido a hora local del usuario,
        manejando desbordamiento de medianoche (hora_utc + offset puede
        salir del rango [0, 23], lo que implica cambio de día).

        Verifica la disponibilidad para el primer tiempo (hora_inicio)
        y el segundo tiempo (hora_inicio + 1h). Retorna:
            1.0 → usuario disponible para ambos tiempos
            0.5 → usuario disponible solo para uno de los dos tiempos
            0.0 → usuario no disponible

        Parameters
        ----------
        row : pd.Series  Fila del DataFrame con match_hora_utc y day_of_week_num.

        Returns
        -------
        float  0.0, 0.5 o 1.0
        """
        utc_offset = perfil_usuario.get('utc_offset', -3)
        hora_utc = row['match_hora_utc']
        dia_utc  = row['day_of_week_num']

        # Corrección de zona horaria con manejo de overflow de medianoche
        hora_local_bruta = hora_utc + utc_offset
        hora_1 = hora_local_bruta % 24

        if hora_local_bruta >= 24:
            dia_1 = (dia_utc + 1) % 7   # Cruza medianoche hacia el día siguiente
        elif hora_local_bruta < 0:
            dia_1 = (dia_utc - 1) % 7   # Cruza medianoche hacia el día anterior
        else:
            dia_1 = dia_utc

        # Segundo tiempo: una hora después del inicio
        hora_2 = (hora_1 + 1) % 24
        dia_2  = (dia_1 + 1) % 7 if hora_2 < hora_1 else dia_1

        puede_ver_primer_tiempo   = hora_1 in perfil_usuario['horario_libre'].get(dia_1, [])
        puede_ver_segundo_tiempo  = hora_2 in perfil_usuario['horario_libre'].get(dia_2, [])

        if puede_ver_primer_tiempo and puede_ver_segundo_tiempo:
            return 1.0
        elif puede_ver_primer_tiempo or puede_ver_segundo_tiempo:
            return 0.5
        else:
            return 0.0

    df['feature_disponibilidad'] = df.apply(verificar_disponibilidad, axis=1)

    # ─────────────────────────────────────────────────────────────────────────
    # PASO 2: Normalización de pesos con soporte de signos
    # ─────────────────────────────────────────────────────────────────────────
    # Se trabaja sobre una copia para no mutar el perfil original del usuario.
    # El peso del horario libre se agrega siempre con valor fijo (no configurable).
    pesos_crudos = perfil_usuario.get('pesos', {}).copy()
    pesos_crudos['w_horario_libre'] = PESO_HORARIO_LIBRE

    # Normalización por suma de valores absolutos (permite cualquier escala de pesos)
    suma_total = sum(abs(v) for v in pesos_crudos.values())
    if suma_total == 0:
        suma_total = 1

    pesos_norm = {k: abs(v) / suma_total for k, v in pesos_crudos.items()}

    # Signos: determinan si se usa feature directa (+) o invertida (-)
    signos = {k: (1 if v >= 0 else -1) for k, v in pesos_crudos.items()}

    # Feature de nacionalidad: 1.0 si el equipo favorito juega, 0.0 si no
    pais_usuario = perfil_usuario.get('nacionalidad', '')
    df['feature_nacionalidad'] = (
        (df['home_team'] == pais_usuario) | (df['away_team'] == pais_usuario)
    ).astype(float)

    # ─────────────────────────────────────────────────────────────────────────
    # PASO 3: Cálculo del score final
    # ─────────────────────────────────────────────────────────────────────────
    def aplicar_logica(peso_key: str, feature_directa: pd.Series, feature_inversa: pd.Series) -> pd.Series:
        """
        Aplica la feature correcta según el signo del peso del usuario.

        Si el usuario puso un peso positivo → se premia la feature directa.
        Si el usuario puso un peso negativo → se premia lo opuesto (feature invertida).

        Ejemplo:
            w_paridad_elo > 0: premia partidos parejos  (1 - ELO_diff)
            w_paridad_elo < 0: premia partidos dispares (ELO_diff)

        Parameters
        ----------
        peso_key       : str        Clave del diccionario de pesos.
        feature_directa: pd.Series  Feature tal como está en la matriz.
        feature_inversa: pd.Series  Complemento de la feature (1 - feature).

        Returns
        -------
        pd.Series  Contribución ponderada al score.
        """
        peso  = pesos_norm.get(peso_key, 0)
        signo = signos.get(peso_key, 1)
        return peso * (feature_directa if signo > 0 else feature_inversa)

    df['Score_Recomendacion'] = (
        # Nacionalidad: premia si juega mi equipo (neg → premia si NO juega)
        aplicar_logica('w_nacionalidad', df['feature_nacionalidad'],  1 - df['feature_nacionalidad']) +

        # Calidad ELO: premia partidos de alto nivel histórico
        aplicar_logica('w_calidad_elo',  df['ELO_match_rating_scaled'], 1 - df['ELO_match_rating_scaled']) +

        # Paridad ELO: ELO_diff_scaled alto = partido desparejo
        #   Directo (pos) → 1 - diff = premia parejos
        #   Inverso (neg) → diff     = premia dispares (goleadas)
        aplicar_logica('w_paridad_elo',  1 - df['ELO_diff_scaled'],  df['ELO_diff_scaled']) +

        # Calidad FIFA (PC2): alto = equipos de mayor nivel táctico promedio
        aplicar_logica('w_calidad_fifa', df['PC2_Calidad_scaled'],   1 - df['PC2_Calidad_scaled']) +

        # Paridad FIFA (PC1): PC1 alto = partido tácticamente desparejo
        #   Directo (pos) → 1 - PC1 = premia parejos
        #   Inverso (neg) → PC1     = premia dispares
        aplicar_logica('w_paridad_fifa', 1 - df['PC1_Disparidad_scaled'], df['PC1_Disparidad_scaled']) +

        # Fin de semana: premia sábado/domingo (neg → premia lunes a viernes)
        aplicar_logica('w_fin_de_semana', df['is_weekend'],          1 - df['is_weekend']) +

        # Horario libre: siempre positivo, peso fijo proporcional al perfil
        (pesos_norm.get('w_horario_libre', 0) * df['feature_disponibilidad'])
    )

    # ─────────────────────────────────────────────────────────────────────────
    # PASO 4: Clasificación por categorías con umbrales híbridos
    # ─────────────────────────────────────────────────────────────────────────
    # Umbrales híbridos: percentil adaptado al usuario + mínimo fijo global.
    # - El percentil garantiza distribución razonable para perfiles típicos.
    # - El mínimo fijo evita inflar categorías superiores en perfiles extremos.
    q_alta  = df['Score_Recomendacion'].quantile(0.85)
    q_media = df['Score_Recomendacion'].quantile(0.50)

    p_alta  = max(q_alta,  0.65)   # Umbral "Imperdible"
    p_media = max(q_media, 0.45)   # Umbral "Vale la pena"

    def categorizar_partido(score: float) -> str:
        if score >= p_alta:
            return "Imperdible 🌟"
        elif score >= p_media:
            return "Vale la pena 📺"
        else:
            return "Para ver el resumen 📱"

    df['Categoria'] = df['Score_Recomendacion'].apply(categorizar_partido)

    # ─────────────────────────────────────────────────────────────────────────
    # PASO 5: Ordenar por score descendente
    # ─────────────────────────────────────────────────────────────────────────
    return df.sort_values(by='Score_Recomendacion', ascending=False)


# ─────────────────────────────────────────────────────────────────────────────
# Ejecución de ejemplo
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":

    # 1. Buscamos dónde está ubicado EXACTAMENTE este archivo script
    directorio_script = os.path.dirname(os.path.abspath(__file__))
    
    # 2. Construimos la ruta absoluta hacia la carpeta 'data'
    ruta_csv = os.path.join(directorio_script, "..", "data", "matriz_partidos_scaled_pca.csv")
    ruta_csv = os.path.abspath(ruta_csv)

    # Cargar la matriz de partidos final (con features ELO + PCA escaladas)
    matriz_partidos = pd.read_csv(
        ruta_csv,
        index_col="id_partido"
    )

    # ── Perfil de ejemplo: fanático del fútbol parejo, mira de noche ─────────
    # Calidad y paridad se expresan como una sola variable que el usuario setea,
    # y se divide por 2 entre ELO y FIFA para no sobreponderar ninguna fuente.
    peso_calidad = 80
    peso_paridad = 60

    usuario_ejemplo = {
        "nacionalidad": "Argentina",
        "utc_offset": -3,
        "pesos": {
            "w_nacionalidad":  35,
            "w_calidad_elo":   peso_calidad / 2,  # 50% de la calidad → ELO
            "w_paridad_elo":   peso_paridad / 2,  # 50% de la paridad → ELO
            "w_calidad_fifa":  peso_calidad / 2,  # 50% de la calidad → FIFA
            "w_paridad_fifa":  peso_paridad / 2,  # 50% de la paridad → FIFA
            "w_fin_de_semana": 10,
        },
        "horario_libre": {
            0: [18, 19, 20, 21, 22],
            1: [18, 19, 20, 21, 22],
            2: [18, 19, 20, 21, 22],
            3: [18, 19, 20, 21, 22],
            4: [18, 19, 20, 21, 22],
            5: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
            6: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
        }
    }

    # Ejecutar el recomendador
    df_recomendaciones = recomendar_partidos(matriz_partidos, usuario_ejemplo)

    # Mostrar top 10
    columnas_vista = ['home_team', 'away_team', 'Score_Recomendacion',
                      'Categoria', 'match_hora_utc', 'day_of_week_num']

    print("🏆 TOP 10 PARTIDOS RECOMENDADOS:")
    print(f"Perfil: {usuario_ejemplo['nacionalidad']} | "
          f"Calidad={peso_calidad} | Paridad={peso_paridad}\n")
    print(df_recomendaciones[columnas_vista].head(10).to_string(index=False))

    print("\nDistribución de categorías:")
    print(df_recomendaciones["Categoria"].value_counts().to_string())

    # ── Gráfico de distribución de scores ─────────────────────────────────────
    plt.figure(figsize=(10, 6))
    sns.histplot(
        df_recomendaciones['Score_Recomendacion'],
        bins=15, kde=True, color='#2ecc71', edgecolor='black'
    )
    promedio = df_recomendaciones['Score_Recomendacion'].mean()
    plt.axvline(promedio, color='red', linestyle='dashed', linewidth=2,
                label=f'Promedio ({promedio:.2f})')
    plt.title('Distribución de Scores de Recomendación', fontsize=16, pad=15)
    plt.xlabel('Score de Recomendación', fontsize=12)
    plt.ylabel('Cantidad de Partidos', fontsize=12)
    plt.legend()
    plt.grid(axis='y', linestyle='--', alpha=0.7)
    plt.tight_layout()
    plt.show()
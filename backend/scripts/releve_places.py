"""Relève les codes de place que le fournisseur renvoie réellement.

Écrit `releve_places.json` : ticker → code d'`exchange` tel que yfinance le rend.
Sert à remplir `frontend/src/lib/placesBoursieres.ts` avec des codes constatés
plutôt que devinés — un code inventé ne se voit pas, il rend juste un drapeau
absent.

    backend/venv/bin/python3 backend/scripts/releve_places.py
"""

import json
import sys
import time
from pathlib import Path

import yfinance as yf

# Un représentant par place à couvrir, choisi parmi les plus gros titres cotés :
# une petite capitalisation aurait pu être retirée de la cote depuis.
TITRES = [
    # Asie — les absentes des deux tables
    "2330.TW", "2317.TW",           # Taïwan
    "6488.TWO",                     # Taipei Exchange (hors marché principal)
    "005930.KS", "000660.KS",       # Corée, KOSPI
    "247540.KQ",                    # Corée, KOSDAQ
    "D05.SI", "O39.SI",             # Singapour
    "0700.HK", "7203.T", "9984.T",  # Hong Kong, Tokyo
    "600519.SS", "000001.SZ",       # Chine continentale
    "RELIANCE.NS", "INFY.BO",       # Inde
    # Europe du Nord — les autres absentes
    "VOLV-B.ST", "ERIC-B.ST",       # Suède
    "NOVO-B.CO", "MAERSK-B.CO",     # Danemark
    "EQNR.OL", "DNB.OL",            # Norvège
    "NOKIA.HE", "NDA-FI.HE",        # Finlande
    # Europe — places déjà partiellement couvertes, à confirmer
    "ABI.BR", "KBC.BR",             # Belgique
    "EDP.LS",                       # Portugal
    "OMV.VI",                       # Autriche
    "KRZ.IR",                       # Irlande
    "ASML.AS", "MC.PA",             # Amsterdam, Paris
    "SIE.DE", "SIE.F",              # Xetra, Francfort
    "SAN.MC", "ENI.MI",             # Madrid, Milan
    "NESN.SW", "NOVN.SW",           # Suisse
    "HSBA.L", "SHEL.L",             # Londres
    "GL9.IR", "A5G.IR",             # Irlande, pour confirmer `ISE` contre `DUB`
    "8306.T", "BNS.TO",             # Tokyo et Toronto, contre `TYO` et `TSX`
    "UBSG.SW", "ZURN.SW",           # Suisse, contre `SWX`
    # Amériques et Océanie
    "AAPL", "JPM",                  # Nasdaq, NYSE
    "SPY", "VOO", "IWM", "EWJ",     # fonds cotés — la place diffère du titre
    "ARKK", "QQQ",
    "SIRI", "PLUG", "RIOT", "MARA", # petites et moyennes capitalisations
    "FCEL", "GPRO", "SOFI", "LCID",
    "BB", "IONQ",
    "NTDOY",                        # certificat hors cote
    "SONY", "TM",                   # certificats cotés à New York
    "RY.TO", "SHOP.TO",             # Toronto
    "PETR4.SA",                     # Brésil
    "BHP.AX", "CBA.AX",             # Australie
    "AIR.NZ",                       # Nouvelle-Zélande
]


def releve() -> dict[str, dict[str, str | None]]:
    """Pour chaque titre : le code de place et le nom de pays, tels qu'ils sortent.

    Les deux ensemble et non deux relevés séparés : ils viennent du même appel, et
    c'est leur **mélange de vocabulaires** qui compte pour l'interface. Le pays sort
    en anglais — « Switzerland » —, la place en code court — « EBS » —, et la
    ventilation géographique reçoit les deux dans la même liste.
    """
    resultat: dict[str, dict[str, str | None]] = {}
    for i, t in enumerate(TITRES):
        try:
            info = yf.Ticker(t).info
            fiche = {"place": info.get("exchange"), "pays": info.get("country")}
        except Exception as e:  # noqa: BLE001 — un titre injoignable ne doit pas tout arrêter
            print(f"{t:14} ✗ {type(e).__name__}: {e}", file=sys.stderr)
            fiche = {"place": None, "pays": None}
        resultat[t] = fiche
        print(f"{t:14} {fiche['place']!r:8} {fiche['pays']!r}", flush=True)
        if i < len(TITRES) - 1:
            time.sleep(0.4)
    return resultat


if __name__ == "__main__":
    tout = releve()
    sortie = Path(__file__).with_name("releve_places.json")
    sortie.write_text(json.dumps(tout, indent=2, ensure_ascii=False), "utf8")
    print(f"\n→ {sortie}")

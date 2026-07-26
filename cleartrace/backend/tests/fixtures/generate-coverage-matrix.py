#!/usr/bin/env python3
"""
Phase 2 remediation — coverage-matrix fixture generator.

Re-runs the exact category x region sweep from Phase 2's Step 1/5/2 against
a live server, capturing the resolver's actual output (not inferred from
code) as a JSON fixture. Run once before a factor-resolver.js change (the
"before" baseline) and once after (to diff against it).

Requires a running server (npm start) and a JWT for a non-demo tenant
(demoGuard blocks writes for demo-flagged tenants). Usage:

    CLEARTRACE_TOKEN=<jwt> python3 generate-coverage-matrix.py > matrix.json
    CLEARTRACE_TOKEN=<jwt> CLEARTRACE_BASE=http://localhost:3001 python3 generate-coverage-matrix.py > matrix.json
"""
import json
import os
import sys
import urllib.request

BASE = os.environ.get("CLEARTRACE_BASE", "http://localhost:3001")
TOKEN = os.environ.get("CLEARTRACE_TOKEN")
if not TOKEN:
    sys.exit("Set CLEARTRACE_TOKEN to a JWT for a non-demo tenant (see docstring above).")

PERIOD_COUNTER = [0]

def next_period():
    PERIOD_COUNTER[0] += 1
    # cycle through a wide range of YYYY-MM values so nothing collides with a locked period
    n = PERIOD_COUNTER[0]
    year = 2030 + (n // 12)
    month = (n % 12) + 1
    return f"{year}-{month:02d}"

def post(path, body):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def entry(category, region=None, unit=None, scope=1, amount=10, extra=None):
    body = {"category": category, "scope": scope, "amount": amount, "unit": unit or "kg", "period": next_period()}
    if region:
        body["region"] = region
    if extra:
        body.update(extra)
    status, resp = post("/api/emissions", body)
    if status >= 400:
        return {"status": status, "error": resp.get("error")}
    return {
        "status": status,
        "emission_factor": resp.get("emission_factor"),
        "region_resolved": resp.get("region_resolved"),
        "is_fallback_factor": resp.get("is_fallback_factor"),
        "fallback_reason": resp.get("fallback_reason"),
        "factor_source": resp.get("factor_source"),
    }

REGIONS = ["GB", "IN", "AE", "AE-DU", "AE-AZ", "AE-SH", "AE-NE"]

# category -> unit, matching Phase 2's Step 1 matrix exactly
CATEGORIES = {
    "Grid Electricity":        "kWh",
    "Water Supply":            "m3",
    "District Heating":        "kWh",
    "Company Car (Diesel)":    "km",
    "Company Car (Petrol)":    "km",
    "Company Car (Average)":   "km",
    "Refrigerants (R-134a)":   "kg",
    "Refrigerants (R-410A)":   "kg",
    "Business Travel (Car)":   "km",
    "Business Travel (Rail)":  "km",
    "Business Travel (Short-haul Flight)": "km",
    "Business Travel (Long-haul Flight)":  "km",
    "Employee Commuting (Car)":  "km",
    "Employee Commuting (Rail)": "km",
    "Waste (Landfill)":   "kg",
    "Waste (Recycled)":   "kg",
    "Waste (Composted)":  "kg",
    "Water Treatment":    "m3",
    "Natural Gas":             "m3",
    "Diesel (Stationary)":     "litres",
    "Petrol (Stationary)":     "litres",
    "LPG":                     "litres",
}

fixture = {"categories": {}, "vehicle_fuel_basis": {}, "flights": {}, "cng_rejection": {}, "custom": {}}

for cat, unit in CATEGORIES.items():
    fixture["categories"][cat] = {}
    for region in REGIONS:
        fixture["categories"][cat][region] = entry(cat, region=region, unit=unit, scope=(2 if "Electricity" in cat or "Heating" in cat else (1 if cat in ("Natural Gas","Diesel (Stationary)","Petrol (Stationary)","LPG","Company Car (Diesel)","Company Car (Petrol)","Company Car (Average)","Refrigerants (R-134a)","Refrigerants (R-410A)") else 3)))

# Vehicle fuel-basis
for fuel in ["diesel", "petrol", "lpg", "cng"]:
    fixture["vehicle_fuel_basis"][fuel] = entry(
        "Company Car (Average)", unit="litres", scope=1,
        extra={"method": "fuel", "fuel_type": fuel},
    )

# Flights — the four reference bands + cabin variety
flight_cases = [
    ("domestic", {"cabin_class": "economy", "touches_uk": True, "both_endpoints_uk": True}),
    ("uk-international-short:economy", {"cabin_class": "economy", "touches_uk": True, "both_endpoints_uk": False, "distance_km": 1000}),
    ("uk-international-long:economy", {"cabin_class": "economy", "touches_uk": True, "both_endpoints_uk": False, "distance_km": 5000}),
    ("international-non-uk:economy", {"cabin_class": "economy", "touches_uk": False}),
]
for label, extra in flight_cases:
    fixture["flights"][label] = entry("Business Travel (Flight)", unit="km", scope=3, extra=extra)

# CNG distance-basis (category doesn't exist at all)
fixture["cng_rejection"]["distance_basis_no_category"] = post("/api/emissions", {
    "category": "CNG", "scope": 1, "amount": 10, "unit": "litres", "period": next_period(),
})[1]

# Custom:true category
fixture["custom"]["with_factor"] = entry("Purchased Goods & Services", unit="kg", scope=3, extra={"emission_factor": 3.5})
status, resp = post("/api/emissions", {"category": "Purchased Goods & Services", "scope": 3, "amount": 10, "unit": "kg", "period": next_period()})
fixture["custom"]["without_factor"] = {"status": status, "error": resp.get("error")}

print(json.dumps(fixture, indent=2))

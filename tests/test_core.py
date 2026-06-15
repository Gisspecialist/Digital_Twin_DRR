from app.main import clamp_coordinate, compute_hazard_score, haversine_distance_km


def test_clamp_coordinate():
    assert clamp_coordinate(120, -220) == (90.0, -180.0)


def test_haversine_distance_reasonable():
    d = haversine_distance_km(17.25, -88.7667, 17.5, -88.2)
    assert 40 < d < 80


def test_hazard_score_high_rain():
    r = compute_hazard_score(
        wind_kmh=20,
        wind_gust_kmh=30,
        precipitation_mm=5,
        hourly_precipitation=[10] * 12,
        temp_c=29,
        pm25=5,
        wave_height_m=1,
        river_discharge_m3s=50,
        nearest_event_km=900,
        nearest_quake_km=900,
    )
    assert r["level"] in {"moderate", "high"}
    assert r["rainfall_24h_mm"] == 120

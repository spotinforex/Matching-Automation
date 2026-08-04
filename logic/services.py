import requests
from dotenv import load_dotenv
import os, logging

load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")

logging.basicConfig(level=logging.INFO)

class DistanceService:

    def geocode_address(address: str) -> tuple[float | None, float | None]:
        """Call Google Geocoding API and return (lat, lng) or (None, None) on failure."""
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {"address": address, "key": api_key}
        try:
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data["status"] == "OK":
                loc = data["results"][0]["geometry"]["location"]
                return loc["lat"], loc["lng"]
            logging.warning(f"  [WARN] Geocoding failed for '{address}': {data['status']}")
        except Exception as e:
            logging.error(f"  [ERROR] Request error for '{address}': {e}")
        return None, None

    def travel_time(self, origin, destination):
        """
        Return travel time in minutes.

        User will implement with Google Distance Matrix or OSRM.
        """
        raise NotImplementedError()

    def landmark_distance(self, landmark1, landmark2):
        """
        Distance between landmark centroids.
        """
        raise NotImplementedError()
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { cn } from '../utils/cn';
// Fix for default marker icon in leaflet with bundlers
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapSelectorProps {
    onLocationSelect: (lat: number, lng: number, placeName?: string) => void;
    active?: boolean;
    className?: string;
}

function MapResizer({ active }: { active?: boolean }) {
    const map = useMap();
    useEffect(() => {
        if (active === undefined || active === true) {
            const timer = setTimeout(() => {
                map.invalidateSize();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [active, map]);
    return null;
}

function LocationMarker({ onSelect }: { onSelect: (lat: number, lng: number, placeName?: string) => void }) {
    const [position, setPosition] = useState<L.LatLng | null>(null);
    const map = useMap();

    useMapEvents({
        async click(e: L.LeafletMouseEvent) {
            const { lat, lng } = e.latlng;
            
            // 1. Visual Update: Move marker instantly
            setPosition(e.latlng);
            map.flyTo(e.latlng, map.getZoom()); 

            let placeName = "";

            try {
                // --- ATTEMPT 1: OpenStreetMap Nominatim ---
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);

                const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
                const res = await fetch(osmUrl, {
                    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    const a = data.address || {};
                    
                    // Priority: City -> Town -> Village -> County/District
                    const city = a.city || a.town || a.village || a.municipality || a.city_district || a.suburb || a.hamlet || a.county;
                    const state = a.state || a.province || a.region;
                    const country = a.country;
                    
                    const parts = [city, state, country].filter(p => p && typeof p === 'string');
                    if (parts.length > 0) placeName = parts.join(", ");
                    else if (data.display_name) placeName = data.display_name.split(',').slice(0, 3).join(',');
                } else {
                    throw new Error("OSM Request failed");
                }

            } catch (err) {
                console.warn("Primary geocode failed, trying backup service...", err);
                // --- ATTEMPT 2: BigDataCloud (Reliable Backup) ---
                try {
                    const backupUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
                    const res2 = await fetch(backupUrl);
                    if (res2.ok) {
                        const data2 = await res2.json();
                        const city = data2.city || data2.locality;
                        const state = data2.principalSubdivision;
                        const country = data2.countryName;
                        
                        const parts = [city, state, country].filter(p => p && typeof p === 'string');
                        if (parts.length > 0) placeName = parts.join(", ");
                    }
                } catch (err2) {
                    console.error("All geocoding services failed.", err2);
                }
            }

            // 3. Final Callback
            onSelect(lat, lng, placeName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        },
    });

    return position === null ? null : (
        <Marker position={position}></Marker>
    );
}

export const MapSelector: React.FC<MapSelectorProps> = ({ onLocationSelect, active, className }) => {
    return (
        <div className={cn("rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-slate-100", className || "h-[400px] w-full")}>
            <MapContainer 
                center={[20, 0]} // Global Center
                zoom={2} // Zoomed out to see the world
                minZoom={2}
                scrollWheelZoom={true} 
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker onSelect={onLocationSelect} />
                <MapResizer active={active} />
            </MapContainer>
        </div>
    );
};
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
            
            // 1. Visual Update: Move marker instantly so UI feels responsive
            setPosition(e.latlng);
            map.flyTo(e.latlng, map.getZoom()); 

            // 2. Data Lookup: Wait for address before notifying parent
            let placeName = "";
            try {
                // Nominatim OpenStreetMap API
                const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
                const res = await fetch(url, {
                    headers: {
                        'Accept-Language': 'en-US,en;q=0.9' // Prefer English results
                    }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    const a = data.address || {};
                    
                    // Priority list for "City" name
                    const city = a.city || a.town || a.village || a.municipality || a.city_district || a.suburb || a.hamlet;
                    const state = a.state || a.province || a.region;
                    const country = a.country;
                    
                    // Build string: "Chandrapur, Maharashtra, India"
                    placeName = [city, state, country].filter(Boolean).join(", ");

                    // Fallback if structured data fails but display_name exists
                    if (!placeName && data.display_name) {
                        // Take first 3 parts of the long display name
                        placeName = data.display_name.split(',').slice(0, 3).join(',');
                    }
                }
            } catch (err) {
                console.warn("Reverse geocode failed", err);
            }

            // 3. Final Callback: Send Coords + Name (or fallback to coords if name failed)
            // If placeName is empty string, the Workspace will fall back to formatting the coords
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
                center={[20, 78]} 
                zoom={4} 
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
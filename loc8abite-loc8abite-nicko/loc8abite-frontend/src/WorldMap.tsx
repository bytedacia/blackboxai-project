import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from "react-leaflet";
import L, { type LeafletMouseEvent, type Layer } from "leaflet";
import "leaflet/dist/leaflet.css";
import "./WorldMap.css";

interface MapSectionFoodProps {
  onCountrySelect: (countryName: string) => void;
  selectedCountry: string | null;
  correctCountry: string | null;
  wrongCountries?: string[];
  showFinalResult?: boolean;
}

const WorldMap: React.FC<MapSectionFoodProps> = ({
  onCountrySelect,
  selectedCountry,
  correctCountry,
  wrongCountries = [],
  showFinalResult = false,
}) => {
  const [geoData, setGeoData] = useState<any>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  const highlightStyle = {
    weight: 3,
    color: "#00bfff",
    fillColor: "#00bfff",
    fillOpacity: 0.5,
    dashArray: "",
    shadow: true,
    className: "country-highlight"
  };
  const correctStyle = {
    weight: 3,
    color: "#4caf50",
    fillColor: "#4caf50",
    fillOpacity: 0.6,
    dashArray: "2,6",
    shadow: true,
    className: "country-correct"
  };
  const wrongStyle = {
    weight: 3,
    color: "#f44336",
    fillColor: "#f44336",
    fillOpacity: 0.6,
    dashArray: "2,6",
    shadow: true,
    className: "country-wrong"
  };
  const selectedStyle = {
    weight: 3,
    color: "#ff9800",
    fillColor: "#ff9800",
    fillOpacity: 0.5,
    dashArray: "2,2",
    shadow: true,
    className: "country-selected"
  };
  const normalStyle = {
    weight: 1,
    color: "#222",
    fillOpacity: 0.15,
    fillColor: "#e0e0e0",
    className: "country-normal"
  };

  // Icone custom per marker
  const correctIcon = new L.Icon({
    iconUrl: "/green.png",
    iconSize: [32, 48],
    iconAnchor: [16, 48],
    popupAnchor: [0, -48],
    className: "marker-correct-anim"
  });
  const guessIcon = new L.Icon({
    iconUrl: "/marker-correct.png",
    iconSize: [32, 48],
    iconAnchor: [16, 48],
    popupAnchor: [0, -48],
    className: "marker-guess-anim"
  });

  // Funzione per trovare il centroide di una nazione
  function getCountryCentroid(geoData: any, countryName: string): [number, number] | null {
    if (!geoData) return null;
    const feature = geoData.features.find((f: any) => f.properties.name === countryName);
    if (!feature) return null;
    let coords = feature.geometry.coordinates;
    if (feature.geometry.type === "Polygon") {
      coords = [coords];
    }
    let points: [number, number][] = [];
    coords.forEach((poly: any) => {
      poly[0].forEach((point: any) => {
        points.push(point);
      });
    });
    const lats = points.map(p => p[1]);
    const lngs = points.map(p => p[0]);
    const lat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const lng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
    return [lat, lng];
  }

  const onEachCountry = (feature: any, layer: Layer) => {
    const countryName = feature.properties.name;
    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        const target = e.target as L.Path;
        // Non evidenziare se è il risultato finale
        if (!showFinalResult) {
          target.setStyle(highlightStyle);
          target.bringToFront();
        }
        layer.openTooltip();
      },
      mouseout: (e: LeafletMouseEvent) => {
        const target = e.target as L.Path;
        // Ripristina lo stile appropriato
        if (showFinalResult && correctCountry === countryName) {
          target.setStyle(correctStyle);
        } else if (showFinalResult && wrongCountries.includes(countryName)) {
          target.setStyle(wrongStyle);
        } else if (selectedCountry === countryName && !showFinalResult) {
          target.setStyle(selectedStyle);
        } else {
          target.setStyle(normalStyle);
        }
        layer.closeTooltip();
      },
      click: () => {
        // Non permettere click se è il risultato finale
        if (!showFinalResult) {
          onCountrySelect(countryName);
        }
      },
    });
    
    // Tooltip con info paese
    let tooltipText = `<b>${countryName}</b>`;
    if (showFinalResult) {
      if (correctCountry === countryName) {
        tooltipText += '<br/><span style="color: #4caf50;">✅ Risposta Corretta</span>';
      } else if (wrongCountries.includes(countryName)) {
        tooltipText += '<br/><span style="color: #f44336;">❌ Risposta Sbagliata</span>';
      }
    }
    layer.bindTooltip(tooltipText, {sticky: true, direction: 'top', className: 'country-tooltip'});
    
    // Stile iniziale
    if (showFinalResult && correctCountry === countryName) {
      (layer as L.Path).setStyle(correctStyle);
    } else if (showFinalResult && wrongCountries.includes(countryName)) {
      (layer as L.Path).setStyle(wrongStyle);
    } else if (selectedCountry === countryName && !showFinalResult) {
      (layer as L.Path).setStyle(selectedStyle);
    } else {
      (layer as L.Path).setStyle(normalStyle);
    }
  };

  // Load GeoJSON data once
  useEffect(() => {
    fetch("/data/countries.geo.json")
      .then((res) => res.json())
      .then((data) => {
        setGeoData(data);
      })
      .catch((err) => console.error("Error loading GeoJSON:", err));
  }, []);

  // Update styles when selection changes
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.eachLayer((layer: L.Layer) => {
        const countryName = (layer as any).feature?.properties?.name;
        if (!countryName) return;

        if (showFinalResult && correctCountry === countryName) {
          (layer as L.Path).setStyle(correctStyle);
        } else if (showFinalResult && wrongCountries.includes(countryName)) {
          (layer as L.Path).setStyle(wrongStyle);
        } else if (selectedCountry === countryName && !showFinalResult) {
          (layer as L.Path).setStyle(selectedStyle);
        } else {
          (layer as L.Path).setStyle(normalStyle);
        }
      });
    }
  }, [selectedCountry, correctCountry, wrongCountries, showFinalResult]);

  return (
    <div className="map-section geoguessr-style">
      {selectedCountry && (
        <p style={{ fontWeight: "bold", marginBottom: "0.5rem", color: '#00bfff', textShadow: '0 0 6px #fff' }}>
          Selezionato: {selectedCountry}
        </p>
      )}
      <MapContainer
        center={correctCountry && geoData ? getCountryCentroid(geoData, correctCountry) : [20, 0]}
        zoom={2}
        maxZoom={8}
        minZoom={2}
        scrollWheelZoom
        style={{ height: "420px", width: "100%", borderRadius: '18px', boxShadow: '0 4px 24px #0002', border: '2px solid #00bfff' }}
        zoomControl={true}
        doubleClickZoom={true}
        dragging={true}
        animate={true}
        attributionControl={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          noWrap
        />
        {geoData && (
          <GeoJSON
            key={`${selectedCountry}-${correctCountry}-${wrongCountries.join(',')}-${showFinalResult}`}
            ref={(ref) => {
              if (ref) geoJsonRef.current = ref;
            }}
            data={geoData}
            onEachFeature={onEachCountry}
          />
        )}
        {/* Marker soluzione e guess */}
        {geoData && correctCountry && (() => {
          const position = getCountryCentroid(geoData, correctCountry);
          return position ? (
            <Marker position={position} icon={correctIcon}>
              <Popup>Soluzione: {correctCountry}</Popup>
            </Marker>
          ) : null;
        })()}
        {geoData && selectedCountry && selectedCountry !== correctCountry && (() => {
          const position = getCountryCentroid(geoData, selectedCountry);
          return position ? (
            <Marker position={position} icon={guessIcon}>
              <Popup>La tua scelta: {selectedCountry}</Popup>
            </Marker>
          ) : null;
        })()}
      </MapContainer>
    </div>
  );
};

export default WorldMap;

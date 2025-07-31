import React, { useState, useEffect, useRef } from "react";
import "./PhotoGuessMode.css";
import PhotoDisplay from "./PhotoDisplayFood";
import WorldMap from "./WorldMap";
import ResultModal from "./ResultModalFood";
import confetti from "canvas-confetti";

interface PhotoData {
  image: string;
  country: string;
  name: string;
  type: string;
}

interface FoodGuessModeProps {
  onBack?: () => void;
}

const FoodGuessMode: React.FC<FoodGuessModeProps> = ({ onBack }) => {
  const [photoData, setPhotoData] = useState<PhotoData[]>([]);
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [flashCelebration, setFlashCelebration] = useState(false);
  const [revealCorrect, setRevealCorrect] = useState(false);
  const [isCorrectGuess, setIsCorrectGuess] = useState<boolean>(false);

  // Stato per timer, tentativi, indizio e feedback visivo
  const [attempts, setAttempts] = useState(0);
  const [timer, setTimer] = useState(60);
  const [showHint, setShowHint] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [direction, setDirection] = useState<string | null>(null);
  const [feedbackColor, setFeedbackColor] = useState<string | null>(null);
  const [wrongCountries, setWrongCountries] = useState<string[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Funzione per calcolare il centroide di un paese dal GeoJSON
  function getCountryCentroid(geoData: any, countryName: string): [number, number] | null {
    if (!geoData) return null;
    const feature = geoData.features.find((f: any) => f.properties.name === countryName);
    if (!feature) return null;
    // Supporta solo Polygon e MultiPolygon
    let coords = feature.geometry.coordinates;
    if (feature.geometry.type === "Polygon") {
      coords = [coords];
    }
    // Prende tutti i punti
    let points: [number, number][] = [];
    coords.forEach((poly: any) => {
      poly[0].forEach((point: any) => {
        points.push(point);
      });
    });
    // Calcola media
    const lats = points.map(p => p[1]);
    const lngs = points.map(p => p[0]);
    const lat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const lng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
    return [lat, lng];
  }

  // Funzione per calcolare la direzione bussola
  function getCompassDirection(from: [number, number], to: [number, number]): string {
    const dLat = to[0] - from[0];
    const dLng = to[1] - from[1];
    const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
    if (angle >= -22.5 && angle < 22.5) return '🧭 Nord';
    if (angle >= 22.5 && angle < 67.5) return '🧭 Nord-Est';
    if (angle >= 67.5 && angle < 112.5) return '🧭 Est';
    if (angle >= 112.5 && angle < 157.5) return '🧭 Sud-Est';
    if (angle >= 157.5 || angle < -157.5) return '🧭 Sud';
    if (angle >= -157.5 && angle < -112.5) return '🧭 Sud-Ovest';
    if (angle >= -112.5 && angle < -67.5) return '🧭 Ovest';
    if (angle >= -67.5 && angle < -22.5) return '🧭 Nord-Ovest';
    return '🧭';
  }

  // Funzione per ottenere la bandiera emoji da nome paese
  function getFlagEmoji(country: string) {
    const code = country
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2);
    if (code.length !== 2) return "";
    return String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
  }

  // Effetti sonori
  const correctSound = useRef<HTMLAudioElement | null>(null);
  const wrongSound = useRef<HTMLAudioElement | null>(null);
  const endSound = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    correctSound.current = new Audio("/audio/celebrate.mp3");
    wrongSound.current = new Audio("/audio/wrong.mp3");
    endSound.current = new Audio("/audio/end.mp3");
  }, []);

  // Animazione punteggio
  const [scoreAnim, setScoreAnim] = useState<number | null>(null);
  useEffect(() => {
    if (score !== null) {
      let start = 0;
      const end = score;
      const duration = 600;
      const step = Math.max(1, Math.floor(end / 30));
      let current = 0;
      const animate = () => {
        if (current < end) {
          current += step;
          setScoreAnim(Math.min(current, end));
          setTimeout(animate, duration / (end / step));
        } else {
          setScoreAnim(end);
        }
      };
      animate();
    }
  }, [score]);

  // Stato per geoData
  const [geoData, setGeoData] = useState<any>(null);
  useEffect(() => {
    fetch("/data/countries.geo.json")
      .then((res) => res.json())
      .then((data) => setGeoData(data));
  }, []);

  useEffect(() => {
    audioRef.current = new Audio("/audio/celebrate.mp3");
  }, []);

  // Stato per round
  const [round, setRound] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [usedPhotoIndices, setUsedPhotoIndices] = useState<number[]>([]);

  // Stato per cronologia round
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetch("http://localhost:4000/api/wikidata/food")
      .then((res) => res.json())
      .then((data) => setPhotoData(data))
      .catch((err) => console.error("Failed to fetch food data:", err));
  }, []);

  const startRound = () => {
    if (photoData.length > 0) {
      const randomIdx = Math.floor(Math.random() * photoData.length);
      setCurrentPhotoIdx(randomIdx);
      setUsedPhotoIndices([randomIdx]);
      setStarted(true);
      setRound(1);
      setGameOver(false);
      setTotalScore(0);
      setHistory([]);
    }
  };

  const currentPhoto = photoData[currentPhotoIdx];

  const handleCountrySelect = (countryName: string) => {
    setSelectedCountry(countryName);
  };

  // Gestione timer
  useEffect(() => {
    if (!started) return;
    if (timer === 0 || attempts >= 5) {
      setShowResult(true);
      setRevealCorrect(true);
      setFeedbackColor(null);
      return;
    }
    timerRef.current = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(timerRef.current!);
  }, [timer, started, attempts]);

  // Gestione submit
  const handleSubmit = () => {
    if (!selectedCountry || !currentPhoto || showResult) return;
    const isCorrect = selectedCountry.trim().toLowerCase() === currentPhoto.country.trim().toLowerCase();
    setAttempts(a => a + 1);
    
    if (isCorrect) {
      // Calcola punteggio basato su tentativi e tempo
      const timeBonus = Math.max(0, timer) * 2; // Bonus tempo rimanente
      const attemptPenalty = attempts * 15; // Penalità per tentativi precedenti
      const finalScore = Math.max(10, 100 + timeBonus - attemptPenalty);
      
      setScore(finalScore);
      setIsCorrectGuess(true);
      setShowResult(true);
      setRevealCorrect(true);
      setFeedbackColor('green');
      setResult(`🎉 Corretto! Hai indovinato la nazione! Punteggio: ${finalScore}`);
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      if (correctSound.current) correctSound.current.play();
      setFlashCelebration(true);
    } else {
      // Aggiungi il paese sbagliato alla lista
      if (!wrongCountries.includes(selectedCountry)) {
        setWrongCountries(prev => [...prev, selectedCountry]);
      }
      
      setScore(0);
      setIsCorrectGuess(false);
      setFeedbackColor('red');
      setResult(`❌ Sbagliato! Hai scelto ${selectedCountry}`);
      
      // Se è l'ultimo tentativo, mostra la risposta corretta
      if (attempts >= 4) {
        setRevealCorrect(true);
        setShowResult(true);
      }
      
      // Indizio dal secondo tentativo in poi
      if (attempts >= 1 && geoData) {
        const from = getCountryCentroid(geoData, selectedCountry);
        const to = getCountryCentroid(geoData, currentPhoto.country);
        if (from && to) {
          setDirection(getCompassDirection(from, to));
          setHint('Hai sbagliato nazione! ' + getCompassDirection(from, to));
          setShowHint(true);
        }
      }
      if (wrongSound.current) wrongSound.current.play();
    }
  };

  // Gestione fine round
  useEffect(() => {
    if ((timer === 0 || attempts >= 5) && !showResult) {
      setShowResult(true);
      setRevealCorrect(true);
      setFeedbackColor(null);
    }
  }, [timer, attempts, showResult]);

  const handleReveal = () => {
    if (!isCorrectGuess && currentPhoto?.country) {
      setRevealCorrect(true);
      setResult(`The correct country is: ${currentPhoto.country}`);
    }
  };

  // Modifica handleNext per salvare i dati del round
  const handleNext = () => {
    setSelectedCountry(null);
    setResult(null);
    setShowResult(false);
    setScore(null);
    setRevealCorrect(false);
    setFlashCelebration(false);
    setIsCorrectGuess(false);
    setAttempts(0);
    setTimer(60);
    setShowHint(false);
    setHint(null);
    setDirection(null);
    setFeedbackColor(null);
    setWrongCountries([]); // Reset wrong countries for next round
    if (score !== null) {
      setTotalScore(s => s + score);
      setHistory(h => [...h, {
        round,
        image: currentPhoto.image,
        food: currentPhoto.name,
        correct: currentPhoto.country,
        guess: selectedCountry,
        isCorrect: isCorrectGuess,
        score: score
      }]);
    }
    if (round >= 10 && endSound.current) endSound.current.play();
    if (round >= 10) {
      setGameOver(true);
      return;
    }
    setRound(r => r + 1);
    if (photoData.length > 0) {
      // Trova una foto non ancora usata
      let availableIndices = photoData.map((_, index) => index).filter(index => !usedPhotoIndices.includes(index));
      
      // Se abbiamo usato tutte le foto, ricomincia da capo
      if (availableIndices.length === 0) {
        availableIndices = photoData.map((_, index) => index);
        setUsedPhotoIndices([]);
      }
      
      const randomIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      setCurrentPhotoIdx(randomIdx);
      setUsedPhotoIndices(prev => [...prev, randomIdx]);
    }
  };

  if (!currentPhoto) return <div>Loading...</div>;

  // Progress bar round
  const progressPercent = Math.round(((round - 1) / 10) * 100);

  return (
    <div className={`photo-guess-mode ${flashCelebration ? "flash-bg" : ""}`}>
      {!started ? (
        <div className="card-options">
          <div className="card-option start-card" onClick={startRound}>
            <h3>▶️ Start Food Guess</h3>
            <p>Try to guess which country this food is from!</p>
          </div>
          {onBack && (
            <div className="card-option back-card" onClick={onBack}>
              <h3>🔙 Back to Menu</h3>
              <p>Return to mode selection screen</p>
            </div>
          )}
        </div>
      ) : gameOver ? (
        <div className="game-over">
          <h2>🎉 Partita terminata!</h2>
          <div className="progress-bar" style={{ width: '100%', margin: '1rem 0' }}>
            <div style={{ width: '100%', height: 10, background: '#e0e0e0', borderRadius: 8 }}>
              <div style={{ width: '100%', height: 10, background: '#4caf50', borderRadius: 8, transition: 'width 0.5s' }} />
            </div>
          </div>
          <p>Punteggio totale: <b>{totalScore}</b>/1000</p>
          <div className="summary-table">
            <table>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Foto</th>
                  <th>Nome</th>
                  <th>Risposta data</th>
                  <th>Risposta corretta</th>
                  <th>Punti</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} style={{ background: h.isCorrect ? '#e8f5e9' : '#ffebee' }}>
                    <td>{h.round}</td>
                    <td><img src={h.image} alt={h.food} style={{ width: 60, borderRadius: 8, border: h.isCorrect ? '2px solid #4caf50' : '2px solid #f44336' }} /></td>
                    <td>{h.food}</td>
                    <td style={{ color: h.isCorrect ? '#4caf50' : '#f44336', fontWeight: 'bold' }} title={h.guess || ''}>
                      {getFlagEmoji(h.guess || '')} {h.guess || 'Nessuna'}
                    </td>
                    <td style={{ color: '#4caf50', fontWeight: 'bold' }} title={h.correct}>
                      {getFlagEmoji(h.correct)} {h.correct}
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{h.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={startRound}>Rigioca</button>
          {onBack && <button onClick={onBack}>Torna al menu</button>}
        </div>
      ) : (
        <>
          <div className="round-bar">
            <span>Round {round}/10</span>
            <div className="progress-bar" style={{ width: '60%', margin: '0.5rem auto' }}>
              <div style={{ width: '100%', height: 8, background: '#e0e0e0', borderRadius: 8 }}>
                <div style={{ width: `${progressPercent}%`, height: 8, background: '#00bfff', borderRadius: 8, transition: 'width 0.5s' }} />
              </div>
            </div>
          </div>
          <PhotoDisplay url={currentPhoto.image} name={currentPhoto.name} />
          <WorldMap
            onCountrySelect={handleCountrySelect}
            selectedCountry={selectedCountry}
            correctCountry={revealCorrect ? currentPhoto.country : null}
            wrongCountries={wrongCountries}
            showFinalResult={revealCorrect}
          />
          {started && (
            <div className="status-bar">
              <span className="timer" style={{ color: timer <= 10 ? 'red' : 'black' }}>⏰ {timer}s</span>
              <span className="score-display" style={{ color: '#00bfff', fontWeight: 'bold' }}>🏆 {totalScore} pts</span>
              <span className="attempts" style={{ color: feedbackColor }}>{attempts}/5 tentativi</span>
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={!selectedCountry}
            className="submit-btn"
          >
            Submit Guess
          </button>

          {showResult && !isCorrectGuess && !revealCorrect && (
            <button onClick={handleReveal} className="correct-btn">
              Reveal Correct Country
            </button>
          )}

          <button
            onClick={handleNext}
            className="correct-btn skip-btn"
            style={{ marginTop: "0.5rem" }}
          >
            ⏭️ {round < 10 ? 'Prossimo Round' : 'Termina'}
          </button>

          {showHint && hint && (
            <div className="hint">
              <span>{hint}</span>
            </div>
          )}

          <ResultModal result={result} show={showResult} score={scoreAnim ?? score} />
          {showResult && (
            <div className="solution">
              <span>La tua risposta: <span style={{ color: isCorrectGuess ? 'green' : 'red' }}>{selectedCountry || 'Nessuna'}</span></span>
              {!isCorrectGuess && (
                <span>La risposta corretta: <span style={{ color: 'green' }}>{currentPhoto.country}</span></span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FoodGuessMode;

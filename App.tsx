import React, { useState, useEffect, useRef } from 'react';
import Experience from './components/Experience';
import * as THREE from 'three';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const experienceRef = useRef<Experience | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize experience
    const experience = new Experience(containerRef.current, () => {
      setLoading(false);
    });
    experienceRef.current = experience;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') {
        setControlsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      experience.destroy();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && experienceRef.current) {
      const reader = new FileReader();
      // EXACT logic requested for texture loading
      reader.onload = (ev) => {
        if (ev.target?.result) {
          new THREE.TextureLoader().load(ev.target.result as string, (t) => {
            t.colorSpace = THREE.SRGBColorSpace; // Critical: specific color space
            experienceRef.current?.addPhotoToScene(t);
          });
        }
      };
      reader.readAsDataURL(f);
    }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      {/* 3D Scene */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Loader */}
      {loading && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center transition-opacity duration-1000">
          <div className="spinner mb-6"></div>
          <p className="cinzel text-xs tracking-[0.3em] text-[#d4af37]">LOADING HOLIDAY MAGIC</p>
        </div>
      )}

      {/* UI Overlay */}
      <div className={`absolute inset-0 flex flex-col items-center pointer-events-none transition-opacity duration-500 z-10 ${!controlsVisible ? 'ui-hidden' : ''}`}>
        <h1 className="cinzel mt-16 font-bold title-gradient uppercase tracking-widest text-center px-4">
          Merry Christmas
        </h1>

        <div className="absolute bottom-20 flex flex-col items-center gap-6 pointer-events-auto">
          <div className="upload-wrapper">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-10 py-4 glass-btn cinzel tracking-[0.2em] rounded-sm uppercase text-sm font-bold"
            >
              Add Memories
            </button>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleFileUpload}
            />
          </div>
          <p className="text-[10px] tracking-[0.25em] text-[#fceea7] opacity-60 uppercase">Press 'H' to Hide Controls</p>
        </div>
      </div>

      {/* Invisible MediaPipe Webcam container */}
      <div className="fixed bottom-4 right-4 opacity-0 pointer-events-none z-[-1]">
        <video id="webcam" autoPlay playsInline width="160" height="120"></video>
        <canvas id="cv_canvas" width="160" height="120"></canvas>
      </div>
    </div>
  );
};

export default App;
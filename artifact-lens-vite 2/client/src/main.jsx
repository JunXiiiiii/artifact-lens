import React from 'react';
import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import App from './App.jsx';
import './index.css';
import { motionAllowed } from './utils/motion.js';

gsap.registerPlugin(ScrollTrigger);

const allowMotion = motionAllowed();

if (!allowMotion) {
  gsap.globalTimeline.timeScale(100);
} else {
  const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.on('scroll', ScrollTrigger.update);
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

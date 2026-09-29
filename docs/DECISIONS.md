# Technical Decisions

## 001 - Frontend

Decision:
Use Vite + Vanilla JavaScript.

Do not migrate to React.

Reason:
Very short hackathon deadline and simple browser application.

---

## 002 - Gesture tracking

Decision:
Use MediaPipe.

Our own code should interpret landmarks into game gestures.

Reason:
We need reliable tracking while still demonstrating custom gesture logic.

---

## 003 - Game rendering

Decision:
Use regular DOM/CSS and Canvas 2D where useful.

No 3D engine.

---

## 004 - Navigation

Decision:
Use index fingertip as virtual cursor.

Selection uses dwell time, not a click gesture.

---

## 005 - Heroes

Decision:
All heroes share one gesture engine.

Different heroes map the same gestures to different abilities.

---

## 006 - Persistence

Decision:
Use localStorage.

No backend.

---

## 007 - Primary platform

Decision:
Desktop/laptop browser with webcam.

Mobile is not part of the core MVP.

---

## 008 - Development strategy

Decision:
Complete one stable vertical slice before adding optional features.

Order:

camera
-> tracking
-> gestures
-> navigation
-> error mode
-> combat
-> complete MVP
-> polish
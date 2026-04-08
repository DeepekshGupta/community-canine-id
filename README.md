# 🐕 Community Canine ID (CCID)

> A decentralized, ultra-low-cost QR-based medical identity system for community animals.


CCID is an open-source, serverless platform designed to track the medical history, location, and wellbeing of street animals, specifically optimized for the Indian context. By utilizing passive QR tags, CCID shifts the burden of data management from expensive centralized infrastructure to the user's smartphone.

By leveraging QR code technology, caregivers, NGOs, and the general public can access and update a dog’s health records, ensuring continuity of care even when individual caretakers are unavailable.


---

## 🌍 Key Objectives
*  Open-Source Identity: Standardized data schemas to allow NGO-specific forks
while maintaining a global "Liveness" registry.
* Continuity of Care: Maintain accessible digital medical records that survive changes in caretakers or NGOs.
* Zero-Battery Passive Tracking: No expensive electronics; all intelligence resides in the QR code and the scanner's device.
* Extreme Scalability: Powered by serverless "pay-as-you-go" infrastructure to support millions of animals at near-zero idle cost.
* Resilience: A "Hybrid QR" system that ensures functionality in both high-connectivity urban centers and remote offline areas.
*  Computational Decentralization: Data transformation and logic are handled by
the client-side JavaScript to minimize backend costs.


---

## 🚀 Features
* 💻 System-Wide
    * Progressive Web App (PWA): No app store download required; runs instantly in any mobile browser.
    * Offline-First: Local persistence via Service Workers and IndexedDB for areas with poor connectivity.
    * Decentralized Logic: Client-side JavaScript handles data transformation and conflict resolution to minimize backend costs.



* 🩺 For Caretakers & NGOs
    * Inventory Mode: Pre-print "blank" tags and assign them to new profiles in the field.
    * Identity Merging: Seamlessly link a new physical tag to an existing digital profile if a collar is lost.
    * Liveness Heartbeat: Records are automatically flagged as "Unknown" if no scans are recorded within 6 months.
    * Interaction Log: Collaborative timeline for feeding, medical treatments, and behavioral notes.
    * Verification: Side-profile photo comparison to ensure the tag belongs to the dog
    being viewed.
    * Bulk Export: Export records to Excel/CSV for government reporting.
* 🤳 For the General Public (Low Friction)
    * Low Friction: Instant access to an animal’s "Story" and vaccination status
    * Digital Zoom: Scan skittish or nervous animals from a safe distance.
    * Micro-Donations: Integrated ₹10 "Tip" triggers for specific dog needs (food, medicine).
    * Safety First: Provides immediate tips on dog behavior and local emergency contacts.
    * Missing Dog Alerts: Instant SMS/Push to caretakers when a "Missing" dog is
    scanned.
---



## 🔄 Technical Architecture

### A. The Hybrid QR System
#### 1. Static QR (Offline)
* Functionality: Uses CBOR/Bit-field encoding to store critical data (ID, Rabies status, contact info) directly in the QR pixels.
#### 2. Dynamic QR (Online)
* Functionality: Links to a central database for real-time updates, GPS-based incident alerts, and full medical histories.



### B. The Frontend
* Tech Stack: Mobile-first Web App (React/Vue/Next.js) functioning as a
Progressive Web App (PWA).
*  Local Persistence: Uses Service Workers and IndexedDB to cache scans and
location logs when offline, auto-syncing when a connection is restored.
* Logic-Heavy Client: The frontend performs data validation and "Conflict
Resolution" (e.g., weighing a Vet's update over a passerby's) before sending the
final payload to the backend.

### B. The Backend
* Compute: Serverless functions (Cloudflare Workers) for high-speed, low-latency API calls.
* Storage: Document-based DB (MongoDB) for flexible schemas.
* Global Mediator: A lightweight central DB maintains "Liveness" heartbeats and
basic ID sync across various NGO-specific app instances.
---
## 🧩 Stack

* **Frontend**: PlaceHolder
* **Backend**: PlaceHolder
* **Database**: PlaceHolder

---

## 👥 Tag Design
  This is not a collar, but an accessory that can be attached to a collor

| Feature | Specification |
| -------- | ------- |
| Materials | Laminated TPU (Budget) or Laser-etched Metal (Durable), Flexible for collars, ropes, or harnesses |
| Color | High-contrast white on black (Inverted supported) |
| Error Correction | Error correction level H (high) for wear-and-tear resilience |
| Human Fallback | 3-digit Bold ID printed for manual search in the PWA |
| Visual Indicators | Optional color-coded bands for "Agreesive" or "Friendly" status |



Goal: Scalable deployment for millions of dogs at minimal cost.


---

## 💡 Use Cases

* Street dog tracking
* NGO management
* Vaccination campaigns
* Passive animal monitoring

---

## 🤝 Contributing

We welcome contributors!

* Developers: Help us optimize bit-field encoding or improve the PWA offline sync.
* UI/UX Designers: Help us make the interface more accessible for field use.
* Translators: Add support for regional languages to empower local communities across India.
* Optimize encoding

---

## ❤️ Acknowledgment

Built for community-driven animal welfare. CCID aims to empower the people on the ground with the tools they need to protect those who cannot speak for themselves.
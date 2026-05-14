<div align="center">

<img src="https://img.shields.io/badge/Synapse-Study%20Smarter-534AB7?style=for-the-badge&logoColor=white" alt="Synapse"/>

# 🧠 Synapse
### Connect your brain. Own your learning.

**A Chrome extension + web dashboard that helps school students focus, track their study sessions, and grow with a personalized AI study coach.**

[![Made with Love](https://img.shields.io/badge/Made%20with-❤️-red?style=flat-square)](https://github.com)
[![Track](https://img.shields.io/badge/Track-Deeptech-534AB7?style=flat-square)](https://github.com)
[![Team](https://img.shields.io/badge/Team-Neuron-1D9E75?style=flat-square)](https://github.com)
[![Status](https://img.shields.io/badge/Status-In%20Development-EF9F27?style=flat-square)](https://github.com)

</div>

---

## 📖 What is Synapse?

Most school students spend hours on their devices but have zero visibility into how much time they actually studied versus scrolled. Synapse fixes that.

Synapse is a **Chrome extension paired with a web dashboard** that helps students aged 13–18:
- 🔒 **Lock distracting sites** during study sessions
- ⏱️ **Track time spent** on each subject automatically
- 📊 **Visualize progress** with weekly reports and goal tracking
- 🤖 **Get personalized guidance** from an AI study coach that knows their actual data

No manual logging. No complicated setup. Just click, study, and grow.

---

## ✨ Features

### 🔒 Focus Lock *(Chrome Extension)*
Block YouTube, Instagram, and other distracting sites during a session. Student sets a timer, extension locks them in. Simple whitelist/blacklist control.

### ⏱️ Study Session Timer *(Chrome Extension)*
Pomodoro-style timer built into the extension popup. Start, pause, stop. Every session auto-logs subject, duration, and date to the dashboard.

### 📊 Progress Dashboard *(Web App)*
Visual weekly report of study hours per subject, focus streaks, and goals vs actual. Clean charts that turn raw study time into actionable insight.

### 🎯 Goal & Subject Tracker *(Web App)*
Set weekly goals per subject — "4 hrs Maths this week." Dashboard shows live progress with a simple percentage bar. Stay on track, always.

### 🤖 AI Study Coach *(Web App)*
Personalized chatbot powered by Gemini AI. It reads your actual study data and responds like it knows you — because it does.

> *"Hey Aryan, you've studied Science 3hrs this week — great! But Maths is at 1hr vs your 4hr goal. Want me to build a catch-up plan?"*

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Chrome Extension | JavaScript, Chrome Extension API (Manifest V3) |
| Frontend / Dashboard | React.js, Tailwind CSS |
| Backend | Node.js, Express |
| Database | Firebase / Supabase |
| AI Coach | Google Gemini API (free tier) |
| Auth | Firebase Authentication |
| Hosting | Vercel (frontend), Railway (backend) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- Chrome browser
- Google Gemini API key (free at [aistudio.google.com](https://aistudio.google.com))

### 1. Clone the repo
```bash
git clone https://github.com/kinova/synapse.git
cd synapse
```

### 2. Install dependencies
```bash
# Web app
cd webapp
npm install

# Backend
cd ../backend
npm install
```

### 3. Set up environment variables
```bash
cp .env.example .env
```
Fill in your `.env`:
```
GEMINI_API_KEY=your_key_here
FIREBASE_API_KEY=your_key_here
```

### 4. Run the web app
```bash
cd webapp
npm run dev
```

### 5. Load the Chrome extension
1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `/extension` folder from this repo

---

## 📁 Project Structure

```
synapse/
├── extension/          # Chrome extension
│   ├── manifest.json
│   ├── popup/          # Extension popup UI
│   ├── background.js   # Service worker
│   └── content.js      # Site blocking logic
│
├── webapp/             # React web dashboard
│   ├── src/
│   │   ├── pages/      # Dashboard, Goals, Progress
│   │   ├── components/ # Charts, Timer, Chat
│   │   └── hooks/      # Custom React hooks
│   └── public/
│
├── backend/            # Node.js API
│   ├── routes/         # Sessions, goals, user
│   ├── ai/             # Gemini API integration
│   └── db/             # Database models
│
└── README.md
```

---

## 🗺️ Roadmap

- [x] Focus lock Chrome extension
- [x] Study session timer
- [x] Progress dashboard
- [x] Goal & subject tracker
- [x] AI study coach (Gemini)
- [ ] Parent dashboard
- [ ] Gamified leaderboards & badges
- [ ] Exam countdown & revision planner
- [ ] Smart reminders based on study patterns
- [ ] Mobile companion app (Android/iOS)
- [ ] School & institute admin panel

---

## 👥 Team Neuron

| Name | Role |
|---|---|
| **Kinshuk** | Tech Lead & Full Stack Developer |
| **Krishna** | Product Manager & Strategy Lead |
| **Aditya** | UI/UX Designer & Creative Lead |

Built with ❤️ at **[Hackathon Name] 2026** — Deeptech Track

---

## 📄 License

MIT License — feel free to use, fork, and build on this.

---

<div align="center">

**Synapse** · Built by Team Kinova · 2026

*"The habit of intentional studying is one of the highest-leverage skills a student can build."*

</div>
